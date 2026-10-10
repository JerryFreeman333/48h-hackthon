import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {z} from 'zod';
import {runAgentGraph,validateRuntimeState,type AgentDefinition,type AgentGraphOptions,type AgentToolDefinition} from './runtime';

const numberArtifact=z.strictObject({value:z.number()});
function checkpoint(){return join(mkdtempSync(join(tmpdir(),'xmind-runtime-')),'private.json');}
function agent(name:string,handle:AgentDefinition['handle'],tools:string[]=[]):AgentDefinition{return {name,version:'1',engine:'rules',inputSchema:numberArtifact,outputSchema:numberArtifact,toolAllowlist:tools,handle};}
function options(path:string,agents:AgentDefinition[],tools:AgentToolDefinition[]=[],initialTasks:AgentGraphOptions['initialTasks']=[{id:'task-1',agent:agents[0].name,input:{value:1}}]):AgentGraphOptions{return {runId:'runtime-test',checkpointPath:path,agents,tools,initialTasks};}
function external(execute:AgentToolDefinition['execute'],recover?:AgentToolDefinition['recover']):AgentToolDefinition{return {name:'fetch',version:'1',effect:'external',engine:'rules',inputSchema:numberArtifact,outputSchema:numberArtifact,execute,recover};}

test('independent agents receive validated dependency artifacts and structured handoff messages',async()=>{
 const path=checkpoint();let calls=0;
 const planner=agent('planner',input=>{calls++;return {output:{value:input.value+1},enqueue:[{id:'task-extract',agent:'extractor',input:{value:3},dependsOn:['task-1']}],messages:[{id:'message-route',toTaskId:'task-extract',kind:'missing_field',payload:{field:'salaryBasis'}}]};});
 const extractor=agent('extractor',(input,ctx)=>{calls++;assert.deepEqual(ctx.dependencies['task-1'],{value:2});assert.equal(ctx.inbox[0].kind,'missing_field');return {output:{value:input.value+Number((ctx.dependencies['task-1'] as any).value)}};});
 const state=await runAgentGraph(options(path,[planner,extractor]));assert.equal(state.status,'completed');assert.equal(state.tasks.length,2);assert.deepEqual(state.tasks[1].output,{value:5});assert.equal(state.tasks[1].round,1);assert.ok(state.audit.some(entry=>entry.event==='message_sent'));
 assert.deepEqual(await runAgentGraph(options(path,[planner,extractor])),state);assert.equal(calls,2);
});

test('bounded feedback schedules actual next agents and refuses an endless unknown loop',async()=>{
 const path=checkpoint();const followup=agent('followup',(input,ctx)=>({output:{value:input.value},enqueue:[{id:'feedback-'+(ctx.round+1),agent:'followup',input:{value:input.value+1},dependsOn:[ctx.taskId]}]}));
 const state=await runAgentGraph({...options(path,[followup]),limits:{maxRounds:2}});assert.equal(state.tasks.length,3);assert.equal(state.tasks[0].status,'completed');assert.equal(state.tasks[1].status,'completed');assert.equal(state.tasks[2].status,'blocked');assert.equal(state.tasks[2].reason,'feedback_round_budget');assert.equal(state.status,'partial');
});

test('tool reservations are durable before execution; same operation in parallel runs only once',async()=>{
 const path=checkpoint();let calls=0;
 const fetch=external(async input=>{calls++;const saved=validateRuntimeState(JSON.parse(readFileSync(path,'utf8')));assert.equal(saved.toolCalls[0].status,'pending');assert.equal(saved.tasks[0].status,'running');await delay(10);return {value:input.value+4};});
 const researcher=agent('researcher',async(input,ctx)=>{const [a,b]=await Promise.all([ctx.callTool('fetch',input,'same-source'),ctx.callTool('fetch',input,'same-source')]);assert.deepEqual(a,b);return {output:a};},['fetch']);
 const state=await runAgentGraph(options(path,[researcher],[fetch]));assert.equal(calls,1);assert.equal(state.toolCalls.length,1);assert.equal(state.status,'completed');assert.equal(state.toolCalls[0].status,'completed');
 await runAgentGraph(options(path,[researcher],[fetch]));assert.equal(calls,1);
});

