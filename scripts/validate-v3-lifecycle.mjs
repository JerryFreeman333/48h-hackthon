import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
const base=process.env.V3_BASE_URL??'http://127.0.0.1:3213',s=JSON.parse(readFileSync('.data/v3-acceptance/http-session.json','utf8'));
async function api(path,body,cookie=s.cookie){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{cookie,origin:base,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const t=await r.text();let data;try{data=JSON.parse(t);}catch{data=t;}return {status:r.status,data};}
if(process.argv[2]==='prepare'){
 const html=(await api(s.reportUrl)).data;writeFileSync('.data/v3-acceptance/before-off.html',html);
 const original=JSON.parse(readFileSync('.data/v3-acceptance/source.json','utf8'));
 const imp=(await api('/api/integration/materials',{kind:'text',title:'中断恢复：实际官网原文 '+Date.now(),content:original.text,declaredSource:original.url}));assert.equal(imp.status,200);
 const r=await api('/api/integration/research',{sessionId:s.sessionId,revision:1,recordIds:[16],v3:{needOrigin:'synthetic_acceptance',purpose:'selection',sourceUrls:['http://127.0.0.1/forbidden'],importIds:[imp.data.importId]}});assert.equal(r.status,202);
 await new Promise(resolve=>setTimeout(resolve,100));const job=(await api('/api/integration/research/runs/'+r.data.runId)).data;assert.equal(job.status,'running');writeFileSync('.data/v3-acceptance/interrupted.json',JSON.stringify({runId:job.runId,expected:'failed_after_restart'},null,2));console.log('Prepared a running real HTTP investigation for controlled restart');
}else{
 const saved=JSON.parse(readFileSync('.data/v3-acceptance/interrupted.json','utf8')),job=(await api('/api/integration/research/runs/'+saved.runId)).data;assert.equal(job.status,'failed');assert.ok(job.message.includes('不会自动重复调用'));
 const old=(await api(s.reportUrl)).data;assert.equal(old,readFileSync('.data/v3-acceptance/before-off.html','utf8'));
 const b=(await api('/api/integration/research?sessionId='+s.sessionId+'&revision=1')).data;assert.equal(b.agent.v3,false);
 const post=await api('/api/integration/research',{sessionId:s.sessionId,revision:1,recordIds:[16]});let result=post.data;
 if(post.status===202){for(;;){result=(await api('/api/integration/research/runs/'+post.data.runId)).data;if(result.status==='completed')break;assert.notEqual(result.status,'failed');await new Promise(r=>setTimeout(r,800));}}else assert.equal(post.status,200);
 const reportId=result.reportUrl.split('/').at(-1),invest=(await api('/api/integration/reports/'+reportId+'/investigation')).data;assert.equal(invest.agentV3,null);assert.ok((await api(result.reportUrl)).data.includes('嵌入式软件工程师'));
 assert.equal((await api('/api/integration/materials',{kind:'text',title:'V3 disabled',content:'test'})).status,409);
 const r=await fetch(base+'/api/a/needs/bootstrap'),cookie=r.headers.get('set-cookie').split(';')[0];await r.text();assert.equal((await api('/api/integration/reports/'+s.reportId+'/investigation',undefined,cookie)).status,404);
 writeFileSync('.data/v3-acceptance/lifecycle.json',JSON.stringify({result:'pass',interruptedRun:job.runId,interruptedState:job.status,automaticRetry:false,oldReportByteIdentical:true,v3Disabled:true,fallbackReportId:reportId,legacySidecarAbsent:true,ownerIsolation:true},null,2));console.log('Actual HTTP restart, immutable V3 reopen, disabled fallback and owner isolation passed');
}
