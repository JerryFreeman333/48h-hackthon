// Local acceptance only; public HTTP/browser entrances, no internal state injection.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const s=JSON.parse(readFileSync('.data/v3-acceptance/http-session.json','utf8')),base='http://127.0.0.1:3213';
async function api(path,body,cookie=s.cookie){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{cookie,origin:base,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};}
assert.equal((await api('/api/integration/materials',{kind:'pdf',title:'invalid pdf',content:'YWJjZA=='})).status,422);
const original=JSON.parse(readFileSync('.data/v3-acceptance/source.json','utf8'));
const text=(await api('/api/integration/materials',{kind:'text',title:'大华官网公司简介（用户提供文本）',content:original.text,declaredSource:original.url}));assert.equal(text.status,200);
const pdfbytes=readFileSync('.data/v3-acceptance/public-import.pdf');const pdf=(await api('/api/integration/materials',{kind:'pdf',title:'浙江大华技术股份有限公司2025年年度报告',content:pdfbytes.toString('base64'),declaredSource:JSON.parse(readFileSync('.data/v3-acceptance/pdf-preparation.json','utf8')).url}));assert.equal(pdf.status,200);
const body={sessionId:s.sessionId,revision:1,recordIds:[16],v3:{purpose:'exploration',needOrigin:'synthetic_acceptance',sourceUrls:[],importIds:[text.data.importId,pdf.data.importId]}};
const start=await api('/api/integration/research',body);assert.equal(start.status,202);let job,last='';
for(;;){job=(await api('/api/integration/research/runs/'+start.data.runId)).data;if(job.message!==last){console.log(job.status,job.message);last=job.message;}if(job.status==='completed')break;if(job.status==='failed')throw Error(job.message);await new Promise(r=>setTimeout(r,1800));}
const id=job.reportUrl.split('/').at(-1),snap=(await api('/api/integration/reports/'+id+'/investigation')).data.agentV3;
const rec=snap.sourceAttempts.find(a=>a.acquisitionMode==='user_pdf'&&a.accessState==='ok');assert.ok(rec,'Real controlled PDF must parse');assert.equal(rec.rawHash,createHash('sha256').update(pdfbytes).digest('hex'));assert.ok(rec.locators.some(l=>l.physical_page>0));
const source=(await api('/api/integration/reports/'+id+'/sources/'+rec.evidenceIds[0])).data;assert.equal(source.originalAvailable,true);assert.equal(source.rawHash,rec.rawHash);assert.ok(source.text.includes('浙江大华技术股份有限公司'));
assert.ok(snap.claims.some(c=>rec.evidenceIds.includes(c.evidenceId)&&snap.questions.some(q=>q.supportingClaimIds.includes(c.id))));assert.ok(snap.questions.filter(q=>q.predicate==='fixed_salary'||q.predicate==='rest').every(q=>q.conclusion==='unknown'));
assert.equal((await api('/api/integration/research',body)).data.runId,start.data.runId);
writeFileSync('.data/v3-acceptance/import-investigation.json',JSON.stringify(snap,null,2));writeFileSync('.data/v3-acceptance/import-receipt.json',JSON.stringify({result:'pass',runId:start.data.runId,reportId:id,reportUrl:job.reportUrl,pdfBytes:pdfbytes.length,pdfHash:rec.rawHash,url:rec.declaredSource,physicalPages:Math.max(...rec.locators.map(l=>l.physical_page??0)),questions:snap.questions.map(q=>({predicate:q.predicate,state:q.answerState,conclusion:q.conclusion})),networkRequests:snap.budget.usedRequests,elapsedMs:snap.budget.elapsedMs,modelCalls:snap.budget.modelCalls},null,2));console.log('Actual text and complete public PDF controlled import passed');
