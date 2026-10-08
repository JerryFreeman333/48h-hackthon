"""Offline synthetic channel/restart fixtures. Never use these results as live materials."""
import copy
import json
import tempfile
import unittest
from pathlib import Path
from v2.pipeline import research,compact_result,independent_sources
from v2.store import EvidenceStore
from v2.transport import FetchResult,SourceError
from test_v2 import IDENTITY

def html(title,body):
    return ('<html><head><meta charset="utf-8"><title>'+title+'</title></head><article><h1>'+title+'</h1>'+body+'</article></html>').encode()

PAGES={
    'https://example.com/disclosure':html('晨光示例科技有限公司2025年年度报告','<p>合并资产负债表 单位：万元 币种：人民币</p><table><tr><td>项目</td><td>2025年</td><td>2024年</td></tr><tr><td>资产总计</td><td>200</td><td>100</td></tr><tr><td>负债合计</td><td>80</td><td>50</td></tr><tr><td>货币资金</td><td>20</td><td>30</td></tr></table><p>这是完全合成的测试公司经营材料。</p>'),
    'https://example.com/credit':html('晨光示例科技有限公司登记资料','<p>晨光示例科技有限公司登记线索，注册资本100万元；现金未知。本条为离线合成测试数据。</p>'),
    'https://example.com/recruit':html('晨光示例科技有限公司杭州研发招聘','<p>岗位：软件工程师。城市：杭州。年薪20–30万元含奖金，固定月薪未明确。奖金根据业绩发放。不加班。提供五险一金。员工可表达不同意见。这是合成招聘材料。</p>'),
    'https://example.com/procurement':html('晨光示例科技有限公司食堂采购意向公告','<p>采购人：晨光示例科技有限公司</p><p>预算金额：120万元</p><p>服务对象：杭州园区员工。本次为采购计划，尚未签订合同。仅作合成案例。</p>'),
}

class FixtureFetcher:
    def __init__(self,interrupt=False,fail_recruit=False):
        self.requests=0;self.max_requests=40;self.interrupt=interrupt;self.fail_recruit=fail_recruit;self.urls=[]
    def remaining(self):return 60
    def fetch(self,url):
        self.requests+=1;self.urls.append(url)
        if 'recruit' in url:
            if self.interrupt:raise KeyboardInterrupt('simulated process interruption')
            if self.fail_recruit:raise SourceError('timeout','http','fixture_timeout')
        if 'zhihu.com' in url:raise SourceError('login_required','http','fixture_login')
        return FetchResult(url,PAGES[url],'text/html; charset=utf-8',1)

class FixtureSearch:
    def __init__(self):self.queries=[]
    def discover(self,query,provider='bing'):
        self.queries.append(query)
        if '年度报告' in query:url='https://example.com/disclosure'
        elif '信用代码' in query:url='https://example.com/credit'
        elif '食堂' in query:url='https://example.com/procurement'
        elif '招聘 工资' in query:url='https://example.com/recruit'
        elif 'site:zhihu.com' in query:return [{'url':'https://www.zhihu.com/question/fixture','title':'晨光示例员工经历','snippet':'晨光示例员工声称：2023年研发团队经常加班；匿名经历，身份未知。','provider':provider,'platform':'zhihu'}]
        else:return []
        return [{'url':url,'title':'晨光示例科技有限公司合成材料','snippet':'晨光示例科技有限公司合成检索摘要。','provider':provider}]

def run_fixture(directory,store,**kwargs):
    return research(IDENTITY,['company','pay','hours','benefits','culture','position','growth'],store,Path(directory)/'raw',
        fetcher=kwargs.pop('fetcher',FixtureFetcher()),search=kwargs.pop('search',FixtureSearch()),source_version='synthetic-fixture-only',**kwargs)

