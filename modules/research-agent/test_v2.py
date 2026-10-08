"""Synthetic adversarial fixtures; no network, real users, or source-database writes."""
import copy
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from v2.analysis import financial_facts, source_claims, procurement_fields, review_claims, ratios, translations
from v2.identity import stock_identity, match_document
from v2.parsers import parse_html, content_hash
from v2.pipeline import make_document, research, compact_result
from v2.provenance import validate_snapshot
from v2.store import EvidenceStore
from v2.transport import canonical_url, public_addresses, SourceError, FetchResult, PublicFetcher
from v2.channels import parse_search

IDENTITY={'company_id':900001,'legal_name':'晨光示例科技有限公司','brand':'晨光示例','aliases':['晨光示例科技有限公司','晨光示例'],
    'credit_code':None,'stock':None,'relationship':'unknown','match_status':'record_clue','candidates':[],'job_scope':'unconfirmed'}


def document(text='晨光示例科技有限公司招聘：年薪20–30万元含奖金，固定底薪未知。暂无年终奖。不加班。没有晋升通道。',channel='recruitment_procurement',url='https://example.com/fixture'):
    text+='这是离线合成测试资料，不代表真实公司。'
    parsed=parse_html(('<html><title>晨光示例科技有限公司</title><article><p>'+text+'</p></article></html>').encode(),url)
    return make_document(IDENTITY,parsed,{'url':url,'title':parsed['title'],'fixture':True},channel,'html')


def financial_document():
    doc=document('晨光示例科技有限公司2025年度报告。合并报表与母公司报表分别记录。','disclosure')
    doc['tables']=[{'table':1,'physical_page':7,'printed_page':'5','context':'合并资产负债表 单位：万元 币种：人民币',
        'rows':[['项目','2024年','2025年'],['资产总计','100','200'],['负债合计','50','80'],['货币资金','','20']]},
        {'table':2,'physical_page':8,'context':'母公司利润表 单位：元 币种：人民币','rows':[['项目','2025年度','2024年度'],['净利润','-100','120'],['经营活动产生的现金流量净额','30','-10']]}]
    return doc


class IdentityTests(unittest.TestCase):
    def test_market_width_and_no_numeric_substring(self):
        self.assertEqual(stock_identity('HK700'),{'market':'HK','code':'00700'})
        self.assertEqual(stock_identity('00700.HK'),{'market':'HK','code':'00700'})
        self.assertEqual(stock_identity('688777'),{'market':'SH','code':'688777'})
        self.assertIsNone(stock_identity('公司收入688777万元'))
        self.assertIsNone(stock_identity('SZ688777'))

    def test_ambiguous_company_and_wrong_issuer_rejected(self):
        self.assertEqual(match_document({**IDENTITY,'match_status':'ambiguous'},'晨光示例','晨光示例科技有限公司'),'ambiguous')
        self.assertEqual(match_document(IDENTITY,'别的科技有限公司年度报告','客户晨光示例科技有限公司'),'other_subject')
        self.assertEqual(match_document(IDENTITY,'未来晨光示例科技有限公司年报','晨光示例科技有限公司'),'other_subject')
        with_code={**IDENTITY,'credit_code':'91330000TEST1234567'}
        self.assertEqual(match_document(with_code,'其他股份有限公司','客户晨光示例科技有限公司，统一社会信用代码：91330000TEST1234567'),'other_subject')
        self.assertEqual(match_document(IDENTITY,'集团财务报告','晨光示例品牌',disclosure=True),'unresolved')
        supcon={**IDENTITY,'legal_name':'浙江中控信息产业股份有限公司','aliases':['浙江中控信息产业股份有限公司','中控信息']}
        self.assertEqual(match_document(supcon,'中控技术股份有限公司2025年度报告','中控技术股份有限公司',disclosure=True),'other_subject')


