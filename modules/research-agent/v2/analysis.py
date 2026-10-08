"""Extract source claims conservatively. Financial pressure is not a job-loss finding."""
from __future__ import annotations
import re
from decimal import Decimal, InvalidOperation
from . import RULE_VERSION
from .store import stable_id

METRICS = {
    '营业收入':'revenue', '营业总收入':'total_revenue', '净利润':'net_profit',
    '归属于上市公司股东的净利润':'parent_net_profit', '归属于母公司股东的净利润':'parent_net_profit',
    '经营活动产生的现金流量净额':'operating_cashflow', '货币资金':'cash',
    '资产总计':'total_assets', '总资产':'total_assets', '负债合计':'total_liabilities',
    '流动负债合计':'current_liabilities', '短期借款':'short_term_borrowings', '长期借款':'long_term_borrowings',
    '在职员工的数量合计':'employees', '在职员工总数':'employees',
}
SIGNALS = {
    'hours.overtime':r'加班|调休', 'hours.schedule':r'双休|单休|工作时间|工时|值班|出差',
    'pay.bonus':r'年终奖|奖金|绩效工资', 'pay.total':r'年薪|薪资|薪酬|工资|底薪',
    'benefits.coverage':r'五险|社保|公积金|社会保险',
    'mental_space.autonomy':r'自主权|自主安排(?:任务|工作)|工作自主|任务自主|尊重员工|个人边界|表达意见|不同意见|辱骂|管理压力|申诉',
    'culture.collaboration':r'团队氛围|团队协作|沟通方式|管理支持|同事关系',
    'growth.promotion':r'晋升|升职|职级|培训|带教',
    'position.contract':r'劳动合同|签约主体|外包|派遣|短期项目|岗位调整',
    'company.audit':r'审计意见|持续经营.{0,15}重大不确定|保留意见|无法表示意见|否定意见',
    'company.risk_event':r'行政处罚|被执行|诉讼|仲裁|拖欠工资|破产|重整',
}
TOPIC_MAP = {'mental_space':'culture'}
METRIC_LABELS={'revenue':'营业收入','total_revenue':'营业总收入','net_profit':'净利润','parent_net_profit':'归属于母公司或上市公司股东的净利润',
    'operating_cashflow':'经营活动现金流量净额','cash':'货币资金','total_assets':'资产总额','total_liabilities':'负债总额',
    'current_liabilities':'流动负债','short_term_borrowings':'短期借款','long_term_borrowings':'长期借款','employees':'员工数量'}
TOPIC_LABELS={'company':'企业经营','growth':'晋升与成长','pay':'薪资透明','hours':'劳动时长','benefits':'五险一金','culture':'企业文化','position':'职位稳定','mental_space':'精神空间'}


def substantive_claim(key,text):
    """A topic label, question, navigation menu or technology slogan is not a claim."""
    text=re.sub(r'\s+','',text)
    if re.search(r'文章目录|(?:全文|内容|文章)目录|目录[1一][.、]',text): return False
    if re.search(r'为您提供.{0,160}(?:多维度|详细信息|信息查询)|怎么样[」?？]|(?:工资待遇|薪资待遇|加班情况).{0,6}(?:怎么样|如何)',text):
        return False
    if key=='company.risk_event':
        event=r'(?:行政处罚|被执行|诉讼|仲裁|拖欠工资|破产|重整)'
        return bool(re.search(r'(?:收到|受到|遭到|不存在|未发生|未受到|未涉及|没有|无重大|涉及|发生|正在|尚未|不涉及|立案|裁定).{0,24}'+event+r'|'+event+r'.{0,35}(?:判决|金额|罚款|未决|审理中|人民币|\d+万元)',text))
    if key=='company.audit':
        return bool(re.search(r'出具.{0,35}(?:意见|报告)|(?:标准无保留|保留|无法表示|否定)意见.{0,16}(?:报告|结论)|(?:存在|不存在|未发现).{0,25}重大不确定',text))
    if key=='pay.total':
        return bool(re.search(r'(?:年薪|薪资|薪酬|工资|底薪).{0,20}(?:\d[\d.,–—\-至~]*[kKwW元万千薪]|未明确|未知|不透明|发放|发薪|拖欠|税前|税后|扣除|降低|增长)|\d[\d.,–—\-至~]*[kKwW元万千].{0,15}(?:年薪|月薪|底薪)',text))
    if key=='pay.bonus':
        return bool(re.search(r'(?:没有|暂无|不提供|提供|无).{0,6}(?:年终奖|奖金)|(?:年终奖|奖金|绩效工资).{0,25}(?:\d|业绩|考核|发放|条件|包含|另计|未知|未明确)|含(?:年终奖|奖金)',text))
    if key=='hours.overtime':
        return bool(re.search(r'(?:不|无|经常|需要|要求|频繁|强制|自愿).{0,3}加班|加班.{0,20}(?:调休|补偿|工资|费|小时|严重|较多|频繁)|调休.{0,12}(?:安排|补偿|可用|不能|可以)',text))
    if key=='mental_space.autonomy' and not re.search(r'辱骂|个人边界|管理压力|申诉',text):
        return bool(re.search(r'员工|团队|工作|任务|主管|领导|经理',text))
    if key=='culture.collaboration':
        return bool(re.search(r'(?:团队氛围|团队协作|同事关系|沟通方式|管理支持).{0,20}(?:好|差|友善|紧张|融洽|困难|顺畅|直接|开放|尊重|支持|不|缺乏|较|一般)',text))
    return True


