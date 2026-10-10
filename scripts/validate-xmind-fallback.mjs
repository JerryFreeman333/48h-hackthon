import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
const s=JSON.parse(readFileSync('.data/xmind-acceptance/session.json','utf8')),base=process.env.V3_BASE_URL??'http://127.0.0.1:3215';
async function req(path,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{cookie:s.cookie,...(body?{'content-type':'application/json',origin:base}:{})},...(body?{body:JSON.stringify(body)}:{})});const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=text;}if(!r.ok)throw Error(path+' '+r.status+' '+JSON.stringify(data).slice(0,300));return data;}
const b=await req('/api/integration/research?sessionId='+s.sessionId+'&revision=1');assert.equal(b.agent.v3,false);
const job=await req('/api/integration/research',{sessionId:s.sessionId,revision:1,recordIds:[16],v3:{discovery:'supplied_only'}});let run;const deadline=Date.now()+30000;
do{run=await req('/api/integration/research/runs/'+job.runId);if(run.status==='failed')throw Error(run.message);if(Date.now()>deadline)throw Error('Fallback deadline');if(run.status!=='completed')await new Promise(r=>setTimeout(r,500));}while(run.status!=='completed');
const v3=await req('/api/integration/reports/'+run.reportUrl.split('/').at(-1)+'/investigation');assert.equal(v3.agentV3,null);assert.equal((await req(run.reportUrl)).includes('XMind 调查流程'),false);assert.ok((await req(s.reportUrl)).includes('XMind 调查流程'));
const companyPost=await fetch(base+'/api/integration/companies',{method:'POST',headers:{cookie:s.cookie,origin:base,'content-type':'application/json'},body:JSON.stringify({companyId:271})});assert.equal(companyPost.status,409);
writeFileSync('.data/xmind-acceptance/fallback.json',JSON.stringify({result:'pass',newReport:run.reportUrl,archiveReopen:s.reportUrl,companyV3DisabledStatus:409},null,2));console.log('V3 off fallback, old XMind report reopening and disabled company execution passed');
