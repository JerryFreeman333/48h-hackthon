import {z} from 'zod';

/** Runtime checkpoints contain private task artifacts; audit entries never contain their text. */
export const runtimeIdSchema=z.string().regex(/^[A-Za-z0-9_.:-]{1,180}$/);
export const runtimeEngineSchema=z.enum(['rules','model']);
export const runtimeLimitsSchema=z.strictObject({
 maxTasks:z.number().int().min(1).max(400),maxSteps:z.number().int().min(1).max(2000),
 maxRounds:z.number().int().min(0).max(20),maxToolCalls:z.number().int().min(0).max(400),
 maxMessages:z.number().int().min(0).max(400),deadlineMs:z.number().int().min(1).max(3600000),
});
export const runtimeTaskSpecSchema=z.strictObject({
 id:runtimeIdSchema,agent:runtimeIdSchema,input:z.json(),dependsOn:z.array(runtimeIdSchema).max(400).default([]),
 /** Ordering only: wait for a terminal outcome without requiring successful material acquisition. */
 after:z.array(runtimeIdSchema).max(400).default([]),
 dedupeKey:runtimeIdSchema.optional(),round:z.number().int().min(0).max(20).optional(),
});
export const runtimeMessageSpecSchema=z.strictObject({
 id:runtimeIdSchema,toTaskId:runtimeIdSchema,kind:runtimeIdSchema,payload:z.json(),
});
const taskSchema=runtimeTaskSpecSchema.extend({
 fingerprint:z.string().length(64),round:z.number().int().min(0).max(20),
 status:z.enum(['queued','running','completed','failed','blocked']),engine:runtimeEngineSchema,
 output:z.json().nullable(),attempts:z.number().int().min(0),reason:runtimeIdSchema.nullable(),
 startedAt:z.iso.datetime().nullable(),finishedAt:z.iso.datetime().nullable(),
});
const callSchema=z.strictObject({
 id:runtimeIdSchema,taskId:runtimeIdSchema,tool:runtimeIdSchema,operationKey:runtimeIdSchema,
 fingerprint:z.string().length(64),input:z.json(),output:z.json().nullable(),
 effect:z.enum(['read_only','external','model']),engine:runtimeEngineSchema,
 status:z.enum(['pending','completed','rejected']),reason:runtimeIdSchema.nullable(),
 reservedAt:z.iso.datetime(),finishedAt:z.iso.datetime().nullable(),
});
const auditSchema=z.strictObject({
 seq:z.number().int().positive(),at:z.iso.datetime(),
 event:z.enum(['task_queued','task_started','task_completed','task_failed','task_blocked','task_recovered','task_deduplicated','message_sent','tool_reserved','tool_completed','tool_recovered','tool_unknown','run_stopped']),
 taskId:runtimeIdSchema.nullable(),agent:runtimeIdSchema.nullable(),relatedIds:z.array(runtimeIdSchema).max(400),
 code:runtimeIdSchema,
});
export const runtimeSchema=z.strictObject({
 schemaVersion:z.literal('xmind-runtime/1'),runId:runtimeIdSchema,configurationHash:z.string().length(64),initialTasksHash:z.string().length(64),
 createdAt:z.iso.datetime(),updatedAt:z.iso.datetime(),elapsedMs:z.number().int().min(0),steps:z.number().int().min(0),
 status:z.enum(['running','completed','partial','blocked']),stopReason:runtimeIdSchema.nullable(),limits:runtimeLimitsSchema,
 tasks:z.array(taskSchema).max(400),messages:z.array(runtimeMessageSpecSchema.extend({fromTaskId:runtimeIdSchema,at:z.iso.datetime()})).max(400),
 toolCalls:z.array(callSchema).max(400),audit:z.array(auditSchema).max(5000),
});
export type AgentRuntimeState=z.infer<typeof runtimeSchema>;
export type AgentRuntimeTaskSpec=z.input<typeof runtimeTaskSpecSchema>;
export type AgentRuntimeMessageSpec=z.infer<typeof runtimeMessageSpecSchema>;
export type AgentRuntimeLimits=z.infer<typeof runtimeLimitsSchema>;
export type AgentRuntimeEngine=z.infer<typeof runtimeEngineSchema>;

/** Validate cross references in addition to the wire schema before restoring a checkpoint. */
export function validateRuntimeState(value:unknown):AgentRuntimeState{
 const state=runtimeSchema.parse(value),tasks=new Map(state.tasks.map(task=>[task.id,task]));
 if(tasks.size!==state.tasks.length)throw Error('runtime_duplicate_task');
 if(new Set(state.toolCalls.map(call=>call.id)).size!==state.toolCalls.length)throw Error('runtime_duplicate_call');
 if(new Set(state.messages.map(message=>message.id)).size!==state.messages.length)throw Error('runtime_duplicate_message');
 if(state.tasks.length>state.limits.maxTasks||state.messages.length>state.limits.maxMessages||state.toolCalls.length>state.limits.maxToolCalls)throw Error('runtime_budget_invalid');
 for(const task of state.tasks){
  if([...task.dependsOn,...task.after].some(id=>!tasks.has(id)||id===task.id))throw Error('runtime_dependency_reference');
  if(task.status==='completed'&&task.finishedAt===null)throw Error('runtime_completed_without_timestamp');
  if(task.round>state.limits.maxRounds)throw Error('runtime_round_invalid');
 }
 for(const message of state.messages)if(!tasks.has(message.fromTaskId)||!tasks.has(message.toTaskId))throw Error('runtime_message_reference');
 for(const call of state.toolCalls)if(!tasks.has(call.taskId))throw Error('runtime_call_reference');
 const visiting=new Set<string>(),visited=new Set<string>();
 const visit=(id:string)=>{if(visiting.has(id))throw Error('runtime_dependency_cycle');if(visited.has(id))return;visiting.add(id);for(const parent of [...tasks.get(id)!.dependsOn,...tasks.get(id)!.after])visit(parent);visiting.delete(id);visited.add(id);};
 for(const id of tasks.keys())visit(id);
 return state;
}