def number(value):
    text = str(value or '').strip().replace(',', '').replace('，','').replace('−','-')
    if re.fullmatch(r'\(\d+(?:\.\d+)?\)',text): text='-'+text[1:-1]
    if not re.fullmatch(r'[+-]?\d+(?:\.\d+)?',text): return None
    try: return Decimal(text)
    except InvalidOperation: return None


def _metric(label):
    label=re.sub(r'\s+','',label)
    label=re.sub(r'^[一二三四五六七八九十0-9]+[、.．]', '', label)
    label=re.sub(r'^其中[:：]', '', label)
    label=re.sub(r'[（(].*?[）)]','',label)
    return METRICS.get(label)


def source_context(doc):
    """Only explicit labels; company/job matching and employee identity stay unconfirmed."""
    text=doc['text'] if doc['access_mode']!='pdf' else ''
    def label(pattern):
        match=re.search(pattern+r'\s*[:：]\s*([^\n。；，]{2,60})',text)
        return match[1].strip() if match else None
    return {'role':label(r'(?:招聘岗位|岗位名称|职位名称|岗位)'),
        'department':label(r'(?:所在部门|部门)'), 'city':label(r'(?:工作地点|工作城市|城市)'),
        'experience_period':label(r'(?:经历时间|任职时间|在职时间)'),
        'employee_identity':'self_reported_unverified' if re.search(r'本人(?:曾|目前|现在)?(?:任职|在职|就职)|我是.{0,20}(?:员工|工程师)',text) else 'unknown'}


def risk_event(text,doc):
    category=next((name for pattern,name in [(r'行政处罚','administrative_penalty'),(r'被执行','enforcement'),
        (r'诉讼|仲裁','dispute'),(r'破产|重整','insolvency'),(r'拖欠工资','wage_claim')] if re.search(pattern,text)),None)
    if category is None: return None
    negative=bool(re.search(r'(?:不存在|未发生|未受到|无|没有).{0,12}(?:行政处罚|被执行|诉讼|仲裁|破产|重整|拖欠工资)',text))
    status='source_reports_none' if negative else 'alleged' if re.search(r'涉嫌|声称|指称|举报',text) else 'pending' if re.search(r'尚未判决|未决|审理中|待审|尚未生效',text) else 'effective_result' if re.search(r'已生效判决|判决已生效',text) else 'decision_issued' if '行政处罚决定书' in text else 'unknown'
    date=re.search(r'20\d{2}年\d{1,2}月\d{1,2}日|20\d{2}-\d{1,2}-\d{1,2}',text)
    amount=re.search(r'(?:罚款|处罚金额|涉案金额|执行标的|争议金额)\s*[:：]?\s*(?:人民币)?\s*[\d,，.]+\s*(?:亿元|万元|元)',text)
    return {'category':category,'subject':doc['company_name'] if doc['company_name'] in text else None,
        'date':date[0] if date else None,'event_status':status,'amount_quote':amount[0] if amount else None,
        'source_evidence_id':doc['id'],'limitation':'保留来源陈述与案件阶段；未明确主体、日期或结果时不补全，不等于已证实事件。'}


