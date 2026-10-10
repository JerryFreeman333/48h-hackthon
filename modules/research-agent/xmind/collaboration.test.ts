import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createAHost} from '../../../packages/integration/a-host';
import {databaseBundle} from '../../../packages/integration/local-database';
import {enrichWithV3,type V3Inputs} from '../v3-research';
import {validateV3Snapshot,type V3Snapshot} from '../v3-contract';
import type {V3ToolRequest} from '../v3-tool';
import {renderV3Report} from '../v3-report';
import {createV3Questions} from '../v3-assessment';

function input(){
 const host=createAHost(mkdtempSync(join(tmpdir(),'xmind-collaboration-a-'))),owner='controlled-collaboration',draft=host.service.create(owner,{mode:'manual'}),data=draft.data;
 data.goalIds=['find_first_job'];data.industryTags=['manufacturing'];data.roleTypes=['engineering'];
 const salary=data.conditions.find((condition:any)=>condition.key==='min_fixed_monthly_salary');salary.value=15000;salary.strength='hard';
 data.answers['pay.priority']='priority';data.answers['pay.details']=['fixed'];data.answers['hours.priority']='priority';data.answers['hours.details']=['rest'];
 const updated=host.service.update(owner,draft.id,{expectedRevision:draft.revision,questionnaireVersion:draft.questionnaireVersion,step:8,data});
 return host.service.confirm(owner,draft.id,{expectedRevision:updated.revision,confirmed:true}).export;
}
const directory=()=>mkdtempSync(join(tmpdir(),'xmind-collaboration-run-'));
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
/** Controlled tool responses are synthetic rule regressions, never claimed as real source acquisition. */
function response(request:V3ToolRequest,text:string,legalName:string,index:number,mode:'user_text'|'http'='user_text'){
 const hash=digest(text),rawRef=`.data/research-agent/v3/${request.task_id}/${request.question_id}/${hash}.${mode==='http'?'html.gz':'txt'}`,date='2026-10-10T00:00:00Z',url=mode==='http'?'https://example.invalid/controlled/'+index:null;
 return {requests:1,done:true,records:[{sourceId:'controlled-'+index,questionId:request.question_id,sourceClass:mode==='http'?'public_web':'user_text',acquisitionMode:mode,accessState:'ok',contentState:'full_text',analysisState:'accepted',declaredSubject:legalName,publishedAt:null,retrievedAt:date,url,rawRef,rawHash:hash,locators:[],evidenceIds:[],capabilityVersion:'synthetic-collaboration/1',failureReason:null,elapsedMs:1,query:request.query}],documents:[{id:'document-'+index,url,title:'明确标记的合成调查回归材料',publishedAt:null,retrievedAt:date,declaredSubject:legalName,entityMatch:'exact',rawRef,rawHash:hash,parsedRef:rawRef+'.parsed.json',contentHash:hash,mode,units:[{text,locator:{paragraph:1}}]}]};
}
async function modelDisabled<T>(operation:()=>Promise<T>,enableWithoutCredentials=false){
 const originalEnabled=process.env.RESEARCH_AGENT_V3_MODEL_ENABLED,originalKey=process.env.MINIMAX_API_KEY;
 process.env.RESEARCH_AGENT_V3_MODEL_ENABLED=enableWithoutCredentials?'true':'false';delete process.env.MINIMAX_API_KEY;
 try{return await operation();}finally{if(originalEnabled===undefined)delete process.env.RESEARCH_AGENT_V3_MODEL_ENABLED;else process.env.RESEARCH_AGENT_V3_MODEL_ENABLED=originalEnabled;if(originalKey===undefined)delete process.env.MINIMAX_API_KEY;else process.env.MINIMAX_API_KEY=originalKey;}
}

