import {z} from 'zod';
import {tradeoffVersion,tradeoffCatalog,tradeoffQuestions,tradeoffCoreQuestions,tradeoffFollowupQuestions,tradeoffTopicIds,tradeoffTopicTitles} from './tradeoff-catalog.mjs';
export {tradeoffVersion,tradeoffCatalog};
const strengths=['must','prefer','learn','unknown'];
const priorities=['priority','secondary','unknown'];
const policies=['verify_first','continue_with_unknown','unknown'];
const unique=xs=>new Set(xs).size===xs.length;
const isUnresolved=value=>value===null||value==='unsure'||value==='continue_unknown';
const blankReview=()=>({priority:'unknown',strength:'unknown',unknownHandling:'unknown',confirmed:false,basis:null});
const reviewSchema=z.strictObject({priority:z.enum(priorities),strength:z.enum(strengths),unknownHandling:z.enum(policies),confirmed:z.boolean(),basis:z.string().max(4096).nullable()}).refine(r=>r.confirmed?(r.basis!==null&&(r.strength!=='must'||r.priority==='priority')):(r.priority==='unknown'&&r.strength==='unknown'&&r.unknownHandling==='unknown'&&r.basis===null),'未确认的提议不能成为需求；明确底线必须由本人确认并列为重点');
export const tradeoffDataSchema=z.strictObject({
 schemaVersion:z.literal('a-needs-tradeoff/1'),questionnaireVersion:z.literal(tradeoffVersion),
 answers:z.strictObject(Object.fromEntries(tradeoffQuestions.map(q=>[q.id,z.enum(q.options.map(o=>o.id)).nullable()]))),
 inactiveAnswers:z.array(z.strictObject({questionId:z.enum(tradeoffFollowupQuestions.map(q=>q.id)),value:z.string(),reason:z.literal('branch_changed')})).max(tradeoffFollowupQuestions.length).refine(xs=>unique(xs.map(a=>a.questionId))&&xs.every(a=>tradeoffFollowupQuestions.find(q=>q.id===a.questionId)?.options.some(o=>o.id===a.value))),
 review:z.strictObject(Object.fromEntries(tradeoffTopicIds.map(id=>[id,reviewSchema])))
}).superRefine((extension,ctx)=>{
 const proposed=proposedNeedsFor(extension);
 for(const id of tradeoffTopicIds){const r=extension.review[id];if(r.confirmed&&r.basis===tradeoffReviewBasis(extension,id)&&r.strength==='must'&&!proposed.some(n=>n.topicId===id))ctx.addIssue({code:'custom',path:['review',id,'strength'],message:'没有具体期望时不能确认底线，请先回答相关情境或保留未知'});}
});
export function emptyTradeoff(){return {schemaVersion:'a-needs-tradeoff/1',questionnaireVersion:tradeoffVersion,answers:Object.fromEntries(tradeoffQuestions.map(q=>[q.id,null])),inactiveAnswers:[],review:Object.fromEntries(tradeoffTopicIds.map(id=>[id,blankReview()]))};}
export function activeTradeoffQuestions(extension){
 // Follow-ups are interleaved after their scenario. A branch never needs private state injection.
 return tradeoffCoreQuestions.flatMap(q=>[q,...tradeoffFollowupQuestions.filter(child=>child.when.questionId===q.id&&child.when.answerIds.includes(extension.answers[q.id]))]);
}
export function tradeoffReviewBasis(extension,topicId){
 if(!tradeoffTopicIds.includes(topicId))throw new TypeError('Unknown job-needs topic');
 // Ranking is a global proposal. Any answer change invalidates its previous acceptance.
 return JSON.stringify([tradeoffVersion,topicId,activeTradeoffQuestions(extension).map(q=>[q.id,extension.answers[q.id]])]);
}
export function reconcileTradeoff(extension){
 const next=structuredClone(tradeoffDataSchema.parse(extension)),active=new Set(activeTradeoffQuestions(next).map(q=>q.id));
 for(const q of tradeoffFollowupQuestions){const value=next.answers[q.id];if(active.has(q.id)||value===null)continue;next.inactiveAnswers=next.inactiveAnswers.filter(a=>a.questionId!==q.id);next.inactiveAnswers.push({questionId:q.id,value,reason:'branch_changed'});next.answers[q.id]=null;}
 for(const id of tradeoffTopicIds){const r=next.review[id];if(r.confirmed&&r.basis!==tradeoffReviewBasis(next,id))next.review[id]=blankReview();}
 return next;
}
function stronglyConnected(ids,adj){
 const seen=new Set(),order=[];const visit=id=>{if(seen.has(id))return;seen.add(id);for(const n of adj.get(id)??[])visit(n);order.push(id);};ids.forEach(visit);
 const reverse=new Map(ids.map(id=>[id,[]]));for(const [id,ns]of adj)for(const n of ns)reverse.get(n).push(id);
 seen.clear();const components=[];const collect=(id,group)=>{if(seen.has(id))return;seen.add(id);group.push(id);for(const n of reverse.get(id))collect(n,group);};
 for(const id of order.reverse())if(!seen.has(id)){const group=[];collect(id,group);components.push(group.sort((a,b)=>ids.indexOf(a)-ids.indexOf(b)));}return components;
}
function rankingFor(extension){
 const relationMap=new Map(),observed=new Set(),qualifications=[],conditionalRelations=[];
 for(const q of tradeoffCoreQuestions){
  const a=extension.answers[q.id];if(a!=='left'&&a!=='right')continue;
  const child=tradeoffFollowupQuestions.find(c=>c.when.questionId===q.id&&c.when.answerIds.includes(a)),higher=q.offers[a].topicId,lower=q.exchanges[a].topicId;
  if(child){
   const value=extension.answers[child.id];
   if(value==='no_exchange'){qualifications.push({sourceQuestionId:q.id,conditionQuestionId:child.id,reason:'exchange_declined',explanation:'后续明确拒绝了这项交换；不再用之前的选择推定先后。'});continue;}
   if(isUnresolved(value)){qualifications.push({sourceQuestionId:q.id,conditionQuestionId:child.id,reason:'conditions_unresolved',explanation:'这项交换的追加条件尚未明确，保留当前倾向，不用它推定全局先后。'});continue;}
   const originalScenarioCompatible=child.id==='condition_01'&&['fixed_30','fixed_50'].includes(value)?false:null;
   const compatibilityExplanation=originalScenarioCompatible===false?'原题收入只高约20%，没有达到你补充的更高收入门槛；不能把原机会视为已经接受。':'原题没有说明满足这些追加条件所需的全部信息，是否符合条件仍不明确。';
   conditionalRelations.push({higherTopicId:higher,lowerTopicId:lower,questionIds:[q.id],conditionQuestionId:child.id,conditionAnswerId:value,conditionText:child.options.find(o=>o.id===value).text,originalScenarioCompatible,compatibilityExplanation,explanation:'仅在本人补充的条件成立时考虑这项交换，不参与全局先后排序。'});
   if(originalScenarioCompatible===false)qualifications.push({sourceQuestionId:q.id,conditionQuestionId:child.id,reason:'condition_exceeds_original_scenario',explanation:compatibilityExplanation});
   continue;
  }
  observed.add(higher);observed.add(lower);const key=higher+':'+lower;if(!relationMap.has(key))relationMap.set(key,{higherTopicId:higher,lowerTopicId:lower,questionIds:[]});relationMap.get(key).questionIds.push(q.id);
 }
 const relations=[...relationMap.values()],ids=tradeoffTopicIds.filter(id=>observed.has(id)),adj=new Map(ids.map(id=>[id,[]]));for(const r of relations)adj.get(r.higherTopicId).push(r.lowerTopicId);
 const components=stronglyConnected(ids,adj),which=new Map();components.forEach((group,index)=>group.forEach(id=>which.set(id,index)));
 const outgoing=components.map(()=>new Set()),indegree=components.map(()=>0);for(const r of relations){const a=which.get(r.higherTopicId),b=which.get(r.lowerTopicId);if(a!==b&&!outgoing[a].has(b)){outgoing[a].add(b);indegree[b]++;}}
 const pending=new Set(components.map((_,index)=>index)),tiers=[];
 while(pending.size){const layer=[...pending].filter(i=>indegree[i]===0);if(!layer.length)break;tiers.push(layer.flatMap(i=>components[i]).sort((a,b)=>tradeoffTopicIds.indexOf(a)-tradeoffTopicIds.indexOf(b)));for(const i of layer){pending.delete(i);for(const n of outgoing[i])indegree[n]--;}}
 const conflicts=components.filter(group=>group.length>1).map(topicIds=>({topicIds,questionIds:relations.filter(r=>topicIds.includes(r.higherTopicId)&&topicIds.includes(r.lowerTopicId)).flatMap(r=>r.questionIds),explanation:'这些具体情境给出了循环取舍，不能据此确定全局先后；请结合情境确认自己的当前重点。'}));
 const reachable=(from,to)=>{const seen=new Set(),todo=[from];while(todo.length){const cur=todo.pop();if(cur===to)return true;if(seen.has(cur))continue;seen.add(cur);todo.push(...(adj.get(cur)??[]));}return false;};
 const uncomparedTopicPairs=[];for(let a=0;a<tradeoffTopicIds.length;a++)for(let b=a+1;b<tradeoffTopicIds.length;b++){const x=tradeoffTopicIds[a],y=tradeoffTopicIds[b];if(!reachable(x,y)&&!reachable(y,x))uncomparedTopicPairs.push([x,y]);}
 return {method:'pairwise-partial-order-with-cycle-preservation',tiers,tiersMeaning:'仅按无需追加限定的当前情境归纳部分顺序；有条件交换单独保留，不参与全局先后。同层表示尚未得到前后关系，不代表同等重要。循环与未比较关系保留，最后由本人确认。',relations,conditionalRelations,conflicts,qualifications,unknownTopicIds:tradeoffTopicIds.filter(id=>!observed.has(id)),uncomparedTopicPairs};
}
function proposedNeedsFor(extension){
 const result=[];
 for(const q of tradeoffCoreQuestions){const answer=extension.answers[q.id];if(answer!=='left'&&answer!=='right')continue;const offer=q.offers[answer];result.push({questionId:q.id+'.'+offer.topicId,sourceQuestionId:q.id,topicId:offer.topicId,detailId:offer.detailId,questionText:q.text,answerIds:[answer],answerTexts:[offer.text],description:offer.text});}
 for(const q of activeTradeoffQuestions(extension).filter(q=>q.when)){const answer=extension.answers[q.id];if(answer===null||answer==='unsure'||answer==='continue_unknown')continue;const option=q.options.find(o=>o.id===answer),mapping=option.need??q;result.push({questionId:q.id+'.'+mapping.topicId,sourceQuestionId:q.id,topicId:mapping.topicId,detailId:mapping.detailId,questionText:q.text,answerIds:[answer],answerTexts:[option.text],description:option.text});}
 return result;
}
function exchangesFor(extension){
 const result=[];
 for(const q of tradeoffCoreQuestions){const a=extension.answers[q.id];if(!['left','right','depends'].includes(a))continue;const child=tradeoffFollowupQuestions.find(c=>c.when.questionId===q.id&&c.when.answerIds.includes(a));
 const exchange=a==='depends'?(child?{topicId:child.topicId,detailId:child.detailId,text:'当前还不能选择，需要先明确条件'}:null):q.exchanges[a];if(!exchange)continue;
 const childAnswer=child?extension.answers[child.id]:null,known=!isUnresolved(childAnswer);
 result.push({sourceQuestionId:q.id,selectedAnswerId:a,favouredTopicId:a==='depends'?null:q.offers[a].topicId,concededTopicId:exchange.topicId,detailId:exchange.detailId,description:exchange.text,conditionQuestionId:child?.id??null,conditionAnswerId:childAnswer,conditionText:known?child.options.find(o=>o.id===childAnswer).text:null,status:childAnswer==='no_exchange'?'declined-exchange':known?'conditions-stated':a==='depends'||child?'unknown':'conditional-interest',userConfirmed:extension.review[exchange.topicId].confirmed});
 }
 return result;
}
/** @param {any} extension @param {{confirmedAt?: string|null}} options */
export function deriveTradeoff(extension,{confirmedAt=null}={}){
 const current=reconcileTradeoff(extension),ranking=rankingFor(current),proposed=proposedNeedsFor(current),conditionalExchanges=exchangesFor(current),active=activeTradeoffQuestions(current),confirmed=typeof confirmedAt==='string'&&confirmedAt.length>0;
 const incoming=id=>ranking.relations.filter(r=>r.lowerTopicId===id),outgoing=id=>ranking.relations.filter(r=>r.higherTopicId===id);
 const topics=tradeoffTopicIds.map(topicId=>{const r=current.review[topicId],proposal=proposed.filter(n=>n.topicId===topicId),exchanges=conditionalExchanges.filter(e=>e.concededTopicId===topicId),conflicts=ranking.conflicts.filter(c=>c.topicIds.includes(topicId));
  const proposalPriority=conflicts.length?'unknown':outgoing(topicId).length&&!incoming(topicId).length?'priority':incoming(topicId).length&&!outgoing(topicId).length?'secondary':'unknown';
  return {topicId,title:tradeoffTopicTitles[topicId],proposalPriority,priority:r.confirmed?r.priority:'unknown',strength:r.confirmed?r.strength:'unknown',unknownHandling:r.confirmed?r.unknownHandling:'unknown',reviewConfirmed:r.confirmed,userConfirmed:r.confirmed&&confirmed,reviewBasis:tradeoffReviewBasis(current,topicId),proposedNeeds:proposal,proposedExchanges:exchanges,explanation:conflicts.length?'你的不同选择存在循环取舍，系统保留差异，等待你确认当前重点。':proposal.length?'这些是按你选择的具体情境整理的提议，不是心理测量或已确认的底线。':'目前没有足够回答归纳这项具体需求，可以保留未知。'};
 });
 const needs=proposed.filter(n=>current.review[n.topicId].confirmed).map(({description,...n})=>({...n,strength:current.review[n.topicId].strength,userConfirmed:confirmed}));
 const confirmedPriorityGroups=Object.fromEntries(priorities.map(priority=>[priority,topics.filter(t=>t.priority===priority).map(t=>t.topicId)]));
 return {schemaVersion:'a-needs-tradeoff/1',questionnaireVersion:tradeoffVersion,measurement:tradeoffCatalog.measurement,validationStatus:'not-validated',scores:null,answers:structuredClone(current.answers),inactiveAnswers:structuredClone(current.inactiveAnswers),review:structuredClone(current.review),ranking,confirmedPriorityGroups,topics,needs,conditionalExchanges:conditionalExchanges.map(e=>({...e,userConfirmed:e.userConfirmed&&confirmed})),unknownQuestionIds:active.filter(q=>isUnresolved(current.answers[q.id])||(current.answers[q.id]==='depends'&&!tradeoffFollowupQuestions.some(c=>c.when.questionId===q.id&&active.some(x=>x.id===c.id)&&!isUnresolved(current.answers[c.id])))).map(q=>q.id),indifferentQuestionIds:tradeoffCoreQuestions.filter(q=>current.answers[q.id]==='tie').map(q=>q.id),questionProvenance:tradeoffQuestions.map(q=>({itemId:q.id,text:q.text,...tradeoffCatalog.provenance,version:tradeoffVersion})),references:structuredClone(tradeoffCatalog.references)};
}
export function tradeoffTopicMapping(extension){
 const derived=deriveTradeoff(extension),answers={};
 for(const t of derived.topics){const needs=derived.needs.filter(n=>n.topicId===t.topicId),details=[...new Set(needs.map(n=>n.detailId))];answers[t.topicId+'.priority']=t.reviewConfirmed&&t.priority!=='unknown'?t.priority:'unsure';answers[t.topicId+'.details']=t.reviewConfirmed&&details.length?details:['unsure'];answers[t.topicId+'.policy']=t.reviewConfirmed&&t.unknownHandling!=='unknown'?t.unknownHandling:'unsure';}
 return answers;
}
