// Local acceptance only; public HTTP/browser entrances, no internal state injection.
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../.data/browser/package.json',import.meta.url)),{chromium}=require('playwright'),base='http://127.0.0.1:3213';
const browser=await chromium.launch({headless:true,executablePath:process.env.V3_BROWSER_EXECUTABLE??'C:/Program Files/Google/Chrome/Application/chrome.exe'}),context=await browser.newContext({viewport:{width:1360,height:920}}),page=await context.newPage();let errors=[];page.on('pageerror',e=>errors.push(e.message));
if(process.argv.includes('--check-off')){
 const bootstrap=await(await context.request.get(base+'/api/a/needs/bootstrap')).json();assert.equal(bootstrap.features.quickUnsure,false);
 await page.goto(base+'/profile?new=1');await page.locator('#start').click();await page.locator('#next').waitFor();
 assert.equal(await page.locator('#quick-unsure').count(),0);assert.ok(await page.locator('#next').isVisible());assert.deepEqual(errors,[]);
 writeFileSync('.data/v3-acceptance/a-rollback.json',JSON.stringify({result:'pass',quickUnsure:false,originalNextVisible:true,pageErrors:errors},null,2));
 await browser.close();console.log('Actual A feature-off browser rollback passed');process.exit(0);
}
await page.goto(base+'/profile?new=1');await page.locator('#start').click();await page.locator('#quick-unsure').waitFor();
async function choose(selector,method='check',value){await Promise.all([page.waitForResponse(r=>r.request().method()==='PATCH'&&r.url().includes('/api/a/needs/sessions/')),page.locator(selector)[method](...(value?[value]:[]))]);}
await choose('input[name="growth.priority"][value=priority]');await choose('input[name="growth.details"][value=learning]');await choose('input[name="growth.policy"][value=continue_with_unknown]');
await page.locator('#quick-unsure').click();await page.locator('#min_fixed_monthly_salary').waitFor();await page.screenshot({path:'.data/v3-acceptance/a-shortcut-conditions.png',fullPage:true});
await choose('input[name=opportunity][value=find_first_job]');await choose('input[name=industries][value=manufacturing]');await choose('input[name=roles][value=engineering]');await choose('#min_fixed_monthly_salary','selectOption','15000');await choose('#min_fixed_monthly_salary-strength','selectOption','hard');await page.locator('#city-choices').evaluate(el=>el.open=true);await choose('input[name=cities][value="杭州"]');await choose('#city-strength','selectOption','hard');
await page.locator('#next').click();await page.locator('#confirmed').check();await page.locator('#confirm').click();await page.locator('#result-title').waitFor();
const sessionId=new URL(page.url()).searchParams.get('sessionId'),view=await (await context.request.get(base+'/api/a/needs/sessions/'+sessionId+'/view')).json();
assert.equal(view.JobNeedsSnapshot.topics.find(t=>t.topicId==='growth').priority,'priority');assert.deepEqual(view.JobNeedsSnapshot.topics.find(t=>t.topicId==='growth').verificationItemIds,['learning']);assert.ok(view.JobNeedsSnapshot.topics.filter(t=>t.topicId!=='growth').every(t=>t.priority==='unknown'&&t.verificationItemIds.length===0));assert.equal(view.UserProfile.preferences.find(c=>c.key==='min_fixed_monthly_salary').strength,'hard');
await page.locator('#analyze').click();await page.getByText('嵌入式软件工程师',{exact:true}).waitFor();assert.ok(await page.getByRole('heading',{name:'补充材料（可选）'}).isVisible());
const original=JSON.parse(readFileSync('.data/v3-acceptance/source.json','utf8')),imp=await(await context.request.post(base+'/api/integration/materials',{data:{kind:'text',title:'A改进验收：大华官网实际原文',content:original.text,declaredSource:original.url},headers:{origin:base}})).json();
const body={sessionId,revision:1,recordIds:[16],v3:{needOrigin:'synthetic_acceptance',purpose:'selection',importIds:[imp.importId],sourceUrls:[]}},jobStart=await(await context.request.post(base+'/api/integration/research',{data:body,headers:{origin:base}})).json();let job,last='';
for(;;){job=await(await context.request.get(base+'/api/integration/research/runs/'+jobStart.runId)).json();if(job.message!==last){console.log(job.status,job.message);last=job.message;}if(job.status==='completed')break;assert.notEqual(job.status,'failed');await new Promise(r=>setTimeout(r,1700));}
const id=job.reportUrl.split('/').at(-1),s=await(await context.request.get(base+'/api/integration/reports/'+id+'/investigation')).json();assert.deepEqual(s.agentV3.questions.map(q=>q.predicate).sort(),['business','fixed_salary','training']);assert.equal(s.agentV3.questions.find(q=>q.predicate==='fixed_salary').importance,'hard');
await page.goto(base+job.reportUrl);await page.getByRole('heading',{name:'具体问题与需求判断'}).waitFor();assert.ok(await page.getByText('合成验收需求：仅用于验证流程，不代表你的求职侧写。材料来源另行标注。',{exact:true}).count());await page.screenshot({path:'.data/v3-acceptance/a-to-c.png',fullPage:true});assert.deepEqual(errors,[]);
writeFileSync('.data/v3-acceptance/a-acceptance.json',JSON.stringify({result:'pass',sessionId,reportId:id,reportUrl:job.reportUrl,selectedGrowthRetained:true,remainingTopicsUnknown:true,explicitSalaryHard:true,predicates:s.agentV3.questions.map(q=>q.predicate),pageErrors:errors},null,2));
await browser.close();console.log('Actual A browser shortcut -> confirmed needs -> B HTTP -> C passed');
