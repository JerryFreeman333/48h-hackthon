import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,readFileSync,copyFileSync,cpSync,symlinkSync,existsSync,appendFileSync} from 'node:fs';
import {createServer} from 'node:net';
import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join,relative,resolve,dirname} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium,expect} from '@playwright/test';

// Public UI on the mounted Next application. A private host prevents accidental
// rewriting of the real application's tsconfig, sessions, or report archives.
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const results=join(root,'docs/test-results');mkdirSync(results,{recursive:true});
const dir=mkdtempSync(join(results,'a-tradeoff-browser-'));
const host=join(dir,'host');mkdirSync(host);
cpSync(join(root,'app'),join(host,'app'),{recursive:true});
for(const source of ['modules','packages','node_modules'])symlinkSync(join(root,source),join(host,source),'junction');
for(const file of ['next.config.ts','package.json'])copyFileSync(join(root,file),join(host,file));
const tsconfig=JSON.parse(readFileSync(join(root,'tsconfig.json'),'utf8'));
tsconfig.include=['next-env.d.ts','**/*.ts','**/*.tsx','next/types/**/*.ts'];
writeFileSync(join(host,'tsconfig.json'),JSON.stringify(tsconfig,null,2));
if(existsSync(join(root,'.data/company-database'))){mkdirSync(join(host,'.data'));symlinkSync(join(root,'.data/company-database'),join(host,'.data/company-database'),'junction');}
const port=await new Promise((resolve,reject)=>{const socket=createServer();socket.once('error',reject);socket.listen(0,'127.0.0.1',()=>{const port=socket.address().port;socket.close(()=>resolve(port));});});
const origin='http://127.0.0.1:'+port;
let server,browser,context,page,boot,sessionId,serverOutput='';
const errors=[],networkCalls=[],visited=new Set();
const environment={...process.env,
 XRAY_A_DATA_DIR:join(dir,'data'),XRAY_REPORT_DATA_DIR:join(dir,'reports'),XRAY_NEXT_DIST_DIR:'next',
 A_NEEDS_TRADEOFF_ENABLED:'true',A_NEEDS_REFINEMENT_ENABLED:'true',A_NEEDS_QUICK_UNSURE_ENABLED:'true',
 RESEARCH_AGENT_ENABLED:'false',RESEARCH_AGENT_V3_ENABLED:'false',RESEARCH_AGENT_V2_ENABLED:'false',MINIMAX_API_KEY:'',NEXT_TELEMETRY_DISABLED:'1'};
