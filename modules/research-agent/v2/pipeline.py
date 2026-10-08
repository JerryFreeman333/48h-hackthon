"""Four bounded channel adapters, shared evidence, checkpoints and targeted follow-up."""
from __future__ import annotations
import gzip
import hashlib
import json
import re
import time
from pathlib import Path
from . import VERSION, PARSER_VERSION, RULE_VERSION
from .analysis import financial_facts, source_claims, source_context, procurement_fields, review_claims, ratios, translations, TOPIC_MAP
from .channels import SearchAdapter, channel_queries, capability_matrix, platform_for
from .identity import identity_key, match_document
from .parsers import parse_html, parse_pdf, content_hash
from .provenance import validate_snapshot
from .store import EvidenceStore, stable_id, utcnow
from .transport import PublicFetcher, SourceError, canonical_url

CHANNELS=('disclosure','credit','recruitment_procurement','community')
FOLLOW_UP={
    'company':('disclosure','年度报告 合并资产负债表 经营活动现金流'),
    'benefits':('recruitment_procurement','招聘 社会保险 公积金 缴纳基数'),
    'pay':('recruitment_procurement','招聘 固定工资 奖金 条件'),
    'hours':('recruitment_procurement','招聘 工作时间 双休 加班'),
    'culture':('community','员工 尊重 自主 沟通 体验 site:zhihu.com'),
    'position':('recruitment_procurement','招聘 合同 用工主体 项目周期'),
    'growth':('recruitment_procurement','员工 培训 晋升 制度'),
}


def independent_sources(documents):
    """Connected provenance groups: same URL, content or declared original is one source."""
    groups=[]
    for doc in documents:
        keys={doc['content_hash'],canonical_url(doc['url'])}
        if doc.get('origin_url'):
            keys.add(canonical_url(doc['origin_url']))
        if doc.get('source_lineage'): keys.add(doc['source_lineage'])
        overlapping=[g for g in groups if g & keys]
        for group in overlapping:
            keys.update(group);groups.remove(group)
        groups.append(keys)
    return groups


def prefer_full_documents(documents):
    full_urls={canonical_url(d['url']) for d in documents if d['access_mode']!='index_snippet'}
    return [d for d in documents if d['access_mode']!='index_snippet' or canonical_url(d['url']) not in full_urls]


def make_document(identity, parsed, hit, channel, mode, raw_path=None, raw_hash=None):
    match=match_document(identity,parsed['title'],parsed['text'],disclosure=mode=='pdf')
    if match in ('ambiguous','conflict','other_subject','unresolved'):
        raise SourceError('identity_mismatch','identity',match)
    digest=content_hash(parsed['text'])
    period=re.search(r'(20\d{2})\s*年\s*(?:年度|半年度)报告',parsed['title'])
    doc={**parsed,'id':stable_id('evidence',identity_key(identity),digest,mode), 'company_id':identity['company_id'],
        'company_name':identity.get('legal_name') or identity['brand'],'job_id':None,'scope':'company',
        'channel':channel,'channels':[channel],'platform':hit.get('platform') or platform_for(hit['url']),
        'provider':hit.get('provider','public_url'),'access_mode':mode,'url':canonical_url(hit['url']),
        'discovered_urls':[hit.get('discovery_url') or hit['url']],'query':hit.get('query'),
        'content_hash':digest,'raw_hash':raw_hash,'raw_path':raw_path,'entity_match':match,
        'collected_at':utcnow(),'report_period':period[1] if period else None,
        'experience_period':None,'department':None,'role':None,'city':None,'employee_identity':'unknown',
        'source_lineage':parsed.get('origin_url') or digest,'dimensions':[], 'fixture':bool(hit.get('fixture',False))}
    doc.update(source_context(doc))
    procurement=procurement_fields(doc)
    if procurement: doc['procurement']=procurement
    return doc