class ExtractionTests(unittest.TestCase):
    def test_explicit_role_city_experience_and_risk_stage_preserved(self):
        doc=document('晨光示例科技有限公司。岗位：软件工程师。城市：杭州。部门：研发部。经历时间：2023年。')
        self.assertEqual(doc['city'],'杭州');self.assertEqual(doc['role'],'软件工程师');self.assertEqual(doc['experience_period'],'2023年')
        doc=document('晨光示例科技有限公司于2025年6月1日收到行政处罚决定书，罚款人民币10万元。','credit')
        claim=next(c for c in source_claims(doc) if c['metric']=='company.risk_event')
        event=claim['risk_event'];self.assertEqual(event['event_status'],'decision_issued');self.assertEqual(event['subject'],IDENTITY['legal_name'])
        self.assertEqual(event['date'],'2025年6月1日');self.assertEqual(event['amount_quote'],'罚款人民币10万元')
        no_event=source_claims(document('晨光示例科技有限公司不存在重大诉讼。','credit'))[0]['risk_event']
        self.assertEqual(no_event['event_status'],'source_reports_none');self.assertIsNone(no_event['amount_quote'])

    def test_employee_count_keeps_report_scope_and_is_not_a_layoff_claim(self):
        doc=financial_document();doc['report_period']='2025'
        doc['tables']=[{'table':1,'physical_page':50,'context':'员工情况','rows':[['在职员工的数量合计','1200']]}]
        fact=financial_facts(doc)[0]
        self.assertEqual(fact['unit'],'人');self.assertIsNone(fact['currency']);self.assertEqual(fact['reporting_scope'],'unknown')
        self.assertIn('不直接证明裁员',translations([fact],[doc],['company'])[0]['inference'])

    def test_financial_units_column_order_and_scope(self):
        facts=financial_facts(financial_document())
        asset=next(f for f in facts if f['metric']=='total_assets' and f['period']=='2025年')
        self.assertEqual(asset['value'],'200'); self.assertEqual(asset['normalized_value'],'2000000')
        self.assertEqual(asset['locator']['column'],3); self.assertEqual(asset['reporting_scope'],'合并')
        self.assertFalse(any(f['metric']=='cash' and f['period']=='2024年' for f in facts))
        self.assertTrue(any(f['value']=='-100' and f['reporting_scope']=='母公司' for f in facts))
        self.assertEqual(ratios(facts)[1]['value'],'0.4')

    def test_missing_unit_and_snippet_never_produce_financial_numbers(self):
        doc=financial_document(); doc['tables'][0]['context']='合并资产负债表'
        self.assertFalse(any(f['metric']=='total_assets' for f in financial_facts(doc)))
        doc['access_mode']='index_snippet'; self.assertEqual(financial_facts(doc),[])

    def test_negation_bonus_conditions_and_no_fixed_monthly_inference(self):
        doc=document(); claims=source_claims(doc)
        self.assertTrue(any(c['metric']=='hours.overtime' and c['polarity']=='negative' for c in claims))
        self.assertTrue(any(c['metric']=='growth.promotion' and '没有晋升通道' in c['quote'] for c in claims))
        text=json.dumps(translations(claims,[doc],['pay','hours','growth']),ensure_ascii=False)
        self.assertIn('固定月薪',text); self.assertNotIn('16666',text); self.assertNotIn('25000',text)
        conditional=source_claims(document('晨光示例科技有限公司奖金根据年度考核与业绩发放，以书面合同为准。'))
        self.assertTrue(any(c['conditional'] for c in conditional))

    def test_mental_space_not_growth(self):
        claims=source_claims(document('晨光示例科技有限公司允许员工表达不同意见，员工自主安排任务并保护个人边界。'))
        self.assertTrue(any('mental_space' in c['dimensions'] for c in claims))
        self.assertFalse(any(c['metric'].startswith('growth') for c in claims))

    def test_registration_and_losses_do_not_become_job_stability(self):
        self.assertEqual(financial_facts(document('晨光示例科技有限公司注册资本100亿元，现金余额未公开。')),[])
        doc=financial_document(); facts=financial_facts(doc)
        text=json.dumps(translations(facts,[doc],['company']),ensure_ascii=False)
        self.assertIn('不直接证明裁员',text); self.assertNotIn('将会拖欠工资',text)

    def test_procurement_is_stage_clue_not_delivered_benefit(self):
        doc=document('晨光示例科技有限公司员工食堂采购计划。采购人：晨光示例科技有限公司\n预算金额：120万元\n服务对象：杭州园区员工。')
        doc['title']='晨光示例科技有限公司食堂采购意向公告'
        fields=procurement_fields(doc)
        self.assertEqual(fields['stage'],'planned');self.assertIsNone(fields['benefit_delivered']);self.assertIsNone(fields['per_employee_value'])
        doc['title']='晨光示例科技有限公司食堂中标公告';self.assertEqual(procurement_fields(doc)['stage'],'awarded')

    def test_period_and_scope_difference_not_conflict(self):
        first=document(channel='community'); second=document('晨光示例科技有限公司新招聘说明双休。',url='https://example.com/new')
        a=source_claims(first)[0]; b={**a,'id':'second','evidence_id':second['id'],'period':'2025','polarity':'positive'}
        a['period']='2023'
        self.assertEqual(review_claims([a,b],[first,second])[0]['kind'],'time_difference')
        a['period']='2025';a['department']='销售';b['department']='研发'
        self.assertEqual(review_claims([a,b],[first,second])[0]['kind'],'scope_difference')

    def test_citation_subject_locator_and_hash_are_checked(self):
        doc=financial_document(); facts=financial_facts(doc)
        self.assertEqual(validate_snapshot([doc],facts,900001),[])
        wrong=copy.deepcopy(facts);wrong[0]['evidence_id']='missing'
        self.assertIn('missing_evidence',validate_snapshot([doc],wrong,900001))
        wrong=copy.deepcopy(facts);wrong[0]['locator']['column']=4
        self.assertIn('quote_or_locator_mismatch',validate_snapshot([doc],wrong,900001))
        wrong=copy.deepcopy(facts);wrong[0]['company_id']=999
        self.assertIn('subject_mismatch',validate_snapshot([doc],wrong,900001))
        doc['text']+='tampered';self.assertIn('evidence_hash_mismatch',validate_snapshot([doc],facts,900001))


