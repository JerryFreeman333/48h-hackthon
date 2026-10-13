import test from 'node:test';
import assert from 'node:assert/strict';
import {topics} from '../../modules/a-profile/src/needs/catalog.mjs';
import {emptyTradeoff,deriveTradeoff,tradeoffTopicMapping,tradeoffReviewBasis,reconcileTradeoff,tradeoffVersion} from '../../modules/a-profile/src/needs/tradeoff.mjs';
import {demoSample} from '../../modules/b-research/research-service';
import {buildInvestigationPlan,respondToJobNeeds,renderNeedsHtml,needsMarkdown} from './job-needs';
import {productActions} from './product-action';
import {feedbackQuestions} from './verification-feedback';
import {deriveNeeds,emptyData} from '../../modules/a-profile/src/needs/service.mjs';

type Review={priority:'priority'|'secondary'|'unknown';strength:'must'|'prefer'|'learn'|'unknown';unknownHandling:'verify_first'|'continue_with_unknown'|'unknown'};
function snapshot(answers:Record<string,string|null>={},review:Record<string,Partial<Review>>={},confirmTopics=true){
 const b=demoSample().bundle,raw:any=emptyTradeoff();Object.assign(raw.answers,answers);
 if(confirmTopics)for(const topic of topics)raw.review[topic.id]={priority:'secondary',strength:'prefer',unknownHandling:'continue_with_unknown',...review[topic.id],confirmed:true,basis:tradeoffReviewBasis(raw,topic.id)};
 const tradeoff=deriveTradeoff(raw,{confirmedAt:b.retrievedAt}),mapped=tradeoffTopicMapping(raw) as Record<string,any>;
 const s={schemaVersion:'a-job-needs-1',questionnaireVersion:tradeoffVersion,projectId:b.projectId,profileId:'tradeoff-profile',profileRevision:b.intentRevision,mode:b.mode,confirmedAt:b.retrievedAt,topics:topics.map(t=>({topicId:t.id,title:t.title,priority:mapped[t.id+'.priority']==='unsure'?'unknown':mapped[t.id+'.priority'],verificationItemIds:mapped[t.id+'.details'].filter((id:string)=>id!=='unsure'),unknownHandling:mapped[t.id+'.policy']==='unsure'?'unknown':mapped[t.id+'.policy'],userConfirmed:true})),tradeoff,selectionData:{tradeoff:structuredClone(raw)}};
 return {s,raw,b};
}

test('canonical mixed scenarios hand off relative ranking and reviewed needs through the unchanged 7/28 mapping',()=>{
 const {s,b}=snapshot({opportunity_01:'left',condition_01:'fixed_30',opportunity_07:'right'}),plan=buildInvestigationPlan(s),response=respondToJobNeeds(s,b);
 assert.deepEqual(plan.tradeoff?.ranking,s.tradeoff.ranking);assert.ok(plan.tradeoff?.ranking.relations.length);assert.ok(plan.items.some(i=>i.topicId==='pay'&&i.itemId==='fixed'));assert.ok(plan.items.some(i=>i.topicId==='company'&&i.itemId==='continuity'&&i.scope==='company'));assert.ok(plan.items.some(i=>i.topicId==='position'&&i.scope==='job'));
 assert.ok(plan.items.every(i=>!i.mustVerify));assert.ok(response.candidates.every(c=>c.actionGate==='no_additional_gate'));assert.ok(response.candidates.flatMap(c=>c.items).flatMap(i=>i.declaredNeeds).every(n=>n.userConfirmed&&n.fulfilment==='unknown'));
 const html=renderNeedsHtml(response),md=needsMarkdown(response);assert.match(html,/你的情境取舍/);assert.match(html,/至少高30%/);assert.match(md,/条件/);assert.match(html,/未比较的关系不补成完整排名/);assert.equal(plan.tradeoff?.scores,null);
});

