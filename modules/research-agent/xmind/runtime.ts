import {createHash,randomUUID} from 'node:crypto';
import {closeSync,existsSync,mkdirSync,openSync,readFileSync,unlinkSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {z} from 'zod';
import {atomicWrite} from '../atomic-file';
import {runtimeIdSchema,runtimeLimitsSchema,runtimeMessageSpecSchema,runtimeTaskSpecSchema,validateRuntimeState,type AgentRuntimeState,type AgentRuntimeTaskSpec,type AgentRuntimeMessageSpec,type AgentRuntimeLimits,type AgentRuntimeEngine} from './runtime-schema';

export {runtimeSchema,validateRuntimeState} from './runtime-schema';
export type {AgentRuntimeState,AgentRuntimeTaskSpec,AgentRuntimeMessageSpec,AgentRuntimeLimits,AgentRuntimeEngine} from './runtime-schema';
type Json=z.infer<ReturnType<typeof z.json>>;
export type AgentTaskResult={output:unknown;enqueue?:AgentRuntimeTaskSpec[];messages?:AgentRuntimeMessageSpec[]};
export type AgentToolContext={runId:string;taskId:string;callId:string;operationKey:string};
export type AgentToolRecovery={status:'completed';output:unknown}|{status:'unknown'};
export type AgentToolDefinition={
 name:string;version:string;effect:'read_only'|'external'|'model';engine:AgentRuntimeEngine;
 inputSchema:z.ZodType<any>;outputSchema:z.ZodType<any>;
 execute:(input:any,context:AgentToolContext)=>Promise<unknown>|unknown;
 /** Recover reads a durable result only. It must never repeat the external operation. */
 recover?:(input:any,context:AgentToolContext)=>Promise<AgentToolRecovery>|AgentToolRecovery;
};
export type AgentContext={
 runId:string;taskId:string;round:number;
 dependencies:Readonly<Record<string,Json>>;
 /** Terminal prerequisite outcomes include soft-order failures; successful artifacts remain separate. */
 outcomes:Readonly<Record<string,{status:AgentRuntimeState['tasks'][number]['status'];reason:string|null;engine:AgentRuntimeEngine}>>;
 /** Existing logical operations for this task; input, output and provider payload stay private. */
 toolReceipts:readonly Readonly<Pick<AgentRuntimeState['toolCalls'][number],'id'|'tool'|'operationKey'|'status'|'engine'|'effect'>>[];
 inbox:readonly AgentRuntimeState['messages'][number][];
 /** operationKey must identify the logical operation, not an attempt number. */
 callTool:(name:string,input:unknown,operationKey:string)=>Promise<Json>;
 /** Read an existing original operation only; missing receipts never invoke execute. */
 recoverTool:(name:string,operationKey:string)=>Promise<Json>;
};
export type AgentDefinition={
 name:string;version:string;engine:AgentRuntimeEngine;
 inputSchema:z.ZodType<any>;outputSchema:z.ZodType<any>;toolAllowlist:readonly string[];
 handle:(input:any,context:AgentContext)=>Promise<AgentTaskResult>|AgentTaskResult;
};
export type AgentGraphOptions={
 runId:string;initialTasks:AgentRuntimeTaskSpec[];agents:AgentDefinition[];tools?:AgentToolDefinition[];
 checkpointPath:string;limits?:Partial<AgentRuntimeLimits>;
 /** Optional source/profile fingerprint is part of the durable configuration scope. */
 scopeFingerprint?:string;
};
export class AgentRuntimeError extends Error{
 constructor(public readonly code:string){super(code);this.name='AgentRuntimeError';}
}
const defaults:AgentRuntimeLimits={maxTasks:200,maxSteps:400,maxRounds:4,maxToolCalls:30,maxMessages:200,deadlineMs:180000};
const jsonSchema=z.json();
function canonical(value:unknown):string{
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 const object=value as Record<string,unknown>;
 return '{'+Object.keys(object).filter(key=>object[key]!==undefined).sort().map(key=>JSON.stringify(key)+':'+canonical(object[key])).join(',')+'}';
}
function hash(value:unknown){return createHash('sha256').update(canonical(value)).digest('hex');}
function copyJson(value:unknown):Json{return structuredClone(jsonSchema.parse(value));}
function fail(code:string):never{throw new AgentRuntimeError(code);}
const runtimeCodes=new Set(['duplicate_definition','allowlist_tool_missing','checkpoint_lock_invalid','checkpoint_in_use','unknown_agent','feedback_round_budget','feedback_round_invalid','task_dedupe_conflict','task_budget_exhausted','checkpoint_invalid','checkpoint_scope_mismatch','checkpoint_agent_mismatch','checkpoint_task_fingerprint','checkpoint_artifact_invalid','checkpoint_tool_mismatch','checkpoint_tool_artifact_invalid','dependency_unavailable','step_budget_exhausted','deadline_exhausted','task_no_longer_active','tool_not_allowed','unknown_tool','tool_operation_conflict','tool_rejected','tool_outcome_unknown','tool_budget_exhausted','message_budget_exhausted','message_dedupe_conflict','message_target_missing','message_target_finished','tool_receipt_missing']);
function safeCode(error:unknown){return error instanceof AgentRuntimeError&&runtimeCodes.has(error.code)?error.code:'agent_handler_failed';}
/** Exact known errors map to constants; never archive arbitrary provider messages or source text. */
function toolDiagnostic(error:unknown){
 if(error instanceof AgentRuntimeError&&runtimeCodes.has(error.code))return error.code;
 if(error instanceof z.ZodError)return 'tool_response_invalid';
 const label=error instanceof Error?error.message:'';
 const known:Record<string,string>={'V3 acquisition timeout':'tool_transport_timeout','V3 Python unavailable':'tool_executor_unavailable','V3 output limit':'tool_response_limit','V3 invalid tool output':'tool_response_invalid','V3 acquisition failed':'tool_executor_failed'};
 return known[label]??'tool_transport_unknown';
}
async function beforeDeadline<T>(operation:Promise<T>|T,milliseconds:number):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([Promise.resolve(operation),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new AgentRuntimeError('deadline_exhausted')),Math.max(1,milliseconds));})]);}
 finally{if(timer!==undefined)clearTimeout(timer);}
}
function definitionMap<T extends {name:string;version:string}>(definitions:T[]){
 const map=new Map<string,T>();for(const definition of definitions){runtimeIdSchema.parse(definition.name);runtimeIdSchema.parse(definition.version);if(map.has(definition.name))fail('duplicate_definition');map.set(definition.name,definition);}return map;
}