test('unknown external outcome never repeats; later restart reads a durable result and resumes dependants',async()=>{
 const path=checkpoint();let calls=0,recoveries=0,durable:any=null;
 const fetch=external(()=>{calls++;throw Error('provider accepted request, transport lost');},()=>{recoveries++;return durable?{status:'completed',output:durable}:{status:'unknown'};});
 const researcher=agent('researcher',async(input,ctx)=>({output:await ctx.callTool('fetch',input,'company-document')}),['fetch']);
 const reporter=agent('reporter',(_input,ctx)=>({output:ctx.dependencies['task-1']}));
 const config=options(path,[researcher,reporter],[fetch],[{id:'task-1',agent:'researcher',input:{value:1}},{id:'report',agent:'reporter',input:{value:0},dependsOn:['task-1']}]);
 const first=await runAgentGraph(config);assert.equal(first.status,'blocked');assert.equal(first.tasks[0].reason,'tool_outcome_unknown');assert.equal(first.tasks[1].reason,'dependency_unavailable');assert.equal(first.toolCalls[0].status,'pending');
 await runAgentGraph(config);assert.equal(calls,1);assert.equal(recoveries,2);
 durable={value:8};const resumed=await runAgentGraph(config);assert.equal(calls,1);assert.equal(resumed.status,'completed');assert.deepEqual(resumed.tasks[1].output,{value:8});assert.ok(resumed.audit.some(entry=>entry.event==='tool_recovered'));
});

test('soft ordering waits for failed acquisition, retains rules, and permits the next independent question',async()=>{
 const path=checkpoint(),calls:number[]=[],order:string[]=[];
 const fetch=external(input=>{calls.push(input.value);if(input.value===3)throw Error('request outcome unknown');return input;},()=>({status:'unknown'}));
 const collector=agent('collector',async(input,ctx)=>{order.push(ctx.taskId);try{return {output:await ctx.callTool('fetch',input,'question-source')};}catch{return {output:{value:0}};}},['fetch']);
 const rules=agent('rules',(_input,ctx)=>{order.push(ctx.taskId);assert.equal(ctx.outcomes.collect.status,'blocked');assert.equal(ctx.outcomes.collect.reason,'tool_outcome_unknown');assert.equal(ctx.dependencies.collect,undefined);return {output:{value:0}};});
 const strict=agent('strict',()=>{assert.fail('strict dependent must remain blocked');});
 const config=options(path,[collector,rules,strict],[fetch],[
  // Deliberately list consumers before their producer: ordering comes from the graph, not insertion.
  {id:'rules',agent:'rules',input:{value:0},after:['collect']},
  {id:'next-question',agent:'collector',input:{value:1},dependsOn:['rules']},
  {id:'strict',agent:'strict',input:{value:0},dependsOn:['collect']},
  {id:'collect',agent:'collector',input:{value:3}},
 ]);
 const state=await runAgentGraph(config);assert.deepEqual(calls,[3,1]);assert.deepEqual(order,['collect','rules','next-question']);assert.equal(state.tasks.find(task=>task.id==='rules')?.status,'completed');assert.equal(state.tasks.find(task=>task.id==='next-question')?.status,'completed');assert.equal(state.tasks.find(task=>task.id==='strict')?.status,'blocked');assert.equal(state.toolCalls[0].status,'pending');
 await runAgentGraph(config);assert.deepEqual(calls,[3,1]);
});

test('soft-order successful artifacts, references, cycles and checkpoint fingerprints remain explicit',async()=>{
 const processor=agent('processor',(input,ctx)=>({output:{value:input.value+Object.values(ctx.dependencies).reduce((sum:number,artifact)=>sum+Number((artifact as any).value),0)}}));
 const path=checkpoint(),tasks=[{id:'source',agent:'processor',input:{value:2}},{id:'consumer',agent:'processor',input:{value:3},after:['source']}];
 const state=await runAgentGraph(options(path,[processor],[],tasks));assert.deepEqual(state.tasks[1].output,{value:5});
 const altered=JSON.parse(readFileSync(path,'utf8'));altered.tasks[1].after=[];writeFileSync(path,JSON.stringify(altered));await assert.rejects(()=>runAgentGraph(options(path,[processor],[],tasks)),/checkpoint_task_fingerprint/);
 await assert.rejects(()=>runAgentGraph(options(checkpoint(),[processor],[],[{id:'source',agent:'processor',input:{value:1},after:['missing']}])),/runtime_dependency_reference/);
 await assert.rejects(()=>runAgentGraph(options(checkpoint(),[processor],[],[{id:'a',agent:'processor',input:{value:1},after:['b']},{id:'b',agent:'processor',input:{value:2},dependsOn:['a']}])),/runtime_dependency_cycle/);
});