test('unreviewed comparisons stay proposals and never become hard constraints or declared needs',()=>{
 const {s,b}=snapshot({opportunity_01:'left',condition_01:'fixed_50'}, {},false),plan=buildInvestigationPlan(s);
 assert.equal(plan.tradeoff?.ranking.relations.length,0);assert.equal(plan.tradeoff?.ranking.conditionalRelations.length,1);assert.equal(plan.tradeoff?.ranking.conditionalRelations[0].originalScenarioCompatible,false);assert.equal(plan.tradeoff?.needs.length,0);assert.equal(plan.items.length,0);assert.deepEqual(plan.unknownTopicIds,topics.map(t=>t.id));assert.equal(respondToJobNeeds(s,b).candidates[0].actionGate,'no_additional_gate');
 assert.ok(plan.tradeoff?.conditionalExchanges.every(e=>!e.userConfirmed));assert.match(renderNeedsHtml(respondToJobNeeds(s,b)),/尚未由本人确认/);
});

test('explicit follow-up thresholds remain conditional and do not promote the original 20% offer into global salary priority',()=>{
 for(const [answer,compatible] of [['fixed_20',null],['fixed_30',false],['fixed_50',false]] as const){
  const {s,b}=snapshot({opportunity_01:'left',condition_01:answer}),response=respondToJobNeeds(s,b),ranking=response.plan.tradeoff!.ranking;
  assert.equal(ranking.relations.length,0);assert.deepEqual(ranking.tiers,[]);assert.equal(ranking.conditionalRelations.length,1);
  const relation=ranking.conditionalRelations[0];assert.equal(relation.higherTopicId,'pay');assert.equal(relation.lowerTopicId,'company');assert.equal(relation.conditionAnswerId,answer);assert.equal(relation.originalScenarioCompatible,compatible);
  assert.ok(response.plan.items.every(i=>!i.mustVerify));assert.ok(response.candidates.every(c=>c.actionGate==='no_additional_gate'));
  const html=renderNeedsHtml(response),md=needsMarkdown(response);assert.match(html,/附条件的比较/);assert.match(md,/不用于全局排序/);
  if(compatible===false){assert.match(html,/原题条件未达到你提出的接受条件/);assert.match(md,/不能按原选项推断先后/);}else{assert.match(html,/是否符合上述条件尚不明确/);}
 }
});

test('an unanswered conditional branch keeps its comparison unresolved instead of becoming an unconditional ordering edge',()=>{
 for(const answer of [null,'unsure']){
  const {s,b}=snapshot({opportunity_01:'left',condition_01:answer}),response=respondToJobNeeds(s,b),tradeoff=response.plan.tradeoff!;
  assert.equal(tradeoff.ranking.relations.length,0);assert.equal(tradeoff.ranking.conditionalRelations.length,0);assert.deepEqual(tradeoff.ranking.tiers,[]);assert.ok(tradeoff.ranking.qualifications.some(q=>q.sourceQuestionId==='opportunity_01'&&q.reason==='conditions_unresolved'));
  assert.ok(tradeoff.unknownQuestionIds.includes('condition_01'));assert.ok(response.plan.items.every(i=>!i.mustVerify));assert.match(renderNeedsHtml(response),/保留未知/);
 }
});

test('only a reviewed explicit must requirement gates a job, even with verified materials',()=>{
 const {s,b}=snapshot({opportunity_07:'right'},{position:{priority:'priority',strength:'must'}}),j=b.jobs[0];
 b.evidence.push({...b.evidence[0],evidenceId:'tradeoff-proof',jobId:j.jobId,companyId:j.companyId,scope:'job',verification:'verified',excerpt:'该岗位的持续安排已有书面记载，但尚未对照用户具体预期。'});
 b.facts.push({factId:'tradeoff-fact',companyId:j.companyId,jobId:j.jobId,key:'needs.position.hiring_reason',value:'已有持续安排记载',status:'supported',evidenceIds:['tradeoff-proof'],asOf:null});
 const response=respondToJobNeeds(s,b),item=response.candidates[0].items.find(i=>i.topicId==='position')!;
 assert.equal(item.status,'available');assert.equal(item.mustVerify,true);assert.equal(item.requiresAction,true);assert.equal(item.declaredNeeds[0].fulfilment,'unknown');assert.equal(response.candidates[0].actionGate,'verify_first');
 const report:any={results:[{jobId:j.jobId,recommendation:'explore',constraints:[]}]};assert.equal(productActions(report,response)[0].recommendation,'verify_first');assert.match(renderNeedsHtml(response),/必须满足/);
});

