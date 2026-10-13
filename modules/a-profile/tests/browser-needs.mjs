import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,readFileSync,copyFileSync,cpSync,symlinkSync,existsSync,appendFileSync} from 'node:fs';
import {createServer} from 'node:net';
import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join,relative,resolve,dirname} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium,expect} from '@playwright/test';

// Actual mounted Next HTTP application; never reuse a developer server or its data.
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const results=join(root,'docs/test-results');mkdirSync(results,{recursive:true});
const dir=mkdtempSync(join(results,'a-needs-browser-'));
// Next automatically rewrites tsconfig/next-env. Give it a private host directory,
// while junctions resolve the exact repository source and installed dependencies.
const host=join(dir,'host');mkdirSync(host);
// Next route discovery skips junction directories; copy only the public route source.
cpSync(join(root,'app'),join(host,'app'),{recursive:true});
for(const source of ['modules','packages','node_modules'])symlinkSync(join(root,source),join(host,source),'junction');
for(const file of ['next.config.ts','package.json'])copyFileSync(join(root,file),join(host,file));
const tsconfig=JSON.parse(readFileSync(join(root,'tsconfig.json'),'utf8'));
tsconfig.include=['next-env.d.ts','**/*.ts','**/*.tsx','next/types/**/*.ts'];
writeFileSync(join(host,'tsconfig.json'),JSON.stringify(tsconfig,null,2));
if(existsSync(join(root,'.data/company-database'))){mkdirSync(join(host,'.data'));symlinkSync(join(root,'.data/company-database'),join(host,'.data/company-database'),'junction');}
const port=await new Promise((resolve,reject)=>{
 const socket=createServer();socket.once('error',reject);
 socket.listen(0,'127.0.0.1',()=>{const port=socket.address().port;socket.close(()=>resolve(port));});
});
const origin='http://127.0.0.1:'+port;
let server,browser,context,page,boot,sessionId,serverOutput='';
const errors=[],visited=new Set(),networkCalls=[];
const environment={...process.env,
 XRAY_A_DATA_DIR:join(dir,'data'),XRAY_NEXT_DIST_DIR:'next',
 A_NEEDS_REFINEMENT_ENABLED:'true',A_NEEDS_QUICK_UNSURE_ENABLED:'true',
 RESEARCH_AGENT_ENABLED:'false',RESEARCH_AGENT_V3_ENABLED:'false',RESEARCH_AGENT_V2_ENABLED:'false',MINIMAX_API_KEY:'',NEXT_TELEMETRY_DISABLED:'1'};