test('actual B feedback asks a second source for missing salary fields and C keeps unverified fulfilment unknown',()=>modelDisabled(async()=>{
 const i=input(),first=databaseBundle(i,[16]),dir=directory(),requests:V3ToolRequest[]=[],company=first.bundle.companies[0].legalName,role=first.bundle.jobs[0].title;
 const tool=async(request:V3ToolRequest)=>{assert.equal(request.recovery_only,undefined);requests.push(structuredClone(request));const text=requests.length===1?`岗位：${role}，${company}2026年固定月薪16000元。`:`岗位：${role}，${company}2026年自入职起税前人民币固定月薪16000元，无附加条件。`;return response(request,text,company,requests.length) as any;};
 await enrichWithV3(first.bundle,first.databaseSource,i,()=>{},{needOrigin:'synthetic_acceptance'},{tool,maxRequests:2,checkpointDir:dir});
 const s=validateV3Snapshot((first.databaseSource as any).agentV3,first.bundle),salary=s.questions.find(q=>q.predicate==='fixed_salary')!;
 assert.equal(requests.length,2);assert.equal(requests[0].question_id.replace(/-r0$/,''),requests[1].question_id.replace(/-r1$/,''));assert.notEqual(requests[0].query,requests[1].query);
 assert.equal(salary.attempts,2);assert.equal(salary.answerState,'answered');assert.equal(salary.conclusion,'unknown');assert.equal(s.budget.usedRequests,2);assert.equal(s.budget.reservedRequests,0);assert.equal(s.xmindCollaboration?.rounds,2);assert.equal(s.xmindCollaboration?.messages[0].kind,'missing_fields');assert.ok(renderV3Report(s,'report-controlled').includes('固定税前月薪'));
 const reopen=databaseBundle(i,[16]);await enrichWithV3(reopen.bundle,reopen.databaseSource,i,()=>{},{needOrigin:'synthetic_acceptance'},{tool,maxRequests:2,checkpointDir:dir});assert.equal(requests.length,2);assert.equal((reopen.databaseSource as any).agentV3.budget.modelCalls,0);
}));

test('unknown collection holds its reservation while soft ordering executes rules and the next question',()=>modelDisabled(async()=>{
 const i=input(),first=databaseBundle(i,[16]),dir=directory(),paid:number[]=[];let recoveries=0;
 const tool=async(request:V3ToolRequest)=>{if(request.recovery_only){recoveries++;throw Error('controlled worker result not yet known');}paid.push(request.max_requests);if(paid.length===1)throw Error('controlled external outcome unknown');return {records:[],documents:[],requests:1,done:true};};
 await enrichWithV3(first.bundle,first.databaseSource,i,()=>{},{needOrigin:'synthetic_acceptance'},{tool,maxRequests:4,checkpointDir:dir});
 const s=validateV3Snapshot((first.databaseSource as any).agentV3,first.bundle);assert.deepEqual(paid,[3,1]);assert.equal(recoveries,1);assert.equal(s.budget.reservedRequests,3);assert.equal(s.budget.usedRequests,1);assert.equal(s.questions.reduce((sum,q)=>sum+q.pendingRequestBudget,0),3);assert.ok(s.questions.every(q=>q.conclusion==='unknown'));
 assert.equal(s.xmindCollaboration?.tasks.find(task=>task.id==='r0:collector')?.status,'blocked');assert.equal(s.xmindCollaboration?.tasks.find(task=>task.id==='r0:verifier')?.status,'completed');assert.equal(s.xmindCollaboration?.tasks.find(task=>task.id==='r1:collector')?.status,'completed');assert.equal(s.xmindCollaboration?.tools.filter(call=>call.status==='pending').length,1);
 const reopen=databaseBundle(i,[16]);await enrichWithV3(reopen.bundle,reopen.databaseSource,i,()=>{},{needOrigin:'synthetic_acceptance'},{tool,maxRequests:4,checkpointDir:dir});assert.deepEqual(paid,[3,1]);assert.equal(recoveries,1);
}));

