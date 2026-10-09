import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {assessV3Question,extractV3Claims,finishV3Questions} from './v3-assessment';
import {validateV3Snapshot,type V3Snapshot,type V3Question,type V3Claim} from './v3-contract';
import {agentConfiguration} from './config';
import {enrichWithV3} from './v3-research';
import {loadV3Options,saveV3Import} from './v3-sources';
import {reviewV3Semantics} from './v3-model';
import {createAHost} from '../../packages/integration/a-host';
import {databaseBundle} from '../../packages/integration/local-database';
const bundle:any={schemaVersion:'1.0.0',bundleId:'b',projectId:'p',intentId:'i',intentRevision:1,mode:'manual',retrievedAt:'2026-10-09T00:00:00Z',companies:[{companyId:'c',legalName:'目标股份有限公司',brandName:'目标',creditCode:null,identityStatus:'ambiguous'}],jobs:[{jobId:'j',companyId:'c',title:'工程师',rawJd:'岗位',city:'杭州',sourceUrl:null,publishedAt:null,vacancyStatus:'unknown',salary:{min:null,max:null,currency:'CNY',period:'unknown',basis:'unknown',taxBasis:'unknown',months:null}}],evidence:[{evidenceId:'e',companyId:'c',jobId:'j',scope:'job',sourceType:'user_text',title:'2026年年度报告',url:null,publishedAt:null,retrievedAt:'2026-10-09T00:00:00Z',excerpt:'来源原句',mode:'manual',verification:'unverified'}],facts:[],coverage:[],usage:[]};
function question(overrides:Partial<V3Question>={}):V3Question{return {id:'q',version:1,companyId:'c',jobId:'j',topic:'pay',predicate:'fixed_salary',text:'固定税前月薪',needRefs:['salary'],targetScope:'job',answerTarget:'source_statement',requiredFields:['min','max','period','basis','taxBasis','currency'],acceptableEvidence:['full_text'],importance:'hard',constraintType:'non_negotiable',threshold:15000,answerState:'unknown',applicability:'unconfirmed',conclusion:'unknown',supportingClaimIds:[],missingFields:[],nextAction:'investigate',stopReason:null,attempts:2,maxAttempts:2,pendingRequestBudget:0,externalQuestion:null,notApplicableReason:null,...overrides};}
function claim(overrides:Partial<V3Claim>={}):V3Claim{return {id:'claim',companyId:'c',jobId:'j',subject:'目标股份有限公司',subjectMatch:'exact',scope:'job',predicate:'fixed_salary',quote:'来源原句',evidenceId:'e',locator:{paragraph:1},fields:{min:16000,max:18000,period:'month',basis:'fixed',taxBasis:'pre_tax',currency:'CNY'},period:'2026',city:'杭州',team:'研发',role:'工程师',polarity:'positive',conditions:[],answerTarget:'source_statement',verification:'source_claim',reviewRequired:false,...overrides};}
function snapshot(q=question()):V3Snapshot{return {schemaVersion:'agent-v3/1',taskId:'t',profileId:'p',profileRevision:1,createdAt:'2026-10-09T00:00:00Z',purpose:'selection',needOrigin:'synthetic_acceptance',materialKind:'synthetic_fixtures',questions:[q],claims:[],sourceRelations:[],assessments:[],reviews:[],sourceAttempts:[],budget:{maxRequests:3,usedRequests:0,reservedRequests:0,deadlineMs:100,elapsedMs:0,modelCalls:0,tokens:null,costMinor:null},stopReasons:[],semanticChecks:[],ruleVersions:{rules:'1'},model:{status:'not_configured',reason:'无模型'},propagation:{status:'disabled',reason:'无账号/时间'},keyQuestionIds:[],criticalUnknownCount:0};}
function assess(c:V3Claim[],q=question()){const s=snapshot(q);s.claims=c;assessV3Question(q,c,s);return {s,q};}
test('optional model failure/invalid citations retain rules and durably prevent duplicate paid calls',async()=>{
 for(const invalid of [false,true]){
  const b=structuredClone(bundle),s=snapshot();b.evidence[0].sourceType='agent_v3_http';b.evidence[0].excerpt='来源原句完整上下文，仅为合成语义回归样本';s.budget.deadlineMs=30000;
  s.sourceAttempts=[{sourceId:'a',questionId:'q',sourceClass:'public_web',acquisitionMode:'http',accessState:'ok',contentState:'full_text',analysisState:'accepted',declaredSubject:null,publishedAt:null,retrievedAt:s.createdAt,url:'https://example.com',rawRef:null,rawHash:null,locators:[],evidenceIds:['e'],capabilityVersion:'fixture',failureReason:null,elapsedMs:0,query:null}];
  let calls=0,reserved=false;const deps={enabled:true,config:{...agentConfiguration({NODE_ENV:'test'}),key:'synthetic-never-sent'},model:async()=>{calls++;assert.ok(reserved);if(!invalid)throw Error('synthetic timeout');return {message:{role:'assistant',content:JSON.stringify({checks:[{questionId:'q',evidenceId:'e',quote:'不在原文中的无效模型引用',scope:'job',answerTarget:'source_statement',stance:'supports',reason:'fixture',missingFields:[]}]})},tokens:10,requestId:'fixture'};}};
  const persist=()=>{reserved=s.budget.modelCalls===1;};await reviewV3Semantics(s,b,persist,deps);assert.equal(s.model.status,'failed');assert.equal(s.questions[0].conclusion,'unknown');assert.equal(s.semanticChecks.length,0);assert.equal(calls,1);
  await reviewV3Semantics(structuredClone(s),b,persist,deps);assert.equal(calls,1);
 }
});
test('model never receives user imports or personal preference values',async()=>{
 const b=structuredClone(bundle),s=snapshot();s.budget.deadlineMs=30000;let calls=0;
 await reviewV3Semantics(s,b,()=>{},{enabled:true,config:{...agentConfiguration({NODE_ENV:'test'}),key:'synthetic-never-sent'},model:async()=>{calls++;throw Error('should not run');}});
 assert.equal(calls,0);assert.equal(s.model.status,'disabled');
});
test('V3 defaults off; answer/source verification/satisfaction remain separate',()=>{
 assert.equal(agentConfiguration({NODE_ENV:'test'}).v3Enabled,false);
 const {q,s}=assess([claim()]);assert.equal(q.answerState,'answered');assert.equal(q.conclusion,'pass');assert.equal(s.claims[0].verification,'source_claim');
 finishV3Questions(s);assert.equal(q.conclusion,'unknown');assert.equal(s.reviews[0].state,'deferred');assert.equal(s.criticalUnknownCount,1);
});
test('a soft salary preference also cannot become fulfilled from an unverified source claim',()=>{
 const {q,s}=assess([claim()],question({importance:'secondary',constraintType:'preference'}));assert.equal(q.answerState,'answered');finishV3Questions(s);assert.equal(q.conclusion,'unknown');assert.equal(s.reviews.length,0);
});
test('bonus annual package and incomplete tax/fixed/currency stay partial; range crossing threshold unknown',()=>{
 for(const fields of [{annual:250000,basis:'total'}, {min:16000,max:18000,period:'month',basis:'fixed',currency:'CNY'}] as V3Claim['fields'][]){
  const {q}=assess([claim({fields})]);assert.equal(q.answerState,'partial');assert.equal(q.conclusion,'unknown');
 }
 const {q}=assess([claim({fields:{...claim().fields,min:12000,max:18000}})]);assert.equal(q.answerState,'answered');assert.equal(q.conclusion,'unknown');
});
test('subject, group, subsidiary, role, team and answer-target gates',()=>{
 for(const c of [claim({subjectMatch:'alias'}),claim({scope:'company',jobId:null}),claim({jobId:'other'}),claim({answerTarget:'observed_practice'})]){
  const {q}=assess([c]);assert.equal(q.answerState,'partial');assert.equal(q.conclusion,'unknown');
 }
 assert.equal(assess([claim({subjectMatch:'unrelated'})]).q.answerState,'unknown');
 assert.equal(assess([claim()],question({answerTarget:'observed_practice'})).q.answerState,'partial');
});
test('only comparable answers conflict; different periods/cities/teams/conditions remain separate',()=>{
 const different=claim({id:'other',fields:{...claim().fields,min:13000,max:14000}});
 assert.equal(assess([claim(),different]).q.answerState,'conflicting');
 for(const change of [{period:'2025'},{city:'上海'},{team:'销售'},{role:'经理'},{conditions:['仅试用期']}]){
  assert.notEqual(assess([claim(),{...different,...change}]).q.answerState,'conflicting');
 }
 assert.equal(assess([claim(),claim({id:'same',fields:{...claim().fields,min:16000.0,max:18000.0}})]).q.answerState,'answered');
});
test('source snippets cannot upgrade, no data cannot be not_applicable, unsupported quote rejected',()=>{
 const {q,s}=assess([claim()]);s.sourceAttempts=[{sourceId:'a',questionId:'q',sourceClass:'search',acquisitionMode:'search',accessState:'ok',contentState:'index_snippet',analysisState:'quarantined',declaredSubject:null,publishedAt:null,retrievedAt:s.createdAt,url:null,rawRef:null,rawHash:null,locators:[],evidenceIds:['e'],capabilityVersion:'1',failureReason:null,elapsedMs:0,query:'test'}];
 assessV3Question(q,s.claims,s);assert.equal(q.answerState,'partial');
 q.answerState='not_applicable';assert.throws(()=>validateV3Snapshot(s,bundle));
 q.answerState='partial';s.claims[0].quote='伪造引用';assert.throws(()=>validateV3Snapshot(s,bundle));
});
test('negation of accommodation does not negate social insurance; no overtime pay is not no overtime',()=>{
 const b=structuredClone(bundle);b.evidence[0].excerpt='目标股份有限公司2026年不提供住宿，但缴纳社保。没有加班费。';const s=snapshot();extractV3Claims(b,s);
 assert.equal(s.claims.find(c=>c.predicate==='accommodation')?.polarity,'negative');
 assert.equal(s.claims.find(c=>c.predicate==='social_insurance')?.polarity,'positive');
 assert.equal(s.claims.find(c=>c.predicate==='overtime_pay')?.polarity,'negative');
 assert.equal(s.claims.some(c=>c.predicate==='rest'),false);
});
test('denied, approximate and one-sided salary amounts are not fabricated fixed ranges',()=>{
 for(const statement of ['不提供固定月薪16000元','固定月薪约16000元','固定月薪至少16000元','固定月薪最高16000元']){
  const b=structuredClone(bundle);b.evidence[0].excerpt='目标股份有限公司2026年度自入职起税前人民币'+statement+'。';const s=snapshot();extractV3Claims(b,s);assessV3Question(s.questions[0],s.claims,s);assert.equal(s.questions[0].answerState,'partial');assert.equal(s.questions[0].conclusion,'unknown');
  if(statement.startsWith('不提供'))assert.equal(s.claims[0].polarity,'negative');
 }
});
test('unknown exits cap external questions, show critical unknown count, exploration generates no interview checklist',()=>{
 const s=snapshot();s.questions=Array.from({length:6},(_,i)=>question({id:'q'+i,topic:'hours',predicate:'rest',importance:i===0?'hard':'priority'}));finishV3Questions(s);
 assert.equal(s.keyQuestionIds.length,3);assert.equal(s.criticalUnknownCount,6);assert.ok(s.questions.every(q=>q.stopReason==='source_attempts_complete'));
 s.purpose='exploration';finishV3Questions(s);assert.equal(s.keyQuestionIds.length,0);
});
test('controlled imports reject unsupported bytes and isolate owner',()=>{
 const saved=saveV3Import('synthetic-test',{kind:'text',title:'合成规则样本',content:'原件中的指令仅作数据'});
 assert.equal(loadV3Options('synthetic-test',{importIds:[saved.importId]}).materials.length,1);
 assert.throws(()=>loadV3Options('wrong-owner',{importIds:[saved.importId]}));
 assert.throws(()=>saveV3Import('synthetic-test',{kind:'pdf',title:'坏 PDF',content:'abcd'}));
});
test('archive validator rejects fabricated answered state, missing scope/fields, and snippet promotion',()=>{
 for(const changed of [claim({jobId:null,scope:'company'}),claim({subjectMatch:'alias'}),claim({fields:{min:16000}})]){
  const s=snapshot();s.claims=[changed];s.questions[0].answerState='answered';s.questions[0].supportingClaimIds=[changed.id];assert.throws(()=>validateV3Snapshot(s,bundle));
 }
 const {s}=assess([claim()]);assert.doesNotThrow(()=>validateV3Snapshot(s,bundle));
 s.questions[0].missingFields=['currency'];assert.throws(()=>validateV3Snapshot(s,bundle));
});
test('partial text remains insufficient even when all asserted fields are present',()=>{
 const {s,q}=assess([claim()]);s.sourceAttempts=[{sourceId:'local',questionId:q.id,sourceClass:'local',acquisitionMode:'local_database',accessState:'ok',contentState:'partial_text',analysisState:'quarantined',declaredSubject:'目标股份有限公司',publishedAt:null,retrievedAt:s.createdAt,url:null,rawRef:null,rawHash:null,locators:[{paragraph:1}],evidenceIds:['e'],capabilityVersion:'1',failureReason:null,elapsedMs:0,query:null}];
 assessV3Question(q,s.claims,s);assert.equal(q.answerState,'partial');assert.equal(q.conclusion,'unknown');
});
test('generic priority without concrete details is a preference clarification, never recruiter workload',()=>{
 const s=snapshot(question({predicate:'preference_clarification',importance:'priority'}));finishV3Questions(s);assert.equal(s.questions[0].nextAction,'preference_clarification');assert.equal(s.keyQuestionIds.length,0);
});
test('extractor keeps conditions and ignores financial capital reserves and business table headings',()=>{
 const b=structuredClone(bundle);b.evidence[0].excerpt='目标股份有限公司2026年度主要业务为面向企业的软件服务。仅限新员工参加入职培训，需提出申请。资本公积金转增股本。主营业务收入：123元。';
 const s=snapshot();extractV3Claims(b,s);assert.equal(s.claims.filter(c=>c.predicate==='business').length,1);assert.equal(s.claims.some(c=>c.predicate==='social_insurance'),false);assert.ok(s.claims.find(c=>c.predicate==='training')?.conditions.length);
});
test('question-level failure does not starve next question; budgets stop; checkpoint reopening issues no tool/model requests',async()=>{
 const host=createAHost(mkdtempSync(join(tmpdir(),'v3-a-'))),owner='test-owner',draft=host.service.create(owner,{mode:'manual'});
 const d=draft.data;d.goalIds=['find_first_job'];d.industryTags=['manufacturing'];d.roleTypes=['engineering'];d.conditions.find((c:any)=>c.key==='city').value=['杭州'];d.conditions.find((c:any)=>c.key==='city').strength='hard';
 d.answers['pay.priority']='priority';d.answers['pay.details']=['fixed'];d.answers['hours.priority']='priority';d.answers['hours.details']=['rest'];d.answers['growth.priority']='priority';d.answers['growth.details']=['learning'];
 const updated=host.service.update(owner,draft.id,{expectedRevision:draft.revision,questionnaireVersion:draft.questionnaireVersion,step:8,data:d});
 const input=host.service.confirm(owner,draft.id,{expectedRevision:updated.revision,confirmed:true}).export;
 const {bundle:b,databaseSource}=databaseBundle(input,[16]);const dir=mkdtempSync(join(tmpdir(),'v3-check-'));const calls:string[]=[];
 const tool=async(req:any)=>{calls.push(req.question_id);return {records:[],documents:[],requests:1,done:true};};
 await enrichWithV3(b,databaseSource,input,()=>{}, {},{tool,maxRequests:4,checkpointDir:dir});
 const s=(databaseSource as any).agentV3;assert.equal(new Set(calls.map(c=>c.replace(/-r\d$/,''))).size,4);assert.equal(s.budget.usedRequests,4);assert.equal(s.model.status,'not_configured');
 const fresh=databaseBundle(input,[16]);await enrichWithV3(fresh.bundle,fresh.databaseSource,input,()=>{}, {},{tool,checkpointDir:dir});assert.equal(calls.length,4);
 const invalid=structuredClone(s);invalid.mystery=true;assert.throws(()=>validateV3Snapshot(invalid,b));
});

