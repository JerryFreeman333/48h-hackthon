import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {candidateBundleSchema,validateBundleReferences} from '../../packages/contracts';
import {agentConfiguration} from './config';
import {enrichWithAgent,mergeAgentMaterials} from './research';
import type {ToolResult} from './python-tool';
const config={...agentConfiguration(),enabled:true,key:'test-key'};
const input={JobNeedsSnapshot:{topics:[{topicId:'benefits',priority:'priority',verificationItemIds:['coverage']}]},UserProfile:{owner:'private-owner',salary:12345}};
const fixture=()=>candidateBundleSchema.parse(JSON.parse(readFileSync(join(process.cwd(),'packages/contracts/fixtures/candidate-bundle.json'),'utf8').replaceAll('company-demo-1','db-company-450')));
const cache=()=>mkdtempSync(join(tmpdir(),'xray-agent-test-'));
const result:ToolResult={company_id:450,topics:['benefits'],evidence:[{id:'franklin-one',company_id:450,topic:'benefits',title:'公司福利',excerpt:'公司员工评价提到五险一金',url:'https://example.com/article',source_type:'search_snippet',published_at:'2026-09-01',collected_at:'2026-10-03T10:00:00Z',verification_original:'source_claimed_official'}],facts:[]};
const call=(company_id=450)=>({message:{role:'assistant',content:null,tool_calls:[{id:'call-one',type:'function',function:{name:'investigate_company_topics',arguments:JSON.stringify({company_id,topics:['benefits']})}}]},requestId:'test-request',tokens:10});
test('MiniMax tools preserve company scope and source provenance, then reuse cache without calls',async()=>{
 const bundle=fixture(),source:any={fingerprint:'test'},cacheDir=cache();let models=0,tools=0;
 await enrichWithAgent(bundle,source,input,()=>{},{config,cacheDir,model:async messages=>{assert.ok(!JSON.stringify(messages).includes('private-owner'));assert.ok(!JSON.stringify(messages).includes('12345'));return models++===0?call():{message:{role:'assistant',content:'完成'},requestId:'done',tokens:5};},tool:async()=>{tools++;return result;}});
 const e=bundle.evidence.find(e=>e.evidenceId==='agent-franklin-one')!;
 assert.equal(e.jobId,null);assert.equal(e.scope,'company');assert.equal(e.verification,'unverified');assert.equal(e.publishedAt,'2026-09-01');
 assert.ok(e.topicLinks?.some(link=>link.topicId==='benefits'&&link.detailIds.includes('coverage')));assert.deepEqual(e.searchTopics,['benefits']);assert.deepEqual(validateBundleReferences(bundle),[]);
 assert.equal(source.agentInvestigation.status,'completed');assert.equal(source.sourceDates[0].verificationOriginal,'source_claimed_official');
 await enrichWithAgent(fixture(),{fingerprint:'test'},input,()=>{},{config,cacheDir,model:async()=>{throw Error('cache should avoid paid calls');},tool:async()=>{throw Error('cache should avoid crawling');}});assert.equal(tools,1);
});
test('model cannot investigate a company outside selection',async()=>{
 const bundle=fixture(),source:any={fingerprint:'scope'};let executed=false;
 await enrichWithAgent(bundle,source,input,()=>{},{config,cacheDir:cache(),model:async()=>call(451),tool:async()=>{executed=true;return result;}});
 assert.equal(executed,false);assert.equal(source.agentInvestigation.status,'partial');assert.ok(!bundle.evidence.some(e=>e.evidenceId.startsWith('agent-')));
});
test('service failure keeps existing facts and evidence; no fake absence or confirmed benefit',async()=>{
 const bundle=fixture(),before=structuredClone(bundle),source:any={fingerprint:'failure'};
 await enrichWithAgent(bundle,source,input,()=>{},{config,cacheDir:cache(),model:async()=>{throw Error('MiniMax 调用达到限额，使用已有资料');}});
 assert.deepEqual(bundle.evidence,before.evidence);assert.equal(source.agentInvestigation.status,'partial');assert.match(source.agentInvestigation.companies[0].notes.join(' '),/不代表公司或岗位没有/);
});
test('raw facts without actual quotation and cross-company references do not enter C',()=>{
 const bundle=fixture();mergeAgentMaterials(bundle,{}, {recordId:450,companyId:'db-company-450',name:'测试'}, {...result,facts:[{id:'bad',company_id:450,evidence_id:'missing',fact_key:'agent.raw.B2.salary',value:'50000'},{id:'foreign',company_id:451,evidence_id:'franklin-one',fact_key:'agent.raw.B1.hours',value:'五险一金'},{id:'invented',company_id:450,evidence_id:'franklin-one',fact_key:'agent.raw.B2.salary',value:'50000'}]});assert.ok(!bundle.facts.some(f=>f.factId.startsWith('agent-')));
});
test('provider addresses stay official and missing key falls back',async()=>{
 assert.throws(()=>agentConfiguration({MINIMAX_BASE_URL:'http://localhost/v1'} as any));
 const source:any={};await enrichWithAgent(fixture(),source,input,()=>{},{config:{...config,key:''}});assert.equal(source.agentInvestigation.status,'not_configured');
});
test('a bounded investigation includes all A-selected themes even when the model proposes a subset',async()=>{
 const topics=[...input.JobNeedsSnapshot.topics,{topicId:'hours',priority:'priority',verificationItemIds:['schedule']}];let round=0;let seen:string[]=[];
 await enrichWithAgent(fixture(),{fingerprint:'required-themes'},{JobNeedsSnapshot:{topics}},()=>{},{config,cacheDir:cache(),model:async()=>round++===0?call():{message:{role:'assistant',content:'完成'},requestId:'done',tokens:1},tool:async(_action,args)=>{seen=args.topics;return {...result,topics:args.topics};}});
 assert.deepEqual(seen,['hours','benefits']);
});
test('public business passages reach company needs as unverified leads',async()=>{
 const bundle=fixture();let round=0;const data={...result,topics:['company'] as const,evidence:[{...result.evidence[0],topic:'company' as const,excerpt:'公司在娱乐影视等业务板块探索，直播电商业务覆盖多个渠道。'}]};
 await enrichWithAgent(bundle,{fingerprint:'business-passages'},{JobNeedsSnapshot:{topics:[{topicId:'company',priority:'priority',verificationItemIds:['business']}]}},()=>{},{config,cacheDir:cache(),model:async()=>round++===0?{...call(),message:{role:'assistant',content:null,tool_calls:[{id:'business',function:{name:'investigate_company_topics',arguments:JSON.stringify({company_id:450,topics:['company']})}}]}}:{message:{role:'assistant',content:'完成'},requestId:'done',tokens:1},tool:async()=>({...data,topics:[...data.topics]})});
 assert.ok(bundle.evidence.find(e=>e.evidenceId==='agent-franklin-one')?.topicLinks?.some(link=>link.topicId==='company'&&link.detailIds.includes('business')));
 assert.ok(!bundle.facts.some(f=>f.key==='needs.company.business'&&f.evidenceIds.includes('agent-franklin-one')));
});
test('progress-storage failures cannot discard materials or block C conversion',async()=>{
 const bundle=fixture();let round=0;
 await enrichWithAgent(bundle,{fingerprint:'progress-failure'},input,()=>{throw Error('progress storage failed');},{config,cacheDir:cache(),model:async()=>round++===0?call():{message:{role:'assistant',content:'完成'},requestId:'done',tokens:1},tool:async()=>result});
 assert.ok(bundle.evidence.some(e=>e.evidenceId==='agent-franklin-one'));assert.deepEqual(validateBundleReferences(bundle),[]);
});
test('zero-result investigations remain partial and a new analysis retries instead of reusing empty cache',async()=>{
 const cacheDir=cache();let toolCalls=0;
 for(let i=0;i<2;i++){let round=0;const source:any={fingerprint:'empty-retry'};
  await enrichWithAgent(fixture(),source,input,()=>{},{config,cacheDir,model:async()=>round++===0?call():{message:{role:'assistant',content:'结束'},requestId:'done',tokens:1},tool:async()=>{toolCalls++;return {...result,evidence:[],attempted_sources:3,empty_or_failed_sources:3};}});
  assert.equal(source.agentInvestigation.status,'partial');assert.equal(source.agentInvestigation.companies[0].cached,false);
 }
 assert.equal(toolCalls,2);
});