test('a real process crash after reservation recovers the original operation without a second collection or charge',()=>modelDisabled(async()=>{
 const i=input(),first=databaseBundle(i,[16]),dir=directory(),company=first.bundle.companies[0].legalName,role=first.bundle.jobs[0].title,receiptPath=join(dir,'durable-tool-result.json'),scriptPath=join(dir,'crash-runner.mjs');
 const text=`岗位：${role}，${company}2026年自入职起税前人民币固定月薪16000元，无附加条件。`,opts:V3Inputs={discovery:'supplied_only',needOrigin:'synthetic_acceptance',materials:[{kind:'text',title:'合成崩溃恢复材料',content:text,synthetic_fixture:true}]};
 const sample=response({company_id:16,question_id:'placeholder-r0',task_id:'placeholder',query:'',urls:[],imports:[],max_requests:1,seconds:1},text,company,1);
 const moduleUrl=pathToFileURL(join(process.cwd(),'modules/research-agent/v3-research.ts')).href;
 // The child terminates while the operation is actually in flight; no internal state is injected.
 const script=`import {enrichWithV3} from ${JSON.stringify(moduleUrl)};
import {writeFileSync} from 'node:fs';
const bundle=${JSON.stringify(first.bundle)},source=${JSON.stringify(first.databaseSource)},input=${JSON.stringify(i)},options=${JSON.stringify(opts)},sample=${JSON.stringify(sample)};
const tool=async request=>{
 const rawRef='.data/research-agent/v3/'+request.task_id+'/'+request.question_id+'/'+sample.documents[0].rawHash+'.txt';
 sample.records[0].questionId=request.question_id;sample.records[0].rawRef=rawRef;sample.documents[0].rawRef=rawRef;sample.documents[0].parsedRef=rawRef+'.parsed.json';
 writeFileSync(${JSON.stringify(receiptPath)},JSON.stringify({request,result:sample}));
 process.stdout.write('OPERATION_RESERVED\\n');await new Promise(()=>{});
};
await enrichWithV3(bundle,source,input,()=>{},options,{tool,maxRequests:1,checkpointDir:${JSON.stringify(dir)}});
`;
 writeFileSync(scriptPath,script);
 const child=spawn(process.execPath,['--import','tsx',scriptPath],{cwd:process.cwd(),env:{...process.env,RESEARCH_AGENT_V3_MODEL_ENABLED:'false',MINIMAX_API_KEY:''},stdio:['ignore','pipe','pipe']});
 let output='',errors='';child.stdout.on('data',chunk=>{output+=String(chunk);});child.stderr.on('data',chunk=>{errors+=String(chunk).slice(0,2000);});
 await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(Error('crash child did not reach reservation'));},15000);const ready=(chunk:Buffer)=>{if(output.includes('OPERATION_RESERVED')){clearTimeout(timer);child.stdout.off('data',ready);resolve();}};child.stdout.on('data',ready);child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',()=>{clearTimeout(timer);if(!output.includes('OPERATION_RESERVED'))reject(Error('crash child stopped before reservation: '+errors));});});
 const stopped=new Promise<void>(resolve=>child.once('exit',()=>resolve()));child.kill();await stopped;
 const receipt=JSON.parse(readFileSync(receiptPath,'utf8'));let additionalExecutions=0,recoveries=0;
 const tool=async(request:V3ToolRequest)=>{if(!request.recovery_only){additionalExecutions++;throw Error('interrupted operation must not be executed again');}recoveries++;assert.equal(request.task_id,receipt.request.task_id);assert.equal(request.question_id,receipt.request.question_id);assert.equal(request.max_requests,0);return structuredClone(receipt.result);};
 const resumed=databaseBundle(i,[16]);await enrichWithV3(resumed.bundle,resumed.databaseSource,i,()=>{},opts,{tool,maxRequests:1,checkpointDir:dir});const s=validateV3Snapshot((resumed.databaseSource as any).agentV3,resumed.bundle),salary=s.questions.find(q=>q.predicate==='fixed_salary')!;
 assert.equal(additionalExecutions,0);assert.equal(recoveries,2);assert.equal(salary.attempts,1);assert.equal(salary.pendingRequestBudget,0);assert.equal(salary.answerState,'answered');assert.equal(s.budget.usedRequests,1);assert.equal(s.budget.reservedRequests,0);assert.equal(s.processedOperationIds?.length,1);assert.equal(s.xmindCollaboration?.tools.length,1);assert.equal(s.xmindCollaboration?.tools[0].status,'completed');
 const replay=databaseBundle(i,[16]);await enrichWithV3(replay.bundle,replay.databaseSource,i,()=>{},opts,{tool,maxRequests:1,checkpointDir:dir});assert.equal(additionalExecutions,0);assert.equal(recoveries,2);
}));

