"""V3 bounded per-question acquisition; V2 transport/HTML/PDF/search are reused.
No credentials, filesystem paths, shell, audio/video or external instructions accepted.
"""
from __future__ import annotations
import base64, gzip, hashlib, json, re, sys, time, uuid, os
from pathlib import Path
from v2.transport import PublicFetcher, SourceError, canonical_url
from v2.parsers import parse_html, parse_pdf, content_hash
from v2.channels import SearchAdapter
from v2.identity import company_identity, match_document
ROOT=Path(__file__).resolve().parents[2]
VERSION='v3-acquisition/1'
def sha(value): return hashlib.sha256(value).hexdigest()
def disk(path):
    # Keep logical relative references portable; only filesystem calls use Windows long paths.
    return Path('\\\\?\\'+str(path.resolve())) if os.name=='nt' and not str(path).startswith('\\\\?\\') else path

def save(path,value):
    temp=path.with_name(path.name+'.'+uuid.uuid4().hex+'.tmp')
    disk(temp).write_text(json.dumps(value,ensure_ascii=False),encoding='utf-8')
    try:
        for n in range(5):
            try:disk(temp).replace(disk(path));return
            except PermissionError:
                if n==4:raise
                time.sleep([0.04,0.1,0.2,0.4][n])
    finally:
        if disk(temp).exists():disk(temp).unlink()