def research(identity, topics, store: EvidenceStore, raw_dir: Path, *, seeds=None, fetcher=None, search=None,
             max_rounds=2, max_documents=12, cache_seconds=86400, source_version='', only_channels=None, recovery_only=False):
    started=time.monotonic()
    fetcher=fetcher or PublicFetcher()
    search=search or SearchAdapter(fetcher)
    channels=only_channels or CHANNELS
    queries=channel_queries(identity)
    # Same target/scope/versions can resume. Expired stages reacquire; snapshots show original collection dates.
    run_id=stable_id('run',VERSION,PARSER_VERSION,RULE_VERSION,identity_key(identity),sorted(topics),source_version,list(channels),queries,max_rounds)
    if not recovery_only: store.start(run_id,identity)
    raw_dir.mkdir(parents=True,exist_ok=True)
    notes=[]; followups=[]; reused=[]
    current_documents={}
    attempted_queries=set()
    fetched_urls=set()
    failed_channels=set()
    if recovery_only:
        current_documents={d['id']:d for d in prefer_full_documents(store.snapshot(run_id)['documents'])[:max_documents]}
        notes.append('本次采集提前结束；以下材料从本次任务的已保存检查点恢复，未重新访问来源。')

    def record(channel,status,stage,**extra):
        row={'channel':channel,'status':status,'stage':stage,'at':utcnow(),**extra}
        store.attempt(run_id,row)
        if status not in ('ok','empty'): failed_channels.add(channel)
        return row

    def accept(parsed,hit,channel,mode,raw_path=None,raw_hash=None):
        if hit.get('fixture'):
            raise SourceError('unsupported','validation','fixture_not_allowed_in_live')
        doc=make_document(identity,parsed,hit,channel,mode,raw_path,raw_hash)
        facts=financial_facts(doc)+source_claims(doc)
        doc['dimensions']=sorted({dim for f in facts for dim in f['dimensions']})
        errors=validate_snapshot([doc],facts,identity['company_id'])
        if errors: raise SourceError('parse_error','validation','invalid_evidence_or_quote')
        doc=store.save_document(run_id,doc)
        store.save_facts(facts)
        store.checkpoint(run_id,'material:'+canonical_url(hit['url']),{'document_id':doc['id']})
        current_documents[doc['id']]=doc
        record(channel,'ok','acquire',provider=doc['provider'],platform=doc['platform'],access_mode=mode,
               url=doc['url'],evidence_id=doc['id'],count=1)
        return doc

    def acquire(hit,channel):
        if len(current_documents)>=max_documents: return
        url=canonical_url(hit['url'])
        if url in fetched_urls: return
        fetched_urls.add(url)
        saved=store.load_checkpoint(run_id,'material:'+url,cache_seconds)
        if saved:
            doc=next((d for d in store.snapshot(run_id)['documents'] if d['id']==saved.get('document_id')),None)
            if doc and doc['access_mode']!='index_snippet':
                current_documents[doc['id']]=doc
                return doc
        stamp=time.monotonic()
        try:
            response=fetcher.fetch(url)
            is_pdf=response.body.startswith(b'%PDF-')
            if is_pdf:
                parsed=parse_pdf(response.body,seconds=min(45,max(1,fetcher.remaining())))
                mode='pdf'
            else:
                parsed=parse_html(response.body,response.url); mode='html'
            digest=hashlib.sha256(response.body).hexdigest()
            raw_path=raw_dir/(digest+('.pdf' if is_pdf else '.html.gz'))
            # Write raw bytes only once; untrusted names/paths never enter this location.
            if not raw_path.exists(): raw_path.write_bytes(response.body if is_pdf else gzip.compress(response.body))
            doc=accept(parsed,{**hit,'url':response.url},channel,mode,str(raw_path.name),digest)
            if response.url!=url:
                store.checkpoint(run_id,'material:'+url,{'document_id':doc['id']})
            if channel=='disclosure' and not is_pdf:
                for link in parsed.get('links',[])[:2]:
                    if re.search(r'\.pdf(?:\?|$)',link['url'],re.I):
                        acquire({**link,'discovery_url':url,'provider':'document_link','query':hit.get('query')},channel)
            return doc
        except SourceError as error:
            record(channel,error.status,error.stage,provider=hit.get('provider','public_url'),platform=hit.get('platform') or platform_for(url),
                   url=url,reason=error.reason,elapsed_ms=int((time.monotonic()-stamp)*1000),count=0)
        except Exception:
            record(channel,'parse_error','parse',platform=platform_for(url),url=url,reason='unexpected_parser_error',count=0)
        # Search summaries survive a failed article fetch, with their lower access level explicit.
        if hit.get('snippet'):
            snippet=hit['snippet']
            parsed={'title':hit['title'],'text':snippet,'pages':[],'paragraphs':[{'paragraph':1,'text':snippet}],
                'tables':[],'published_at':hit.get('published_at'),'parser_version':PARSER_VERSION,'warnings':['original_body_unavailable'],'links':[],'origin_url':None}
            try: return accept(parsed,hit,channel,'index_snippet')
            except SourceError as error: record(channel,error.status,error.stage,url=url,reason=error.reason,count=0)

    def discover(query,channel):
        if query in attempted_queries: return
        attempted_queries.add(query)
        for provider in ('bing','360'):
            stamp=time.monotonic()
            try:
                hits=search.discover(query,provider)
                relevant=[h for h in hits if any(alias in h['title']+' '+h.get('snippet','') for alias in identity.get('aliases',[]) if len(alias)>=2)]
                site=re.search(r'\bsite:([a-z0-9.-]+)',query,re.I)
                if site:
                    from urllib.parse import urlsplit
                    relevant=[h for h in relevant if (urlsplit(h['url']).hostname or '')==site[1] or (urlsplit(h['url']).hostname or '').endswith('.'+site[1])]
                record(channel,'ok' if relevant else 'identity_mismatch' if hits else 'empty','search',provider=provider,query=query,count=len(relevant),rejected_subjects=len(hits)-len(relevant),elapsed_ms=int((time.monotonic()-stamp)*1000))
                for hit in relevant[:2]: acquire({**hit,'query':query},channel)
                # A successful provider already supplies discovery; do not repeat its full query elsewhere.
                if relevant: return
            except SourceError as error:
                record(channel,error.status,error.stage,provider=provider,query=query,reason=error.reason,count=0,elapsed_ms=int((time.monotonic()-stamp)*1000))
                if error.status=='budget_exhausted': return
            except Exception:
                record(channel,'parse_error','search',provider=provider,query=query,reason='search_adapter_failed',count=0)

    for channel in ([] if recovery_only else channels):
        checkpoint=store.load_checkpoint(run_id,channel,cache_seconds)
        if checkpoint and checkpoint.get('complete') and checkpoint.get('document_ids'):
            snapshot=store.snapshot(run_id)
            wanted=set(checkpoint['document_ids'])
            for doc in snapshot['documents']:
                if doc['id'] in wanted:
                    current_documents[doc['id']]=doc; fetched_urls.add(doc['url'])
            reused.append(channel)
            continue
        before=set(current_documents)
        if identity.get('match_status')=='ambiguous':
            record(channel,'identity_mismatch','identity',reason='unresolved_candidates',count=0); continue
        if channel=='disclosure':
            for hit in (seeds or [])[:3]: acquire(hit,channel)
        if not (channel=='disclosure' and any(d['access_mode']=='pdf' for d in current_documents.values())):
            for query in queries[channel]:
                discover(query,channel)
        added=set(current_documents)-before
        # Every accepted document is already committed. A killed process can resume from this stage.
        if added: store.checkpoint(run_id,channel,{'document_ids':sorted(added),'version':VERSION,'complete':channel not in failed_channels})

    def active_snapshot():
        snapshot=store.snapshot(run_id)
        docs=prefer_full_documents(list(current_documents.values())); ids={d['id'] for d in docs}
        facts=[f for f in snapshot['facts'] if f['evidence_id'] in ids and f['rule_version']==RULE_VERSION]
        return docs,facts,snapshot['attempts']

    stop_reason='checkpoint_recovery' if recovery_only else 'max_rounds'
    for round_index in range(0 if recovery_only else max(0,min(max_rounds,2))):
        docs,facts,_=active_snapshot()
        covered={TOPIC_MAP.get(dim,dim) for f in facts for dim in f['dimensions']}
        missing=[topic for topic in topics if topic not in covered]
        if not missing: stop_reason='covered_with_source_claims'; break
        if fetcher.remaining()<2 or fetcher.requests>=fetcher.max_requests: stop_reason='budget_exhausted'; break
        topic=missing[0]; channel,suffix=FOLLOW_UP[topic]
        query='"'+(identity.get('legal_name') or identity['brand'])+'" '+suffix
        before=independent_sources(docs)
        plan={'round':round_index+1,'topic':topic,'target':identity.get('legal_name') or identity['brand'],
            'query':query,'channel':channel,'reason':'用户关注的问题尚缺可定位材料。','budget':{'queries':1,'hits':2}}
        discover(query,channel)
        after=independent_sources(current_documents.values())
        gained=sum(not any(group & old for old in before) for group in after)
        plan['new_independent_sources']=gained; followups.append(plan)
        store.checkpoint(run_id,'followup-'+str(round_index+1),plan)
        if not gained: stop_reason='no_new_independent_evidence'; break
    docs,facts,attempts=active_snapshot()
    errors=validate_snapshot(docs,facts,identity['company_id'])
    if errors: raise ValueError('Evidence snapshot validation failed')
    reviews=review_claims(facts,docs)
    selected_translations=translations(facts,docs,topics)
    covered={TOPIC_MAP.get(dim,dim) for f in facts for dim in f['dimensions']}
    gaps=[{'topic':t,'status':'unknown','reason':'未取得足够的可定位材料；不表示没有风险或满足需求。'} for t in topics if t not in covered]
    if not any(d['access_mode']=='pdf' for d in docs): notes.append('未取得可解析的公开财报；私企或未公开报表保持资料缺口。')
    if reused: notes.append('部分渠道复用近期证据；原采集时间保留，不当作本次重新采集。')
    notes.append('精神空间单独记录；旧 growth 字段仍表示晋升与成长。')
    status='partial' if recovery_only or gaps or any(a['status'] not in ('ok','empty') for a in attempts[-40:]) else 'completed'
    if not recovery_only: store.finish(run_id,status)
    return {'version':VERSION,'rule_version':RULE_VERSION,'run_id':run_id,'company_id':identity['company_id'],'identity':identity,
        'status':status,'documents':docs,'facts':facts,'reviews':reviews,'ratios':ratios(facts),'translations':selected_translations,
        'attempts':attempts[-100:],'capabilities':capability_matrix(attempts),'gaps':gaps,'followups':followups,
        'stop_reason':stop_reason,'reused_channels':reused,'notes':notes,'elapsed_ms':int((time.monotonic()-started)*1000),
        'independent_sources':len(independent_sources(docs)),'model':{'status':'not_used','reason':'确定性采集与引用校验无需模型。'}}