def financial_facts(doc):
    if doc['access_mode']=='index_snippet' or doc['entity_match'] not in ('legal_name_match','credit_code_match'):
        return []
    facts=[]
    for table in doc.get('tables',[]):
        rows=table['rows']
        context=table.get('context','')
        header=' '.join(context.splitlines()[-12:])+' '+' '.join(' '.join(r) for r in rows[:3])
        unit_match=list(re.finditer(r'单位\s*[:：]?\s*(人民币)?\s*(亿元|万元|元|人)',header))
        unit=unit_match[-1][2] if unit_match and len({m[2] for m in unit_match})==1 else None
        currencies=({'CNY'} if '人民币' in header else set()) | ({'HKD'} if '港元' in header or '港币' in header else set())
        currency=next(iter(currencies)) if len(currencies)==1 else None
        scope_matches=list(re.finditer(r'(合并|母公司)(?:资产负债表|利润表|现金流量表|财务报表)',context))
        scope=scope_matches[-1][1] if scope_matches else 'unknown'
        def periods(row):
            return {col:re.sub(r'\s+','',cell) for col,cell in enumerate(row[1:],1)
                if re.fullmatch(r'20\d{2}(?:\s*年(?:度|末|\s*\d{1,2}\s*月\s*\d{1,2}\s*日)?)?',cell)}
        column_periods=periods(table.get('column_header',[]))
        for row_index,row in enumerate(rows):
            if not row: continue
            row_periods=periods(row)
            if len(row_periods)>=2:
                column_periods=row_periods if len(set(row_periods.values()))==len(row_periods) else {}
                continue
            metric=_metric(row[0])
            if not metric: continue
            row_periods=column_periods
            if metric=='employees' and not row_periods and len(row)==2 and doc.get('report_period'):
                row_periods={1:doc['report_period']+'年（报告期员工表）'}
            if not row_periods: continue
            actual_unit='人' if metric=='employees' else unit
            if actual_unit is None or (actual_unit!='人' and currency is None): continue
            for col,period in row_periods.items():
                if col>=len(row): continue
                value=number(row[col])
                if value is None: continue
                factor={'元':1,'万元':10000,'亿元':100000000,'人':1}[actual_unit]
                locator={'physical_page':table.get('physical_page'),'printed_page':table.get('printed_page'),
                    'table':table['table'],'row':row_index+1,'column':col+1}
                quote=' | '.join(row)
                facts.append({'id':stable_id('fact',RULE_VERSION,doc['id'],metric,locator),'evidence_id':doc['id'],'company_id':doc['company_id'],
                    'kind':'normalized_fact','metric':metric,'value':str(value),'normalized_value':str(value*factor),
                    'unit':actual_unit,'currency':currency if actual_unit!='人' else None,'period':period,'reporting_scope':scope,
                    'scope':'company','job_id':None,'quote':quote,'locator':locator,'status':'source_claim',
                    'confidence':'medium' if scope!='unknown' else 'low','rule_version':RULE_VERSION,'dimensions':['company']})
    return facts


def source_claims(doc):
    claims=[]
    pieces=[]
    for page in doc.get('pages',[]):
        # Financial rows remain tables; prose claims are short attributed passages.
        pieces.extend((part,{'physical_page':page['physical_page'],'printed_page':page.get('printed_page')}) for part in re.split(r'(?<=[。；！？])',page['text']) if 2<len(part.strip())<=600)
    if not pieces:
        pieces=[(part,{'paragraph':p['paragraph']}) for p in doc.get('paragraphs',[]) for part in re.split(r'(?<=[。；！？])',p['text']) if 2<len(part.strip())<=600]
    for text,locator in pieces:
        for key,pattern in SIGNALS.items():
            if not re.search(pattern,text) or not substantive_claim(key,text): continue
            # Preserve the complete statement: negative/conditional language is never reduced to a keyword.
            polarity='negative' if re.search(r'不加班|无加班|没有|暂无|不提供|未提供|未缴|无年终奖|不予',text) else 'positive' if re.search(r'需要加班|经常加班|提供年终奖|提供晋升通道|缴纳社保',text) else 'unspecified'
            conditional=bool(re.search(r'视.{0,20}(业绩|考核)|根据.{0,20}(业绩|考核)|若|如.{0,12}则|达到|满足.{0,12}条件|以.{0,20}为准',text))
            dimension=key.split('.')[0]
            claim={'id':stable_id('claim',RULE_VERSION,doc['id'],key,text),'evidence_id':doc['id'],'company_id':doc['company_id'],
                'kind':'source_claim','metric':key,'value':None,'quote':text.strip(),'locator':locator,'status':'source_claim',
                'scope':'company','job_id':None,'period':doc.get('experience_period') or doc.get('report_period'),
                'department':doc.get('department'),'role':doc.get('role'),'polarity':polarity,'conditional':conditional,
                'confidence':'low' if doc['access_mode']=='index_snippet' or doc['channel']=='community' else 'medium',
                'rule_version':RULE_VERSION,'dimensions':[dimension]}
            if key=='company.risk_event': claim['risk_event']=risk_event(text,doc)
            claims.append(claim)
            if len(claims)>=40: return claims
    return claims


