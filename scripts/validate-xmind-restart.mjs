// Run after restarting the actual HTTP server; no state injection or tool substitute.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
const base=process.env.V3_BASE_URL??'http://127.0.0.1:3220',s=JSON.parse(readFileSync('.data/xmind-acceptance/session.json','utf8'));
async function req(path,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{cookie:s.cookie,...(body?{origin:base,'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const t=await r.text();let data;try{data=JSON.parse(t);}catch{data=t;}assert.ok(r.ok,path+' '+r.status);return data;}
const before=readFileSync('.data/xmind-acceptance/report.html','utf8'),snapshot=JSON.parse(readFileSync('.data/xmind-acceptance/investigation.json','utf8'));
assert.equal(await req(s.reportUrl),before);assert.deepEqual((await req('/api/integration/reports/'+s.reportId+'/investigation')).agentV3,snapshot);
assert.equal((await req('/api/integration/research',s.researchBody)).runId,s.runId);assert.equal((await req('/api/integration/research/runs/'+s.runId)).status,'completed');
assert.ok((await req('/api/integration/history')).reports.some(r=>r.reportId===s.reportId));
writeFileSync('.data/xmind-structure-acceptance/restart-http.json',JSON.stringify({result:'pass',reportId:s.reportId,runId:s.runId,checks:['immutable actual C reopening after server restart','explicit V3 sidecar byte-equivalent reopening','deduplication persisted across restart','completed job and history recovered'],snapshotNetworkRequests:snapshot.budget.usedRequests,snapshotModelCalls:snapshot.budget.modelCalls},null,2));console.log('Actual HTTP server restart, report/sidecar/history and duplicate job recovery passed');