test('supplement seed preserves old citations and actually processes newly supplied material before archiving',()=>modelDisabled(async()=>{
 const i=input(),first=databaseBundle(i,[16]),company=first.bundle.companies[0].legalName,role=first.bundle.jobs[0].title,dir=directory();let calls=0;
 const tool=async(request:V3ToolRequest)=>{calls++;assert.equal(request.imports.length,1);return response(request,request.imports[0].content,company,calls) as any;};
 const oldOptions:V3Inputs={discovery:'supplied_only',needOrigin:'synthetic_acceptance',materials:[{kind:'text',title:'合成历史业务材料',content:`${company}2025年度主营业务为视频监控与智能物联网设备的研发、生产和销售。`,synthetic_fixture:true}]};
 await enrichWithV3(first.bundle,first.databaseSource,i,()=>{},oldOptions,{tool,maxRequests:2,checkpointDir:dir});const seed=validateV3Snapshot((first.databaseSource as any).agentV3,first.bundle),oldIds=seed.claims.map(claim=>claim.id);assert.ok(oldIds.length);
 const updatedBundle=structuredClone(first.bundle),updatedSource=structuredClone(first.databaseSource),newOptions:V3Inputs={discovery:'supplied_only',needOrigin:'synthetic_acceptance',materials:[{kind:'text',title:'合成新增岗位材料',content:`岗位：${role}，${company}2026年自入职起税前人民币固定月薪16000元，无附加条件。`,synthetic_fixture:true}]};
 await enrichWithV3(updatedBundle,updatedSource,i,()=>{},newOptions,{tool,maxRequests:2,checkpointDir:dir,seedSnapshot:seed});const s=validateV3Snapshot((updatedSource as any).agentV3,updatedBundle);
 assert.equal(calls,2);assert.ok(oldIds.every(id=>s.claims.some(claim=>claim.id===id)));assert.ok(s.sourceAttempts.some(attempt=>attempt.rawRef?.includes('/'+seed.taskId+'/')));assert.ok(s.sourceAttempts.some(attempt=>attempt.rawRef?.includes('/'+s.taskId+'/')));assert.equal(s.questions.find(q=>q.predicate==='fixed_salary')?.answerState,'answered');assert.equal(s.questions.find(q=>q.predicate==='fixed_salary')?.conclusion,'unknown');
 const replay=structuredClone(first.bundle),replaySource=structuredClone(first.databaseSource);await enrichWithV3(replay,replaySource,i,()=>{},newOptions,{tool,maxRequests:2,checkpointDir:dir,seedSnapshot:seed});assert.equal(calls,2);assert.equal((replaySource as any).agentV3.taskId,s.taskId);
}));

test('same follow-up options on a newer seed cannot reuse another seed completed checkpoint',()=>modelDisabled(async()=>{
 const i=input(),first=databaseBundle(i,[16]),company=first.bundle.companies[0].legalName,dir=directory();let calls=0;
 const tool=async(request:V3ToolRequest)=>{calls++;return response(request,`${company}2026年度主营业务为视频监控与软件平台研发服务，来源版本${calls}。`,company,calls) as any;};
 const options:V3Inputs={discovery:'supplied_only',needOrigin:'synthetic_acceptance'};
 await enrichWithV3(first.bundle,first.databaseSource,i,()=>{},options,{tool,maxRequests:1,checkpointDir:dir});const seed=validateV3Snapshot((first.databaseSource as any).agentV3,first.bundle);
 const followupBundle=structuredClone(first.bundle),followupSource=structuredClone(first.databaseSource);await enrichWithV3(followupBundle,followupSource,i,()=>{},options,{tool,maxRequests:1,checkpointDir:dir,seedSnapshot:seed});const second=validateV3Snapshot((followupSource as any).agentV3,followupBundle);
 assert.equal(calls,2);assert.notEqual(second.taskId,seed.taskId);assert.ok(second.claims.length>seed.claims.length);
 const thirdBundle=structuredClone(followupBundle),thirdSource=structuredClone(followupSource);await enrichWithV3(thirdBundle,thirdSource,i,()=>{},options,{tool,maxRequests:1,checkpointDir:dir,seedSnapshot:second});const third=validateV3Snapshot((thirdSource as any).agentV3,thirdBundle);assert.equal(calls,3);assert.notEqual(third.taskId,second.taskId);
}));

test('targeted refresh investigates only selected questions and empty focus performs no collection',()=>modelDisabled(async()=>{
 const i=input(),first=databaseBundle(i,[16]),rest=createV3Questions(i,first.bundle).find(question=>question.predicate==='rest')!,dir=directory(),requested:string[]=[];
 const tool=async(request:V3ToolRequest)=>{requested.push(request.question_id);return {records:[],documents:[],requests:1,done:true};};
 await enrichWithV3(first.bundle,first.databaseSource,i,()=>{},{needOrigin:'synthetic_acceptance'},{tool,maxRequests:4,checkpointDir:dir,focusQuestionIds:[rest.id]});const s=validateV3Snapshot((first.databaseSource as any).agentV3,first.bundle);
 assert.deepEqual(requested,[rest.id+'-r0']);assert.ok(s.questions.filter(question=>question.id!==rest.id).every(question=>question.attempts===0&&question.stopReason==='outside_requested_refresh_scope'));
 const empty=databaseBundle(i,[16]);await enrichWithV3(empty.bundle,empty.databaseSource,i,()=>{},{needOrigin:'synthetic_acceptance'},{tool,maxRequests:4,checkpointDir:dir,focusQuestionIds:[]});assert.deepEqual(requested,[rest.id+'-r0']);assert.notEqual((empty.databaseSource as any).agentV3.taskId,s.taskId);
}));