def handle(req):
    allowed={'company_id','question_id','task_id','query','urls','imports','max_requests','seconds','recovery_only'}
    if not isinstance(req,dict) or set(req)-allowed: raise ValueError('fields')
    for field in ('question_id','task_id'):
        if not re.fullmatch(r'[a-zA-Z0-9-]{1,160}',req.get(field,'')): raise ValueError('id')
    if not isinstance(req.get('query'),str) or len(req['query'])>500: raise ValueError('query')
    urls=req.get('urls',[]);imports=req.get('imports',[])
    if not isinstance(urls,list) or len(urls)>4 or not isinstance(imports,list) or len(imports)>3: raise ValueError('inputs')
    identity=company_identity(ROOT/'.data/company-database/xray-v3-20261003.sqlite',req.get('company_id'))
    folder=ROOT/'.data/research-agent/v3'/req['task_id']/req['question_id'];disk(folder).mkdir(parents=True,exist_ok=True)
    statefile=folder/'checkpoint.json'
    state=json.loads(disk(statefile).read_text(encoding='utf-8')) if disk(statefile).exists() else {'records':[],'documents':[],'done':False,'requests':0}
    if req.get('recovery_only') or state['done']: return state
    fetcher=PublicFetcher(deadline_seconds=max(1,min(int(req.get('seconds',35)),90)),max_requests=max(0,min(int(req.get('max_requests',4)),6)),max_bytes=118_000_000,timeout=8)
    search=SearchAdapter(fetcher);started=time.monotonic()
    def stamp(): return time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
    def record(key,mode,source_class,url=None,query=None,error=None):
        status=error.status if error else 'ok'
        status={'not_found':'unreachable'}.get(status,status)
        if error and 'http_429' in error.reason:status='rate_limited'
        if status not in ('ok','empty','login_required','blocked','rate_limited','timeout','parse_error','not_configured','unsupported','unreachable','identity_mismatch','budget_exhausted'): status='parse_error'
        r={'sourceId':'source-'+sha(key.encode())[:28],'questionId':req['question_id'],'sourceClass':source_class,'acquisitionMode':mode,
           'accessState':status,'contentState':'unusable','analysisState':'rejected','declaredSubject':None,'publishedAt':None,'retrievedAt':stamp(),
           'url':url,'rawRef':None,'rawHash':None,'locators':[],'evidenceIds':[],'capabilityVersion':VERSION,
           'failureReason':error.reason if error else None,'elapsedMs':int((time.monotonic()-started)*1000),'query':query}
        state['records'].append(r);save(statefile,state);return r
    def accepted(parsed,body,mode,key,url=None,source_class='public_web',snippet=False,declared_source=None):
        r=record(key,mode,source_class,url)
        r['declaredSource']=declared_source
        digest=sha(body);name=digest+('.pdf' if mode in ('pdf','user_pdf') else '.txt' if mode=='user_text' else '.html.gz')
        raw=folder/name
        if not disk(raw).exists(): disk(raw).write_bytes(gzip.compress(body) if name.endswith('.gz') else body)
        r['rawHash']=digest;r['rawRef']=str(raw.relative_to(ROOT)).replace('\\','/')
        r['contentState']='index_snippet' if snippet else 'document' if mode in ('pdf','user_pdf') else 'full_text'
        r['publishedAt']=parsed.get('published_at')
        match=match_document(identity,parsed['title'],parsed['text'],disclosure=mode in ('pdf','user_pdf'))
        if match in ('conflict','other_subject','unresolved','ambiguous'):
            r.update(accessState='identity_mismatch',analysisState='quarantined',failureReason=match);save(statefile,state);return
        r['declaredSubject']=identity['legal_name'] if match in ('legal_name_match','credit_code_match') else None
        r['analysisState']='accepted' if r['declaredSubject'] else 'quarantined'
        units=[]
        if parsed.get('pages'):
            for page in parsed['pages']:
                lines=page['text'].splitlines()
                for i,line in enumerate(lines):
                    if re.search(r'培训|晋升|职级|调薪|成长|主营|业务|工资|薪酬|奖金|双休|值班|社保|公积金|加班|住宿|营业收入|净利润|现金流|签约主体|合同|信用代码|招聘|沟通|协作|绩效|回应|指控|监管|试用期|群聊元数据',line):
                        text='\n'.join(lines[max(0,i-2):i+4])[:6000]
                        units.append({'text':text,'locator':{'physical_page':page['physical_page'],'paragraph':i+1}})
        else:
            for p in parsed.get('paragraphs',[]):
                if re.search(r'培训|晋升|职级|调薪|成长|主营|业务|工资|薪酬|奖金|双休|值班|社保|公积金|加班|住宿|营业收入|净利润|现金流|签约主体|合同|信用代码|招聘|沟通|协作|绩效|回应|指控|监管|试用期|群聊元数据',p['text']):
                    units.append({'text':p['text'][:6000],'locator':{'paragraph':p['paragraph']}})
        # A large annual report must not spend the entire excerpt budget on its opening financial pages.
        # Reserve bounded slots for each inquiry class; the full parsed source stays on disk.
        categories=[r'固定月薪|年薪|工资|薪酬',r'员工培训|培训体系|入职培训|带教|导师',r'每周|双休|单休|值班|轮班',r'社保|社会保险|住房公积金',r'主营业务|主要业务|解决方案提供商',r'营业收入|净利润|现金流',r'签约主体|信用代码|法定代表人',r'晋升|职级|调薪|职业发展',r'沟通|协作|绩效|不同意见',r'合同|招聘|试用期',r'指控|回应|裁判|监管',r'加班|下班后|调休',r'群聊元数据']
        selected=[];locations=set()
        for pattern in categories:
            for unit in [u for u in units if re.search(pattern,u['text'])][:2]:
                unit_key=json.dumps(unit['locator'],sort_keys=True)
                if unit_key not in locations:selected.append(unit);locations.add(unit_key)
        for unit in units:
            unit_key=json.dumps(unit['locator'],sort_keys=True)
            if unit_key not in locations:selected.append(unit);locations.add(unit_key)
            if len(selected)>=32:break
        units=selected[:32]
        textfile=folder/(digest+'.parsed.json')
        save(textfile,parsed)
        doc={'id':'doc-'+sha((key+digest).encode())[:28],'url':url,'title':parsed['title'][:1000],'publishedAt':parsed.get('published_at'),'retrievedAt':r['retrievedAt'],
             'declaredSubject':r['declaredSubject'],'entityMatch':match,'rawRef':r['rawRef'],'rawHash':digest,'parsedRef':str(textfile.relative_to(ROOT)).replace('\\','/'),
             'originUrl':parsed.get('origin_url'),'contentHash':content_hash(parsed['text']),'mode':mode,'units':units}
        r['locators']=[u['locator'] for u in units]
        state['documents'].append(doc);save(statefile,state)
    seen={r.get('url') for r in state['records'] if r.get('url')}
    def acquire(hit):
        url=canonical_url(hit['url'])
        if url in seen:return
        seen.add(url)
        try:
            response=fetcher.fetch(url);pdf=response.body.startswith(b'%PDF-')
            if pdf: parsed=parse_pdf(response.body,seconds=min(30,max(1,fetcher.remaining())))
            elif 'text/plain' in response.content_type:
                text=response.body.decode('utf-8',errors='replace')
                parsed={'title':hit.get('title',''),'text':text,'paragraphs':[{'paragraph':i+1,'text':v} for i,v in enumerate(text.splitlines())],'published_at':None,'links':[]}
            else: parsed=parse_html(response.body,response.url)
            if len(parsed['text'].strip())<100 or len(parsed.get('paragraphs',[]))<2 and len(parsed['text'])<200 and not pdf:
                raise SourceError('parse_error','content','navigation_or_insufficient_body')
            accepted(parsed,response.body,'pdf' if pdf else 'http',response.url,response.url,'public_pdf' if pdf else 'public_web')
            # Follow at most one explicit disclosure PDF with the same global budget.
            if not pdf:
                for link in parsed.get('links',[])[:1]:
                    if re.search(r'\.pdf(?:[?#]|$)',link['url'],re.I):acquire(link)
        except SourceError as error:
            record(url,'http','public_web',url,error=error)
            if hit.get('snippet'):
                parsed={'title':hit.get('title',''),'text':hit['snippet'],'paragraphs':[{'paragraph':1,'text':hit['snippet']}],'published_at':None}
                accepted(parsed,hit['snippet'].encode(),'search',url+'-snippet',url,'search_index',snippet=True)
        except Exception:record(url,'http','public_web',url,error=SourceError('parse_error','parse','unexpected_parse_failure'))
        state['requests']=fetcher.requests;save(statefile,state)
    for i,item in enumerate(imports):
        if set(item)-{'kind','content','title','declared_source','synthetic_fixture'} or item.get('kind') not in ('text','pdf'):raise ValueError('import')
        mode='user_text' if item['kind']=='text' else 'user_pdf'
        body=item['content'].encode('utf-8') if item['kind']=='text' else base64.b64decode(item['content'],validate=True)
        if len(body)>18_000_000:raise ValueError('import size')
        key='import-'+sha(body)
        if any(r['sourceId']=='source-'+sha(key.encode())[:28] for r in state['records']):continue
        try:
            if mode=='user_pdf':parsed=parse_pdf(body,seconds=25)
            else:
                text=body.decode('utf-8')
                parsed={'title':item['title'],'text':text,'paragraphs':[{'paragraph':j+1,'text':v} for j,v in enumerate(text.splitlines()) if v.strip()],'published_at':None}
            accepted(parsed,body,mode,key,source_class='synthetic_fixture' if item.get('synthetic_fixture') else 'user_import_unverified',declared_source=item.get('declared_source'))
        except SourceError as error:
            if error.reason=='scan_or_no_text_ocr_unavailable':error=SourceError('unsupported','pdf',error.reason)
            record(key,mode,'user_import_unverified',error=error)
        except Exception:
            record(key+'-failure',mode,'user_import_unverified',error=SourceError('parse_error','import','unexpected_import_failure'))
    for url in urls:acquire({'url':url})
    # Discovery always bounded per question. A prior question failure does not skip this one.
    if req['query'] and fetcher.requests<fetcher.max_requests:
        for provider in ('bing','360'):
            if any(r['query']==req['query'] and r['sourceClass']=='search_'+provider for r in state['records']):continue
            try:
                hits=search.discover(req['query'],provider)
                relevant=[h for h in hits if any(a in h['title']+' '+h.get('snippet','') for a in identity['aliases'])]
                r=record('search-'+provider+req['query'],'search','search_'+provider,query=req['query'])
                r['contentState']='index_snippet';r['analysisState']='quarantined';r['accessState']='ok' if relevant else 'empty';save(statefile,state)
                for hit in relevant[:2]:acquire(hit)
                if relevant:break
            except SourceError as error:record('search-'+provider+req['query'],'search','search_'+provider,query=req['query'],error=error)
    state.update(done=True,requests=fetcher.requests)
    save(statefile,state);return state
if __name__=='__main__':
    try:
        req=json.loads(sys.stdin.read(80_000_000));result=handle(req);print(json.dumps(result,ensure_ascii=False))
    except Exception:
        print(json.dumps({'error':'acquisition_failed','message':'材料检查点保留，未自动重试'}));sys.exit(1)
