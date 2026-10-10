import {join} from 'node:path';
import {z} from 'zod';
import type {CandidateBundle} from '../../../packages/contracts';
import type {V3Snapshot,V3Question} from '../v3-contract';
import {assessV3Question,extractV3Claims,finishV3Questions,stableV3} from '../v3-assessment';
import {acquisitionResultSchema,runV3Tool,type V3ToolRequest} from '../v3-tool';
import type {V3Inputs} from '../v3-research';
import type {AgentProgress} from '../research';
import {executeXmind} from './execution';
import {sources,routeSources} from './sources';
import {runAgentGraph,type AgentDefinition,type AgentRuntimeTaskSpec} from './runtime';
import {collaborationSchema} from './collaboration-schema';
import {materialKinds} from './document-schema';
import {runXmindSemanticBatch,mergeXmindSemanticClaims} from './semantic';
import {agentConfiguration} from '../config';

const stepInput=z.strictObject({cycle:z.number().int().nonnegative()});
const ids=z.array(z.string()).max(1000);
const artifact=z.strictObject({ids,status:z.enum(['ready','unknown','skipped']),reason:z.string()});
const requestSchema=z.strictObject({company_id:z.number().int().positive(),question_id:z.string(),task_id:z.string(),query:z.string().max(500),urls:z.array(z.string()).max(4),imports:z.array(z.strictObject({kind:z.enum(materialKinds),content:z.string(),title:z.string(),declared_source:z.string().nullable().optional(),synthetic_fixture:z.boolean().optional()})).max(3),max_requests:z.number().int().min(0).max(3),seconds:z.number().int().min(1).max(90),recovery_only:z.boolean().optional()});
// A route freezes the original operation before collector reservations mutate question.attempts.
// Old runtime/1 route artifacts without this receipt are readable but never recollected blindly.
const routeArtifact=z.strictObject({questionId:z.string().nullable(),sourceId:z.string().nullable(),reason:z.string(),request:requestSchema.nullable().default(null),operationId:z.string().nullable().default(null),attempt:z.number().int().nonnegative().nullable().default(null)});
const terms:Record<string,string>={fixed_salary:'招聘 固定月薪 税前 奖金',rest:'招聘 工作周 休息 值班',training:'员工 培训 带教 参加条件',business:'主营业务 年度报告',social_insurance:'社保 公积金 缴纳条件'};
const sequence=['planner','router','collector','identity','provenance','extractor','propagation','verifier','interpreter','followup','archive'] as const;
const taskId=(cycle:number,role:string)=>`r${cycle}:${role}`;
function tasks(cycle:number,after?:string):AgentRuntimeTaskSpec[]{
 return sequence.map((agent,index)=>({id:taskId(cycle,agent),agent,input:{cycle},round:cycle,
  dependsOn:agent==='planner'?(after?[after]:[]):['identity','provenance'].includes(agent)?[taskId(cycle,'router')]:['extractor','propagation'].includes(agent)?[taskId(cycle,'identity'),taskId(cycle,'provenance')]:agent==='verifier'?[taskId(cycle,'identity'),taskId(cycle,'provenance'),taskId(cycle,'propagation')]:[taskId(cycle,sequence[index-1])],after:['identity','provenance'].includes(agent)?[taskId(cycle,'collector')]:['propagation','verifier'].includes(agent)?[taskId(cycle,'extractor')]:[]
 }));
}
/** Independent agents exchange validated artifacts and request bounded follow-up rounds. */
export async function runXmindCollaboration(s:V3Snapshot,bundle:CandidateBundle,context:{
 options:V3Inputs;tool:typeof runV3Tool;merge:(result:Awaited<ReturnType<typeof runV3Tool>>,qid:string,operationId?:string)=>void;
 checkpoint:()=>void;elapsed:()=>number;directory:string;progress:(p:AgentProgress)=>void;allowAcquisition?:boolean;focusQuestionIds?:string[];
}){
 const {checkpoint,options}=context,focus=context.focusQuestionIds?new Set(context.focusQuestionIds):null;let supplied=s.sourceAttempts.some(a=>a.rawRef?.includes('/'+s.taskId+'/'));
 const choose=():V3Question|undefined=>{
  if(context.allowAcquisition===false||s.budget.usedRequests+s.budget.reservedRequests>=s.budget.maxRequests||context.elapsed()>=s.budget.deadlineMs)return;
  if(supplied&&options.discovery==='supplied_only')return;
  const permitted=s.questions.filter(q=>!focus||focus.has(q.id));
  if(!supplied&&(options.materials?.length||options.sourceUrls?.length))return permitted.find(q=>q.pendingRequestBudget===0&&q.attempts<q.maxAttempts);
  return permitted.sort((a,b)=>['hard','priority','secondary','background'].indexOf(a.importance)-['hard','priority','secondary','background'].indexOf(b.importance)).find(q=>!['answered','not_applicable'].includes(q.answerState)&&q.attempts<q.maxAttempts&&!q.stopReason);
 };
 const selectedSource=(q:V3Question)=>routeSources(q.predicate,q.topic,q.missingFields).map(id=>sources.find(source=>source.id===id)!).filter(source=>source.status==='available'&&source.mode==='http'&&source.domains.length)[q.attempts]?.id??'public';
 const makeRequest=(q:V3Question,sourceId:string|null):V3ToolRequest=>{
  const company=bundle.companies.find(c=>c.companyId===q.companyId)!,domain=sources.find(source=>source.id===sourceId)?.domains[0],role=bundle.jobs.find(job=>job.jobId===q.jobId)?.title;
  return {company_id:Number(q.companyId.split('-company-').at(-1)),question_id:q.id+'-r'+q.attempts,task_id:s.taskId,
   query:options.discovery==='supplied_only'?'':'"'+company.legalName+'" '+(role?'"'+role+'" ':'')+(domain?'site:'+domain+' ':'')+(terms[q.predicate]??q.text).slice(0,150),
   urls:supplied?[]:options.sourceUrls??[],imports:supplied?[]:options.materials??[],max_requests:Math.min(3,s.budget.maxRequests-s.budget.usedRequests-s.budget.reservedRequests),seconds:Math.min(30,Math.max(1,Math.floor((s.budget.deadlineMs-context.elapsed())/1000)))};
 };
 const result=(values:string[],reason:string,status:'ready'|'unknown'|'skipped'='ready')=>({output:{ids:values.slice(0,1000),status,reason}});
 const agent=(name:string,handle:AgentDefinition['handle'],outputSchema:z.ZodType<any>=artifact,toolAllowlist:string[]=[]):AgentDefinition=>({name,version:'xmind-agent-2',engine:'rules',inputSchema:stepInput,outputSchema,toolAllowlist,handle});
 const definitions:AgentDefinition[]=[
  agent('planner',(_input,ctx)=>{const focus=ctx.inbox.flatMap(m=>typeof (m.payload as any)?.questionId==='string'?[(m.payload as any).questionId]:[]).filter(id=>s.questions.some(q=>q.id===id));return result([...new Set([...focus,...s.questions.map(q=>q.id)])],'confirmed_needs_and_followup_messages');}),
  agent('router',(input,ctx)=>{const planned=artifact.parse(ctx.dependencies[taskId(input.cycle,'planner')]);const permitted=choose();const focused=s.questions.find(q=>q.id===planned.ids[0]&&q.id===permitted?.id);const q=focused??permitted,sourceId=q?selectedSource(q):null,request=q?makeRequest(q,sourceId):null;return {output:{questionId:q?.id??null,sourceId,reason:q?'missing_fields_route':'no_permitted_followup',request,operationId:request?stableV3(s.taskId,request.question_id):null,attempt:q?.attempts??null}};},routeArtifact),
  agent('collector',async(input,ctx)=>{
   const routed=routeArtifact.parse(ctx.dependencies[taskId(input.cycle,'router')]);if(!routed.questionId)return result([],'no_acquisition_needed','skipped');
   const q=s.questions.find(q=>q.id===routed.questionId)!;
   if(!routed.request||!routed.operationId||routed.attempt===null){q.stopReason??='request_outcome_unknown';checkpoint();return result([],'legacy_operation_receipt_missing','unknown');}
   const request=routed.request,operation=routed.operationId,attempt=routed.attempt;
   if(request.task_id!==s.taskId||request.question_id!==q.id+'-r'+attempt||operation!==stableV3(s.taskId,request.question_id)||request.company_id!==Number(q.companyId.split('-company-').at(-1))){q.stopReason??='request_outcome_unknown';checkpoint();return result([],'operation_scope_mismatch','unknown');}
   const processed=s.processedOperationIds?.includes(operation)??false,reserved=q.attempts===attempt+1&&q.pendingRequestBudget===request.max_requests;
   if(!processed&&!reserved&&!(q.attempts===attempt&&q.pendingRequestBudget===0)){q.stopReason??='request_outcome_unknown';checkpoint();return result([],'operation_reservation_mismatch','unknown');}
   try{context.progress({stage:'collecting',message:'来源 Agent 正在处理：'+q.text+'；随后交给主体、抽取和复核 Agent。'});}catch{}
   supplied=true;
   // Restore the original reservation or completed receipt; never invent r1 from an interrupted r0.
   if(!processed&&!reserved){q.attempts++;q.pendingRequestBudget=request.max_requests;s.budget.reservedRequests+=request.max_requests;q.stopReason='request_outcome_unknown';checkpoint();}
   try{
    const acquired=acquisitionResultSchema.parse(await ctx.callTool('acquire-material',request,operation));context.merge(acquired,q.id,operation);
    if(acquired.done&&!acquired.documents.length)q.stopReason='no_effective_new_material';checkpoint();
    return result(acquired.records.flatMap((r:any)=>r.evidenceIds??[]),processed?'durable_operation_reused':'acquisition_record_saved',acquired.documents.length?'ready':'unknown');
   }catch{checkpoint();return result([],'acquisition_outcome_unknown','unknown');}
  },artifact,['acquire-material']),
  agent('identity',()=>{const x=executeXmind(s,bundle);return result(x.entities.map(e=>e.id),'identity_and_scope_kept_separate');}),
  agent('provenance',()=>{const x=executeXmind(s,bundle);return result(x.documents.map(d=>d.id),'originals_and_lineage_preserved');}),
  agent('extractor',async(input,ctx)=>{
   artifact.parse(ctx.dependencies[taskId(input.cycle,'identity')]);artifact.parse(ctx.dependencies[taskId(input.cycle,'provenance')]);
   extractV3Claims(bundle,s);
   const config=agentConfiguration();
   const priorSemantic=ctx.toolReceipts.find(receipt=>receipt.tool==='semantic-batch'&&receipt.operationKey==='semantic-'+s.taskId);
   if(priorSemantic||context.allowAcquisition!==false&&process.env.RESEARCH_AGENT_V3_MODEL_ENABLED==='true'&&config.key&&s.budget.modelCalls===0&&bundle.evidence.some(e=>['agent_v3_http','agent_v3_pdf'].includes(e.sourceType))){
    try{const semantic=priorSemantic?await ctx.recoverTool('semantic-batch',priorSemantic.operationKey):await ctx.callTool('semantic-batch',{evidenceIds:bundle.evidence.filter(e=>['agent_v3_http','agent_v3_pdf'].includes(e.sourceType)).map(e=>e.evidenceId)},'semantic-'+s.taskId);const merged=mergeXmindSemanticClaims(s,bundle,semantic as any);s.xmindSemantic=merged.record;}catch{if(s.model.status!=='failed')s.model={status:'failed',reason:'语义执行结果未确认；保留规则与未知，不自动重新调用。'};}
   }else if(!s.xmindSemantic){const semantic=await runXmindSemanticBatch(s,bundle,checkpoint,{enabled:false});s.xmindSemantic=semantic.record;}
   checkpoint();return result(s.claims.map(c=>c.id),s.model.status==='completed'?'rules_and_validated_semantic_candidates':'rules_and_explicit_semantic_unknown');
  },artifact,['semantic-batch']),
  agent('propagation',()=>{const x=executeXmind(s,bundle);return result(x.propagation.observations.map(o=>o.evidenceId),x.propagation.status==='disabled'?'account_or_time_missing':'signals_not_truth',x.propagation.status==='disabled'?'skipped':'ready');}),
  agent('verifier',(input,ctx)=>{const saved=ctx.dependencies[taskId(input.cycle,'extractor')],extracted=saved?artifact.parse(saved):null;const checked=extracted?s.claims.filter(c=>extracted.ids.includes(c.id)):s.claims;for(const q of s.questions)assessV3Question(q,checked,s);checkpoint();return result(s.questions.map(q=>q.id),extracted?'citation_scope_conditions_and_comparability_checked':'rules_retained_after_semantic_outcome_unknown',extracted?'ready':'unknown');}),
  agent('interpreter',()=>{s.xmind=executeXmind(s,bundle);checkpoint();return result(s.xmind.translations.map(t=>t.questionId),'evidence_context_and_needs_explained');}),
  agent('followup',(input,ctx)=>{
   const q=choose(),next=input.cycle+1,continueInvestigation=!!q&&next<20;
   if(!continueInvestigation){for(const item of s.questions)if(!item.stopReason)item.stopReason=focus&&!focus.has(item.id)?'outside_requested_refresh_scope':context.allowAcquisition===false?'reused_frozen_sources':supplied&&options.discovery==='supplied_only'?'supplied_sources_exhausted':next>=20?'agent_round_budget_exhausted':'task_budget_exhausted';finishV3Questions(s);checkpoint();}
   return {...result(q?[q.id]:[],continueInvestigation?'request_new_source_for_missing_fields':'stop_with_recorded_unknowns'),...(continueInvestigation?{enqueue:tasks(next,taskId(input.cycle,'archive')),messages:[{id:'feedback-'+next,toTaskId:taskId(next,'planner'),kind:'missing_fields',payload:{questionId:q!.id,missingFields:q!.missingFields,priorSourceId:selectedSource(q!)}}]}:{})};
  }),
  agent('archive',()=>{checkpoint();return result([s.taskId],'snapshot_checkpoint_saved');})
 ];
 const runtime=await runAgentGraph({runId:s.taskId+':agents',scopeFingerprint:stableV3(s.taskId,s.profileRevision,'xmind-agent-2',context.allowAcquisition!==false),checkpointPath:join(context.directory,s.taskId+(context.allowAcquisition===false?'.replay':'.agents')+'.json'),
  initialTasks:tasks(0),agents:definitions,limits:{maxTasks:240,maxSteps:260,maxRounds:20,maxToolCalls:22,maxMessages:20,deadlineMs:Math.max(1000,s.budget.deadlineMs)},
  tools:[{name:'acquire-material',version:'v3-acquisition-2',effect:'external',engine:'rules',inputSchema:requestSchema,outputSchema:acquisitionResultSchema,
   execute:request=>context.tool(request,request.seconds*1000+5000),recover:async request=>{try{const output=await context.tool({...request,recovery_only:true,max_requests:0},12000);return output.done?{status:'completed' as const,output}:{status:'unknown' as const};}catch{return {status:'unknown' as const};}}},
   {name:'semantic-batch',version:'xmind-semantic-1',effect:'model',engine:'model',inputSchema:z.strictObject({evidenceIds:ids}),outputSchema:z.json(),execute:async()=>runXmindSemanticBatch(s,bundle,checkpoint),recover:()=>s.xmindSemantic&&['completed','partial','failed'].includes(s.xmindSemantic.status)?{status:'completed',output:{record:s.xmindSemantic,claims:s.claims.filter(c=>s.xmindSemantic!.acceptedClaimIds.includes(c.id))}}:{status:'unknown'}}]
 });
 s.xmindCollaboration=collaborationSchema.parse({schemaVersion:'xmind-collaboration/1',runId:runtime.runId,status:runtime.status,stopReason:runtime.stopReason,rounds:runtime.tasks.length?Math.max(...runtime.tasks.map(t=>t.round))+1:0,
  tasks:runtime.tasks.map(t=>({id:t.id,agent:t.agent,engine:t.engine,status:t.status,dependsOn:t.dependsOn,after:t.after,reason:t.reason})),messages:runtime.messages.map(m=>({id:m.id,fromTaskId:m.fromTaskId,toTaskId:m.toTaskId,kind:m.kind})),tools:runtime.toolCalls.map(c=>({id:c.id,taskId:c.taskId,tool:c.tool,engine:c.engine,effect:c.effect,status:c.status,reason:c.reason}))});
 if(runtime.status!=='completed'){s.stopReasons.push('agent_'+(runtime.stopReason??runtime.status));finishV3Questions(s);}
 checkpoint();
}