test('running-task crash resumes its completed tools instead of repeating a paid model call',async()=>{
 const path=checkpoint();let calls=0;
 const model:AgentToolDefinition={...external(input=>{calls++;return {value:input.value+2};}),name:'semantic-model',effect:'model',engine:'model'};
 const reviewer=agent('reviewer',async(input,ctx)=>({output:await ctx.callTool('semantic-model',input,'review-once')}),['semantic-model']);
 const config=options(path,[reviewer],[model]);const initial=await runAgentGraph(config);assert.equal(initial.toolCalls[0].engine,'model');assert.equal(initial.tasks[0].engine,'rules');
 const crash=structuredClone(initial);crash.status='running';crash.stopReason=null;crash.tasks[0].status='running';crash.tasks[0].output=null;crash.tasks[0].finishedAt=null;writeFileSync(path,JSON.stringify(crash));
 const recovered=await runAgentGraph(config);assert.equal(recovered.status,'completed');assert.equal(calls,1);assert.equal(recovered.tasks[0].attempts,2);assert.deepEqual(recovered.tasks[0].output,{value:3});
});

test('tool allowlists reject unauthorized access without invoking or reserving the tool',async()=>{
 const path=checkpoint();let calls=0;const fetch=external(()=>{calls++;return {value:7};});
 const restricted=agent('restricted',async(input,ctx)=>({output:await ctx.callTool('fetch',input,'private-access')}));
 const state=await runAgentGraph(options(path,[restricted],[fetch]));assert.equal(calls,0);assert.equal(state.tasks[0].reason,'tool_not_allowed');assert.equal(state.toolCalls.length,0);
});

test('read-only receipt recovery cannot start an absent operation and exposes no private tool payload',async()=>{
 const path=checkpoint();let executions=0;
 const fetch=external(input=>{executions++;return input;});
 const processor=agent('processor',async(_input,ctx)=>{assert.deepEqual(ctx.toolReceipts,[]);return {output:await ctx.recoverTool('fetch','missing-operation')};},['fetch']);
 const state=await runAgentGraph(options(path,[processor],[fetch]));assert.equal(state.tasks[0].reason,'tool_receipt_missing');assert.equal(executions,0);assert.equal(state.toolCalls.length,0);
});

test('tool failures record fixed safe diagnostic codes while outcome remains unknown and reserved',async()=>{
 for(const [message,code] of [['V3 acquisition timeout','tool_transport_timeout'],['V3 Python unavailable','tool_executor_unavailable'],['V3 invalid tool output','tool_response_invalid'],['PRIVATE_PROVIDER_TEXT','tool_transport_unknown']]){
  const fetch=external(()=>{throw Error(message);});const processor=agent('processor',async(input,ctx)=>({output:await ctx.callTool('fetch',input,'once')}),['fetch']);
  const state=await runAgentGraph(options(checkpoint(),[processor],[fetch]));assert.equal(state.toolCalls[0].status,'pending');assert.equal(state.toolCalls[0].reason,'tool_outcome_unknown');assert.equal(state.tasks[0].status,'blocked');assert.ok(state.audit.some(entry=>entry.event==='tool_unknown'&&entry.code===code));assert.ok(!JSON.stringify(state.audit).includes(message));
 }
});

test('handler failure is isolated and audit never leaks raw text, prompts or provider errors',async()=>{
 const path=checkpoint(),privateText='PRIVATE_ACCOUNT_TOKEN_OR_IMPORTED_BODY';
 const failed=agent('failed',()=>{throw Error(privateText);}),independent=agent('independent',input=>({output:input}));
 const state=await runAgentGraph(options(path,[failed,independent],[],[{id:'task-1',agent:'failed',input:{value:1}},{id:'dependent',agent:'independent',input:{value:2},dependsOn:['task-1']},{id:'unrelated',agent:'independent',input:{value:3}}]));
 assert.equal(state.status,'partial');assert.equal(state.tasks[0].reason,'agent_handler_failed');assert.equal(state.tasks[1].status,'blocked');assert.equal(state.tasks[2].status,'completed');assert.ok(!JSON.stringify(state.audit).includes(privateText));assert.ok(!readFileSync(path,'utf8').includes(privateText));
});

