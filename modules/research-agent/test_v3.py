"""Synthetic V3 adapter cases. These do not claim a live source success."""
import json, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
import worker_v3
from v2.transport import SourceError
IDENTITY={'company_id':271,'legal_name':'浙江大华技术股份有限公司','brand':'大华股份','aliases':['浙江大华技术股份有限公司','大华股份'],'credit_code':None,'match_status':'record_clue'}
class Fetcher:
    calls=0
    def __init__(self,**kwargs):self.requests=0;self.max_requests=kwargs['max_requests']
    def remaining(self):return 20
    def fetch(self,url):
        self.requests+=1;Fetcher.calls+=1
        raise SourceError('blocked','dns','non_public_destination')
class Search:
    def __init__(self,fetcher):self.fetcher=fetcher
    def discover(self,query,provider):return []
class V3Tests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        self.patches=[patch.object(worker_v3,'ROOT',self.root),patch.object(worker_v3,'company_identity',return_value=IDENTITY),patch.object(worker_v3,'PublicFetcher',Fetcher),patch.object(worker_v3,'SearchAdapter',Search)]
        for p in self.patches:p.start()
        Fetcher.calls=0
    def tearDown(self):
        for p in self.patches:p.stop()
        resolved=Path(self.temp.name).resolve()
        assert resolved.parent==Path(tempfile.gettempdir()).resolve() and resolved.name.startswith('tmp')
        self.temp.name=str(worker_v3.disk(resolved))
        self.temp.cleanup()
    def request(self,**overrides):
        return {'company_id':271,'question_id':'q-abc-r0','task_id':'task-abc','query':'','urls':[],'imports':[],'max_requests':2,'seconds':5,**overrides}
    def test_text_import_saves_original_locators_and_resume_issues_no_fetch(self):
        body='浙江大华技术股份有限公司\n2025年度主营业务：智慧物联解决方案。\n员工培训体系为在职员工提供学习机制。'
        req=self.request(imports=[{'kind':'text','content':body,'title':'主动提供文本'}])
        result=worker_v3.handle(req)
        self.assertEqual(result['documents'][0]['declaredSubject'],IDENTITY['legal_name'])
        raw=self.root/result['documents'][0]['rawRef']
        self.assertEqual(raw.read_text(encoding='utf-8'),body)
        self.assertTrue(result['documents'][0]['units'][0]['locator']['paragraph']>0)
        again=worker_v3.handle(req);self.assertEqual(again,result);self.assertEqual(Fetcher.calls,0)
    def test_specialist_need_and_explicit_group_metadata_survive_the_real_parser(self):
        body='浙江大华技术股份有限公司\n2026年度晋升条件：评审后调整职级。\n税前固定月薪 18000 元。\n[群聊元数据] 账号=甲 时间=2026-10-10T01:00:00Z 外链=https://example.org/post\n'
        result=worker_v3.handle(self.request(imports=[{'kind':'text','content':body,'title':'合成规则样本'}]))
        units=result['documents'][0]['units']
        self.assertTrue(any('晋升条件' in u['text'] for u in units))
        self.assertTrue(any('税前固定月薪 18000 元。' in u['text'] for u in units))
        self.assertTrue(any('[群聊元数据]' in u['text'] for u in units))
        self.assertEqual(Fetcher.calls,0)
    def test_unrelated_company_not_admitted(self):
        r=worker_v3.handle(self.request(imports=[{'kind':'text','content':'另一科技股份有限公司\n主营业务为软件。','title':'另一科技股份有限公司招聘'}]))
        self.assertEqual(r['documents'],[]);self.assertEqual(r['records'][0]['accessState'],'identity_mismatch')
    def test_access_failure_independent_from_business_judgment(self):
        r=worker_v3.handle(self.request(urls=['http://127.0.0.1/private']))
        self.assertEqual(r['documents'],[]);self.assertEqual(r['records'][0]['accessState'],'blocked')
        self.assertEqual(r['records'][0]['analysisState'],'rejected')
    def test_parser_failure_and_untrusted_fields_fail_closed(self):
        with self.assertRaises(ValueError):worker_v3.handle(self.request(shell='read private file'))
        with self.assertRaises(ValueError):worker_v3.handle(self.request(task_id='../private'))
        with patch.object(worker_v3,'parse_pdf',side_effect=SourceError('parse_error','pdf','scan_or_no_text_ocr_unavailable')):
            import base64
            r=worker_v3.handle(self.request(imports=[{'kind':'pdf','content':base64.b64encode(b'%PDF-scan').decode(),'title':'scan'}]))
            self.assertEqual(r['records'][0]['accessState'],'parse_error')
            self.assertTrue(r['records'][0]['rawRef'].endswith('.pdf'))
    def test_search_empty_is_separate_record_not_company_risk(self):
        r=worker_v3.handle(self.request(query='大华招聘'))
        self.assertEqual([x['accessState'] for x in r['records']],['empty','empty'])
        self.assertEqual(r['documents'],[])
    def test_windows_long_source_paths_preserve_original_and_checkpoint(self):
        worker_v3.ROOT=self.root/('long-source-path-'+'x'*160)
        r=worker_v3.handle(self.request(imports=[{'kind':'text','content':'浙江大华技术股份有限公司\n2025年度主营业务为软件解决方案，提供面向企业的服务。','title':'正文'}]))
        self.assertEqual(len(r['documents']),1)
        self.assertTrue(worker_v3.disk(worker_v3.ROOT/r['documents'][0]['rawRef']).exists())

    def test_recovery_only_never_opens_any_url(self):
        r=worker_v3.handle(self.request(recovery_only=True,urls=['https://example.com/']))
        self.assertEqual(Fetcher.calls,0);self.assertFalse(r['done'])

    def test_native_text_survives_unprocessed_scan_pages_without_ocr_budget_expansion(self):
        import base64
        text='浙江大华技术股份有限公司\n2025年度主营业务：智慧物联解决方案。'
        parsed={'title':'合成混合 PDF','text':text,'paragraphs':[],'pages':[{'physical_page':1,'text':text}]+[{'physical_page':i,'text':''} for i in range(2,14)],'warnings':[]}
        with patch.object(worker_v3,'parse_pdf',return_value=parsed),patch.object(worker_v3,'parse_local_document',side_effect=AssertionError('do not expand OCR page budget')):
            r=worker_v3.handle(self.request(imports=[{'kind':'pdf','content':base64.b64encode(b'%PDF-controlled-mixed').decode(),'title':'合成混合 PDF'}]))
        self.assertEqual(len(r['documents']),1)
        self.assertEqual(r['records'][0]['contentState'],'partial_text')
        self.assertTrue(any('ocr_page_or_time_limit' in x for x in r['documents'][0]['warnings']))
        self.assertEqual(Fetcher.calls,0)
if __name__=='__main__':unittest.main()