/**
 * An executable DAG plus bounded feedback queue. Rules handlers are deterministic processors;
 * model handlers identify their actual engine. All external/model operations must use callTool.
 * Checkpoints live in the caller's private .data directory and contain validated artifacts.
 * The audit is safe to expose: identifiers, engine, transition codes; no excerpts/errors/prompts.
 * Failed tasks isolate their dependants while independent tasks continue.
 */
export async function runAgentGraph(options:AgentGraphOptions):Promise<AgentRuntimeState>{
 const runId=runtimeIdSchema.parse(options.runId),path=resolve(options.checkpointPath),lockPath=path+'.lock';
 const agents=definitionMap(options.agents),tools=definitionMap(options.tools??[]);
 for(const agent of agents.values())for(const tool of agent.toolAllowlist)if(!tools.has(tool))fail('allowlist_tool_missing');
 const limits=runtimeLimitsSchema.parse({...defaults,...options.limits});
 const initial=options.initialTasks.map(spec=>runtimeTaskSpecSchema.parse(spec));
 const configurationHash=hash({agents:[...agents.values()].map(a=>({name:a.name,version:a.version,engine:a.engine,tools:[...a.toolAllowlist].sort()})).sort((a,b)=>a.name.localeCompare(b.name)),tools:[...tools.values()].map(t=>({name:t.name,version:t.version,effect:t.effect,engine:t.engine})).sort((a,b)=>a.name.localeCompare(b.name)),limits,scope:options.scopeFingerprint??null});
 // Empty soft-order lists preserve the previous runtime/1 fingerprint for old checkpoints.
 const initialTasksHash=hash(initial.map(({after,...spec})=>after.length?{...spec,after}:spec));
 mkdirSync(dirname(path),{recursive:true});
 // The lock spans the entire async run. A second process cannot acquire and repeat a paid call.
 const lockToken=randomUUID();let lockFd:number|undefined;
 const acquire=()=>{
  try{lockFd=openSync(lockPath,'wx');writeFileSync(lockFd,JSON.stringify({pid:process.pid,token:lockToken}));}
  catch(error){
   if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;
   // Serialize stale-lock recovery itself: two restarters must not delete each other's new lock.
   const recoveryPath=lockPath+'.recovery';let recoveryFd:number;
   try{recoveryFd=openSync(recoveryPath,'wx');}catch{fail('checkpoint_in_use');}
   try{
    let stale=false;
    try{const owner=JSON.parse(readFileSync(lockPath,'utf8'));if(!Number.isSafeInteger(owner.pid)||owner.pid<1)fail('checkpoint_lock_invalid');try{process.kill(owner.pid,0);}catch(e){if((e as NodeJS.ErrnoException).code==='ESRCH')stale=true;}}catch(error){if(error instanceof AgentRuntimeError)throw error;fail('checkpoint_lock_invalid');}
    if(!stale)fail('checkpoint_in_use');
    // Only a proven dead process lock is removed; a live or ambiguous owner is never stolen.
    try{unlinkSync(lockPath);}catch{fail('checkpoint_in_use');}
    lockFd=openSync(lockPath,'wx');writeFileSync(lockFd,JSON.stringify({pid:process.pid,token:lockToken}));
   }finally{closeSync(recoveryFd);try{unlinkSync(recoveryPath);}catch{}}
  }
 };
 acquire();
 try{
  const started=Date.now(),now=()=>new Date().toISOString();let previousElapsed=0;
  let state:AgentRuntimeState={schemaVersion:'xmind-runtime/1',runId,configurationHash,initialTasksHash,createdAt:now(),updatedAt:now(),elapsedMs:0,steps:0,status:'running',stopReason:null,limits,tasks:[],messages:[],toolCalls:[],audit:[]};
  const audit=(event:AgentRuntimeState['audit'][number]['event'],task:AgentRuntimeState['tasks'][number]|undefined,code:string,relatedIds:string[]=[])=>{
   state.audit.push({seq:(state.audit.at(-1)?.seq??0)+1,at:now(),event,taskId:task?.id??null,agent:task?.agent??null,relatedIds:relatedIds.slice(0,400),code});
   if(state.audit.length>5000)state.audit.splice(0,state.audit.length-5000);
  };
  const save=()=>{state.updatedAt=now();state.elapsedMs=previousElapsed+Math.max(0,Date.now()-started);validateRuntimeState(state);atomicWrite(path,JSON.stringify(state));};
  const taskFingerprint=(spec:ReturnType<typeof runtimeTaskSpecSchema.parse>,round:number)=>hash({agent:spec.agent,input:spec.input,dependencies:[...spec.dependsOn].sort(),...(spec.after.length?{after:[...spec.after].sort()}:{}),round});
  const enqueue=(specs:AgentRuntimeTaskSpec[],parent?:AgentRuntimeState['tasks'][number])=>{
   const candidate=structuredClone(state),additions:AgentRuntimeState['tasks']=[];
   for(const raw of specs){
    const spec=runtimeTaskSpecSchema.parse(raw),agent=agents.get(spec.agent);if(!agent)fail('unknown_agent');
    const round=spec.round??(parent?parent.round+1:0);if(round>limits.maxRounds)fail('feedback_round_budget');if(parent&&round<=parent.round)fail('feedback_round_invalid');
    const parsed=copyJson(agent.inputSchema.parse(spec.input)),fingerprint=taskFingerprint({...spec,input:parsed},round);
    const prior=candidate.tasks.find(task=>task.id===spec.id||(spec.dedupeKey!==undefined&&task.dedupeKey===spec.dedupeKey));
    if(prior){if(prior.fingerprint!==fingerprint)fail('task_dedupe_conflict');audit('task_deduplicated',parent,'same_logical_task',[prior.id]);continue;}
    if(candidate.tasks.length>=limits.maxTasks)fail('task_budget_exhausted');
    const task:AgentRuntimeState['tasks'][number]={...spec,input:parsed,fingerprint,round,status:'queued',engine:agent.engine,output:null,attempts:0,reason:null,startedAt:null,finishedAt:null};
    candidate.tasks.push(task);additions.push(task);
   }
   // All follow-up tasks are checked together, allowing dependencies on their sibling outputs.
   validateRuntimeState(candidate);state.tasks.push(...additions);
   for(const task of additions)audit('task_queued',task,parent?'feedback_task':'initial_task',[...new Set([...task.dependsOn,...task.after])]);
  };
  if(existsSync(path)){
   try{state=validateRuntimeState(JSON.parse(readFileSync(path,'utf8')));}catch{fail('checkpoint_invalid');}
   if(state.runId!==runId||state.configurationHash!==configurationHash||state.initialTasksHash!==initialTasksHash)fail('checkpoint_scope_mismatch');
   for(const task of state.tasks){
    const agent=agents.get(task.agent);if(!agent||task.engine!==agent.engine)fail('checkpoint_agent_mismatch');
    if(taskFingerprint(task,task.round)!==task.fingerprint)fail('checkpoint_task_fingerprint');
    try{agent.inputSchema.parse(task.input);if(task.status==='completed')agent.outputSchema.parse(task.output);}catch{fail('checkpoint_artifact_invalid');}
   }
   for(const call of state.toolCalls){const tool=tools.get(call.tool);if(!tool||!agents.get(state.tasks.find(task=>task.id===call.taskId)!.agent)!.toolAllowlist.includes(call.tool)||call.engine!==tool.engine||call.effect!==tool.effect||hash(call.input)!==call.fingerprint)fail('checkpoint_tool_mismatch');try{tool.inputSchema.parse(call.input);if(call.status==='completed')tool.outputSchema.parse(call.output);}catch{fail('checkpoint_tool_artifact_invalid');}}
   previousElapsed=state.elapsedMs;
   if(state.status!=='running'){
    // A later request may learn an interrupted call's durable result; it must never re-execute it.
    const recoverable=state.tasks.filter(task=>task.status==='blocked'&&task.reason==='tool_outcome_unknown'&&state.toolCalls.some(call=>call.taskId===task.id&&call.status==='pending'));
    if(!recoverable.length)return structuredClone(state);
    const resumed=new Set(recoverable.map(task=>task.id));let changed=true;
    while(changed){changed=false;for(const task of state.tasks)if(task.status==='blocked'&&task.reason==='dependency_unavailable'&&task.dependsOn.some(id=>resumed.has(id))&&!resumed.has(task.id)){resumed.add(task.id);changed=true;}}
    for(const task of state.tasks)if(resumed.has(task.id)){task.status='queued';task.reason=null;task.finishedAt=null;audit('task_recovered',task,'read_only_recovery_available');}
    state.status='running';state.stopReason=null;
   }
   for(const task of state.tasks.filter(task=>task.status==='running')){task.status='queued';task.reason=null;audit('task_recovered',task,'resume_processor_from_durable_tools');}
  }else{enqueue(initial);save();}
  const blocked=(task:AgentRuntimeState['tasks'][number],code:string)=>{task.status='blocked';task.reason=code;task.finishedAt=now();audit('task_blocked',task,code,[...new Set([...task.dependsOn,...task.after])]);};
  while(state.tasks.some(task=>task.status==='queued')){
   for(const task of state.tasks.filter(task=>task.status==='queued'))if(task.dependsOn.some(id=>['failed','blocked'].includes(state.tasks.find(other=>other.id===id)!.status)))blocked(task,'dependency_unavailable');
   const task=state.tasks.find(task=>task.status==='queued'&&task.dependsOn.every(id=>state.tasks.find(other=>other.id===id)!.status==='completed')&&task.after.every(id=>['completed','failed','blocked'].includes(state.tasks.find(other=>other.id===id)!.status)));
   if(!task)break;
   const elapsed=previousElapsed+Date.now()-started;
   if(state.steps>=limits.maxSteps||elapsed>=limits.deadlineMs){const code=state.steps>=limits.maxSteps?'step_budget_exhausted':'deadline_exhausted';for(const pending of state.tasks.filter(task=>task.status==='queued'))blocked(pending,code);state.stopReason=code;save();break;}
   const agent=agents.get(task.agent)!;task.status='running';task.startedAt=now();task.attempts++;state.steps++;audit('task_started',task,'handler_started');save();
   let taskActive=true;
   const remaining=()=>Math.max(1,limits.deadlineMs-previousElapsed-(Date.now()-started));
   const activeOperations=new Map<string,{fingerprint:string;promise:Promise<Json>}>();
   const invokeTool=async(name:string,input:unknown,operationKey:string):Promise<Json>=>{
     if(!taskActive)fail('task_no_longer_active');
     runtimeIdSchema.parse(operationKey);
     if(!agent.toolAllowlist.includes(name))fail('tool_not_allowed');
     const tool=tools.get(name);if(!tool)fail('unknown_tool');
     const validated=copyJson(tool.inputSchema.parse(input)),fingerprint=hash(validated),callId='call-'+hash([task.id,name,operationKey]).slice(0,48);
     let call=state.toolCalls.find(call=>call.id===callId);
     const toolContext:AgentToolContext={runId,taskId:task.id,callId,operationKey};
     if(call){
      if(call.fingerprint!==fingerprint)fail('tool_operation_conflict');
      if(call.status==='completed')return copyJson(call.output);
      if(call.status==='rejected')fail(call.reason??'tool_rejected');
      let recovery:AgentToolRecovery={status:'unknown'},diagnostic='pending_operation_not_repeated';
      try{if(tool.recover)recovery=await beforeDeadline(tool.recover(copyJson(call.input),toolContext),remaining());}catch(error){diagnostic=toolDiagnostic(error);}
      if(recovery.status==='completed'){
       try{call.output=copyJson(tool.outputSchema.parse(recovery.output));}catch{audit('tool_unknown',task,'recovery_output_invalid',[call.id]);save();fail('tool_outcome_unknown');}
       call.status='completed';call.finishedAt=now();call.reason=null;audit('tool_recovered',task,'durable_result_recovered',[call.id]);save();return copyJson(call.output);
      }
      call.reason='tool_outcome_unknown';audit('tool_unknown',task,diagnostic,[call.id]);save();fail('tool_outcome_unknown');
     }
     if(state.toolCalls.length>=limits.maxToolCalls)fail('tool_budget_exhausted');
     if(previousElapsed+Date.now()-started>=limits.deadlineMs)fail('deadline_exhausted');
     call={id:callId,taskId:task.id,tool:name,operationKey,fingerprint,input:validated,output:null,effect:tool.effect,engine:tool.engine,status:'pending',reason:null,reservedAt:now(),finishedAt:null};state.toolCalls.push(call);audit('tool_reserved',task,'reserved_before_external_call',[call.id]);save();
     try{
      const output=await beforeDeadline(tool.execute(copyJson(validated),toolContext),remaining());call.output=copyJson(tool.outputSchema.parse(output));call.status='completed';call.finishedAt=now();audit('tool_completed',task,'validated_tool_result',[call.id]);save();return copyJson(call.output);
     }catch(error){
      // A timeout, transport error or invalid response does not prove that a paid operation failed.
      // The reservation is durable; the only immediate follow-up allowed is read-only recovery.
      let recovery:AgentToolRecovery={status:'unknown'};try{if(tool.recover)recovery=await beforeDeadline(tool.recover(copyJson(validated),toolContext),remaining());}catch{}
      if(recovery.status==='completed'){
       try{call.output=copyJson(tool.outputSchema.parse(recovery.output));call.status='completed';call.finishedAt=now();call.reason=null;audit('tool_recovered',task,'durable_result_recovered',[call.id]);save();return copyJson(call.output);}catch{/* Invalid recovery cannot certify a completed result. */}
      }
      call.status='pending';call.output=null;call.reason='tool_outcome_unknown';audit('tool_unknown',task,toolDiagnostic(error),[call.id]);save();fail('tool_outcome_unknown');
     }
    };
   const prerequisites=[...new Set([...task.dependsOn,...task.after])].map(id=>state.tasks.find(parent=>parent.id===id)!);
   const beginOperation=(name:string,input:unknown,operationKey:string)=>{
    const id=hash([name,operationKey]),fingerprint=hash(copyJson(input)),existing=activeOperations.get(id);
    if(existing){if(existing.fingerprint!==fingerprint)return Promise.reject(new AgentRuntimeError('tool_operation_conflict'));return existing.promise;}
    const promise=invokeTool(name,input,operationKey);activeOperations.set(id,{fingerprint,promise});return promise;
   };
   const context:AgentContext={runId,taskId:task.id,round:task.round,dependencies:Object.fromEntries(prerequisites.filter(parent=>parent.status==='completed').map(parent=>[parent.id,copyJson(parent.output)])),outcomes:Object.fromEntries(prerequisites.map(parent=>[parent.id,{status:parent.status,reason:parent.reason,engine:parent.engine}])),toolReceipts:state.toolCalls.filter(call=>call.taskId===task.id).map(call=>Object.freeze({id:call.id,tool:call.tool,operationKey:call.operationKey,status:call.status,engine:call.engine,effect:call.effect})),inbox:structuredClone(state.messages.filter(message=>message.toTaskId===task.id)),callTool:beginOperation,recoverTool:(name,operationKey)=>{
    if(!agent.toolAllowlist.includes(name))return Promise.reject(new AgentRuntimeError('tool_not_allowed'));
    const call=state.toolCalls.find(call=>call.taskId===task.id&&call.tool===name&&call.operationKey===operationKey);
    if(!call)return Promise.reject(new AgentRuntimeError('tool_receipt_missing'));
    return beginOperation(name,copyJson(call.input),operationKey);
   }};
   try{
    const result=await beforeDeadline(agent.handle(copyJson(task.input),context),remaining());
    // Handlers cannot launch an external operation and return before its reservation is resolved.
    const operations=await Promise.allSettled([...activeOperations.values()].map(operation=>operation.promise));
    const failed=operations.find(result=>result.status==='rejected');if(failed?.status==='rejected')throw failed.reason;
    const output=copyJson(agent.outputSchema.parse(result.output));
    const messages=(result.messages??[]).map(message=>runtimeMessageSpecSchema.parse(message));
    if(state.messages.length+new Set(messages.filter(message=>!state.messages.some(prior=>prior.id===message.id)).map(message=>message.id)).size>limits.maxMessages)fail('message_budget_exhausted');
    // Validate the feedback and messages before marking this processor successful.
    enqueue(result.enqueue??[],task);
    for(const message of messages){
     const prior=state.messages.find(prior=>prior.id===message.id);
     if(prior){if(prior.fromTaskId!==task.id||hash({id:prior.id,toTaskId:prior.toTaskId,kind:prior.kind,payload:prior.payload})!==hash(message))fail('message_dedupe_conflict');continue;}
     if(!state.tasks.some(target=>target.id===message.toTaskId))fail('message_target_missing');
     if(state.tasks.find(target=>target.id===message.toTaskId)!.status!=='queued')fail('message_target_finished');
     state.messages.push({...message,fromTaskId:task.id,at:now()});audit('message_sent',task,'structured_handoff',[message.id,message.toTaskId]);
    }
    task.output=output;task.status='completed';task.finishedAt=now();task.reason=null;audit('task_completed',task,'validated_artifact');save();
   }catch(error){
    taskActive=false;
    await Promise.allSettled([...activeOperations.values()].map(operation=>operation.promise));
    const code=safeCode(error);if(['tool_outcome_unknown','tool_budget_exhausted','feedback_round_budget','task_budget_exhausted','message_budget_exhausted','deadline_exhausted'].includes(code))blocked(task,code);else{task.status='failed';task.reason=code;task.finishedAt=now();audit('task_failed',task,code);}save();
   }finally{taskActive=false;}
  }
  for(const task of state.tasks.filter(task=>task.status==='queued'))blocked(task,'dependency_unavailable');
  const completed=state.tasks.filter(task=>task.status==='completed').length;
  state.status=state.tasks.every(task=>task.status==='completed')?'completed':completed?'partial':'blocked';
  state.stopReason??=state.status==='completed'?'all_tasks_completed':'unresolved_tasks';audit('run_stopped',undefined,state.stopReason);save();return structuredClone(state);
 }finally{
  if(lockFd!==undefined)closeSync(lockFd);
  try{const owner=JSON.parse(readFileSync(lockPath,'utf8'));if(owner.token===lockToken)unlinkSync(lockPath);}catch{/* Never remove another run's lock. */}
 }
}
