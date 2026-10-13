// Real mounted public HTTP flow, with synthetic user choices and the read-only company DB.
// RESEARCH_AGENT_ENABLED=false keeps this A integration check free of network/model calls.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const base=process.env.A_REFINEMENT_BASE_URL??'http://127.0.0.1:3260';
const dir='.data/a-refinement-acceptance';mkdirSync(dir,{recursive:true});
let cookie='';
async function request(path,body,method=body?'POST':'GET',expect=200){
 const r=await fetch(base+path,{method,headers:{cookie,origin:base,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const set=r.headers.get('set-cookie');if(set)cookie=set.split(';')[0];
 const text=await r.text();let value;try{value=JSON.parse(text);}catch{value=text;}
 assert.equal(r.status,expect,path+' '+String(value?.error?.message??''));return value;
}
const boot=await request('/api/a/needs/bootstrap');assert.equal(boot.catalog.refinement.questions.length,36);
let s=await request('/api/a/needs/sessions',{mode:'manual'}),d=structuredClone(s.data);
d.goalIds=['find_first_job'];d.industryTags=['manufacturing'];d.roleTypes=['engineering'];
for(const c of d.conditions)if(c.key==='city'){c.value=['杭州'];c.strength='hard';}
for(const [topic,details] of Object.entries({pay:['fixed'],hours:['schedule'],culture:['communication']})){
 d.answers[topic+'.priority']='priority';d.answers[topic+'.details']=details;d.answers[topic+'.policy']='continue_with_unknown';
}
d.refinements.answers['pay.fixed.arrangement']={value:['fixed_first'],strength:'prefer'};
d.refinements.answers['hours.schedule.arrangement']={value:['stable_day'],strength:'must'};
d.refinements.answers['culture.communication.arrangement']={value:['agreed_autonomy'],strength:'prefer'};
d.refinements.answers['culture.communication.autonomy_conditions']={value:['decision_scope','outcomes'],strength:'learn'};
s=await request('/api/a/needs/sessions/'+s.id,{expectedRevision:s.revision,questionnaireVersion:s.questionnaireVersion,step:8,data:d},'PATCH');
const confirmation={expectedRevision:s.revision,confirmed:true};
const first=await request('/api/a/needs/sessions/'+s.id+'/confirm',confirmation);s=first.session;
await request('/api/a/needs/sessions/'+s.id+'/confirm',confirmation,'POST',409);
const view=await request('/api/a/needs/sessions/'+s.id+'/view?revision=1');assert.equal(view.JobNeedsSnapshot.refinement.needs.length,4);
const handoff=await request('/api/integration/research?sessionId='+s.id+'&revision=1');
assert.equal(handoff.agent.enabled,false,'This test must not start a paid/online investigator');
assert(handoff.topics.some(t=>t.declaredNeeds?.some(n=>n.answer.includes('白天工作时段'))));
assert(handoff.database.candidates.some(c=>c.recordId===16),'Previously verified real 大华 embedded job must remain selectable');
const result=await request('/api/integration/research',{sessionId:s.id,revision:1,recordIds:[16]});
assert.match(result.reportUrl,/^\/flow\/reports\/report-/);
const html=await request(result.reportUrl);assert(html.includes('相对固定的白天工作时段'));assert(html.includes('尚未对照判定是否满足'));assert(html.includes('固定工资'));
const reportId=result.reportUrl.split('/').at(-1);
// Alter the draft, create a new profile version, then reopen the original frozen report.
d=structuredClone(s.data);d.refinements.answers['hours.schedule.arrangement']={value:['planned_shifts'],strength:'prefer'};
s=await request('/api/a/needs/sessions/'+s.id,{expectedRevision:s.revision,questionnaireVersion:s.questionnaireVersion,step:8,data:d},'PATCH');
await request('/api/a/needs/sessions/'+s.id+'/confirm',{expectedRevision:s.revision,confirmed:true});
const newer=await request('/api/a/needs/sessions/'+s.id+'/view?revision=2');assert(newer.JobNeedsSnapshot.refinement.unknownQuestionIds.includes('hours.schedule.shift_conditions'));
assert.deepEqual(await request('/api/a/needs/sessions/'+s.id+'/view?revision=1'),view);assert.equal(await request(result.reportUrl),html);
writeFileSync(dir+'/report.html',html);
writeFileSync(dir+'/checkpoint.json',JSON.stringify({cookie,sessionId:s.id,reportId,reportUrl:result.reportUrl,view},null,2));
const summary={result:'pass',profileRevision:1,newerProfileRevision:2,reportId,reportUrl:result.reportUrl,candidateRecordId:16,source:'read-only real company database; synthetic acceptance user choices',declaredNeeds:4,networkInvestigations:0,modelCalls:0,checks:['public A confirmation and duplicate guard','public B real shortlist and concrete needs','public C concrete expectations and unknown fulfilment','old A revision and old C report immutable'],remaining:'No new crawl or independent company certification is claimed; source material remains unverified where recorded.'};
writeFileSync(dir+'/summary.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
