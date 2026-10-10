import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceFreshness,targetedRefreshQuestions,normalizeReviewQueue,validateXmindLifecycle} from './lifecycle';
import type {V3Claim,V3Question,V3Snapshot} from '../v3-contract';
import type {CandidateBundle} from '../../../packages/contracts';

const now='2026-10-10T04:00:00Z';
function fixture(text='目标股份有限公司嵌入式软件工程师岗位招聘截止2026年10月09日。'){
 const q:V3Question={id:'q',version:1,companyId:'c',jobId:'j',topic:'position',predicate:'recruitment',text:'该岗位当前是否开放？',needRefs:[],targetScope:'job',answerTarget:'source_statement',requiredFields:['mechanism','period','role'],acceptableEvidence:['full_text'],importance:'priority',constraintType:'unspecified',threshold:null,answerState:'answered',applicability:'applicable',conclusion:'unknown',supportingClaimIds:['claim'],missingFields:[],nextAction:'stop',stopReason:'applicable_source_answer',attempts:1,maxAttempts:2,pendingRequestBudget:0,externalQuestion:null,notApplicableReason:null};
 const c:V3Claim={id:'claim',companyId:'c',jobId:'j',subject:'目标股份有限公司',subjectMatch:'exact',scope:'job',predicate:'recruitment',quote:text,evidenceId:'e',locator:{paragraph:1},fields:{mechanism:text,period:'2026年',role:'嵌入式软件工程师'},period:'2026年',city:null,team:null,role:'嵌入式软件工程师',polarity:'positive',conditions:[],answerTarget:'source_statement',verification:'source_claim',reviewRequired:true};
 const bundle:any={schemaVersion:'1.0.0',bundleId:'b',projectId:'p',intentId:'i',intentRevision:1,mode:'manual',retrievedAt:now,companies:[{companyId:'c',legalName:'目标股份有限公司',brandName:'目标',creditCode:null,identityStatus:'ambiguous'}],jobs:[{jobId:'j',companyId:'c',title:'嵌入式软件工程师',rawJd:'',city:null,sourceUrl:null,publishedAt:null,vacancyStatus:'unknown',salary:{min:null,max:null,currency:'CNY',period:'unknown',basis:'unknown',taxBasis:'unknown',months:null}}],evidence:[{evidenceId:'e',companyId:'c',jobId:'j',scope:'job',sourceType:'agent_v3_http',title:'岗位说明',url:'https://example.org/job',publishedAt:null,retrievedAt:now,excerpt:text,mode:'manual',verification:'unverified'}],facts:[],coverage:[],usage:[]};
 const s:V3Snapshot={schemaVersion:'agent-v3/1',taskId:'t',profileId:'p',profileRevision:1,createdAt:now,purpose:'selection',needOrigin:'synthetic_acceptance',materialKind:'synthetic_fixtures',questions:[q],claims:[c],sourceRelations:[],assessments:[],reviews:[],sourceAttempts:[{sourceId:'source',questionId:'q',sourceClass:'public_web',acquisitionMode:'http',accessState:'ok',contentState:'full_text',analysisState:'accepted',declaredSubject:'目标股份有限公司',publishedAt:null,retrievedAt:now,url:'https://example.org/job',rawRef:'raw-document',rawHash:'hash-document',locators:[{paragraph:1}],evidenceIds:['e'],capabilityVersion:'controlled-fixture',failureReason:null,elapsedMs:0,query:null}],budget:{maxRequests:3,usedRequests:1,reservedRequests:0,deadlineMs:30000,elapsedMs:0,modelCalls:0,tokens:null,costMinor:null},stopReasons:[],ruleVersions:{assessment:'v3-rules/test'},semanticChecks:[],model:{status:'disabled',reason:'本机规则'},propagation:{status:'disabled',reason:'无账号时间'},keyQuestionIds:[],criticalUnknownCount:0};
 return {s,bundle:bundle as CandidateBundle,q,c};
}
function review(s:V3Snapshot,overrides:Partial<V3Snapshot['reviews'][number]>={}){return {id:'review-original',claimIds:['claim'],questionIds:['q'],trigger:'high_impact_event',impact:'requires_verification',state:'auto_checked' as const,assignee:null,createdAt:now,updatedAt:now,checks:['quote','subject'],decision:null,reason:'合成规则测试',ruleVersion:s.ruleVersions.assessment,...overrides};}

