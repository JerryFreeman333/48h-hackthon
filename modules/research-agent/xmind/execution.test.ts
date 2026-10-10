import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createAHost} from '../../../packages/integration/a-host';
import {databaseBundle} from '../../../packages/integration/local-database';
import {enrichWithV3,reassessV3} from '../v3-research';
import {validateV3Snapshot} from '../v3-contract';
import {createV3Questions} from '../v3-assessment';
import {executeXmind,xmindCapabilities} from './execution';
import {renderV3Report} from '../v3-report';
import {textSimilarity,groupSources} from './processing';
import {specializedFields} from './catalog';
import {recordXmindReview} from './review';
import {topics} from '../../a-profile/src/needs/catalog.mjs';

function input(){const host=createAHost(mkdtempSync(join(tmpdir(),'xmind-a-'))),owner='rules-test',draft=host.service.create(owner,{mode:'manual'}),d=draft.data;
 const salary=d.conditions.find((c:any)=>c.key==='min_fixed_monthly_salary');salary.value=15000;salary.strength='hard';
 d.goalIds=['find_first_job'];d.industryTags=['manufacturing'];d.roleTypes=['engineering'];
 for(const t of topics){d.answers[t.id+'.priority']='priority';d.answers[t.id+'.details']=t.details.map((v:any)=>v.id);d.answers[t.id+'.policy']='verify_first';}
 const u=host.service.update(owner,draft.id,{expectedRevision:draft.revision,questionnaireVersion:draft.questionnaireVersion,step:8,data:d});return host.service.confirm(owner,draft.id,{expectedRevision:u.revision,confirmed:true}).export;}