test('conditional and declined exchanges remain qualified statements, never inferred unconditional permission',()=>{
 const qualified=snapshot({opportunity_01:'depends',condition_01:'fixed_30'}),plan=buildInvestigationPlan(qualified.s),exchange=plan.tradeoff!.conditionalExchanges[0];
 assert.equal(exchange.status,'conditions-stated');assert.equal(exchange.favouredTopicId,null);assert.equal(plan.tradeoff!.ranking.relations.length,0);assert.ok(plan.items.every(i=>!i.mustVerify));assert.match(renderNeedsHtml(respondToJobNeeds(qualified.s,qualified.b)),/才继续考虑/);
 const declined=snapshot({opportunity_01:'left',condition_01:'no_exchange'},{company:{priority:'priority',strength:'must'}}),response=respondToJobNeeds(declined.s,declined.b);
 assert.equal(response.plan.tradeoff!.conditionalExchanges[0].status,'declined-exchange');assert.equal(response.plan.tradeoff!.ranking.relations.length,0);assert.ok(response.candidates[0].items.some(i=>i.topicId==='company'&&i.mustVerify));assert.match(renderNeedsHtml(response),/这项交换未接受/);
});

test('cycles and unknowns survive C rendering without fabricated total rank or salary amount',()=>{
 // These four choices have no active conditional follow-up: growth > company > hours > culture > growth.
 const {s,b}=snapshot({opportunity_01:'left',condition_01:'fixed_30',opportunity_05:'left',opportunity_09:'left',opportunity_14:'left',opportunity_08:'left',opportunity_03:'tie',opportunity_10:'unsure'}),response=respondToJobNeeds(s,b);
 assert.ok(response.plan.tradeoff!.ranking.conflicts.length);assert.ok(response.plan.tradeoff!.unknownQuestionIds.includes('opportunity_10'));assert.ok(response.plan.tradeoff!.indifferentQuestionIds.includes('opportunity_03'));
 assert.deepEqual([...response.plan.tradeoff!.ranking.conflicts[0].topicIds].sort(),['growth','company','hours','culture'].sort());assert.ok(!response.plan.tradeoff!.ranking.relations.some(r=>r.questionIds.includes('opportunity_01')));
 assert.match(renderNeedsHtml(response),/循环取舍/);assert.match(needsMarkdown(response),/取舍冲突/);assert.ok(!response.plan.items.some(i=>i.factKey==='min_fixed_monthly_salary'));assert.ok(response.plan.items.every(i=>!i.mustVerify));
});

test('forged ranking, canonical need, raw answer, review, version and topic mapping are rejected',()=>{
 const {s}=snapshot({opportunity_01:'left',condition_01:'fixed_30',opportunity_07:'right'});
 const changes=[
  (x:any)=>x.tradeoff.ranking.tiers.reverse(),
  (x:any)=>x.tradeoff.ranking.conditionalRelations[0].originalScenarioCompatible=true,
  (x:any)=>x.tradeoff.ranking.conditionalRelations[0].conditionAnswerId='fixed_20',
  (x:any)=>x.tradeoff.needs[0].answerTexts[0]='伪造期望',
  (x:any)=>x.tradeoff.needs[0].strength='must',
  (x:any)=>x.tradeoff.needs[0].userConfirmed=false,
  (x:any)=>x.tradeoff.review.pay.strength='must',
  (x:any)=>x.tradeoff.answers.opportunity_01='right',
  (x:any)=>x.selectionData.tradeoff.answers.opportunity_07='left',
  (x:any)=>x.tradeoff.questionnaireVersion='unregistered-version',
  (x:any)=>x.questionnaireVersion='job-needs-20261002-1',
  (x:any)=>delete x.tradeoff,
  (x:any)=>x.questionnaireVersion='unregistered-version',
  (x:any)=>x.topics.find((t:any)=>t.topicId==='pay').priority='priority',
  (x:any)=>x.topics.find((t:any)=>t.topicId==='pay').verificationItemIds=['payment'],
  (x:any)=>x.confirmedAt='invalid-time',
 ];
 for(const change of changes){const forged=structuredClone(s);change(forged);assert.throws(()=>buildInvestigationPlan(forged));}
 const minimal:any=structuredClone(s);delete minimal.selectionData;assert.equal(buildInvestigationPlan(minimal).tradeoff?.needs.length,s.tradeoff.needs.length);
});