async function startServer(){
 server=spawn(process.execPath,[join(root,'node_modules/next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port',String(port)],{cwd:host,env:environment,windowsHide:true,stdio:['ignore','pipe','pipe']});
 const record=chunk=>{serverOutput+=chunk;appendFileSync(join(dir,'server.log'),chunk);};
 server.stdout.on('data',record);server.stderr.on('data',record);
 const deadline=Date.now()+120000;
 while(Date.now()<deadline){
  if(server.exitCode!==null)throw new Error('Owned Next test server exited before becoming ready');
  try{const response=await fetch(origin+'/profile',{signal:AbortSignal.timeout(10000)});if(response.ok)return;}catch{}
  await delay(250);
 }
 throw new Error('Owned Next test server did not become ready');
}
async function stopServer(){
 if(!server||server.exitCode!==null)return;
 if(process.platform==='win32'){
  try{execFileSync('taskkill',['/PID',String(server.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}catch{if(server.exitCode===null)server.kill();}
 }else server.kill('SIGTERM');
 if(server.exitCode!==null)return;
 await Promise.race([new Promise(r=>server.once('exit',r)),delay(5000)]);
}
const displayText=text=>text.replaceAll('薪酬透明','薪资与兑现');
const input=(name,value)=>page.locator('input[name="'+name+'"][value="'+value+'"]');
const refinementInput=(question,value)=>input('refinement.'+question.id,value);
const strength=question=>page.locator('select[data-strength-for="'+question.id+'"]');
const questionField=question=>page.locator('fieldset[data-refinement-question="'+question.id+'"]');
async function click(id){await page.locator('#'+id).waitFor();await expect(page.locator('#'+id)).toBeEnabled();await page.locator('#'+id).click();}
async function mutation(action){
 const saved=page.waitForResponse(r=>r.request().method()==='PATCH'&&new URL(r.url()).pathname==='/api/a/needs/sessions/'+sessionId);
 await action();assert.equal((await saved).status(),200,'UI save must succeed');
 await expect(page.locator('#notice')).toHaveText('已自动保存');
}
async function check(name,value){const control=input(name,value);if(!await control.isChecked())await mutation(()=>control.check());}
async function select(control,value){if(await control.inputValue()!==value)await mutation(()=>control.selectOption(value));}
async function api(path){const response=await page.request.get(origin+'/api/a/needs/'+path);assert.equal(response.status(),200);return response.json();}
async function draft(){return api('sessions/'+sessionId);}
async function savedView(revision){return api('sessions/'+sessionId+'/view'+(revision?'?revision='+revision:''));}
async function assertQuestion(question){
 await questionField(question).waitFor();visited.add(question.id);
 assert.equal(await refinementInput(question,'unsure').count(),1);
 for(const option of question.options){assert.equal(await refinementInput(question,option.id).count(),1);assert.ok((await questionField(question).innerText()).includes(option.text));}
 assert.equal(await questionField(question).locator('input').count(),question.options.length);
 assert.equal(await strength(question).locator('option').count(),boot.catalog.refinement.strengths.length);
}
async function chooseQuestion(question,value){await check('refinement.'+question.id,value);}
async function topicReady(topic){await page.getByRole('heading',{name:displayText(topic.title),exact:true,level:2}).waitFor();}
async function opportunityPage(){await page.locator('input[name=opportunity]').first().waitFor();}
async function finishConditions({full=false}={}){
 await opportunityPage();
 await check('opportunity','find_first_job');await check('industries','software_it');await check('roles','engineering');
 if(full){
  await check('expectations','increase_income');await page.locator('#city-choices summary').click();
  await check('cities','杭州');await check('cities','上海');
  await mutation(()=>page.getByRole('button',{name:'提高上海优先级'}).click());
  await select(page.locator('#city-strength'),'hard');await select(page.locator('#min_fixed_monthly_salary'),'8000');await select(page.locator('#min_fixed_monthly_salary-strength'),'hard');
 }
 await click('next');await page.locator('#confirmed').waitFor();await page.locator('#confirmed').check();await click('confirm');await page.locator('#result-title').waitFor();
}

try{
 await startServer();
 console.log('A browser: private Next HTTP host ready; opening /profile');
 browser=await chromium.launch({channel:'chrome',headless:true});
 context=await browser.newContext({viewport:{width:1280,height:900}});
 // A→B navigation may read the local database, but this test never starts C research.
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
 page.on('request',request=>{if(request.method()==='POST'&&request.url().includes('/api/integration/research'))networkCalls.push(request.url());});
 await page.goto(origin+'/profile?new=1');await click('start');await page.waitForURL(url=>url.searchParams.has('sessionId'));
 sessionId=new URL(page.url()).searchParams.get('sessionId');assert.ok(sessionId);
 boot=await api('bootstrap');const topics=boot.catalog.topics,questions=boot.catalog.refinement.questions;
 assert.equal(topics.length,7);assert.equal(questions.length,36);assert.equal(new Set(questions.map(q=>q.id)).size,36);
 assert.equal(await page.locator('textarea,input[type=text],input[type=number]').count(),0);
 for(let index=0;index<topics.length;index++){
  const topic=topics[index];await topicReady(topic);
  await check(topic.id+'.priority','priority');await check(topic.id+'.details','unsure');
  for(const detail of topic.details)await check(topic.id+'.details',detail.id);
  assert.equal(await input(topic.id+'.details','unsure').isChecked(),false);
  await check(topic.id+'.policy','verify_first');
  const children=questions.filter(q=>q.topicId===topic.id&&q.when);
  for(const question of questions.filter(q=>q.topicId===topic.id&&!q.when)){
   await assertQuestion(question);assert.equal(await strength(question).inputValue(),'unknown');assert.ok(await strength(question).isDisabled());
   await chooseQuestion(question,'unsure');assert.equal(await strength(question).inputValue(),'unknown');
   const child=children.find(c=>c.when.questionId===question.id),chosen=child?.when.answerIds[0]??question.options.find(o=>!o.exclusive).id;
   await chooseQuestion(question,chosen);assert.equal(await refinementInput(question,'unsure').isChecked(),false);
   assert.ok(['learn','unknown'].includes(await strength(question).inputValue()),'Selecting an arrangement must not invent a must/prefer strength');
   if(question.kind==='multiple'){
    const exclusive=question.options.find(o=>o.exclusive&&o.id!=='unsure');
    if(exclusive){await chooseQuestion(question,exclusive.id);assert.equal(await questionField(question).locator('input:checked').count(),1);await chooseQuestion(question,chosen);assert.equal(await refinementInput(question,exclusive.id).isChecked(),false);}
   }
   if(question.options.some(o=>o.id==='no_preference')){
    await chooseQuestion(question,'no_preference');assert.equal(await strength(question).inputValue(),'unknown');assert.ok(await strength(question).isDisabled());
    await chooseQuestion(question,chosen);assert.equal(await refinementInput(question,'no_preference').isChecked(),false);
   }
   await select(strength(question),'prefer');
  }
  for(const child of children){
   await assertQuestion(child);assert.equal(await strength(child).inputValue(),'unknown');
   const childAnswer=child.options.find(o=>!o.exclusive).id;await chooseQuestion(child,childAnswer);await select(strength(child),'must');
   const parent=questions.find(q=>q.id===child.when.questionId),alternative=parent.options.find(o=>!o.exclusive&&!child.when.answerIds.includes(o.id)).id;
   await chooseQuestion(parent,alternative);assert.equal(await questionField(child).count(),0,'Hidden branch must disappear');
   const state=await draft();assert.deepEqual(state.data.refinements.answers[child.id],{value:null,strength:'unknown'});
   assert.equal(state.data.refinements.answers[parent.id].strength,'unknown','Changing an arrangement requires confirming its acceptance strength again');
   assert.ok(state.data.refinements.inactiveAnswers.some(a=>a.questionId===child.id&&a.reason==='branch_changed'&&a.value.includes(childAnswer)));
   await chooseQuestion(parent,child.when.answerIds[0]);await questionField(child).waitFor();
   assert.equal(await questionField(child).locator('input:checked').count(),0,'Returning to branch must not silently restore a displaced requirement');
   assert.equal(await strength(child).inputValue(),'unknown');await chooseQuestion(child,childAnswer);await select(strength(child),'learn');
  }
  if(index===2){
   const before=(await draft()).data;await stopServer();await startServer();await page.reload();await topicReady(topic);
   assert.deepEqual((await draft()).data,before,'Draft, step and explicit strengths survive a real server restart');assert.equal((await draft()).step,2);
  }
  await click('next');
  console.log('A browser: topic '+(index+1)+' / '+topics.length+' verified');
 }
 assert.equal(visited.size,36,'Every base and conditional question must be operated through UI');
 await opportunityPage();assert.equal(await page.locator('input[name=opportunity]').count(),3);
 await click('next');await expect(page.locator('#notice')).toContainText('请选择本次主要寻找');assert.equal(await page.locator('#confirmed').count(),0);
 await finishConditions({full:true});
 const first=await savedView(1);assert.equal(first.UserProfile.revision,1);assert.equal(first.JobNeedsSnapshot.refinement.needs.length,36);
 assert.equal(first.JobNeedsSnapshot.refinement.unknownQuestionIds.length,0);assert.equal(first.JobNeedsSnapshot.refinement.questionProvenance.length,36);
 assert.deepEqual(first.UserProfile.preferences.find(c=>c.key==='city').value,['上海','杭州']);
 assert.equal(first.UserProfile.preferences.find(c=>c.key==='min_fixed_monthly_salary').value,8000);
 assert.equal(await page.locator('#json,#restore').count(),0);assert.equal((await page.request.get(origin+'/api/a/needs/sessions/'+sessionId+'/export')).status(),403);
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:join(dir,'result-mobile.png'),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await click('edit');await topicReady(topics[0]);await chooseQuestion(questions[0],'unsure');
 const indifferent=questions.find(q=>q.id==='growth.path.arrangement');await chooseQuestion(indifferent,'no_preference');
 for(let index=0;index<7;index++){await topicReady(topics[index]);await click('next');}
 await click('next');await page.locator('#confirmed').waitFor();await page.locator('#confirmed').check();await click('confirm');await page.locator('#revision').waitFor();
 assert.equal(await page.locator('#revision').inputValue(),'2');const second=await savedView(2);
 assert.ok(second.JobNeedsSnapshot.refinement.unknownQuestionIds.includes(questions[0].id));
 assert.ok(second.JobNeedsSnapshot.refinement.indifferentQuestionIds.includes(indifferent.id));
 assert.ok(!second.JobNeedsSnapshot.refinement.needs.some(n=>n.questionId===indifferent.id));
 assert.deepEqual(await savedView(1),first,'Confirmed historical version stays byte-equivalent at the public view boundary');
 await page.locator('#revision').selectOption('1');await expect(page.locator('#result-title')).toContainText('画像版本 1');
 await click('analyze');await page.waitForURL(url=>url.pathname==='/research');assert.equal(new URL(page.url()).searchParams.get('revision'),'1');
 assert.equal(new URL(page.url()).searchParams.get('sessionId'),sessionId);
 await page.goto(origin+'/profile?new=1');await click('start');await page.waitForURL(url=>url.searchParams.has('sessionId'));sessionId=new URL(page.url()).searchParams.get('sessionId');
 await topicReady(topics[0]);await check('growth.details','learning');const learning=questions.find(q=>q.id==='growth.learning.arrangement');await chooseQuestion(learning,'named_support');await select(strength(learning),'must');
 await click('quick-unsure');await opportunityPage();const shortcut=await draft();
 assert.deepEqual(shortcut.data.refinements.answers[learning.id],{value:['named_support'],strength:'must'});
 assert.equal(shortcut.data.answers['position.priority'],'unsure');assert.ok(shortcut.data.conditions.every(c=>c.value===null&&c.strength==='unknown'));
 await finishConditions();const unknown=await savedView(1);assert.ok(unknown.JobNeedsSnapshot.refinement.needs.some(n=>n.questionId===learning.id&&n.strength==='must'));
 await click('edit');await topicReady(topics[0]);await page.screenshot({path:join(dir,'question-mobile.png'),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);assert.deepEqual(networkCalls,[],'A browser verification must never start online or paid research');
 writeFileSync(join(dir,'result.json'),JSON.stringify({passed:true,entry:'/profile',topics:7,refinementQuestions:36,conditionalQuestions:questions.filter(q=>q.when).length,visitedQuestions:visited.size,modelCalls:0,researchPosts:0,serverRestart:true,oldVersionImmutable:true},null,2));
 console.log('PASS A browser: actual Next /profile → mounted HTTP → saved /view, 36 refinement questions / 8 branches, neutral strength, branch clearing, unknown shortcut, restart, confirmation, immutable revisions, A→B navigation, mobile width, no JS errors or research calls. Artifacts: '+relative(root,dir));
}catch(error){
 if(page)try{await page.screenshot({path:join(dir,'failure.png'),fullPage:true});}catch{}
 throw error;
}finally{
 if(browser)await browser.close();await stopServer();writeFileSync(join(dir,'server.log'),serverOutput);
}
