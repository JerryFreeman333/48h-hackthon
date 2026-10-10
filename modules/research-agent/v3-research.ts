import {sourceFreshness,normalizeReviewQueue} from './xmind/lifecycle';
import type {MaterialKind} from './xmind/document-schema';
import {runXmindCollaboration} from './xmind/collaboration';
import {executeXmind} from './xmind/execution';
import {mkdirSync,readFileSync,existsSync,writeFileSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import type {CandidateBundle} from '../../packages/contracts';
import {candidateBundleSchema,validateBundleReferences} from '../../packages/contracts';
import {V3_RULE,validateV3Snapshot,type V3Snapshot,type AcquisitionRecord} from './v3-contract';
import {assessV3Question,createV3Questions,extractV3Claims,finishV3Questions,stableV3} from './v3-assessment';
import {runV3Tool,type V3ToolRequest} from './v3-tool';
import {atomicWrite} from './atomic-file';

import type {AgentProgress} from './research';
export type V3Inputs={discovery?:'bounded'|'supplied_only';purpose?:'exploration'|'selection';needOrigin?:'user_confirmed'|'synthetic_acceptance';sourceUrls?:string[];materials?:{kind:MaterialKind;content:string;title:string;declared_source?:string|null;synthetic_fixture?:boolean}[]};

export async function enrichWithV3(bundle:CandidateBundle,source:Record<string,any>,input:Record<string,any>,progress:(p:AgentProgress)=>void=()=>{},options:V3Inputs={},deps:{tool?:typeof runV3Tool;maxRequests?:number;deadlineMs?:number;checkpointDir?:string;seedSnapshot?:V3Snapshot;continuationId?:string;focusQuestionIds?:string[]}={}){
 // An update is a new investigation of a frozen seed. Replay of that same update
 // must reuse its receipt, while a later generation must never reuse the old task.
 const scope:unknown[]=[input.UserProfile.profileId,input.UserProfile.revision,bundle.jobs.length?bundle.jobs.map(j=>j.jobId):bundle.companies.map(c=>c.companyId),options];
 if(deps.seedSnapshot)scope.push({seedFingerprint:stableV3(deps.seedSnapshot),continuationId:deps.continuationId??null});
 if(deps.focusQuestionIds)scope.push({focusQuestionIds:[...new Set(deps.focusQuestionIds)].sort()});
 const start=Date.now(),taskId='task-'+stableV3(...scope);let priorElapsed=0;
 const s:V3Snapshot={schemaVersion:'agent-v3/1',taskId,profileId:input.UserProfile.profileId,profileRevision:input.UserProfile.revision,createdAt:new Date().toISOString(),purpose:options.purpose??'selection',needOrigin:options.needOrigin??'user_confirmed',materialKind:options.materials?.some(m=>m.synthetic_fixture)?'mixed_sources':'real_sources',questions:createV3Questions(input,bundle),claims:[],sourceRelations:[],assessments:[],reviews:[],sourceAttempts:[],
  budget:{maxRequests:deps.maxRequests??18,usedRequests:0,reservedRequests:0,deadlineMs:deps.deadlineMs??180000,elapsedMs:0,modelCalls:0,tokens:null,costMinor:null},stopReasons:[],semanticChecks:[],ruleVersions:{assessment:V3_RULE,extraction:'v3-rule-extraction/3',xmind:'xmind-execution/1',acquisition:'v3-acquisition/1'},model:{status:process.env.MINIMAX_API_KEY?'disabled':'not_configured',reason:'首版采用明确规则；未调用语义模型，规则无法判断的字段保留未知。'},propagation:{status:'disabled',reason:'首版材料无账号、精确时间与行为历史，不运行依赖这些字段的协同检测。'},keyQuestionIds:[],criticalUnknownCount:0};
 if(deps.seedSnapshot){const prior=validateV3Snapshot(deps.seedSnapshot,bundle);const map=new Map(prior.questions.map(q=>[q.id,q]));const remap=(id:string)=>{const q=map.get(id);return s.questions.find(n=>n.companyId===q?.companyId&&n.jobId===q?.jobId&&n.predicate===q?.predicate)?.id;};s.claims=structuredClone(prior.claims);s.sourceRelations=structuredClone(prior.sourceRelations);s.sourceAttempts=prior.sourceAttempts.flatMap(a=>{const id=remap(a.questionId);return id?[{...structuredClone(a),questionId:id}]:[];});s.reviews=prior.reviews.flatMap(r=>{const ids=r.questionIds.map(remap).filter((id):id is string=>!!id);return ids.length?[{...structuredClone(r),questionIds:ids}]:[];});}
 source.agentV3=s;
 const dir=deps.checkpointDir??join(process.cwd(),'.data/research-agent/v3-snapshots');mkdirSync(dir,{recursive:true});const file=join(dir,taskId+'.json');
 const checkpoint=()=>{s.xmind=executeXmind(s,bundle);s.budget.elapsedMs=priorElapsed+Date.now()-start;atomicWrite(file,JSON.stringify({snapshot:s,evidence:bundle.evidence.filter(e=>e.sourceType.startsWith('agent_v3')),sourceDates:source.sourceDates??[]}));};
 if(existsSync(file)){
  try{const saved=JSON.parse(readFileSync(file,'utf8'));const restored=structuredClone(bundle);
   restored.evidence.push(...saved.evidence.filter((e:any)=>!restored.evidence.some(x=>x.evidenceId===e.evidenceId)));
   const valid=candidateBundleSchema.parse(restored);if(validateBundleReferences(valid).length)throw Error('references');
   const old=validateV3Snapshot(saved.snapshot,valid);
   if(old.profileId!==s.profileId||old.profileRevision!==s.profileRevision||old.taskId!==taskId)throw Error('checkpoint scope');
   Object.assign(bundle,valid);Object.assign(s,old);priorElapsed=old.budget.elapsedMs;source.sourceDates=saved.sourceDates;
   if(s.stopReasons.includes('completed_with_unknowns')||s.stopReasons.includes('questions_answered')){
    if(s.ruleVersions.assessment!==V3_RULE){Object.assign(s,reassessV3(s,input,bundle));source.agentV3=s;checkpoint();}
    if(!s.xmindCollaboration)await runXmindCollaboration(s,bundle,{options,tool:deps.tool??runV3Tool,merge:()=>{},checkpoint,elapsed:()=>priorElapsed+Date.now()-start,directory:dir,progress,allowAcquisition:false,focusQuestionIds:deps.focusQuestionIds});source.agentV3=validateV3Snapshot(s,bundle);return;
   }
  }catch{ s.stopReasons.push('invalid_checkpoint_ignored');}
 }
 // Existing materials remain lower-level leads until scope and source quality are explicit.
 for(const e of bundle.evidence.filter(e=>!e.sourceType.startsWith('agent_v3'))){
  const q=s.questions.find(q=>q.companyId===e.companyId);if(!q||s.sourceAttempts.some(a=>a.sourceId==='local-'+e.evidenceId))continue;
  s.sourceAttempts.push({sourceId:'local-'+e.evidenceId,questionId:q.id,sourceClass:e.sourceType,acquisitionMode:'local_database',accessState:'ok',contentState:'partial_text',analysisState:'quarantined',declaredSubject:null,publishedAt:e.publishedAt,retrievedAt:e.retrievedAt,url:e.url,rawRef:null,rawHash:null,locators:[{paragraph:1}],evidenceIds:[e.evidenceId],capabilityVersion:'local-database/1',failureReason:'原始本地摘录，主体与当前岗位适用性待确认',elapsedMs:0,query:null});
 }
 const tool=deps.tool??runV3Tool;
 const merge=(result:Awaited<ReturnType<typeof runV3Tool>>,qid:string,operationId?:string)=>{
  if(operationId&&s.processedOperationIds?.includes(operationId))return;
  const q=s.questions.find(q=>q.id===qid)!;
  if(result.done){if(result.requests>q.pendingRequestBudget)throw Error('V3 acquisition exceeded reservation');s.budget.reservedRequests-=q.pendingRequestBudget;q.pendingRequestBudget=0;s.budget.usedRequests+=result.requests;if(q.stopReason==='request_outcome_unknown')q.stopReason=null;}
  if(result.done&&operationId){s.processedOperationIds??=[];s.processedOperationIds.push(operationId);}
  const docs=result.documents;
  for(const raw of result.records){
   const r=raw as AcquisitionRecord;
   const doc=docs.find(d=>d.rawRef===r.rawRef);if(doc){r.reviewRequired=doc.reviewRequired;r.parserVersion=doc.parserVersion;r.warnings=doc.warnings;}r.questionId=qid;r.evidenceIds=[];r.locators=[];
   if(doc&&r.accessState==='ok'&&r.analysisState!=='rejected'){
    const companyId=s.questions.find(q=>q.id===qid)!.companyId;
    for(const [i,u] of doc.units.entries()){
     const matches=bundle.jobs.filter(j=>j.companyId===companyId&&new RegExp('(?:岗位|职位|招聘)[：:]\\s*'+j.title.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\$&')+'(?:[，,。；;\\s]|$)').test(u.text));
     const scoped=doc.declaredSubject&&matches.length===1&&/(?:岗位|职位|招聘)[：:]/.test(u.text)?matches[0]:null;
     const eid='v3-'+stableV3(companyId,scoped?.jobId??null,doc.contentHash,JSON.stringify(u.locator),u.text);
     const prior=bundle.evidence.find(e=>e.evidenceId===eid);
     if(!prior){
      // Acquisition remains company-scoped unless an explicit role binding has been checked.
      bundle.evidence.push({evidenceId:eid,companyId,jobId:scoped?.jobId??null,scope:scoped?'job':'company',sourceType:'agent_v3_'+doc.mode,title:doc.title||'用户导入材料（未经核验）',url:doc.url,publishedAt:doc.publishedAt,retrievedAt:doc.retrievedAt,excerpt:u.text,mode:bundle.mode,verification:'unverified'});
      source.sourceDates??=[];source.sourceDates.push({evidenceId:eid,locator:u.locator,publishedAtRaw:doc.publishedAt,retrievedAtRaw:doc.retrievedAt,rawRef:doc.rawRef,rawHash:doc.rawHash,collectedBy:'agent_v3'});
     }
     r.evidenceIds.push(eid);r.locators.push(u.locator);
    }
    if(doc.originUrl){
     const origin=bundle.evidence.find(e=>e.url===doc.originUrl&&e.companyId===companyId);
     if(origin&&r.evidenceIds[0]&&origin.evidenceId!==r.evidenceIds[0])s.sourceRelations.push({from:r.evidenceIds[0],to:origin.evidenceId,kind:'confirmed_repost',reason:'正文明确原文链接'});
    }
   }
   if(!s.sourceAttempts.some(a=>a.sourceId===r.sourceId&&a.questionId===qid))s.sourceAttempts.push(r);
  }
  // Same normalized quotation is one support group; similarity never establishes falsehood.
  for(const e of bundle.evidence.filter(e=>e.sourceType.startsWith('agent_v3'))){
   const other=bundle.evidence.find(o=>o.companyId===e.companyId&&o.evidenceId!==e.evidenceId&&o.url!==e.url&&o.excerpt.replace(/\s/g,'')===e.excerpt.replace(/\s/g,''));
   if(other&&!s.sourceRelations.some(r=>r.from===e.evidenceId&&r.to===other.evidenceId))s.sourceRelations.push({from:e.evidenceId,to:other.evidenceId,kind:'suspected_common_origin',reason:'完全相同正文片段；独立性未知，不重复计独立支持'});
  }
 };
 // Reconcile an interrupted worker by reading its durable result only. Never recollect blindly.
 for(const q of s.questions.filter(q=>q.pendingRequestBudget>0)){
  const originalQuestionId=q.id+'-r'+Math.max(0,q.attempts-1),operation=stableV3(taskId,originalQuestionId);
  try{merge(await tool({company_id:Number(q.companyId.split('-company-').at(-1)),question_id:originalQuestionId,task_id:taskId,query:'',urls:[],imports:[],max_requests:0,seconds:1,recovery_only:true},12000),q.id,operation);}catch{q.stopReason='request_outcome_unknown';}
 }
 extractV3Claims(bundle,s);for(const q of s.questions)assessV3Question(q,s.claims,s);checkpoint();
 await runXmindCollaboration(s,bundle,{options,tool,merge,checkpoint,elapsed:()=>priorElapsed+Date.now()-start,directory:dir,progress,focusQuestionIds:deps.focusQuestionIds});
 finishV3Questions(s);normalizeReviewQueue(s);s.xmindLifecycle=sourceFreshness(s,bundle);s.stopReasons.push(s.questions.every(q=>q.answerState==='answered'||q.answerState==='not_applicable')?'questions_answered':'completed_with_unknowns');
 s.budget.elapsedMs=priorElapsed+Date.now()-start;
 s.xmind=executeXmind(s,bundle);source.agentV3=validateV3Snapshot(s,bundle);candidateBundleSchema.parse(bundle);if(validateBundleReferences(bundle).length)throw Error('V3 references invalid');
 checkpoint();try{progress({stage:'analyzing',message:'正在冻结具体问题的回答程度、引用与未知，生成七板块报告'});}catch{}
}

/** Revisions and rule repairs reuse saved sources without any network/model call. */
export function reassessV3(previous:V3Snapshot,input:Record<string,any>,bundle:CandidateBundle){
 const s=structuredClone(previous),old=new Map(s.questions.map(q=>[q.id,q]));
 s.questions=createV3Questions(input,bundle);s.profileId=input.UserProfile.profileId;s.profileRevision=input.UserProfile.revision;
 s.claims=[];s.assessments=[];s.keyQuestionIds=[];s.semanticChecks=[];delete s.xmindCollaboration;delete s.xmindSemantic;
 const map=(id:string)=>{const q=old.get(id);return s.questions.find(n=>n.companyId===q?.companyId&&n.jobId===q?.jobId&&n.predicate===q?.predicate)??s.questions.find(n=>n.companyId===q?.companyId);};
 s.sourceAttempts=s.sourceAttempts.flatMap(a=>{const q=map(a.questionId);return q?[{...a,questionId:q.id}]:[];});
 for(const q of s.questions){const prior=[...old.values()].find(o=>o.companyId===q.companyId&&o.jobId===q.jobId&&o.predicate===q.predicate);q.attempts=prior?.attempts??0;q.pendingRequestBudget=prior?.pendingRequestBudget??0;q.stopReason='reused_frozen_sources';}
 if(s.questions.length)s.questions[0].pendingRequestBudget+=s.budget.reservedRequests-s.questions.reduce((n,q)=>n+q.pendingRequestBudget,0);
 extractV3Claims(bundle,s);for(const c of previous.claims.filter(c=>previous.xmindSemantic?.acceptedClaimIds.includes(c.id)))if(!s.claims.some(x=>x.id===c.id))s.claims.push(structuredClone(c));s.reviews=s.reviews.map(r=>({...r,claimIds:r.claimIds.filter(id=>s.claims.some(c=>c.id===id)),questionIds:r.questionIds.map(id=>map(id)?.id).filter((id):id is string=>!!id)})).filter(r=>r.claimIds.length&&r.questionIds.length);for(const q of s.questions)assessV3Question(q,s.claims,s);finishV3Questions(s);s.ruleVersions.assessment=V3_RULE;s.ruleVersions.extraction='v3-rule-extraction/3';s.ruleVersions.xmind='xmind-execution/1';normalizeReviewQueue(s);s.xmindLifecycle=sourceFreshness(s,bundle);
 s.xmind=executeXmind(s,bundle);return validateV3Snapshot(s,bundle);
}