test('explicit role headers alone bind imported source statements to the selected job',async()=>{
 const host=createAHost(mkdtempSync(join(tmpdir(),'v3-role-'))),owner='test',draft=host.service.create(owner,{mode:'manual'}),d=draft.data;
 d.goalIds=['find_first_job'];d.industryTags=['manufacturing'];d.roleTypes=['engineering'];const salary=d.conditions.find((c:any)=>c.key==='min_fixed_monthly_salary');salary.value=15000;salary.strength='hard';
 const updated=host.service.update(owner,draft.id,{expectedRevision:draft.revision,questionnaireVersion:draft.questionnaireVersion,step:8,data:d}),input=host.service.confirm(owner,draft.id,{expectedRevision:updated.revision,confirmed:true}).export;
 for(const [header,expected] of [['岗位：嵌入式软件工程师，','answered'],['岗位：高级嵌入式软件工程师，','partial'],['公司简介：','partial']]){
  const {bundle:b,databaseSource}=databaseBundle(input,[16]),text='浙江大华技术股份有限公司，'+header+'2026年度自入职起固定月薪税前人民币16000元，奖金另计。';
  const tool=async(req:any)=>({records:[{sourceId:'synthetic',questionId:req.question_id,sourceClass:'synthetic_fixture',acquisitionMode:'user_text',accessState:'ok',contentState:'full_text',analysisState:'accepted',declaredSubject:'浙江大华技术股份有限公司',publishedAt:null,retrievedAt:new Date().toISOString(),url:null,rawRef:'fixture.txt',rawHash:'fixture',locators:[{paragraph:1}],evidenceIds:[],capabilityVersion:'fixture/1',failureReason:null,elapsedMs:1,query:null}],documents:[{id:'fixture',url:null,title:'合成规则样本',publishedAt:null,retrievedAt:new Date().toISOString(),declaredSubject:'浙江大华技术股份有限公司',entityMatch:'legal_name_match',rawRef:'fixture.txt',rawHash:'fixture',parsedRef:'fixture.json',contentHash:'fixture-'+header,mode:'user_text',units:[{text,locator:{paragraph:1}}]}],requests:1,done:true} as any);
  await enrichWithV3(b,databaseSource,input,()=>{},{needOrigin:'synthetic_acceptance',materials:[{kind:'text',title:'fixture',content:text,synthetic_fixture:true}]},{tool,maxRequests:1,checkpointDir:mkdtempSync(join(tmpdir(),'v3-role-check-'))});
  const s=(databaseSource as any).agentV3;assert.equal(s.questions.find((q:any)=>q.predicate==='fixed_salary').answerState,expected);assert.equal(s.questions[0].conclusion,'unknown');assert.equal(s.materialKind,'mixed_sources');
 }
});

