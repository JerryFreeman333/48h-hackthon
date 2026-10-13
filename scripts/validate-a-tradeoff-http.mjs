// Public compiled HTTP acceptance: synthetic job-seeker choices + real read-only company material.
// No internal A/B/C helpers, database writes, new crawler, or paid model calls are used.
import assert from 'node:assert/strict';
import {copyFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';

const base=(process.env.A_TRADEOFF_BASE_URL??'http://127.0.0.1:3261').replace(/\/$/,'');
const endpoint=new URL(base);
assert(['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname),'Acceptance runs only against a local server');
assert.equal(endpoint.protocol,'http:','Use the locally compiled HTTP entry');
const dir='.data/a-tradeoff-acceptance';mkdirSync(dir,{recursive:true});
let previousEvidenceDirectory=null;
if(existsSync(dir+'/summary.json')){
 previousEvidenceDirectory=dir+'/previous-http-runs/'+Date.now();mkdirSync(previousEvidenceDirectory,{recursive:true});
 // Keep earlier successes/failures and their private access checkpoint. Do not move service state.
 for(const name of ['summary.json','report.html','handoff.json','view-v1.json','view-v2.json','checkpoint.json'])if(existsSync(dir+'/'+name))copyFileSync(dir+'/'+name,previousEvidenceDirectory+'/'+name);
}
let cookie='',session=null,firstView=null,firstResult=null;
const checks=[],calls=[];
const write=(name,value)=>writeFileSync(dir+'/'+name,typeof value==='string'?value:JSON.stringify(value,null,2));
function checkpoint(){
 // This file is ignored local test state. Never print or upload its session cookie.
 write('checkpoint.json',{cookie,base,sessionId:session?.id,sessionRevision:session?.revision,reportUrl:firstResult?.reportUrl,firstView,checks});
}
async function request(path,body,method=body?'POST':'GET',expected=200){
 const response=await fetch(base+path,{method,headers:{cookie,origin:base,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const set=response.headers.get('set-cookie');if(set)cookie=set.split(';')[0];
 const text=await response.text();let value;try{value=JSON.parse(text);}catch{value=text;}
 calls.push({method,path,status:response.status});
 assert.equal(response.status,expected,method+' '+path+' '+String(value?.error?.message??''));
 return value;
}
async function patch(data,step=8){
 session=await request('/api/a/needs/sessions/'+session.id,{expectedRevision:session.revision,questionnaireVersion:session.questionnaireVersion,step,data},'PATCH');
 checkpoint();return session;
}
async function reviewDraft({payMust}){
 const preview=await request('/api/a/needs/sessions/'+session.id+'/preview');
 assert.equal(preview.snapshot.tradeoff.questionnaireVersion,session.questionnaireVersion);
 const data=structuredClone(session.data);
 for(const topic of preview.snapshot.tradeoff.topics){
  const hasConcreteNeeds=topic.proposedNeeds.length>0,must=payMust&&topic.topicId==='pay'&&hasConcreteNeeds;
  data.tradeoff.review[topic.topicId]={priority:must?'priority':hasConcreteNeeds?'secondary':'unknown',strength:must?'must':hasConcreteNeeds?'prefer':'unknown',unknownHandling:hasConcreteNeeds?'continue_with_unknown':'unknown',confirmed:true,basis:topic.reviewBasis};
 }
 await patch(data);return preview;
}

try{
 const boot=await request('/api/a/needs/bootstrap');
 assert.equal(boot.features.tradeoff,true);assert.equal(boot.tradeoff.coreQuestionCount,14);assert.equal(boot.tradeoff.maxFollowupCount,8);
 session=await request('/api/a/needs/sessions',{mode:'manual',flow:'tradeoff'});
 assert(session.data.tradeoff);assert(!session.data.refinements);checkpoint();
 const draft=structuredClone(session.data);
 draft.goalIds=['find_first_job'];draft.stageId=null;draft.industryTags=['manufacturing'];draft.roleTypes=['engineering'];
 for(const condition of draft.conditions)if(condition.key==='city'){condition.value=['杭州'];condition.strength='hard';}
 for(const question of boot.tradeoff.questions.filter(q=>!q.when))draft.tradeoff.answers[question.id]='unsure';
 Object.assign(draft.tradeoff.answers,{opportunity_01:'left',condition_01:'fixed_30',opportunity_02:'right',opportunity_07:'right',opportunity_08:'left'});
 await patch(draft);
 const proposal=await request('/api/a/needs/sessions/'+session.id+'/preview');
 assert.equal(proposal.snapshot.tradeoff.needs.length,0,'Scenario comparisons are proposals until review');
 assert(proposal.snapshot.tradeoff.conditionalExchanges.some(x=>x.conditionAnswerId==='fixed_30'&&!x.userConfirmed));
 await reviewDraft({payMust:true});
 const confirmation={expectedRevision:session.revision,confirmed:true};
 const confirmed=await request('/api/a/needs/sessions/'+session.id+'/confirm',confirmation);session=confirmed.session;checkpoint();
 await request('/api/a/needs/sessions/'+session.id+'/confirm',confirmation,'POST',409);
 checks.push('public A proposal, explicit review, confirmation and duplicate revision guard');

 firstView=await request('/api/a/needs/sessions/'+session.id+'/view?revision=1');
 const needs=firstView.JobNeedsSnapshot.tradeoff;
 assert.equal(needs.questionnaireVersion,boot.tradeoff.version);assert.equal(needs.scores,null);
 assert(needs.needs.some(n=>n.topicId==='pay'&&n.strength==='must'&&n.userConfirmed));
 const conditional=needs.ranking.conditionalRelations.find(r=>r.questionIds.includes('opportunity_01'));
 assert(conditional,'The income/uncertainty comparison must keep its explicit acceptance threshold');assert.equal(conditional.conditionAnswerId,'fixed_30');assert.equal(conditional.originalScenarioCompatible,false);
 assert(!needs.ranking.relations.some(r=>r.questionIds.includes('opportunity_01')),'The original 20% offer cannot imply an unconditional preference after a 30% acceptance threshold');
 assert(needs.confirmedPriorityGroups.priority.includes('pay'));assert(needs.unknownQuestionIds.length>0);
 assert(!('Report'in firstView),'Public view must not expose the export report');
 const handoff=await request('/api/integration/research?sessionId='+session.id+'&revision=1');
 assert.equal(handoff.agent.enabled,false,'Stop before C if paid/online investigation is enabled');
 assert(handoff.topics.some(t=>t.declaredNeeds?.some(n=>n.answer.includes('30%'))),'B must preserve the explicitly stated exchange condition');
 const candidate=handoff.database.candidates.find(c=>c.recordId===16);
 assert(candidate,'Previously verified real 大华 embedded job must remain selectable');
 assert.match(candidate.companyName,/大华/);assert.match(candidate.title,/嵌入式/);
 checks.push('public B real 大华 embedded shortlist and confirmed concrete needs');

 const payload={sessionId:session.id,revision:1,recordIds:[16]};
 firstResult=await request('/api/integration/research',payload);assert.match(firstResult.reportUrl,/^\/flow\/reports\/report-/);checkpoint();
 const html=await request(firstResult.reportUrl);assert.equal(typeof html,'string');
 assert(html.includes('30%'));assert(html.includes('你确认的当前重点'));assert(html.includes('尚未对照判定是否满足'));assert(html.includes('必须满足'));assert(html.includes('原题条件未达到你提出的接受条件'));
 write('report.html',html);write('handoff.json',handoff);write('view-v1.json',firstView);
 checks.push('public C relative exchange condition, reviewed priority, explicit must and unknown fulfilment');
 const repeated=await request('/api/integration/research',payload);
 assert.match(repeated.reportUrl,/^\/flow\/reports\/report-/);
 const repeatedHtml=await request(repeated.reportUrl);assert(repeatedHtml.includes('30%'));assert(repeatedHtml.includes('尚未对照判定是否满足'));
 checks.push('repeated local C request succeeds; report reuse recorded without assuming deduplication');

 const changed=structuredClone(session.data);changed.tradeoff.answers.opportunity_01='right';await patch(changed);
 assert.equal(session.data.tradeoff.answers.condition_01,null);assert(session.data.tradeoff.inactiveAnswers.some(x=>x.questionId==='condition_01'));
 assert(Object.values(session.data.tradeoff.review).every(r=>!r.confirmed),'Changed answers require renewed acceptance');
 await reviewDraft({payMust:false});
 const newer=await request('/api/a/needs/sessions/'+session.id+'/confirm',{expectedRevision:session.revision,confirmed:true});session=newer.session;
 const secondView=await request('/api/a/needs/sessions/'+session.id+'/view?revision=2');
 assert.equal(secondView.UserProfile.revision,2);assert(!secondView.JobNeedsSnapshot.tradeoff.needs.some(n=>n.sourceQuestionId==='condition_01'));
 assert.deepEqual(await request('/api/a/needs/sessions/'+session.id+'/view?revision=1'),firstView);
 assert.equal(await request(firstResult.reportUrl),html);
 write('view-v2.json',secondView);checks.push('public changed branch invalidates review; old A version and C report reopen unchanged');
 checkpoint();

 const summary={result:'pass',base,questionnaireVersion:needs.questionnaireVersion,profileRevision:1,newerProfileRevision:2,reportId:firstResult.reportUrl.split('/').at(-1),reportUrl:firstResult.reportUrl,repeatedReportUrl:repeated.reportUrl,repeatedRequestReusedReport:repeated.reportUrl===firstResult.reportUrl,candidateRecordId:16,candidateCompany:candidate.companyName,candidateTitle:candidate.title,userInput:{kind:'synthetic-acceptance-choices',purpose:'functional HTTP validation; not a real user or psychometric validity study'},companySource:{kind:'real-read-only-original-company-database',sourceName:handoff.database.sourceName,sourceFingerprint:handoff.database.sourceFingerprint,counts:handoff.database.counts,independentVerification:'Only existing provenance is retained; no new independent confirmation'},declaredNeeds:needs.needs.length,unknownQuestions:needs.unknownQuestionIds.length,networkInvestigations:0,modelCalls:0,newCrawlerRuns:0,checks,calls,remaining:['UI is separately checked by the browser workflow; this script validates public HTTP only.','Tradeoff questions are product-authored and unvalidated; no psychological accuracy is claimed.','Available company material does not prove individual needs fulfilled; declared requirements remain unknown.']};
 write('summary.json',summary);console.log(JSON.stringify(summary,null,2));
}catch(error){
 checkpoint();const summary={result:'failed',base,message:error instanceof Error?error.message:String(error),checks,calls,sessionId:session?.id,reportUrl:firstResult?.reportUrl,remaining:'Fix the observed public-flow failure before claiming acceptance; private checkpoint retained locally.'};
 write('summary.json',summary);console.error(JSON.stringify(summary,null,2));process.exitCode=1;
}
