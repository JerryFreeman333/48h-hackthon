"""Server JSON entrypoint. Accepts selected company IDs/topics, never arbitrary paths or shell."""
from __future__ import annotations
import contextlib
import io
import json
import os
import re
import sqlite3
import sys
from pathlib import Path
from v2.identity import company_identity
from v2.pipeline import research, compact_result
from v2.store import EvidenceStore
from v2.transport import PublicFetcher

ROOT=Path(__file__).resolve().parents[2]
TOPICS={'growth','pay','hours','benefits','culture','position','company'}


def bounded_env(name,default,minimum,maximum):
    try: value=int(os.environ.get(name,str(default)))
    except ValueError: value=default
    return max(minimum,min(maximum,value))


def seeds_from_database(source, company_id):
    with sqlite3.connect(source.resolve().as_uri()+'?mode=ro',uri=True) as db:
        db.row_factory=sqlite3.Row
        rows=db.execute("SELECT title,url,excerpt FROM evidence WHERE company_id=? AND url LIKE 'http%' AND (title LIKE '%年度报告%' OR title LIKE '%财务报告%' OR url LIKE '%.pdf%' OR url LIKE '%.PDF%') LIMIT 20",(company_id,)).fetchall()
    return [{'title':r['title'] or '', 'url':r['url'],'provider':'existing_database_discovery','discovery_url':r['url']} for r in rows if re.search(r'\.pdf(?:[?#]|$)',r['url'],re.I)][:3]


def handle(request):
    if not isinstance(request,dict) or set(request)-{'company_id','topics','action'}:
        raise ValueError('Invalid request fields')
    if request.get('action') not in ('investigate_company_channels','read_company_checkpoint'): raise ValueError('Unknown action')
    topics=request.get('topics')
    if not isinstance(topics,list) or not 1<=len(topics)<=7 or any(not isinstance(t,str) or t not in TOPICS for t in topics):
        raise ValueError('Invalid topics')
    source=ROOT/'.data/company-database/xray-v3-20261003.sqlite'
    identity=company_identity(source,request.get('company_id'))
    work=ROOT/'.data/research-agent/v2'
    store=EvidenceStore(work/'evidence.sqlite')
    try:
        manifest=json.loads((source.parent/'manifest.json').read_text(encoding='utf-8'))
        return compact_result(research(identity,list(dict.fromkeys(topics)),store,work/'raw',seeds=seeds_from_database(source,identity['company_id']),
            fetcher=PublicFetcher(deadline_seconds=bounded_env('RESEARCH_V2_SECONDS',150,30,210),max_requests=bounded_env('RESEARCH_V2_MAX_REQUESTS',22,4,40),
                max_bytes=bounded_env('RESEARCH_V2_MAX_BYTES',18_000_000,1_000_000,25_000_000),timeout=bounded_env('RESEARCH_V2_HTTP_TIMEOUT',10,2,20)),
            max_rounds=bounded_env('RESEARCH_V2_FOLLOWUP_ROUNDS',2,0,2),max_documents=bounded_env('RESEARCH_V2_MAX_DOCUMENTS',12,4,20),
            cache_seconds=bounded_env('RESEARCH_V2_CACHE_SECONDS',86400,0,86400),source_version=manifest['sha256'],
            recovery_only=request['action']=='read_company_checkpoint'))
    finally: store.close()


if __name__=='__main__':
    try:
        request=json.loads(sys.stdin.read(8000))
        with contextlib.redirect_stdout(io.StringIO()): result=handle(request)
        print(json.dumps(result,ensure_ascii=False))
    except Exception as error:
        print(json.dumps({'error':type(error).__name__,'message':'公开调查未完成；已保存证据检查点，可在再次分析时恢复。'},ensure_ascii=False))
        sys.exit(1)
