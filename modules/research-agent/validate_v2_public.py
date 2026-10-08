"""Explicit operator-only real PDF check. The sample issuer is NOT inserted in the live company DB."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
from v2.pipeline import research,compact_result
from v2.store import EvidenceStore
from v2.transport import PublicFetcher

ROOT=Path(__file__).resolve().parents[2]
SAMPLE_URL='https://static.cninfo.com.cn/finalpage/2026-04-21/1225131222.PDF'
IDENTITY={'company_id':900001,'legal_name':'中控技术股份有限公司','brand':'中控技术','aliases':['中控技术股份有限公司','中控技术'],
    'credit_code':None,'stock':{'market':'SH','code':'688777'},'relationship':'unknown','match_status':'record_clue','candidates':[],'job_scope':'unconfirmed'}

def main():
    args=argparse.ArgumentParser(description=__doc__)
    args.add_argument('--all-channels',action='store_true')
    args.add_argument('--refresh',action='store_true')
    options=args.parse_args()
    directory=ROOT/'.data/agent-v2-validation/public-sample'
    store=EvidenceStore(directory/'evidence.sqlite')
    try:
        result=research(IDENTITY,['company','pay','hours','benefits','culture','position','growth'],store,directory/'raw',
            seeds=[{'url':SAMPLE_URL,'title':'待核对的企业披露文件','provider':'operator_public_sample'}],
            only_channels=None if options.all_channels else ['disclosure'],max_rounds=2 if options.all_channels else 0,
            fetcher=PublicFetcher(deadline_seconds=180,max_requests=22),cache_seconds=0 if options.refresh else 86400,
            source_version='public-material-validation-only')
        compact=compact_result(result)
        (directory/'result.json').write_text(json.dumps(compact,ensure_ascii=False,indent=2),encoding='utf-8')
        summary={'validation_only':True,'real_source':SAMPLE_URL,'status':result['status'],'documents':len(result['documents']),
            'facts':len(result['facts']),'financial_facts':sum(f['kind']=='normalized_fact' for f in result['facts']),
            'seconds':result['elapsed_ms']/1000,'output':str(directory/'result.json'),
            'attempts':[{k:a[k] for k in ('channel','status','stage') if k in a} for a in result['attempts']]}
        print(json.dumps(summary,ensure_ascii=False,indent=2))
    finally: store.close()

if __name__=='__main__': main()