test('dependency cycles, missing references, invalid artifacts and mismatched scope fail explicitly',async()=>{
 const processor=agent('processor',input=>({output:input}));
 await assert.rejects(()=>runAgentGraph(options(checkpoint(),[processor],[],[{id:'a',agent:'processor',input:{value:1},dependsOn:['b']},{id:'b',agent:'processor',input:{value:2},dependsOn:['a']}])),/runtime_dependency_cycle/);
 await assert.rejects(()=>runAgentGraph(options(checkpoint(),[processor],[],[{id:'a',agent:'processor',input:{value:1},dependsOn:['missing']}])),/runtime_dependency_reference/);
 const path=checkpoint();await runAgentGraph(options(path,[processor]));await assert.rejects(()=>runAgentGraph({...options(path,[processor]),scopeFingerprint:'different-profile'}),/checkpoint_scope_mismatch/);
 const saved=JSON.parse(readFileSync(path,'utf8'));saved.tasks[0].output={value:'invalid'};writeFileSync(path,JSON.stringify(saved));await assert.rejects(()=>runAgentGraph(options(path,[processor])),/checkpoint_artifact_invalid/);
});

test('identical dynamic tasks deduplicate; conflicting logical operation inputs are rejected',async()=>{
 const path=checkpoint(),next={id:'next',agent:'processor',input:{value:2},dependsOn:['task-1']};
 const planner=agent('planner',input=>({output:input,enqueue:[next,next]})),processor=agent('processor',input=>({output:input}));
 const state=await runAgentGraph(options(path,[planner,processor]));assert.equal(state.tasks.length,2);assert.ok(state.audit.some(entry=>entry.event==='task_deduplicated'));
 let calls=0;const fetch=external(input=>{calls++;return input;});
 const conflict=agent('conflict',async(input,ctx)=>{await ctx.callTool('fetch',input,'source');return {output:await ctx.callTool('fetch',{value:2},'source')};},['fetch']);
 const rejected=await runAgentGraph(options(checkpoint(),[conflict],[fetch]));assert.equal(calls,1);assert.equal(rejected.tasks[0].reason,'tool_operation_conflict');
});

test('one checkpoint lock prevents concurrent requests from duplicating external work',async()=>{
 const path=checkpoint();let release!:(value:unknown)=>void,calls=0;
 const fetch=external(()=>{calls++;return new Promise(resolve=>{release=resolve;});});
 const researcher=agent('researcher',async(input,ctx)=>({output:await ctx.callTool('fetch',input,'once')}),['fetch']);const config=options(path,[researcher],[fetch]);
 const first=runAgentGraph(config);await delay(10);await assert.rejects(()=>runAgentGraph(config),/checkpoint_in_use/);release({value:5});const state=await first;assert.equal(state.status,'completed');assert.equal(calls,1);
});

test('tool and step budgets stop actual work without inventing a successful output',async()=>{
 let calls=0;const fetch=external(input=>{calls++;return input;});
 const researcher=agent('researcher',async(input,ctx)=>({output:await ctx.callTool('fetch',input,'once')}),['fetch']);
 const blocked=await runAgentGraph({...options(checkpoint(),[researcher],[fetch]),limits:{maxToolCalls:0}});assert.equal(calls,0);assert.equal(blocked.tasks[0].reason,'tool_budget_exhausted');assert.equal(blocked.tasks[0].output,null);
 const processor=agent('processor',input=>({output:input}));const steps=await runAgentGraph({...options(checkpoint(),[processor],[],[{id:'one',agent:'processor',input:{value:1}},{id:'two',agent:'processor',input:{value:2},dependsOn:['one']}]),limits:{maxSteps:1}});assert.equal(steps.tasks[0].status,'completed');assert.equal(steps.tasks[1].reason,'step_budget_exhausted');
});

test('deadline retains an unresolved reservation and late external completion cannot write a finished run',async()=>{
 const path=checkpoint();let calls=0;
 const fetch=external(async input=>{calls++;await delay(100);return input;});
 const researcher=agent('researcher',async(input,ctx)=>({output:await ctx.callTool('fetch',input,'once')}),['fetch']);
 const config={...options(path,[researcher],[fetch]),limits:{deadlineMs:30}};const state=await runAgentGraph(config);assert.equal(state.status,'blocked');assert.equal(state.toolCalls[0].status,'pending');const frozen=readFileSync(path,'utf8');await delay(110);assert.equal(readFileSync(path,'utf8'),frozen);await runAgentGraph(config);assert.equal(calls,1);
});