test('answer revisions clear old review acceptance, preserve frozen snapshots and avoid duplicate follow-up questions',()=>{
 const prior=snapshot({opportunity_01:'left',condition_01:'fixed_30'},{company:{priority:'priority',strength:'must'}}),old=structuredClone(prior.s),before=renderNeedsHtml(respondToJobNeeds(prior.s,prior.b));
 prior.raw.answers.opportunity_01='right';const revised=reconcileTradeoff(prior.raw),derived=deriveTradeoff(revised,{confirmedAt:prior.b.retrievedAt});
 assert.equal(derived.needs.length,0);assert.ok(derived.topics.every(t=>!t.reviewConfirmed));assert.equal(derived.answers.condition_01,null);assert.ok(derived.inactiveAnswers.some(a=>a.questionId==='condition_01'));assert.deepEqual(prior.s,old);assert.equal(renderNeedsHtml(respondToJobNeeds(prior.s,prior.b)),before);
 const response=respondToJobNeeds(old,prior.b),j=prior.b.jobs[0];const questions=feedbackQuestions({report:{results:[{jobId:j.jobId,constraints:[],questions:[]}]},inputs:{bundle:prior.b,needsResponse:response}} as any);
 assert.ok(questions.length<=3);assert.equal(new Set(questions.map(q=>q.id)).size,questions.length);
});

test('the actual A snapshot builder preserves new answers and feeds B/C without rewriting legacy snapshots',()=>{
 const {raw,b}=snapshot({opportunity_01:'left',condition_01:'fixed_30',opportunity_07:'right'},{position:{priority:'priority',strength:'must'}}),data:any=emptyData();delete data.refinements;data.tradeoff=raw;
 const context={projectId:b.projectId,profileId:'actual-a-profile',revision:b.intentRevision,confirmedAt:b.retrievedAt,mode:b.mode},a=deriveNeeds(data,context),frozen=structuredClone(a),response=respondToJobNeeds(a,b);
 assert.equal(a.questionnaireVersion,tradeoffVersion);assert.deepEqual(a.selectionData.tradeoff,raw);assert.deepEqual(response.plan.tradeoff?.ranking,a.tradeoff!.ranking);assert.equal(response.candidates[0].actionGate,'verify_first');assert.ok(response.plan.items.some(i=>i.topicId==='position'&&i.declaredNeeds.some(n=>n.strength==='must')));
 data.tradeoff.answers.opportunity_07='left';const revised=deriveNeeds(data,{...context,revision:context.revision+1});assert.deepEqual(a,frozen);assert.equal(revised.tradeoff!.needs.length,0);assert.ok(revised.topics.every(t=>t.priority==='unknown'));
});

test('tradeoff report strings stay escaped in immutable HTML and Markdown views',()=>{
 const {s,b}=snapshot({opportunity_01:'left',condition_01:'fixed_30'}),response=respondToJobNeeds(s,b);
 response.plan.tradeoff!.conditionalExchanges[0].description='<script>bad</script> [注入](javascript:bad)';response.plan.tradeoff!.conditionalExchanges[0].conditionText='<img src=x onerror=bad>';
 const html=renderNeedsHtml(response),md=needsMarkdown(response);assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img src=x'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(md.includes('\\[注入\\]'));
});
