"""Offline old/new comparison on the same synthetic source corpus. No model/network calls."""
from __future__ import annotations
import contextlib
import io
import json
import sqlite3
import tempfile
import time
from pathlib import Path
from unittest.mock import patch
import worker
import no_login_crawler as crawler
from test_v2_pipeline import PAGES,FixtureFetcher,FixtureSearch,run_fixture
from test_v2 import IDENTITY
from v2.parsers import parse_html
from v2.pipeline import compact_result
from v2.provenance import validate_snapshot
from v2.store import EvidenceStore,utcnow


def compare():
    hits=[]
    for url,body in PAGES.items():
        parsed=parse_html(body,url)
        hits.append(crawler.Hit(parsed['title'],parsed['text'],url,'fixture','synthetic',None))
    hits.append(crawler.Hit('晨光示例员工经历','晨光示例员工声称：2023年研发团队经常加班；匿名经历，身份未知。','https://www.zhihu.com/question/fixture','fixture','synthetic',None))
    conn=sqlite3.connect(':memory:');conn.row_factory=sqlite3.Row
    conn.executescript('''CREATE TABLE agent_evidence(id TEXT PRIMARY KEY,company_id INTEGER,topic TEXT,title TEXT,excerpt TEXT,url TEXT,source_type TEXT,published_at TEXT,collected_at TEXT,verification_original TEXT);
        CREATE TABLE agent_facts(id TEXT PRIMARY KEY,evidence_id TEXT,company_id INTEGER,fact_key TEXT,value TEXT);''')
    started=time.monotonic()
    with patch.object(crawler,'fetch_bing_cn',lambda query:hits),patch.object(crawler,'fetch_360',lambda query:hits),patch.object(crawler,'fetch_sogou_wechat',lambda query:hits):
        target={'id':900001,'name':IDENTITY['brand'],'full_name':IDENTITY['legal_name'],'known_listing':None,'stock_code':None}
        old=worker.collect(conn,target,list(worker.TOPICS))
        first=conn.execute('SELECT COUNT(*) FROM agent_evidence').fetchone()[0]
        worker.collect(conn,target,list(worker.TOPICS))
        second=conn.execute('SELECT COUNT(*) FROM agent_evidence').fetchone()[0]
    old_ms=int((time.monotonic()-started)*1000)
    conn.close()
    with tempfile.TemporaryDirectory() as directory:
        store=EvidenceStore(Path(directory)/'work.sqlite')
        started=time.monotonic();new=run_fixture(directory,store)
        first_new=store.db.execute('SELECT COUNT(*) FROM v2_documents').fetchone()[0]
        repeat=run_fixture(directory,store)
        second_new=store.db.execute('SELECT COUNT(*) FROM v2_documents').fetchone()[0]
        new_ms=int((time.monotonic()-started)*1000)
        errors=validate_snapshot(new['documents'],new['facts'],900001);store.close()
    summary={'fixture':True,'generated_at':utcnow(),'company':IDENTITY['legal_name'],'job_scope':'same unconfirmed job; neither collector may assign job facts',
        'topics':list(worker.TOPICS),'corpus':'test_v2_pipeline.py PAGES plus its anonymous community snippet',
        'method':'Both actual collectors run twice against one synthetic corpus. V1 receives all available hits on each mocked topic search; V2 uses its deterministic channel discovery fixture and article fetches. This measures extraction/storage behavior, not search ranking or live latency.',
        'v1':{'returned_evidence_rows':len(old['evidence']),'distinct_urls':len({e['url'] for e in old['evidence']}),'stored_rows_after_first':first,'stored_rows_after_repeat':second,'located_body_documents':0,'aligned_financial_facts':0,'facts':len(old['facts']),'source_attempts':old['attempted_sources'],'independent_sources':'not represented','two_runs_ms':old_ms,'model_calls':0},
        'v2':{'returned_documents':len(new['documents']),'stored_rows_after_first':first_new,'stored_rows_after_repeat':second_new,'located_body_documents':sum(d['access_mode']=='html' for d in new['documents']),'aligned_financial_facts':sum(f['kind']=='normalized_fact' for f in new['facts']),'facts':len(new['facts']),'independent_sources':new['independent_sources'],'validated_facts':len(new['facts']) if not errors else None,'citation_errors':errors,'source_attempts':len(new['attempts']),'status':new['status'],'two_runs_ms':new_ms,'model_calls':0},
        'limits':['All inputs are synthetic. Timing includes initialization and repeated runs, and is not a production speed comparison.','Neither path called a live model; no fee or accuracy percentage is estimated.','This is a collector comparison; existing tests separately validate old/new report contracts.']}
    out=Path(__file__).resolve().parents[2]/'.data/agent-v2-validation/comparison'
    out.mkdir(parents=True,exist_ok=True)
    (out/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (out/'v1-synthetic.json').write_text(json.dumps(old,ensure_ascii=False,indent=2),encoding='utf-8')
    compact=compact_result(new)
    for d in compact['documents']:d['fixture']=True
    for e in compact['excerpts']:e['fixture']=True
    (out/'v2-synthetic.json').write_text(json.dumps(compact,ensure_ascii=False,indent=2),encoding='utf-8')
    return summary

if __name__=='__main__':
    with contextlib.redirect_stdout(io.StringIO()):result=compare()
    print(json.dumps(result,ensure_ascii=False,indent=2))
