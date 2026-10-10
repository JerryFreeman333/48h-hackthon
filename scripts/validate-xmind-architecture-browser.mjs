// Actual browser/public HTTP entrances; fresh isolated Chrome context, no state injection.
// The TXT is a byte-preserving UTF-8 copy of previously saved public official text.
import {createRequire} from 'node:module';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const require=createRequire(new URL('../.data/browser/package.json',import.meta.url));
const {chromium}=require('playwright');
const base=process.env.V3_BASE_URL??'http://127.0.0.1:3220';
const dir='.data/xmind-structure-acceptance/browser';
mkdirSync(dir,{recursive:true});
const session=JSON.parse(readFileSync('.data/xmind-acceptance/session.json','utf8'));
const architecturePath='.data/xmind-structure-acceptance/architecture-http.json';
const architecture=existsSync(architecturePath)?JSON.parse(readFileSync(architecturePath,'utf8')):null;
const initialReportId=architecture?.result==='pass'?architecture.finalReportId:session.reportId;
const initialReportUrl='/flow/reports/'+initialReportId;
const official=JSON.parse(readFileSync('.data/v3-acceptance/source.json','utf8'));
assert.equal(official.originalAvailable,true);
assert.equal(official.url,'https://www.dahuatech.com/about/company.html');
assert.ok(official.text.includes('浙江大华技术股份有限公司'));
assert.ok(!official.text.includes('\uFFFD'),'saved official text must not contain decoding replacements');
const inputPath=resolve(dir,'大华官网正文-真实原件回读.txt');
writeFileSync(inputPath,official.text,'utf8');
const inputHash=createHash('sha256').update(readFileSync(inputPath)).digest('hex');
const cookieSeparator=session.cookie.indexOf('=');
assert.ok(cookieSeparator>0,'existing cookie came from legal HTTP bootstrap');
let phase='browser launch',browser;
const errors=[],responseErrors=[],screenshots=[];
const receipt={result:'running',base,initialReportId,source:{url:official.url,savedRawHash:official.rawHash,uploadedTextHash:inputHash,title:'大华官网正文-真实原件回读.txt',kind:'saved real public official body; controlled file import; no fresh crawl'},cookieSaved:false,desktop:'1360x920',mobile:'390x844',errors,responseErrors,screenshots};
function save(){writeFileSync(dir+'/receipt.json',JSON.stringify({...receipt,phase},null,2));}
save();
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.V3_BROWSER_EXECUTABLE??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const context=await browser.newContext({viewport:{width:1360,height:920}});
 await context.addCookies([{name:session.cookie.slice(0,cookieSeparator),value:session.cookie.slice(cookieSeparator+1),url:base}]);
 const page=await context.newPage();page.setDefaultTimeout(30000);
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(new URL(r.url()).origin===base&&r.status()>=400)responseErrors.push({status:r.status(),path:new URL(r.url()).pathname});});
 async function req(path){const response=await context.request.get(base+path);const text=await response.text();assert.ok(response.ok(),path+' status '+response.status());let body;try{body=JSON.parse(text);}catch{body=text;}return body;}
 async function shot(name,locator=page){const path=dir+'/'+name+'.png';await locator.screenshot({path,...(locator===page?{fullPage:true}:{})});screenshots.push(path);save();}
 async function noOverflow(label){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false,label+' horizontal document overflow');}

 phase='A confirmed profile';save();
 await page.goto(base+'/profile?sessionId='+encodeURIComponent(session.sessionId));
 await page.getByRole('heading',{name:/侧写已保存 · 画像版本/}).waitFor();
 await page.getByRole('button',{name:'继续调查公司与岗位',exact:true}).waitFor();
 await shot('a-profile-desktop');
 await page.getByRole('button',{name:'继续调查公司与岗位',exact:true}).click();
 await page.waitForURL('**/research?**');
 await page.getByRole('heading',{name:'公司与岗位调查',exact:true}).waitFor();
 await page.getByText('你的已确认需求',{exact:true}).waitFor();
 await page.getByText('嵌入式软件工程师',{exact:true}).first().waitFor();
 assert.equal(new URL(page.url()).searchParams.get('sessionId'),session.sessionId);
 assert.ok((await page.locator('.b-conditions').innerText()).includes('杭州'));
 await shot('b-research-desktop');
 receipt.profileToResearch=true;

 phase='C actual agent collaboration';save();
 const oldHtml=await req(initialReportUrl);
 const initial=(await req('/api/integration/reports/'+initialReportId+'/investigation')).agentV3;
 assert.equal(new Set(initial.xmindCollaboration.tasks.map(t=>t.agent)).size,11);
 writeFileSync(dir+'/original-report.html',oldHtml);
 receipt.originalReportHtmlHash=createHash('sha256').update(oldHtml).digest('hex');
 await page.goto(base+initialReportUrl);
 await page.getByRole('heading',{name:'XMind 调查流程',exact:true}).waitFor();
 const agentSection=page.getByText('本次 Agent 协作结果',{exact:true}).locator('..');
 await agentSection.waitFor();
 assert.equal(await agentSection.locator('tbody tr').count(),11);
 await shot('agents-desktop',agentSection);
 await page.getByText('查看各模块实际运行状态',{exact:true}).click();
 assert.ok(await page.getByText('问题规划：已运行',{exact:false}).count());
 receipt.agentRows=11;

 phase='Evidence file form desktop/mobile';save();
 await page.getByRole('link',{name:'补充材料或更新调查',exact:true}).click();
 await page.waitForURL('**/evidence/'+initialReportId);
 await page.getByRole('heading',{name:'补充材料并更新调查',exact:true}).waitFor();
 const input=page.locator('input[type="file"]');
 await input.waitFor();
 await page.waitForFunction(()=>!document.querySelector('input[type="file"]').disabled);
 await shot('evidence-desktop');
 await page.setViewportSize({width:390,height:844});
 await noOverflow('390px evidence page');
 await shot('evidence-mobile');
 await page.setViewportSize({width:1360,height:920});

 phase='Actual file upload and new report';save();
 await input.setInputFiles(inputPath);
 const upload=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/integration/materials'&&r.request().method()==='POST');
 const update=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/integration/reports/'+initialReportId+'/sources-update'&&r.request().method()==='POST',{timeout:120000});
 await page.getByRole('button',{name:'核对材料并生成新报告',exact:true}).click();
 const uploaded=await upload;assert.ok(uploaded.ok(),'file upload HTTP status '+uploaded.status());
 const uploadedBody=await uploaded.json();assert.ok(uploadedBody.importId);
 const updated=await update;const updatedBody=await updated.json();
 assert.ok(updated.ok(),'update HTTP status '+updated.status()+' '+JSON.stringify(updatedBody));
 assert.notEqual(updatedBody.reportId,initialReportId);
 await page.getByText('已保存新报告，原报告仍可打开。新材料仍按来源陈述处理。',{exact:true}).waitFor();
 await page.getByRole('link',{name:'打开更新后的报告',exact:true}).click();
 await page.waitForURL('**/flow/reports/'+updatedBody.reportId);
 await page.getByRole('heading',{name:'XMind 调查流程',exact:true}).waitFor();
 const current=(await req('/api/integration/reports/'+updatedBody.reportId+'/investigation')).agentV3;
 assert.notEqual(current.taskId,initial.taskId);
 assert.ok(current.xmindCollaboration.tools.some(t=>t.tool==='acquire-material'&&t.status==='completed'),'new investigation must complete its actual acquisition operation');
 assert.ok(current.processedOperationIds?.some(id=>!initial.processedOperationIds?.includes(id)),'new acquisition receipt must be merged');
 // An identical body intentionally reuses the retained source receipt; do not require duplicate originals.
 const attempt=current.sourceAttempts.find(a=>a.acquisitionMode==='user_text'&&a.rawHash===inputHash&&a.accessState==='ok'&&a.analysisState==='accepted'&&a.evidenceIds.length);
 assert.ok(attempt,'uploaded real saved text must reach accepted located body');
 const source=await req('/api/integration/reports/'+updatedBody.reportId+'/sources/'+attempt.evidenceIds[0]);
 assert.equal(source.originalAvailable,true);assert.equal(source.rawHash,inputHash);
 assert.ok(source.text.includes('浙江大华技术股份有限公司'));
 assert.equal(source.text,official.text,'readback preserves the supplied official body');
 assert.ok(attempt.locators.length>0);
 assert.ok(current.claims.some(c=>attempt.evidenceIds.includes(c.evidenceId)));
 assert.ok(current.claims.filter(c=>attempt.evidenceIds.includes(c.evidenceId)).every(c=>c.verification==='source_claim'),'controlled real text remains source claim');
 assert.equal(current.budget.usedRequests,0);assert.equal(current.budget.modelCalls,0);
 assert.ok(current.questions.every(q=>q.conclusion==='unknown'));
 assert.ok(current.keyQuestionIds.length<=3);
 for(const old of initial.sourceAttempts)assert.ok(current.sourceAttempts.some(a=>a.sourceId===old.sourceId&&a.rawHash===old.rawHash),'prior original retained');
 assert.equal(await req(initialReportUrl),oldHtml);
 assert.deepEqual((await req('/api/integration/reports/'+initialReportId+'/investigation')).agentV3,initial);
 const newHtml=await req(updatedBody.reportUrl);writeFileSync(dir+'/updated-report.html',newHtml);
 writeFileSync(dir+'/uploaded-source.json',JSON.stringify(source,null,2));
 const currentAgents=page.getByText('本次 Agent 协作结果',{exact:true}).locator('..');
 assert.equal(await currentAgents.locator('tbody tr').count(),11);
 await shot('updated-agents-desktop',currentAgents);
 await page.setViewportSize({width:390,height:844});
 await noOverflow('390px updated C page');
 await shot('updated-report-mobile');
 await shot('updated-agents-mobile',currentAgents);
 assert.deepEqual(errors,[]);assert.deepEqual(responseErrors,[]);
 Object.assign(receipt,{result:'pass',updatedReportId:updatedBody.reportId,updatedReportUrl:updatedBody.reportUrl,importId:uploadedBody.importId,uploadedEvidenceId:attempt.evidenceIds[0],bodyReceiptReused:!attempt.rawRef?.includes('/'+current.taskId+'/'),newAcquisitionCompleted:true,locators:attempt.locators.length,networkRequests:0,modelCalls:0,oldReportUnchanged:true,priorSourcesRetained:true,conclusions:'unknown',stopReasons:current.stopReasons,pages:['confirmed A profile','B profile handoff','11-Agent C table','evidence file form','new report and source readback'],visualReview:'screenshots captured; images require explicit inspection before claiming visual QA passed'});
 phase='screenshots ready for inspection';save();
 console.log(JSON.stringify({result:'pass',receipt:dir+'/receipt.json',initialReportId,updatedReportId:updatedBody.reportId,agentRows:11,errors},null,2));
}catch(error){receipt.result='fail';receipt.failure=error.stack??String(error);save();writeFileSync(dir+'/failure-'+Date.now()+'.json',JSON.stringify({...receipt,phase},null,2));console.error('Browser acceptance failed at '+phase+': '+error.message);process.exitCode=1;}
finally{await browser?.close();}