test('successful optional semantic review validates scope/quotes but does not certify a source',async()=>{
 const b=structuredClone(bundle),s=snapshot();b.evidence[0].sourceType='agent_v3_http';b.evidence[0].excerpt='来源原句完整上下文，仅为合成语义回归样本';s.budget.deadlineMs=30000;
 s.sourceAttempts=[{sourceId:'a',questionId:'q',sourceClass:'public_web',acquisitionMode:'http',accessState:'ok',contentState:'full_text',analysisState:'accepted',declaredSubject:null,publishedAt:null,retrievedAt:s.createdAt,url:'https://example.com',rawRef:null,rawHash:null,locators:[],evidenceIds:['e'],capabilityVersion:'fixture',failureReason:null,elapsedMs:0,query:null}];
 await reviewV3Semantics(s,b,()=>{},{enabled:true,config:{...agentConfiguration({NODE_ENV:'test'}),key:'synthetic-never-sent'},model:async()=>({message:{role:'assistant',content:JSON.stringify({checks:[{questionId:'q',evidenceId:'e',quote:b.evidence[0].excerpt,scope:'job',answerTarget:'source_statement',stance:'insufficient',reason:'未说明固定月薪口径',missingFields:['basis']}]})},tokens:88,requestId:'fixture'})});
 assert.equal(s.model.status,'completed');assert.equal(s.budget.tokens,88);assert.equal(s.semanticChecks.length,1);assert.equal(s.questions[0].answerState,'unknown');assert.doesNotThrow(()=>validateV3Snapshot(s,b));
});