for(const failurePoint of ['cached','pending'] as const)test('semantic '+failurePoint+' receipt survives a real crash and reopens without provider credentials or repeat charges',()=>modelDisabled(async()=>{
 const i=input(),first=databaseBundle(i,[16]),company=first.bundle.companies[0].legalName,role=first.bundle.jobs[0].title,dir=directory(),scriptPath=join(dir,'semantic-crash-runner.mjs'),countPath=join(dir,'controlled-provider-calls.txt');
 const text=`岗位：${role}，${company}2026年固定月薪税前人民币16000至18000元，自入职起无附加条件。`,opts:V3Inputs={discovery:'supplied_only',needOrigin:'synthetic_acceptance',materials:[{kind:'text',title:'合成语义崩溃验收材料',content:text,synthetic_fixture:true}]};
 const sample=response({company_id:16,question_id:'placeholder-r0',task_id:'placeholder',query:'',urls:[],imports:[],max_requests:1,seconds:1},text,company,1,'http');
 const moduleUrl=pathToFileURL(join(process.cwd(),'modules/research-agent/v3-research.ts')).href;
 const signal=failurePoint==='cached'?'SEMANTIC_RESULT_CACHED':'SEMANTIC_CALL_PENDING';
 const script=`import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';
const originalRename=fs.renameSync;
fs.renameSync=(from,to)=>{originalRename(from,to);if(${JSON.stringify(failurePoint)}==='cached'&&String(to).endsWith('.agents.json')){const state=JSON.parse(fs.readFileSync(to,'utf8'));if(state.toolCalls.some(call=>call.tool==='semantic-batch'&&call.status==='completed')&&state.tasks.some(task=>task.agent==='extractor'&&task.status==='running')){process.stdout.write('SEMANTIC_RESULT_CACHED\\n');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,100000);}}};syncBuiltinESMExports();
const {enrichWithV3}=await import(${JSON.stringify(moduleUrl)});
const bundle=${JSON.stringify(first.bundle)},source=${JSON.stringify(first.databaseSource)},input=${JSON.stringify(i)},options=${JSON.stringify(opts)},sample=${JSON.stringify(sample)};
globalThis.fetch=async(url,init)=>{if(!String(url).includes('/chat/completions'))throw Error('controlled provider only');fs.writeFileSync(${JSON.stringify(countPath)},'1');if(${JSON.stringify(failurePoint)}==='pending'){process.stdout.write('SEMANTIC_CALL_PENDING\\n');await new Promise(()=>{});}const payload=JSON.parse(JSON.parse(init.body).messages[1].content),q=payload.questions.find(q=>q.predicate==='fixed_salary'),saved=payload.sources[0],role=${JSON.stringify(role)},company=${JSON.stringify(company)};
const candidate={questionId:q.id,evidenceId:saved.evidenceId,subject:company,scope:'job',predicate:'fixed_salary',quote:saved.text,locator:saved.locator,fields:{min:16000,max:18000,currency:'CNY',period:'month',basis:'fixed',taxBasis:'pre_tax',effectiveConditions:'自入职起无附加条件',role},fieldQuotes:{min:'16000',max:'18000',currency:'人民币',period:'月薪',basis:'固定月薪',taxBasis:'税前',effectiveConditions:'自入职起无附加条件',role},period:'2026年',city:null,team:null,role,polarity:'positive',negationTarget:null,conditions:['自入职起无附加条件'],answerTarget:'source_statement',reason:'controlled semantic recovery regression',missingFields:[]};
return new Response(JSON.stringify({id:'controlled-provider-receipt',choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify({candidates:[candidate],comparisons:[],explanations:[]})}}],usage:{total_tokens:50}}),{status:200,headers:{'content-type':'application/json'}});};
const tool=async request=>{const rawRef='.data/research-agent/v3/'+request.task_id+'/'+request.question_id+'/'+sample.documents[0].rawHash+'.html.gz';sample.records[0].questionId=request.question_id;sample.records[0].rawRef=rawRef;sample.documents[0].rawRef=rawRef;sample.documents[0].parsedRef=rawRef+'.parsed.json';return structuredClone(sample);};
await enrichWithV3(bundle,source,input,()=>{},options,{tool,maxRequests:1,checkpointDir:${JSON.stringify(dir)}});
`;
 writeFileSync(scriptPath,script);
 const child=spawn(process.execPath,['--import','tsx',scriptPath],{cwd:process.cwd(),env:{...process.env,RESEARCH_AGENT_V3_MODEL_ENABLED:'true',MINIMAX_API_KEY:'controlled-provider-never-sent'},stdio:['ignore','pipe','pipe']});let output='',errors='';child.stdout.on('data',chunk=>{output+=String(chunk);});child.stderr.on('data',chunk=>{errors+=String(chunk).slice(0,2000);});
 await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(Error('semantic child did not reach its receipt'));},15000);const ready=()=>{if(output.includes(signal)){clearTimeout(timer);child.stdout.off('data',ready);resolve();}};child.stdout.on('data',ready);child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',()=>{clearTimeout(timer);if(!output.includes(signal))reject(Error('semantic child stopped before result receipt: '+errors));});});
 const stopped=new Promise<void>(resolve=>child.once('exit',()=>resolve()));child.kill();await stopped;assert.equal(readFileSync(countPath,'utf8'),'1');
 let toolCalls=0;const tool=async()=>{toolCalls++;throw Error('no source or provider call is permitted during receipt recovery');};const resumed=databaseBundle(i,[16]);
 await enrichWithV3(resumed.bundle,resumed.databaseSource,i,()=>{},opts,{tool,maxRequests:1,checkpointDir:dir});const s=validateV3Snapshot((resumed.databaseSource as any).agentV3,resumed.bundle);
 assert.equal(toolCalls,0);assert.equal(s.budget.modelCalls,1);assert.equal(s.xmindSemantic?.status,failurePoint==='cached'?'completed':'reserved');assert.equal(s.xmindSemantic?.engine,'model');assert.equal(s.xmindSemantic?.acceptedClaimIds.length,failurePoint==='cached'?1:0);if(failurePoint==='cached')assert.ok(s.claims.some(claim=>s.xmindSemantic?.acceptedClaimIds.includes(claim.id)));assert.equal(s.questions.find(question=>question.predicate==='fixed_salary')?.conclusion,'unknown');assert.equal(s.xmindCollaboration?.tasks.find(task=>task.id==='r0:extractor')?.status,failurePoint==='cached'?'completed':'blocked');assert.equal(s.xmindCollaboration?.tasks.find(task=>task.id==='r0:verifier')?.status,'completed');assert.equal(s.xmindCollaboration?.tools.filter(tool=>tool.engine==='model').length,1);assert.equal(s.xmindCollaboration?.tools.find(tool=>tool.engine==='model')?.status,failurePoint==='cached'?'completed':'pending');
 const replay=databaseBundle(i,[16]);await enrichWithV3(replay.bundle,replay.databaseSource,i,()=>{},opts,{tool,maxRequests:1,checkpointDir:dir});assert.equal(toolCalls,0);assert.equal(readFileSync(countPath,'utf8'),'1');
}));

test('model flag without credentials never records a model execution or paid reservation',()=>modelDisabled(async()=>{
 const i=input(),first=databaseBundle(i,[16]),company=first.bundle.companies[0].legalName;
 const tool=async(request:V3ToolRequest)=>response(request,`${company}2026年度主营业务为面向企业的视频监控与软件平台研发服务。`,company,1,'http') as any;
 await enrichWithV3(first.bundle,first.databaseSource,i,()=>{},{discovery:'supplied_only',needOrigin:'synthetic_acceptance'},{tool,maxRequests:1,checkpointDir:directory()});const s=validateV3Snapshot((first.databaseSource as any).agentV3,first.bundle);
 assert.equal(s.budget.modelCalls,0);assert.equal(s.model.status,'not_configured');assert.equal(s.xmindSemantic?.engine,'rules');assert.ok(!s.xmindCollaboration?.tools.some(call=>call.engine==='model'));assert.ok(s.xmindCollaboration?.tasks.every(task=>task.engine==='rules'));assert.ok(!s.xmind?.runs.some(run=>run.engine==='model'));
},true));
