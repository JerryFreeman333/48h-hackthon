// Real HTTP acceptance: synthetic user needs, real local candidate and live public sources.
// Start a local server with V3 enabled. No internal service/state injection.
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
const base=process.env.V3_BASE_URL??'http://127.0.0.1:3213',dir='.data/v3-acceptance';
mkdirSync(dir,{recursive:true});
const receipt=dir+'/http-session.json';
let state=existsSync(receipt)?JSON.parse(readFileSync(receipt,'utf8')):{};
function save(){writeFileSync(receipt,JSON.stringify(state,null,2));}
async function req(path,body,method=body?'POST':'GET'){
 const r=await fetch(base+path,{method,headers:{...(state.cookie?{cookie:state.cookie}:{}),...(body?{'content-type':'application/json',origin:base}:{})},...(body?{body:JSON.stringify(body)}:{})});
 if(r.headers.get('set-cookie')){state.cookie=r.headers.get('set-cookie').split(';')[0];save();}
 const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=text;}
 if(!r.ok)throw Error(path+' '+r.status+' '+JSON.stringify(data).slice(0,400));
 return {data,status:r.status};
}
if(!state.sessionId){
 const {data:boot}=await req('/api/a/needs/bootstrap');
 let {data:s}=await req('/api/a/needs/sessions',{mode:'manual'});
 const d=s.data;d.goalIds=['find_first_job'];d.industryTags=['manufacturing'];d.roleTypes=['engineering'];
 for(const c of d.conditions){if(c.key==='city'){c.value=['杭州'];c.strength='hard';}if(c.key==='min_fixed_monthly_salary'){c.value=15000;c.strength='hard';}}
 for(const [t,detail] of [['pay','fixed'],['hours','rest'],['growth','learning']]){d.answers[t+'.priority']='priority';d.answers[t+'.details']=[detail];d.answers[t+'.policy']='verify_first';}
 s=(await req('/api/a/needs/sessions/'+s.id,{expectedRevision:s.revision,questionnaireVersion:s.questionnaireVersion,step:8,data:d},'PATCH')).data;
 const confirmed=(await req('/api/a/needs/sessions/'+s.id+'/confirm',{expectedRevision:s.revision,confirmed:true})).data;
 state.sessionId=s.id;state.revision=1;state.needKind='synthetic_acceptance';save();
}
const b=(await req('/api/integration/research?sessionId='+state.sessionId+'&revision='+state.revision)).data;
const candidate=b.database.candidates.find(c=>c.recordId===16&&c.companyName.includes('大华')&&c.title==='嵌入式软件工程师');
assert.ok(candidate,'Confirmed candidate must be selectable at the public B entrance');
assert.equal(b.agent.v3,true);
state.candidate=candidate;state.body={sessionId:state.sessionId,revision:state.revision,recordIds:[16],v3:{purpose:'selection',needOrigin:'synthetic_acceptance',sourceUrls:['https://www.dahuatech.com/about/company.html','https://webfile.dahuatech.com/ESG/file/2022ESG%E6%8A%A5%E5%91%8A.pdf','https://job.dahuatech.com/'],importIds:[]}};
if(process.env.V3_NEW_RUN==='1'){delete state.runId;}
if(!state.runId){const {data:job,status}=await req('/api/integration/research',state.body);assert.equal(status,202);state.runId=job.runId;save();}
let job,last='';
while(true){
 job=(await req('/api/integration/research/runs/'+state.runId)).data;
 if(job.message!==last){console.log(job.status,job.message);last=job.message;}
 if(job.status==='completed')break;
 if(job.status==='failed')throw Error(job.message);
 await new Promise(resolve=>setTimeout(resolve,1800));
}
state.reportUrl=job.reportUrl;state.reportId=job.reportUrl.split('/').at(-1);save();
const html=(await req(state.reportUrl)).data;assert.ok(html.includes('具体问题与需求判断'));
const {agentV3:s}= (await req('/api/integration/reports/'+state.reportId+'/investigation')).data;
assert.ok(s,'V3 must reach actual C archive');
const original=s.sourceAttempts.find(a=>a.accessState==='ok'&&['full_text','document'].includes(a.contentState)&&a.evidenceIds.length&&a.acquisitionMode!=='local_database');
assert.ok(original,'A live full source, not a fixture/snippet, is required');
const source=(await req('/api/integration/reports/'+state.reportId+'/sources/'+original.evidenceIds[0])).data;
assert.equal(source.originalAvailable,true);assert.ok(source.text.length>100);assert.equal(source.rawHash,original.rawHash);
assert.ok(s.claims.some(c=>original.evidenceIds.includes(c.evidenceId)&&s.questions.some(q=>q.supportingClaimIds.includes(c.id))));
for(const q of s.questions.filter(q=>q.predicate==='fixed_salary'||q.predicate==='rest'))assert.equal(q.conclusion,'unknown');
assert.ok(s.keyQuestionIds.length<=3);assert.ok(s.questions.every(q=>q.stopReason));
const reopen=(await req(state.reportUrl)).data;assert.equal(reopen,html);
const duplicate=(await req('/api/integration/research',state.body)).data;assert.equal(duplicate.runId,state.runId);
const history=(await req('/api/integration/history')).data;assert.ok(history.reports.some(r=>r.reportId===state.reportId));
writeFileSync(dir+'/report.html',html);writeFileSync(dir+'/investigation.json',JSON.stringify(s,null,2));writeFileSync(dir+'/source.json',JSON.stringify(source,null,2));
state.summary={result:'pass',sourceHash:original.rawHash,sourceUrl:original.url,questions:s.questions.map(q=>({id:q.id,predicate:q.predicate,state:q.answerState,conclusion:q.conclusion,stop:q.stopReason})),networkRequests:s.budget.usedRequests,elapsedMs:s.budget.elapsedMs,modelCalls:s.budget.modelCalls,costMinor:s.budget.costMinor};
save();console.log(JSON.stringify(state.summary,null,2));