test('all original 441 topics retained with exact XMind byte hash and non-fabricated capability states',()=>{
 const c=xmindCapabilities();assert.equal(c.nodeCount,441);assert.equal(c.relationships.length,13);assert.equal(new Set(c.nodes.map(n=>n.id)).size,441);
 assert.equal(c.designSha256,createHash('sha256').update(readFileSync('docs/agent-v3/source/一家公司完整Agent运行树.xmind')).digest('hex'));
 assert.ok(c.sources.find(s=>s.id==='wechat')?.status==='connector_pending');assert.ok(c.nodes.every(n=>n.implementation));
});
test('all 28 confirmed A details become separate concrete questions; budgets and scopes preserved',()=>{
 const i=input(),b=databaseBundle(i,[16]).bundle,qs=createV3Questions(i,b);
 const details=qs.filter(q=>q.needRefs.some(r=>r.startsWith('topics.')));assert.equal(details.length,28);assert.equal(new Set(details.map(q=>q.predicate)).size,28);
 assert.ok(qs.filter(q=>q.topic==='company'||q.topic==='identity'||q.topic==='opinion').every(q=>q.jobId===null));
 assert.ok(qs.every(q=>q.maxAttempts===2&&q.conclusion==='unknown'));assert.ok(qs.find(q=>q.predicate==='fixed_salary')?.needRefs.includes('preferences.min_fixed_monthly_salary'));assert.equal(qs.find(q=>q.predicate==='fixed_salary')?.importance,'hard');
});
test('actual B worker executes every specialist, freezes sidecar, renders actual C output and reuses checkpoint',async()=>{
 const i=input(),first=databaseBundle(i,[16]),dir=mkdtempSync(join(tmpdir(),'xmind-run-'));let calls=0;
 const tool=async()=>{calls++;return {records:[],documents:[],requests:1,done:true};};
 await enrichWithV3(first.bundle,first.databaseSource,i,()=>{},{needOrigin:'synthetic_acceptance'},{tool,maxRequests:1,checkpointDir:dir});
 const s=(first.databaseSource as any).agentV3;assert.equal(s.xmind.runs.length,10);assert.equal(s.xmind.propagation.status,'disabled');assert.ok(s.questions.every((q:any)=>q.conclusion==='unknown'));
 assert.ok(renderV3Report(s,'report-test').includes('XMind 调查流程'));assert.equal(s.xmind.translations.length,s.questions.length);
 const fresh=databaseBundle(i,[16]);await enrichWithV3(fresh.bundle,fresh.databaseSource,i,()=>{},{needOrigin:'synthetic_acceptance'},{tool,maxRequests:1,checkpointDir:dir});assert.equal(calls,1);
 const bad=structuredClone(s);bad.xmind.translations[0].evidenceIds=['invented'];assert.throws(()=>validateV3Snapshot(bad,first.bundle));
 const revised=structuredClone(i);revised.UserProfile.revision++;const r=reassessV3(s,revised,first.bundle);assert.equal(r.xmind?.revision,revised.UserProfile.revision);assert.equal(calls,1);
});
test('finance metrics, explicit currency and report scope remain distinct; missing fields not inferred',()=>{
 const a:any={},b:any={};specializedFields('finance','2025年度合并口径人民币营业收入12亿元',a);specializedFields('finance','净利润12亿元',b);
 assert.equal(a.metric,'营业收入');assert.equal(a.value,12);assert.equal(a.reportingScope,'consolidated');const negative:any={};specializedFields('finance','合并口径人民币净利润-12亿元',negative);assert.equal(negative.value,-12);assert.equal(b.currency,null);assert.equal(b.reportingScope,null);
});
test('Chinese near duplicates produce explainable lineage without deleting material or classifying truth',()=>{
 assert.equal(textSimilarity('短句','短句'),0);assert.equal(textSimilarity('这是一段足够长的中文原文，用于解释可复核的来源相似性。','这是一段足够长的中文原文，用于解释可复核的来源相似性。'),1);
 const i=input(),b=databaseBundle(i,[16]).bundle,s:any={taskId:'test',profileRevision:1,questions:[],claims:[],sourceAttempts:[],sourceRelations:[],reviews:[],stopReasons:[],model:{status:'disabled',reason:'synthetic test'},semanticChecks:[]};const x=executeXmind(s,b);
 const e=b.evidence[0];b.evidence=[{...e,evidenceId:'a',sourceType:'agent_v3_http',excerpt:'中文材料相似分组只是线索，不能证明转载或机器人，更不能证明内容真假。'.repeat(3)},{...e,evidenceId:'b',sourceType:'agent_v3_http',excerpt:'中文材料相似分组只是线索，不能证明转载或机器人，更不能证明内容真假。'.repeat(3)}];
 groupSources(b,x);assert.equal(x.lineage[0].kind,'near_duplicate');assert.equal(b.evidence.length,2);assert.equal(x.propagation.status,'disabled');
});
test('coordination signals require explicit account AND timezone timestamp, remain signals only',()=>{
 const i=input(),b=databaseBundle(i,[16]).bundle,s:any={taskId:'test',profileRevision:1,questions:[],claims:[],sourceAttempts:[],sourceRelations:[],reviews:[],stopReasons:[],model:{status:'disabled',reason:'synthetic test'},semanticChecks:[]};const x=executeXmind(s,b),e=b.evidence[0];
 b.evidence=[{...e,evidenceId:'a',sourceType:'agent_v3_user_text',excerpt:'[群聊元数据] 账号=甲 时间=2026-10-10T01:00:00Z 外链=https://example.org/post'},{...e,evidenceId:'b',sourceType:'agent_v3_user_text',excerpt:'[群聊元数据] 账号=乙 时间=2026-10-10T01:03:00Z 外链=https://example.org/post'}];groupSources(b,x);assert.equal(x.propagation.status,'signals_only');assert.equal(x.propagation.signals.length,1);
 const other=executeXmind(s,{...b,evidence:b.evidence.map(e=>({...e,excerpt:e.excerpt.replace('Z','')}))});assert.equal(other.propagation.status,'disabled');
});

test('review records are immutable, reference-bound and never certify or alter requirement decisions',async()=>{
 const i=input(),f=databaseBundle(i,[16]);await enrichWithV3(f.bundle,f.databaseSource,i,()=>{},{needOrigin:'synthetic_acceptance'},{tool:async()=>({records:[],documents:[],requests:0,done:true}),maxRequests:0,checkpointDir:mkdtempSync(join(tmpdir(),'xmind-review-'))});
 const s=(f.databaseSource as any).agentV3;s.reviews=[{id:'review-fixture',claimIds:[],questionIds:[s.questions[0].id],trigger:'synthetic_rule_test',impact:'requires_verification',state:'deferred',assignee:null,createdAt:s.createdAt,updatedAt:s.createdAt,checks:['quote'],decision:null,reason:'rule test',ruleVersion:'6'}];
 const updated=recordXmindReview(s,f.bundle,{reviewId:'review-fixture',state:'human_reviewed',decision:'仅核对原文，不独立认证'});assert.equal(s.reviews[0].state,'deferred');assert.equal(updated.reviews[0].state,'human_reviewed');assert.deepEqual(updated.questions,s.questions);
 assert.throws(()=>recordXmindReview(s,f.bundle,{reviewId:'foreign',state:'dismissed',decision:'不存在'}));
 assert.throws(()=>recordXmindReview(s,f.bundle,{reviewId:'review-fixture',state:'human_reviewed',decision:'假的额外认证字段',verified:true}));
});