test('interrupted acquisition keeps its reserved budget and cannot overspend or retry unknown requests',async()=>{
 const host=createAHost(mkdtempSync(join(tmpdir(),'v3-reserve-'))),owner='test',draft=host.service.create(owner,{mode:'manual'}),d=draft.data;d.goalIds=['find_first_job'];d.industryTags=['manufacturing'];d.roleTypes=['engineering'];d.answers['growth.priority']='priority';d.answers['growth.details']=['learning'];const p=d.conditions.find((c:any)=>c.key==='min_fixed_monthly_salary');p.value=15000;p.strength='hard';
 const updated=host.service.update(owner,draft.id,{expectedRevision:draft.revision,questionnaireVersion:draft.questionnaireVersion,step:8,data:d}),input=host.service.confirm(owner,draft.id,{expectedRevision:updated.revision,confirmed:true}).export,first=databaseBundle(input,[16]),dir=mkdtempSync(join(tmpdir(),'v3-reserve-check-')),calls:number[]=[];
 const tool=async(req:any)=>{if(req.recovery_only)return {records:[],documents:[],requests:0,done:false};calls.push(req.max_requests);throw Error('synthetic unknown outcome');};
 await enrichWithV3(first.bundle,first.databaseSource,input,()=>{},{needOrigin:'synthetic_acceptance'},{tool,maxRequests:4,checkpointDir:dir});const s=(first.databaseSource as any).agentV3;
 assert.deepEqual(calls,[3,1]);assert.equal(s.budget.usedRequests,0);assert.equal(s.budget.reservedRequests,4);assert.equal(s.questions.reduce((n:number,q:any)=>n+q.pendingRequestBudget,0),4);assert.ok(s.questions.every((q:any)=>q.conclusion==='unknown'));
 const next=databaseBundle(input,[16]);await enrichWithV3(next.bundle,next.databaseSource,input,()=>{},{needOrigin:'synthetic_acceptance'},{tool,maxRequests:4,checkpointDir:dir});assert.equal(calls.length,2);
});
