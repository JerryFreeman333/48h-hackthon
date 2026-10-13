import test from 'node:test';
import assert from 'node:assert/strict';
import {topics} from '../src/needs/catalog.mjs';
import {tradeoffCatalog,tradeoffQuestions,tradeoffCoreQuestions,tradeoffFollowupQuestions,tradeoffTopicIds} from '../src/needs/tradeoff-catalog.mjs';
import {tradeoffDataSchema,emptyTradeoff,activeTradeoffQuestions,reconcileTradeoff,tradeoffReviewBasis,deriveTradeoff,tradeoffTopicMapping} from '../src/needs/tradeoff.mjs';
const accept=(d,topicId,values={})=>{d.review[topicId]={priority:'priority',strength:'prefer',unknownHandling:'continue_with_unknown',confirmed:true,basis:tradeoffReviewBasis(d,topicId),...values};return d;};
test('mixed original scenarios balance all seven dimensions without an industry gate or a psychological score',()=>{
 assert.equal(tradeoffCoreQuestions.length,14);assert.equal(tradeoffFollowupQuestions.length,8);assert.equal(tradeoffQuestions.length,22);assert.equal(new Set(tradeoffQuestions.map(q=>q.id)).size,22);
 for(const id of tradeoffTopicIds)assert.equal(tradeoffCoreQuestions.filter(q=>Object.values(q.offers).some(o=>o.topicId===id)).length,4);
 for(const q of tradeoffCoreQuestions){assert.deepEqual(q.options.map(o=>o.id),['left','right','tie','depends','unsure']);assert.notEqual(q.pair.leftTopicId,q.pair.rightTopicId);assert(!q.industryId);for(const offer of Object.values(q.offers))assert(topics.find(t=>t.id===offer.topicId).details.some(d=>d.id===offer.detailId));}
 assert(tradeoffCatalog.intro.includes('基本用工保障不参与交换'));assert.equal(deriveTradeoff(emptyTradeoff()).scores,null);assert(deriveTradeoff(emptyTradeoff()).questionProvenance.every(p=>p.itemOrigin==='product-authored'&&p.validationStatus==='not-validated'));
});
test('choices yield explainable provisional relations, never declared hard constraints or public filters',()=>{
 const d=emptyTradeoff();d.answers.opportunity_07='left';const n=deriveTradeoff(d,{confirmedAt:'2026-10-13T12:00:00.000Z'});
 assert.equal(n.needs.length,0);assert.equal(n.topics.find(t=>t.topicId==='pay').priority,'unknown');assert.equal(n.topics.find(t=>t.topicId==='pay').proposalPriority,'priority');assert(n.topics.every(t=>t.strength==='unknown'&&!t.userConfirmed));
 assert.deepEqual(n.ranking.relations,[{higherTopicId:'pay',lowerTopicId:'position',questionIds:['opportunity_07']}]);assert(!('salaryMin' in n));assert(!('preferences' in n));assert(Object.values(tradeoffTopicMapping(d)).every(v=>v==='unsure'||Array.isArray(v)&&v.length===1&&v[0]==='unsure'));
});
test('pairwise cycles remain conflicts rather than a manufactured total ranking',()=>{
 const d=emptyTradeoff();d.answers.opportunity_05='left';d.answers.opportunity_09='left';d.answers.opportunity_14='left';d.answers.opportunity_08='left';
 const n=deriveTradeoff(d);assert(n.ranking.conflicts.some(c=>['growth','company','hours','culture'].every(id=>c.topicIds.includes(id))));assert(n.topics.filter(t=>['growth','company','hours','culture'].includes(t.topicId)).every(t=>t.proposalPriority==='unknown'));assert(n.ranking.uncomparedTopicPairs.some(pair=>pair.includes('pay')));assert.equal(n.needs.length,0);
});
test('ties, depends and missing responses keep indifference distinct from unknown and do not imply a bottom line',()=>{
 const d=emptyTradeoff();d.answers.opportunity_01='depends';d.answers.opportunity_03='tie';d.answers.opportunity_05='unsure';let n=deriveTradeoff(d);
 assert(n.unknownQuestionIds.includes('opportunity_01'));assert(n.unknownQuestionIds.includes('condition_01'));assert(n.unknownQuestionIds.includes('opportunity_05'));assert(n.indifferentQuestionIds.includes('opportunity_03'));assert.equal(n.ranking.relations.length,0);assert.equal(n.needs.length,0);
 d.answers.condition_01='fixed_30';n=deriveTradeoff(d);assert(!n.unknownQuestionIds.includes('opportunity_01'));assert.equal(n.ranking.relations.length,0);assert.equal(n.conditionalExchanges[0].favouredTopicId,null);assert.equal(n.conditionalExchanges[0].status,'conditions-stated');assert(n.topics.find(t=>t.topicId==='company').proposedNeeds.some(x=>x.answerTexts[0].includes('固定税前收入至少高30%')));
});
test('bounded branches are interleaved and hidden child answers are audited without restoration',()=>{
 let d=emptyTradeoff();d.answers.opportunity_01='left';d.answers.condition_01='fixed_30';accept(d,'company',{strength:'must'});const active=activeTradeoffQuestions(d);assert.equal(active[0].id,'opportunity_01');assert.equal(active[1].id,'condition_01');assert(active.length<=22);
 d.answers.opportunity_01='right';d=reconcileTradeoff(d);assert.equal(d.answers.condition_01,null);assert.deepEqual(d.inactiveAnswers,[{questionId:'condition_01',value:'fixed_30',reason:'branch_changed'}]);assert.equal(d.review.company.confirmed,false);assert.equal(d.review.company.strength,'unknown');assert(!deriveTradeoff(d).unknownQuestionIds.includes('condition_01'));
 d.answers.opportunity_01='left';d=reconcileTradeoff(d);assert.equal(d.answers.condition_01,null);assert(deriveTradeoff(d).unknownQuestionIds.includes('condition_01'));assert.equal(deriveTradeoff(d).needs.length,0);
});
test('review is an explicit declaration with canonical evidence; draft review and stale acceptance remain unconfirmed',()=>{
 let d=emptyTradeoff();d.answers.opportunity_01='left';accept(d,'pay',{strength:'must',unknownHandling:'verify_first'});let n=deriveTradeoff(d);assert.equal(n.needs[0].strength,'must');assert.equal(n.needs[0].userConfirmed,false);assert.equal(n.topics.find(t=>t.topicId==='pay').reviewConfirmed,true);
 n=deriveTradeoff(d,{confirmedAt:'2026-10-13T12:00:00.000Z'});assert(n.needs.every(x=>x.userConfirmed));assert.deepEqual(tradeoffTopicMapping(d)['pay.details'],['fixed']);assert.equal(tradeoffTopicMapping(d)['pay.priority'],'priority');assert.equal(tradeoffTopicMapping(d)['pay.policy'],'verify_first');assert.equal(n.needs[0].sourceQuestionId,'opportunity_01');
 d.answers.opportunity_02='right';d=reconcileTradeoff(d);assert.equal(d.review.pay.confirmed,false);assert.equal(deriveTradeoff(d).needs.length,0);
 const forged=emptyTradeoff();forged.answers.opportunity_01='left';accept(forged,'pay',{basis:'arbitrary'});assert.equal(deriveTradeoff(forged).needs.length,0);
});
test('declining an exchange is a specific reviewable requirement, does not retain the old inferred relation, and is never automatically hard',()=>{
 const d=emptyTradeoff();d.answers.opportunity_06='right';d.answers.condition_04='no_exchange';let n=deriveTradeoff(d);assert.equal(n.ranking.relations.length,0);assert.equal(n.ranking.qualifications[0].reason,'exchange_declined');assert.equal(n.conditionalExchanges[0].status,'declined-exchange');assert.equal(n.needs.length,0);assert(n.topics.find(t=>t.topicId==='hours').proposedNeeds.some(x=>x.sourceQuestionId==='condition_04'));
 accept(d,'hours',{strength:'must',unknownHandling:'verify_first'});n=deriveTradeoff(d,{confirmedAt:'2026-10-13T12:00:00.000Z'});assert(n.needs.some(x=>x.sourceQuestionId==='condition_04'&&x.topicId==='hours'&&x.detailId==='schedule'&&x.strength==='must'));assert.deepEqual(tradeoffTopicMapping(d)['hours.details'],['schedule']);assert(!('strength' in n.conditionalExchanges[0]));
});
test('cross-topic follow-up conditions map to the described requirement, not merely their default question category',()=>{
 const d=emptyTradeoff();d.answers.opportunity_08='right';d.answers.condition_05='no_exchange';d.answers.opportunity_10='left';d.answers.condition_07='extra_verified';d.answers.opportunity_11='left';d.answers.condition_08='respect_boundary';accept(d,'culture');accept(d,'benefits');const n=deriveTradeoff(d);
 assert(n.needs.some(x=>x.sourceQuestionId==='condition_05'&&x.topicId==='culture'&&x.detailId==='collaboration'));assert(n.needs.some(x=>x.sourceQuestionId==='condition_07'&&x.topicId==='benefits'&&x.detailId==='verification'));assert(n.needs.some(x=>x.sourceQuestionId==='condition_08'&&x.topicId==='culture'&&x.detailId==='respect'));
});
test('unknown continuation is not a concrete or hard requirement and unconfirmed conclusions cannot be smuggled into review',()=>{
 const d=emptyTradeoff();d.answers.opportunity_09='depends';d.answers.condition_06='continue_unknown';accept(d,'company');const unknown=deriveTradeoff(d);assert.equal(unknown.needs.length,0);assert.equal(unknown.conditionalExchanges[0].status,'unknown');assert(unknown.unknownQuestionIds.includes('opportunity_09'));assert(unknown.unknownQuestionIds.includes('condition_06'));
 for(const mutate of [x=>x.schemaVersion='a-needs-tradeoff/2',x=>x.questionnaireVersion='invented',x=>x.answers.opportunity_01='always_pass',x=>x.answers.extra='private',x=>x.review.pay.strength='must',x=>x.review.pay.confirmed=true,x=>x.inactiveAnswers.push({questionId:'opportunity_01',value:'left',reason:'branch_changed'}),x=>x.inactiveAnswers.push({questionId:'condition_01',value:'invented',reason:'branch_changed'}),x=>x.conditions={salary:99999}]){const x=emptyTradeoff();mutate(x);assert.equal(tradeoffDataSchema.safeParse(x).success,false);}
});
test('confirmed priority groups reflect user corrections, and an unexpressed expectation cannot become a hard boundary',()=>{
 const d=emptyTradeoff();d.answers.opportunity_07='left';accept(d,'pay',{priority:'secondary'});accept(d,'company',{priority:'priority',strength:'learn'});const n=deriveTradeoff(d);assert(n.confirmedPriorityGroups.secondary.includes('pay'));assert(n.confirmedPriorityGroups.priority.includes('company'));assert(n.confirmedPriorityGroups.unknown.includes('growth'));assert.equal(n.ranking.relations[0].higherTopicId,'pay');
 const empty=emptyTradeoff();accept(empty,'pay',{strength:'must'});assert.equal(tradeoffDataSchema.safeParse(empty).success,false);assert.throws(()=>deriveTradeoff(empty));
});
test('unresolved follow-up conditions never contribute to global ordering or a proposed top priority',()=>{
 for(const value of [null,'unsure']){const d=emptyTradeoff();d.answers.opportunity_01='left';d.answers.condition_01=value;const n=deriveTradeoff(d);assert.equal(n.ranking.relations.length,0);assert.equal(n.ranking.conditionalRelations.length,0);assert.equal(n.ranking.tiers.length,0);assert.equal(n.ranking.qualifications[0].reason,'conditions_unresolved');assert.equal(n.topics.find(t=>t.topicId==='pay').proposalPriority,'unknown');assert.equal(n.needs.length,0);}
 const d=emptyTradeoff();d.answers.opportunity_09='right';d.answers.condition_06='continue_unknown';const n=deriveTradeoff(d);assert.equal(n.ranking.relations.length,0);assert.equal(n.ranking.conditionalRelations.length,0);assert.equal(n.ranking.tiers.length,0);assert.equal(n.ranking.qualifications[0].reason,'conditions_unresolved');
});
test('explicit exchange conditions stay attached to the source situation and never become unconditional global relations',()=>{
 for(const value of ['fixed_20','fixed_30','fixed_50']){const d=emptyTradeoff();d.answers.opportunity_01='left';d.answers.condition_01=value;accept(d,'pay',{priority:'priority',strength:'prefer'});const n=deriveTradeoff(d);assert.equal(n.ranking.relations.length,0);assert.equal(n.ranking.tiers.length,0);assert.equal(n.ranking.conflicts.length,0);const r=n.ranking.conditionalRelations[0];assert.equal(r.higherTopicId,'pay');assert.equal(r.lowerTopicId,'company');assert.equal(r.conditionQuestionId,'condition_01');assert.equal(r.conditionAnswerId,value);assert.deepEqual(r.questionIds,['opportunity_01']);assert(r.conditionText.includes('固定税前收入至少高'));assert.equal(r.originalScenarioCompatible,value==='fixed_20'?null:false);assert(r.compatibilityExplanation.length>0);assert(n.confirmedPriorityGroups.priority.includes('pay'));assert.equal(n.topics.find(t=>t.topicId==='pay').proposalPriority,'unknown');}
 const d=emptyTradeoff();d.answers.opportunity_02='left';d.answers.condition_02='notice_compensation';const n=deriveTradeoff(d);assert.equal(n.ranking.conditionalRelations[0].originalScenarioCompatible,null);assert.equal(n.ranking.relations.length,0);
});