def procurement_fields(doc):
    if doc['channel']!='recruitment_procurement': return None
    text=doc['title']+'\n'+doc['text']
    if not re.search(r'采购|招标|中标|成交|验收',text): return None
    stage_text=doc['title'] if re.search(r'计划|意向|招标|中标|成交|合同|验收',doc['title']) else text[:1200]
    stage='acceptance' if '验收' in stage_text else 'contract' if '合同公告' in stage_text or '采购合同' in stage_text else 'awarded' if re.search(r'中标|成交',stage_text) else 'planned' if re.search(r'计划|意向',stage_text) else 'tender' if re.search(r'招标|采购公告',stage_text) else 'unknown'
    buyer=re.search(r'(?:采购人|采购单位|招标人)\s*[:：]\s*([^\n。；]{2,100})',text)
    beneficiary=re.search(r'(?:服务对象|保障对象|受益对象)\s*[:：]\s*([^\n。；]{2,100})',text)
    amount=re.search(r'(?:预算金额|中标金额|成交金额|合同金额)\s*[:：]\s*([\d,.]+\s*(?:万元|元))',text)
    buyer_name=re.split(r'\s*[一二三四五六七八九十]+[、．]',buyer[1])[0].strip() if buyer else None
    buyer_matches=buyer_name==doc['company_name'] if buyer_name else None
    limitation='采购阶段线索不证明福利已交付，采购金额不等于人均福利。'
    if buyer_matches is False: limitation+='这里的采购主体与目标公司不同，目标公司可能只是供货方或页面提及对象；不可用于推断目标公司员工福利。'
    return {'stage':stage,'buyer':buyer_name,'buyer_matches_company':buyer_matches,'beneficiary':beneficiary[1] if beneficiary else None,
        'amount_quote':amount[0] if amount else None,'benefit_delivered':None,'per_employee_value':None,
        'limitation':limitation}


def review_claims(claims, documents):
    docs={d['id']:d for d in documents}; reviews=[]
    for i,a in enumerate(claims):
        for b in claims[i+1:]:
            if a['metric']!=b['metric'] or a['company_id']!=b['company_id'] or a['evidence_id']==b['evidence_id']: continue
            if docs[a['evidence_id']]['content_hash']==docs[b['evidence_id']]['content_hash']: continue
            common={'claim_ids':[a['id'],b['id']],'status':'unresolved','rule_version':RULE_VERSION}
            if not a.get('period') or not b.get('period'):
                reviews.append({**common,'kind':'not_comparable','reason':'时间范围未知，不能判定直接矛盾。'}); continue
            if a['period']!=b['period']:
                reviews.append({**common,'kind':'time_difference','reason':'材料对应时期不同。'}); continue
            if any(a.get(k)!=b.get(k) for k in ('scope','job_id','department','role','reporting_scope','unit','currency')):
                reviews.append({**common,'kind':'scope_difference','reason':'主体以外的岗位、部门或统计口径不同。'}); continue
            # Unknown departments/roles in personal experience cannot prove comparability.
            if any(docs[x['evidence_id']]['channel']=='community' for x in (a,b)) and (not a.get('department') or not a.get('role')):
                reviews.append({**common,'kind':'not_comparable','reason':'员工经历缺少部门或岗位范围。'}); continue
            if a.get('conditional') or b.get('conditional'):
                reviews.append({**common,'kind':'conditional','reason':'存在生效条件，不能去掉条件后比较。'}); continue
            if (a.get('value') is not None and b.get('value') is not None and a['value']!=b['value']) or {a.get('polarity'),b.get('polarity')}=={'negative','positive'}:
                reviews.append({**common,'kind':'possible_conflict','reason':'可比范围内来源陈述不同，待核对原文。'})
    return reviews[:60]