class TransportTests(unittest.TestCase):
    def test_redirect_destination_is_revalidated_before_second_connection(self):
        class Response:
            status=302
            def getheader(self,name,default=None):return 'http://127.0.0.1/private' if name=='Location' else default
        class Connection:
            sock=None
            def __init__(self,*args):self.args=args
            def request(self,*args,**kwargs):pass
            def getresponse(self):return Response()
            def close(self):pass
        with patch('v2.transport.public_addresses',side_effect=[['93.184.215.14'],SourceError('blocked','dns','non_public_destination')]) as dns, patch('v2.transport._PinnedHTTPS',side_effect=Connection) as connection:
            with self.assertRaises(SourceError) as caught:PublicFetcher(domain_interval=0).fetch('https://example.com/start')
            self.assertEqual(caught.exception.status,'blocked');self.assertEqual(connection.call_count,1)
            self.assertEqual(connection.call_args.args[2],'93.184.215.14');self.assertEqual(dns.call_args.args[0],'127.0.0.1')

    def test_streamed_response_cannot_exceed_size_budget(self):
        class Response:
            status=200
            def getheader(self,name,default=None):return 'text/html' if name=='Content-Type' else default
            def read1(self,size):return b'x'*size
        class Connection:
            sock=None
            def __init__(self,*args):pass
            def request(self,*args,**kwargs):pass
            def getresponse(self):return Response()
            def close(self):pass
        with patch('v2.transport.public_addresses',return_value=['93.184.215.14']),patch('v2.transport._PinnedHTTPS',Connection):
            with self.assertRaises(SourceError) as caught:PublicFetcher(max_bytes=10,domain_interval=0).fetch('https://example.com/large')
            self.assertEqual(caught.exception.reason,'size_limit')

    def test_360_original_locator_and_card_boundaries(self):
        html=b'<li class="res-list"><h3 class="res-title"><a href="https://www.so.com/link?m=opaque" data-mdurl="https://example.com/a">first</a></h3><p class="res-desc">first snippet</p></li><li class="res-list"><h3><a href="https://ai.so.com/answer">generated answer</a></h3><p class="res-desc">not original material</p></li><li class="res-list"><h3><a href="https://example.com/b">second</a></h3><p class="res-desc">second snippet</p></li>'
        hits=parse_search(html,'https://www.so.com/s?q=fixture','360')
        self.assertEqual([h['url'] for h in hits],['https://example.com/a','https://example.com/b'])
        self.assertEqual(hits[0]['snippet'],'first snippet')

    def test_financial_table_period_header_changes_mid_table(self):
        doc=financial_document();doc['tables'][0]['rows']=[['项目','2025年','2024年'],['营业收入','100','200'],['','2025年末','2024年末'],['总资产','300','250']]
        facts=financial_facts(doc)
        self.assertEqual(next(f for f in facts if f['metric']=='total_assets')['period'],'2025年末')

    def test_urls_and_dns_refuse_private_destinations(self):
        for url in ['file:///etc/passwd','http://a:b@example.com/','http://example.com:1234/','https://example.com\\@localhost/']:
            with self.assertRaises(SourceError): canonical_url(url)
        for host in ['localhost','127.0.0.1','169.254.169.254','10.0.0.1','::1']:
            with self.assertRaises(SourceError): public_addresses(host,80)
        with patch('socket.getaddrinfo',return_value=[(2,1,6,'',('192.168.1.1',80))]):
            with self.assertRaises(SourceError): public_addresses('rebind.example',80)

    def test_blocked_login_empty_and_parse_error_distinct(self):
        with self.assertRaises(SourceError) as blocked: parse_html(b'<title>Access Denied</title>','https://example.com')
        self.assertEqual(blocked.exception.status,'blocked')
        with self.assertRaises(SourceError) as login: parse_html(b'<input type=password>','https://example.com')
        self.assertEqual(login.exception.status,'login_required')
        self.assertEqual(parse_search(b'<p>No results found</p>','https://cn.bing.com','bing'),[])
        with self.assertRaises(SourceError) as parse: parse_search(b'<html>new search layout</html>','https://cn.bing.com','bing')
        self.assertEqual(parse.exception.status,'parse_error')


class StoreTests(unittest.TestCase):
    def test_reposts_idempotence_and_full_text_survive_reopen(self):
        with tempfile.TemporaryDirectory() as path:
            store=EvidenceStore(Path(path)/'work.sqlite');store.start('run',IDENTITY)
            for url in ['https://one.example/a','https://two.example/b','https://three.example/c']:
                doc=document(url=url);store.save_document('run',doc);store.save_facts(source_claims(doc))
            snapshot=store.snapshot('run');self.assertEqual(len(snapshot['documents']),1)
            self.assertEqual(len(snapshot['documents'][0]['discovered_urls']),3)
            count=len(snapshot['facts']);self.assertGreater(count,0);store.close()
            store=EvidenceStore(Path(path)/'work.sqlite');self.assertEqual(len(store.snapshot('run')['facts']),count);store.close()


if __name__=='__main__': unittest.main()