test('explicit deadlines expire by declared inclusive calendar date, independent of a fresh 24h acquisition cache',()=>{
 const f=fixture();const before=structuredClone(f.s);const result=sourceFreshness(f.s,f.bundle,now);assert.equal(result.sources[0].status,'expired');assert.equal(result.sources[0].validUntil,'2026-10-09');assert.equal(result.refreshQuestions.length,1);assert.ok(result.refreshQuestions[0].acceptableMaterials.includes('嵌入式软件工程师'));assert.deepEqual(f.s,before);
 const end=fixture('目标股份有限公司嵌入式软件工程师岗位招聘截止2026年10月10日。');assert.equal(sourceFreshness(end.s,end.bundle,'2026-10-10T15:59:59Z').sources[0].status,'within_declared_window');assert.equal(sourceFreshness(end.s,end.bundle,'2026-10-10T16:00:00Z').sources[0].status,'expired');
 assert.doesNotThrow(()=>validateXmindLifecycle(result,f.s,f.bundle));
});

test('validity intervals preserve start/end, future windows and ambiguous dates do not become current arrangements',()=>{
 const f=fixture('目标股份有限公司嵌入式软件工程师岗位安排有效期限2026年01月01日至2026年12月31日。');const source=sourceFreshness(f.s,f.bundle,now).sources[0];assert.equal(source.status,'within_declared_window');assert.equal(source.validFrom,'2026-01-01');assert.equal(source.validUntil,'2026-12-31');assert.ok(source.reason.includes('不保证岗位当前开放'));
 const future=fixture('目标股份有限公司嵌入式软件工程师岗位安排有效期2027年01月01日至2027年12月31日。');assert.equal(sourceFreshness(future.s,future.bundle,now).sources[0].status,'not_yet_effective');assert.equal(targetedRefreshQuestions(future.s,future.bundle,now).length,1);
 const ambiguous=fixture('目标股份有限公司嵌入式软件工程师招聘截止2026年09月01日，另一批次截止2026年12月31日。');assert.equal(sourceFreshness(ambiguous.s,ambiguous.bundle,now).sources[0].status,'ambiguous_window');
 const invalid=fixture('目标股份有限公司嵌入式软件工程师招聘截止2026年02月30日。');invalid.c.period=null;assert.equal(sourceFreshness(invalid.s,invalid.bundle,now).sources[0].status,'undated');
});

test('historical financial periods remain valid historical material; only current scoped arrangements are refresh targets',()=>{
 const f=fixture('目标股份有限公司2025年度财务报告披露营业收入。');f.c.period='2025年度';f.c.predicate='finance';f.c.jobId=null;f.c.scope='company';f.q.predicate='finance';f.q.jobId=null;f.q.targetScope='company';f.q.text='该法人2025年度财务披露是什么？';f.bundle.evidence[0].jobId=null;f.bundle.evidence[0].scope='company';
 const result=sourceFreshness(f.s,f.bundle,now);assert.equal(result.sources[0].status,'historical_period');assert.equal(result.refreshQuestions.length,0);assert.equal(f.c.verification,'source_claim');
 const job=fixture('目标股份有限公司2025年度嵌入式软件工程师岗位开放。');job.c.period='2025年度';assert.equal(targetedRefreshQuestions(job.s,job.bundle,now).length,1);
 const other={...job.c,id:'other-claim',companyId:'other'};job.s.claims=[other];job.q.supportingClaimIds=['other-claim'];assert.equal(targetedRefreshQuestions(job.s,job.bundle,now).length,0);
});

test('publication timestamps, undated materials and access failures never become invented expiry or company risk',()=>{
 const f=fixture('目标股份有限公司嵌入式软件工程师岗位说明。');f.c.period=null;assert.equal(sourceFreshness(f.s,f.bundle,now).sources[0].status,'undated');assert.equal(targetedRefreshQuestions(f.s,f.bundle,now).length,0);
 f.bundle.evidence[0].publishedAt='2020-01-01T00:00:00Z';const dated=sourceFreshness(f.s,f.bundle,now).sources[0];assert.equal(dated.status,'dated_reference');assert.equal(dated.validUntil,null);assert.equal(dated.shouldRefresh,false);
 f.s.sourceAttempts[0].accessState='blocked';const failure=sourceFreshness(f.s,f.bundle,now).sources[0];assert.equal(failure.status,'unusable');assert.ok(failure.reason.includes('不作为企业风险'));assert.equal(failure.shouldRefresh,false);
});