def compact_result(result):
    """Full text remains in SQLite/raw storage; transport is a bounded, cited snapshot."""
    out={**result}
    docs={d['id']:d for d in result['documents']}
    facts_by_id={f['id']:f for f in result['facts']}
    selected={fid for t in result['translations'] for fid in t['fact_ids']}
    # Include financial inputs needed to reproduce derived ratios.
    selected.update(fid for ratio in result['ratios'] for fid in ratio['input_fact_ids'])
    for fact in result['facts']:
        if fact['kind']=='normalized_fact' and len(selected)<90: selected.add(fact['id'])
    for review in result['reviews']:
        if len(selected | set(review['claim_ids']))<=90: selected.update(review['claim_ids'])
    facts=[dict(facts_by_id[i]) for i in sorted(selected) if i in facts_by_id][:90]
    included={f['id'] for f in facts}
    out['reviews']=[r for r in result['reviews'] if set(r['claim_ids'])<=included]
    out['ratios']=[r for r in result['ratios'] if set(r['input_fact_ids'])<=included]
    out['facts']=facts
    excerpts=[]
    for fact in facts:
        d=docs[fact['evidence_id']]; locator=fact['locator']
        excerpt_id=stable_id('excerpt',d['id'],fact['quote'],locator)
        fact['excerpt_id']=excerpt_id
        if any(e['id']==excerpt_id for e in excerpts): continue
        page=locator.get('physical_page')
        excerpts.append({'id':excerpt_id,'document_id':d['id'],'company_id':d['company_id'],'title':d['title'],
            'excerpt':fact['quote'],'url':d['url']+('#page='+str(page) if page else ''),'published_at':d['published_at'],
            'collected_at':d['collected_at'],'channel':d['channel'],'access_mode':d['access_mode'],'locator':locator,
            'dimensions':d['dimensions'],'content_hash':hashlib.sha256(fact['quote'].encode()).hexdigest(),'fixture':d['fixture']})
    for d in docs.values():
        if any(e['document_id']==d['id'] for e in excerpts): continue
        para=next((p for p in d.get('paragraphs',[]) if len(p['text'])>40),None)
        page=d['pages'][0] if d.get('pages') else None
        quote=(para['text'] if para else page['text'] if page else d['text'])[:1800]
        locator={'paragraph':para['paragraph']} if para else {'physical_page':page['physical_page'],'printed_page':page.get('printed_page')} if page else {}
        excerpts.append({'id':stable_id('excerpt',d['id'],quote,locator),'document_id':d['id'],'company_id':d['company_id'],
            'title':d['title'],'excerpt':quote,'url':d['url']+('#page='+str(page['physical_page']) if page else ''),
            'published_at':d['published_at'],'collected_at':d['collected_at'],'channel':d['channel'],'access_mode':d['access_mode'],
            'locator':locator,'dimensions':d['dimensions'],'content_hash':hashlib.sha256(quote.encode()).hexdigest(),'fixture':d['fixture']})
    out['excerpts']=excerpts
    out['documents']=[{k:v for k,v in d.items() if k not in ('text','pages','paragraphs','tables','links')} | {'text_length':len(d['text']),'physical_pages':len(d.get('pages',[]))} for d in docs.values()]
    out['stored_fact_count']=len(result['facts'])
    out['stored_document_count']=len(docs)
    return out