def ratios(facts):
    results=[]
    for assets in [f for f in facts if f['metric']=='total_assets' and f.get('reporting_scope') not in (None,'unknown')]:
        for debt in [f for f in facts if f['metric']=='total_liabilities']:
            if any(assets.get(k)!=debt.get(k) for k in ('company_id','period','reporting_scope','currency','unit','evidence_id')): continue
            denominator=Decimal(assets['normalized_value'])
            if denominator<=0: continue
            results.append({'metric':'liabilities_to_assets','value':str(Decimal(debt['normalized_value'])/denominator),
                'formula':'total_liabilities / total_assets','input_fact_ids':[debt['id'],assets['id']],
                'period':assets['period'],'reporting_scope':assets['reporting_scope'],'status':'derived_from_source_claims'})
    return results


def translations(facts, documents, topics):
    docs={d['id']:d for d in documents}; result=[]
    selected_financial={}
    for fact in sorted(facts,key=lambda f:(f.get('reporting_scope')=='合并',f.get('period') or ''),reverse=True):
        if fact['kind']=='normalized_fact': selected_financial.setdefault((fact['evidence_id'],fact['metric']),fact['id'])
    priority=['revenue','net_profit','operating_cashflow','cash','total_assets','total_liabilities','current_liabilities','short_term_borrowings','long_term_borrowings','employees','parent_net_profit','total_revenue']
    ordered=sorted(facts,key=lambda f:(0 if f['kind']=='normalized_fact' else 1,priority.index(f['metric']) if f['metric'] in priority else len(priority)))
    for fact in ordered:
        if fact['kind']=='normalized_fact' and selected_financial.get((fact['evidence_id'],fact['metric']))!=fact['id']: continue
        dimension=fact['dimensions'][0]; public_topic=TOPIC_MAP.get(dimension,dimension)
        if public_topic not in topics: continue
        doc=docs[fact['evidence_id']]
        if fact['kind']=='normalized_fact':
            finding=f"材料记载{METRIC_LABELS.get(fact['metric'],fact['metric'])}：{fact['value']} {fact['unit']}；期间 {fact['period']}，口径 {'未明确' if fact['reporting_scope']=='unknown' else fact['reporting_scope']}。"
            inference='若资料主体与应聘业务有关，可作为询问经营变化的依据；不直接证明裁员、欠薪或岗位取消。'
            unknown='当前岗位预算、签约主体及报告期后的变化未知；收入、利润、现金流和可用现金分别理解。'
            question='这份岗位所属业务的预算和招聘原因是什么？近期经营变化是否影响其编制或合同？'
        else:
            finding=fact['quote']
            inference='推断：若该安排适用于应聘团队和入职时间，可能影响工作体验；目前仅为来源声称。'
            unknown='岗位、城市、部门、经历时间及兑现条件未明确时保留未知。'
            question='这条记载是否适用于我的岗位、城市和入职时间？能否提供当前书面制度或合同约定？'
            if dimension=='pay':
                unknown+=' 年薪含奖金时，固定月薪、奖金条件和税前税后不能由总额推算。'
            if dimension=='mental_space':
                question='团队如何处理不同意见、任务自主权和工作边界？是否有具体的沟通与申诉渠道？'
            if dimension=='company':
                inference='来源记录了经营或审计相关陈述，需先核对涉及主体、日期和事件阶段；不直接推断岗位会取消或待遇无法兑现。'
                unknown='该陈述是否描述实际发生事件、当前进展、涉及子公司及对招聘业务的影响尚需核实。'
                question='该事项目前处于什么阶段？是否涉及应聘岗位的签约主体与业务，能否提供最新公告？'
            if doc['channel']=='community':
                unknown+=' 这是有范围的员工经历或匿名声称，不代表企业普遍情况。'
            if doc['access_mode']=='index_snippet':
                unknown+=' 仅取得搜索索引摘要，未获得原帖正文或评论。'
        result.append({'id':stable_id('translation',fact['id']),'fact_ids':[fact['id']],'evidence_ids':[fact['evidence_id']],
            'dimension':dimension,'public_topic':public_topic,'finding':finding,'inference':inference,
            'relevance':'对应你已确认关注的'+TOPIC_LABELS.get(public_topic,public_topic)+'事项。','unknown':unknown,'question':question,
            'confidence':fact['confidence'],'locator':fact['locator'],'quote':fact['quote'],'status':'unverified_source_interpretation'})
    # Diversify display by dimension; complete facts and documents stay in the shared store.
    groups={}
    for item in result: groups.setdefault(item['dimension'],[]).append(item)
    return [g[i] for i in range(28) for g in groups.values() if i<len(g)][:28]
