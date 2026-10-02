import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {chromium} from '@playwright/test';
import {createServer} from '../src/server.mjs';
mkdirSync('test-results',{recursive:true});const root=mkdtempSync(join('test-results','browser-'));
const server=createServer({dataDir:join(root,'data'),archiveDir:join(root,'rubbish/private')});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const choose=async radio=>{await radio.locator('xpath=ancestor::label[1]').click();assert.equal(await radio.isChecked(),true);};
 const next=async()=>{await page.locator('#next').waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('#next').disabled);await page.locator('#next').click();};
 await page.goto(`http://127.0.0.1:${server.address().port}/demo/a/v1`);
 await page.locator('#instrument').selectOption('onet-mini-ip');await next();
 await choose(page.getByRole('radio',{name:'Unsure',exact:true}).first());
 await page.waitForFunction(()=>document.querySelector('#notice').textContent==='已自动保存');await page.reload();
 await page.getByRole('radio',{name:'Unsure',exact:true}).first().waitFor();assert.equal(await page.getByRole('radio',{name:'Unsure',exact:true}).first().isChecked(),true);
 for(let p=0;p<6;p++){
  const radios=page.getByRole('radio',{name:'Unsure',exact:true});await radios.first().waitFor();
  for(let i=0;i<5;i++){await choose(radios.nth(i));await page.waitForFunction(()=>!document.querySelector('#next').disabled);}
  if(p<5){await page.getByRole('button',{name:'下一页',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#next').disabled);}
 }
 await page.waitForFunction(()=>!document.querySelector('#next').disabled);await next();
 await page.locator('#goal-clarify_direction').check();assert.equal(await page.locator('#education,#skills,#experiences').count(),0);await next();
 await page.locator('input[value=software_it]').check();await next();await page.locator('input[value=product_operations]').check();await next();
 await page.locator('#accept_sales_kpi').selectOption('false');await page.locator('#accept_sales_kpi-strength').selectOption('hard');await page.locator('#accept_sales_kpi-confirmed').check();await next();
 await page.locator('#confirm').check();await next();await page.locator('#download').waitFor();
 let x=JSON.parse(await page.locator('pre').textContent());assert.equal(x.UserProfile.assessment.scores.social,50);assert.equal(x.UserProfile.assessment.instrumentId,'onet-mini-ip');assert.equal(x.SearchIntent.filters.find(p=>p.key==='accept_sales_kpi').value,false);
 await page.reload();await page.locator('#download').waitFor();await page.locator('#edit').click();await page.locator('#goal-find_internship').check();
 for(let i=0;i<4;i++){await next();}await page.locator('#confirm').check();await next();await page.locator('#download').waitFor();
 x=JSON.parse(await page.locator('pre').textContent());assert.equal(x.UserProfile.revision,2);assert.deepEqual(x.UserProfile.background,{education:null,major:null,skills:[],experiences:[]});
 await page.locator('#new').click();await page.locator('#instrument').selectOption('not-administered');await next();await page.locator('#goal-clarify_direction').waitFor();
 assert.match(await page.locator('#app').textContent(),/未进行职业兴趣测评/);
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/mobile.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'test-results/desktop.png',fullPage:true});assert.deepEqual(errors,[]);
 console.log('PASS browser: actual SurveyJS 30-item flow, Unsure/save/reload, A export, revision 2, skip flow, mobile, no page errors');
}finally{await browser.close();await new Promise(r=>server.close(r));}