test('review duplicate fingerprints merge across claim IDs and preserved origins without pretending human verification',()=>{
 const f=fixture();f.q.importance='hard';f.s.claims.push({...f.c,id:'model-claim'});f.s.reviews=[review(f.s),review(f.s,{id:'model-review',claimIds:['model-claim'],createdAt:'2026-10-10T05:00:00Z'})];
 const result=normalizeReviewQueue(f.s);assert.equal(result.merged,1);assert.equal(f.s.reviews.length,1);assert.deepEqual(new Set(f.s.reviews[0].claimIds),new Set(['claim','model-claim']));assert.equal(f.s.reviews[0].state,'deferred');assert.equal(f.s.reviews[0].assignee,null);assert.ok(f.s.reviews[0].checks.includes('negation_target'));assert.ok(f.s.reviews[0].reason.includes('未指定维护者'));assert.ok(f.s.reviews[0].id.startsWith('review-fingerprint-'));assert.equal(f.c.verification,'source_claim');assert.equal(f.q.conclusion,'unknown');
 const state=structuredClone(f.s.reviews);normalizeReviewQueue(f.s);assert.deepEqual(f.s.reviews,state);
});

test('human decisions and deferred states survive repeats, but genuinely new origins or rule changes reopen with prior decision retained',()=>{
 const f=fixture();f.s.reviews=[review(f.s,{state:'human_reviewed',decision:'人工仅核对引用，未认证来源。'})];normalizeReviewQueue(f.s);const prior=structuredClone(f.s.reviews[0]);
 f.s.reviews.push(review(f.s,{id:'repeat-review',state:'deferred',createdAt:'2026-10-11T00:00:00Z'}));assert.equal(normalizeReviewQueue(f.s).reopened,0);assert.equal(f.s.reviews[0].state,'human_reviewed');assert.equal(f.s.reviews[0].decision,prior.decision);assert.equal(f.s.reviews[0].updatedAt,prior.updatedAt);
 f.s.claims.push({...f.c,id:'new-evidence-claim',evidenceId:'new-evidence'});f.s.sourceAttempts.push({...f.s.sourceAttempts[0],sourceId:'new-source',rawHash:'different-document',evidenceIds:['new-evidence']});f.s.reviews.push(review(f.s,{id:'new-review',claimIds:['new-evidence-claim']}));const changed=normalizeReviewQueue(f.s);assert.equal(changed.reopened,1);assert.equal(f.s.reviews[0].state,'deferred');assert.equal(f.s.reviews[0].decision,prior.decision);assert.ok(f.s.reviews[0].reason.includes('不同正文或出处'));
 assert.equal(normalizeReviewQueue(f.s).reopened,0);f.s.ruleVersions.assessment='v3-rules/new';assert.equal(normalizeReviewQueue(f.s).reopened,1);assert.ok(f.s.reviews[0].reason.includes('规则版本变更'));
});

test('different job scopes are not merged and explicitly assigned maintainers remain pending',()=>{
 const f=fixture();const otherQuestion={...f.q,id:'other-question',jobId:'other-job'};f.s.questions.push(otherQuestion);f.s.reviews=[review(f.s,{assignee:'maintainer-local'}),review(f.s,{id:'other-review',questionIds:['other-question'],state:'deferred'})];
 normalizeReviewQueue(f.s);assert.equal(f.s.reviews.length,2);assert.equal(f.s.reviews.find(r=>r.questionIds.includes('q'))?.state,'pending');assert.equal(f.s.reviews.find(r=>r.questionIds.includes('other-question'))?.state,'deferred');
});

test('fresh scoped material cancels needless refresh, and archive lifecycle rejects cross-subject or missing reference tampering',()=>{
 const f=fixture();const text='目标股份有限公司嵌入式软件工程师岗位招聘截止2026年12月31日。';f.s.claims.push({...f.c,id:'fresh-claim',evidenceId:'fresh-evidence',quote:text});f.q.supportingClaimIds.push('fresh-claim');f.bundle.evidence.push({...f.bundle.evidence[0],evidenceId:'fresh-evidence',excerpt:text});f.s.sourceAttempts.push({...f.s.sourceAttempts[0],sourceId:'fresh-source',evidenceIds:['fresh-evidence'],rawHash:'fresh-hash'});
 const lifecycle=sourceFreshness(f.s,f.bundle,now);assert.equal(lifecycle.refreshQuestions.length,0);const bad=structuredClone(lifecycle);bad.sources[0].companyId='other-company';assert.throws(()=>validateXmindLifecycle(bad,f.s,f.bundle));const missing=structuredClone(lifecycle);missing.refreshQuestions=[{questionId:'not-exist',evidenceIds:['e'],reason:'伪造',acceptableMaterials:'伪造',priority:'hard'}];assert.throws(()=>validateXmindLifecycle(missing,f.s,f.bundle));
});