class PipelineTests(unittest.TestCase):
    def test_all_channels_share_evidence_and_summary_level_remains_visible(self):
        with tempfile.TemporaryDirectory() as directory:
            store=EvidenceStore(Path(directory)/'db.sqlite')
            result=run_fixture(directory,store);store.close()
            self.assertEqual({d['channel'] for d in result['documents']},{'disclosure','credit','recruitment_procurement','community'})
            community=next(d for d in result['documents'] if d['channel']=='community')
            self.assertEqual(community['access_mode'],'index_snippet');self.assertEqual(community['employee_identity'],'unknown')
            self.assertTrue(any(a['status']=='login_required' for a in result['attempts']))
            recruit=next(d for d in result['documents'] if 'recruit' in d['url'])
            self.assertIn('hours',recruit['dimensions']);self.assertIn('pay',recruit['dimensions']);self.assertIn('mental_space',recruit['dimensions'])
            self.assertEqual(result['status'],'partial');self.assertEqual(result['stop_reason'],'no_new_independent_evidence')
            self.assertLessEqual(len(result['followups']),2)
            compact=compact_result(result)
            self.assertTrue(all('text' not in d for d in compact['documents']))
            self.assertTrue(all(any(e['id']==f['excerpt_id'] for e in compact['excerpts']) for f in compact['facts']))

    def test_restart_resumes_committed_material_without_duplication(self):
        with tempfile.TemporaryDirectory() as directory:
            store=EvidenceStore(Path(directory)/'db.sqlite');fetcher=FixtureFetcher(interrupt=True)
            with self.assertRaises(KeyboardInterrupt):run_fixture(directory,store,fetcher=fetcher)
            self.assertEqual(store.db.execute('SELECT COUNT(*) FROM v2_documents').fetchone()[0],2)
            store.close();store=EvidenceStore(Path(directory)/'db.sqlite')
            resumed=FixtureFetcher();result=run_fixture(directory,store,fetcher=resumed)
            self.assertNotIn('https://example.com/disclosure',resumed.urls);self.assertNotIn('https://example.com/credit',resumed.urls)
            count=store.db.execute('SELECT COUNT(*) FROM v2_facts').fetchone()[0]
            again=run_fixture(directory,store)
            self.assertEqual(store.db.execute('SELECT COUNT(*) FROM v2_facts').fetchone()[0],count)
            self.assertEqual(result['independent_sources'],again['independent_sources']);store.close()

    def test_partial_source_failure_retains_completed_materials(self):
        with tempfile.TemporaryDirectory() as directory:
            store=EvidenceStore(Path(directory)/'db.sqlite')
            result=run_fixture(directory,store,fetcher=FixtureFetcher(fail_recruit=True));store.close()
            self.assertTrue(any(d['channel']=='disclosure' for d in result['documents']))
            self.assertTrue(any(a['status']=='timeout' for a in result['attempts']))
            self.assertEqual(result['status'],'partial')

    def test_failed_body_is_retried_and_summary_upgraded_without_duplicate_source(self):
        with tempfile.TemporaryDirectory() as directory:
            store=EvidenceStore(Path(directory)/'db.sqlite')
            first=run_fixture(directory,store,fetcher=FixtureFetcher(fail_recruit=True))
            self.assertEqual(next(d for d in first['documents'] if d['url'].endswith('/recruit'))['access_mode'],'index_snippet')
            fetcher=FixtureFetcher();second=run_fixture(directory,store,fetcher=fetcher)
            self.assertIn('https://example.com/recruit',fetcher.urls)
            self.assertEqual([d['access_mode'] for d in second['documents'] if d['url'].endswith('/recruit')],['html'])
            self.assertEqual(first['independent_sources'],second['independent_sources']);store.close()

    def test_interrupted_snapshot_recovers_without_network_calls(self):
        with tempfile.TemporaryDirectory() as directory:
            store=EvidenceStore(Path(directory)/'db.sqlite')
            with self.assertRaises(KeyboardInterrupt):run_fixture(directory,store,fetcher=FixtureFetcher(interrupt=True))
            fetcher=FixtureFetcher();search=FixtureSearch()
            recovered=run_fixture(directory,store,fetcher=fetcher,search=search,recovery_only=True)
            self.assertEqual(len(recovered['documents']),2);self.assertEqual(fetcher.urls,[]);self.assertEqual(search.queries,[])
            self.assertEqual(recovered['stop_reason'],'checkpoint_recovery');self.assertEqual(recovered['status'],'partial');store.close()

    def test_transitive_reposts_are_one_independent_group(self):
        docs=[{'url':'https://example.com/a','content_hash':'aaa'},
              {'url':'https://example.com/b','content_hash':'bbb','origin_url':'https://example.com/a'},
              {'url':'https://example.com/c','content_hash':'bbb'}]
        self.assertEqual(len(independent_sources(docs)),1)

def export_fixture():
    with tempfile.TemporaryDirectory() as directory:
        store=EvidenceStore(Path(directory)/'db.sqlite');result=compact_result(run_fixture(directory,store));store.close()
        for doc in result['documents']:doc['fixture']=True
        for excerpt in result['excerpts']:excerpt['fixture']=True
        result['notes'].insert(0,'SYNTHETIC FIXTURE / 合成材料，仅供离线测试；不得进入真实报告。')
        target=Path(__file__).parent/'fixtures/v2-channels.fixture.json'
        target.parent.mkdir(exist_ok=True)
        target.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        print(target)

if __name__=='__main__':
    import sys
    if '--export-fixture' in sys.argv:export_fixture()
    else:unittest.main()