async function startServer(){
 server=spawn(process.execPath,[join(root,'node_modules/next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port',String(port)],{cwd:host,env:environment,windowsHide:true,stdio:['ignore','pipe','pipe']});
 const record=chunk=>{serverOutput+=chunk;appendFileSync(join(dir,'server.log'),chunk);};server.stdout.on('data',record);server.stderr.on('data',record);
 const deadline=Date.now()+120000;
 while(Date.now()<deadline){
  if(server.exitCode!==null)throw new Error('Owned Next test server exited before becoming ready');
  try{if((await fetch(origin+'/profile',{signal:AbortSignal.timeout(10000)})).ok)return;}catch{}
  await delay(250);
 }
 throw new Error('Owned Next test server did not become ready');
}
async function stopServer(){
 if(!server||server.exitCode!==null)return;
 if(process.platform==='win32'){
  try{execFileSync('taskkill',['/PID',String(server.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}catch{if(server.exitCode===null)server.kill();}
 }else server.kill('SIGTERM');
 if(server.exitCode!==null)return;await Promise.race([new Promise(r=>server.once('exit',r)),delay(5000)]);
}
async function click(id,options={}){const control=page.locator('#'+id);await control.waitFor();await expect(control).toBeEnabled();await control.click(options);}
async function api(path){const response=await page.request.get(origin+'/api/a/needs/'+path);assert.equal(response.status(),200);return response.json();}
const draft=()=>api('sessions/'+sessionId);
const savedView=revision=>api('sessions/'+sessionId+'/view'+(revision?'?revision='+revision:''));
async function mutation(action){
 const saved=page.waitForResponse(r=>r.request().method()==='PATCH'&&new URL(r.url()).pathname==='/api/a/needs/sessions/'+sessionId);
 await action();assert.equal((await saved).status(),200);await expect(page.locator('#notice')).toHaveText('已自动保存');
}
const input=(name,value)=>page.locator('input[name="'+name+'"][value="'+value+'"]');
async function check(name,value){
 const control=input(name,value);await control.waitFor({state:'attached'});
 while(!await control.isVisible()){
  const details=control.locator('xpath=ancestor::details[not(@open)]').first();
  if(!await details.count())throw new Error('Choice is hidden outside an expandable public section: '+name);
  await details.locator('summary').first().click();
 }
 if(!await control.isChecked())await mutation(()=>control.check());
}
async function select(control,value){if(await control.inputValue()!==value)await mutation(()=>control.selectOption(value));}

const questionField=id=>page.locator('[data-tradeoff-question="'+id+'"]');
const chosen={
 opportunity_01:'left',condition_01:'fixed_30',
 opportunity_02:'depends',condition_02:'notice_compensation',
 opportunity_03:'tie',opportunity_04:'left',condition_03:'unsure',
 opportunity_05:'unsure',opportunity_06:'right',condition_04:'no_night',
 opportunity_07:'right',opportunity_08:'right',condition_05:'named_support',
 opportunity_09:'depends',condition_06:'continue_unknown',
 opportunity_10:'left',condition_07:'extra_verified',
 opportunity_11:'left',condition_08:'no_exchange',
 opportunity_12:'right',opportunity_13:'left',opportunity_14:'right'
};
async function newSession(){
 await page.goto(origin+'/profile?new=1');await click('start');
 await page.waitForURL(url=>url.searchParams.has('sessionId'));
 sessionId=new URL(page.url()).searchParams.get('sessionId');assert.ok(sessionId);return sessionId;
}
async function currentQuestion(){
 const field=page.locator('[data-tradeoff-question]').first();await field.waitFor();
 return field.getAttribute('data-tradeoff-question');
}
async function nextQuestion(id){
 await click('next');
 await page.waitForFunction(previous=>{
  const field=document.querySelector('[data-tradeoff-question]');
  return field?field.dataset.tradeoffQuestion!==previous:Boolean(document.querySelector('input[name="opportunity"]'));
 },id);
}
async function answer(id,value){await questionField(id).waitFor();await check('tradeoff.'+id,value);}
async function finishConditions({full=false}={}){
 await page.locator('input[name=opportunity]').first().waitFor();
 await check('opportunity','find_first_job');await check('industries','software_it');await check('roles','engineering');
 if(full){
  await check('expectations','increase_income');await page.locator('#city-choices summary').click();
  await check('cities','杭州');await check('cities','上海');
  await mutation(()=>page.getByRole('button',{name:'提高上海优先级'}).click());
  await select(page.locator('#city-strength'),'hard');
  await select(page.locator('#min_fixed_monthly_salary'),'8000');
  await select(page.locator('#min_fixed_monthly_salary-strength'),'hard');
 }
 await click('next');await page.locator('#confirmed').waitFor();
}
async function review({payMust=false,legacy=false}={}){
 if(!legacy){
  await mutation(()=>page.locator('#adopt-proposals').click());
  const state=await draft();assert.equal(Object.values(state.data.tradeoff.review).filter(r=>r.confirmed).length,7);
  if(payMust){
   const card=page.locator('[data-review-topic=pay]');
   await select(card.locator('select[data-review-field=priority]'),'priority');
   await select(card.locator('select[data-review-field=strength]'),'must');
   await select(card.locator('select[data-review-field=unknownHandling]'),'verify_first');
   const accept=card.locator('input[data-review-accept]');
   if(!await accept.isChecked())await mutation(()=>accept.check());
  }
 }
 await page.locator('#confirmed').check();await click('confirm');await page.locator('#result-title').waitFor();
}

try{
 await startServer();console.log('A tradeoff browser: private mounted Next HTTP host ready');
 browser=await chromium.launch({channel:'chrome',headless:true});
 context=await browser.newContext({viewport:{width:1280,height:900}});
 // Real local database can be read by B. All online research remains disabled.
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 page=await context.newPage();page.setDefaultTimeout(15000);
 page.on('pageerror',error=>errors.push(error.message));
 page.on('request',request=>{if(request.method()==='POST'&&request.url().includes('/api/integration/research'))networkCalls.push(request.url());});
 const firstSessionId=await newSession();boot=await api('bootstrap');
 assert.equal(boot.features.tradeoff,true);assert.equal(boot.tradeoff.coreQuestionCount,14);assert.equal(boot.tradeoff.maxFollowupCount,8);
 const questions=boot.tradeoff.questions;assert.equal(questions.length,22);
 assert.equal(await page.locator('textarea,input[type=text],input[type=number]').count(),0);
 // Emulate one failed response at the public HTTP boundary, then operate the UI
 // again. No session data is injected or mutated by the test harness.
 const savePattern='**/api/a/needs/sessions/'+sessionId;let failureInjected=false;
 const failSave=async route=>{
  if(route.request().method()==='PATCH'&&!failureInjected){failureInjected=true;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{message:'本次保存暂时失败，请重试'}})});}
  else await route.continue();
 };
 await page.route(savePattern,failSave);await input('tradeoff.opportunity_01','unsure').check();
 await expect(page.locator('#notice')).toContainText('本次保存暂时失败');
 assert.equal((await draft()).data.tradeoff.answers.opportunity_01,null);
 await expect(input('tradeoff.opportunity_01','right')).toBeEnabled();await answer('opportunity_01','right');
 assert.equal((await draft()).data.tradeoff.answers.opportunity_01,'right');await page.unroute(savePattern,failSave);
 let restarted=false;
 while(await page.locator('[data-tradeoff-question]').count()){
  const id=await currentQuestion(),q=questions.find(q=>q.id===id);assert.ok(q);visited.add(id);
  assert.equal(await questionField(id).locator('input').count(),q.options.length);
  for(const option of q.options){assert.equal(await input('tradeoff.'+id,option.id).count(),1);assert.ok((await questionField(id).innerText()).includes(option.text));}
  if(!q.when){for(const neutral of ['tie','depends','unsure'])assert.equal(await input('tradeoff.'+id,neutral).count(),1);}
  // The user sees one mixed situation rather than seven dimension cards.
  assert.equal(await page.locator('[data-review-topic]').count(),0);
  await answer(id,chosen[id]);
  if(id==='opportunity_01'){
   await page.setViewportSize({width:390,height:844});await page.screenshot({path:join(dir,'question-mobile.png'),fullPage:true});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.setViewportSize({width:1280,height:900});
  }
  if(id==='condition_02'&&!restarted){
   const before=await draft();await stopServer();await startServer();await page.reload();await questionField(id).waitFor();
   const after=await draft();assert.deepEqual(after.data,before.data);assert.equal(after.tradeoffCursor,before.tradeoffCursor);
   assert.equal(await input('tradeoff.'+id,chosen[id]).isChecked(),true);restarted=true;
  }
  await nextQuestion(id);
 }
 assert.equal(visited.size,22,'Operate every core and conditional question through UI');
 await finishConditions({full:true});
 await expect(page.getByText('有题中的条件达不到你补充的门槛，这些比较没有用于先后排序。',{exact:true})).toBeVisible();
 // Proposals do not silently become confirmed hard constraints.
 const unconfirmed=await draft();assert.ok(Object.values(unconfirmed.data.tradeoff.review).every(r=>!r.confirmed));
 await review({payMust:true});const first=await savedView(1),tradeoff=first.JobNeedsSnapshot.tradeoff;
 assert.equal(first.UserProfile.revision,1);assert.equal(tradeoff.questionnaireVersion,boot.tradeoff.version);
 assert.equal(tradeoff.scores,null);assert.equal(tradeoff.validationStatus,'not-validated');
 assert.equal(tradeoff.questionProvenance.length,22);assert.ok(tradeoff.questionProvenance.every(p=>p.itemOrigin==='product-authored'));
 assert.ok(tradeoff.unknownQuestionIds.includes('opportunity_05'));assert.ok(tradeoff.unknownQuestionIds.includes('condition_06'));
 assert.ok(tradeoff.indifferentQuestionIds.includes('opportunity_03'));
 assert.ok(tradeoff.ranking.qualifications.some(x=>x.sourceQuestionId==='opportunity_11'&&x.reason==='exchange_declined'));
 const conditional=tradeoff.ranking.conditionalRelations.find(x=>x.questionIds.includes('opportunity_01'));
 assert.ok(conditional);assert.equal(conditional.conditionQuestionId,'condition_01');assert.equal(conditional.conditionAnswerId,'fixed_30');
 assert.equal(conditional.originalScenarioCompatible,false,'The original approximately 20% increase cannot meet the declared 30% threshold');
 assert.ok(conditional.conditionText.includes('30%'));
 assert.ok(tradeoff.ranking.relations.every(x=>!x.questionIds.includes('opportunity_01')),'Conditional comparison never enters unconditional ranking');
 assert.ok(tradeoff.ranking.qualifications.some(x=>x.sourceQuestionId==='opportunity_04'&&x.reason==='conditions_unresolved'));
 assert.ok(tradeoff.ranking.relations.every(x=>!x.questionIds.includes('opportunity_04')),'Unknown follow-up never enters unconditional ranking');
 assert.ok(tradeoff.ranking.conditionalRelations.every(x=>!x.questionIds.includes('opportunity_04')));
 assert.ok(tradeoff.unknownQuestionIds.includes('condition_03'));
 assert.ok(tradeoff.conditionalExchanges.some(x=>x.conditionQuestionId==='condition_08'&&x.status==='declined-exchange'));
 assert.ok(tradeoff.conditionalExchanges.some(x=>x.conditionQuestionId==='condition_06'&&x.status==='unknown'));
 assert.ok(tradeoff.needs.some(n=>n.sourceQuestionId==='condition_01'&&n.answerIds.includes('fixed_30')));
 assert.ok(tradeoff.needs.some(n=>n.sourceQuestionId==='condition_08'&&n.answerIds.includes('no_exchange')));
 assert.ok(tradeoff.needs.filter(n=>n.topicId==='pay').every(n=>n.strength==='must'&&n.userConfirmed));
 assert.ok(tradeoff.topics.every(t=>t.userConfirmed));
 assert.equal(first.UserProfile.preferences.find(c=>c.key==='min_fixed_monthly_salary').value,8000);
 assert.deepEqual(first.UserProfile.preferences.find(c=>c.key==='city').value,['上海','杭州']);
 assert.ok(!(await page.locator('#saved-description').innerText()).includes('undefined'));
 assert.equal((await page.request.get(origin+'/api/a/needs/sessions/'+sessionId+'/export')).status(),403);
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:join(dir,'result-mobile.png'),fullPage:true});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.equal(await page.locator('[data-result-topic][open]').count(),0,'Seven detailed themes are folded initially');
 await page.locator('[data-result-topic=company] summary').click();
 assert.ok((await page.locator('[data-result-topic=company]').innerText()).includes('30%'));
 await page.screenshot({path:join(dir,'result-expanded-mobile.png'),fullPage:true});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.setViewportSize({width:1280,height:900});

 await click('edit');await questionField('opportunity_01').waitFor();await answer('opportunity_01','right');
 let changed=await draft();assert.equal(changed.data.tradeoff.answers.condition_01,null);
 assert.ok(changed.data.tradeoff.inactiveAnswers.some(a=>a.questionId==='condition_01'&&a.value==='fixed_30'));
 assert.ok(Object.values(changed.data.tradeoff.review).every(r=>!r.confirmed),'Changing the answer invalidates old acceptance');
 await answer('opportunity_01','left');await nextQuestion('opportunity_01');await questionField('condition_01').waitFor();
 assert.equal(await questionField('condition_01').locator('input:checked').count(),0,'Displaced answer is never silently restored');
 await click('back');await questionField('opportunity_01').waitFor();await answer('opportunity_01','right');
 await click('skip');await finishConditions();await review();
 const second=await savedView(2);assert.equal(second.UserProfile.revision,2);assert.equal(second.JobNeedsSnapshot.tradeoff.answers.condition_01,null);
 assert.deepEqual(await savedView(1),first,'Confirmed previous version stays immutable at public view');
 await page.locator('#revision').selectOption('1');await expect(page.locator('#result-title')).toContainText('画像版本 1');
 await click('analyze',{timeout:60000});await page.waitForURL(url=>url.pathname==='/research',{timeout:60000});
 assert.equal(new URL(page.url()).searchParams.get('sessionId'),firstSessionId);assert.equal(new URL(page.url()).searchParams.get('revision'),'1');

 await newSession();await questionField('opportunity_01').waitFor();await click('skip');await finishConditions();await review();
 const unknown=await savedView(1);assert.equal(unknown.JobNeedsSnapshot.tradeoff.needs.length,0);
 assert.equal(unknown.JobNeedsSnapshot.tradeoff.ranking.relations.length,0);assert.equal(unknown.JobNeedsSnapshot.tradeoff.ranking.tiers.length,0);
 assert.equal(unknown.JobNeedsSnapshot.tradeoff.unknownQuestionIds.length,14);
 assert.ok(unknown.UserProfile.preferences.every(c=>c.value===null&&c.strength==='unknown'));

 await stopServer();environment.A_NEEDS_TRADEOFF_ENABLED='false';await startServer();
 boot=await api('bootstrap');assert.equal(boot.features.tradeoff,false);
 sessionId=firstSessionId;assert.deepEqual(await savedView(1),first,'Turning off the new flow preserves historical reports');
 await page.goto(origin+'/profile?sessionId='+firstSessionId);await page.locator('#result-title').waitFor();
 await page.locator('#revision').selectOption('1');await expect(page.locator('#result-title')).toContainText('画像版本 1');
 assert.ok((await page.locator('#saved-description').textContent()).includes('30%'));
 await newSession();await page.locator('input[name="growth.priority"]').first().waitFor();
 assert.equal(await page.locator('[data-tradeoff-question]').count(),0);assert.equal((await draft()).data.tradeoff,undefined);
 await check('growth.priority','secondary');await check('growth.details','learning');await check('growth.policy','verify_first');
 await click('quick-unsure');await finishConditions();await review({legacy:true});
 const legacy=await savedView(1);assert.equal(legacy.JobNeedsSnapshot.tradeoff,undefined);
 assert.equal((await draft()).questionnaireVersion,'job-needs-20261002-1');
 const legacySessionId=sessionId;
 await stopServer();environment.A_NEEDS_TRADEOFF_ENABLED='true';await startServer();
 await page.goto(origin+'/profile');await page.locator('#start').waitFor();
 assert.equal(await page.locator('input[name="growth.priority"]').count(),0,'A legacy latest session never hides the new default home');
 await expect(page.getByRole('heading',{name:'如果好条件不能同时得到，你会怎么选？'})).toBeVisible();
 await page.goto(origin+'/profile?sessionId='+legacySessionId);await page.locator('#result-title').waitFor();
 sessionId=legacySessionId;assert.deepEqual(await savedView(1),legacy,'Explicit legacy history still opens unchanged after re-enabling');
 assert.deepEqual(errors,[]);assert.deepEqual(networkCalls,[],'A verification never starts online or paid company research');
 writeFileSync(join(dir,'result.json'),JSON.stringify({passed:true,entry:'/profile',questions:22,coreQuestions:14,conditionalQuestions:8,visitedQuestions:visited.size,serverRestart:true,branchClearing:true,oldVersionImmutable:true,unknownExit:true,conditionalComparisonsSeparated:true,originalScenarioBelowThreshold:true,unknownConditionExcludedFromRanking:true,featureFlagRollback:true,legacyConfirmed:true,defaultHomeAfterLegacy:true,aToBNavigation:true,viewport390:true,foldedReport:true,failedSaveRecovery:true,modelCalls:0,researchPosts:0},null,2));
 console.log('PASS A tradeoff browser: 22 mixed questions / 8 branches via public UI, conditional thresholds and unknown follow-ups excluded from unconditional ranking, depends / unsure / declined exchange, explicit acceptance, branch clearing, unknown exit, restart, immutable history, A→B, 390px, flag rollback and legacy confirmation. Artifacts: '+relative(root,dir));
}catch(error){
 if(page)try{await page.screenshot({path:join(dir,'failure.png'),fullPage:true});}catch{}
 throw error;
}finally{
 if(browser)await browser.close();await stopServer();writeFileSync(join(dir,'server.log'),serverOutput);
}
