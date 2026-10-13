import {z} from 'zod';
import {refinementVersion,refinementQuestions,refinementStrengths,refinementReferences} from './refinement-catalog.mjs';

const strengths=['must','prefer','learn','unknown'];
const unique=xs=>new Set(xs).size===xs.length;
const answerFor=q=>z.strictObject({
 value:z.array(z.enum(q.options.map(o=>o.id))).min(1).max(q.kind==='single'?1:q.options.length).refine(unique).refine(xs=>!xs.some(id=>id==='unsure'||q.options.find(o=>o.id===id)?.exclusive)||xs.length===1).nullable(),
 strength:z.enum(strengths)
}).refine(a=>(a.value!==null&&!a.value.includes('unsure'))||a.strength==='unknown','未知答案不能成为必须满足的要求');
export const refinementDataSchema=z.strictObject({
 schemaVersion:z.literal('a-needs-refinement/1'),questionnaireVersion:z.literal(refinementVersion),
 answers:z.strictObject(Object.fromEntries(refinementQuestions.map(q=>[q.id,answerFor(q)]))),
 inactiveAnswers:z.array(z.strictObject({questionId:z.enum(refinementQuestions.map(q=>q.id)),value:z.array(z.string()).min(1),strength:z.enum(strengths),reason:z.literal('branch_changed')})).max(refinementQuestions.length).refine(xs=>unique(xs.map(a=>a.questionId))&&xs.every(a=>answerFor(refinementQuestions.find(q=>q.id===a.questionId)).safeParse({value:a.value,strength:a.strength}).success))
});
export function emptyRefinement(){return {schemaVersion:'a-needs-refinement/1',questionnaireVersion:refinementVersion,answers:Object.fromEntries(refinementQuestions.map(q=>[q.id,{value:null,strength:'unknown'}])),inactiveAnswers:[]};}

export function activeRefinementQuestions(data){
 const active=new Set();
 for(const q of refinementQuestions){
  if(!data.answers[q.topicId+'.details']?.includes(q.detailId))continue;
  if(q.when&&(!active.has(q.when.questionId)||!data.refinements?.answers[q.when.questionId]?.value?.some(id=>q.when.answerIds.includes(id))))continue;
  active.add(q.id);
 }
 return refinementQuestions.filter(q=>active.has(q.id));
}
// A hidden child answer never reappears as a current preference or becomes a filter.
// Retain the latest displaced answer for explanation; confirmed historical versions stay immutable.
export function reconcileRefinement(data){
 if(!data.refinements)return data;
 const next=structuredClone(data),active=new Set(activeRefinementQuestions(next).map(q=>q.id));
 for(const q of refinementQuestions){
  const answer=next.refinements.answers[q.id];
  if(answer.value?.includes('no_preference'))answer.strength='unknown';
  if(active.has(q.id)||answer.value===null)continue;
  next.refinements.inactiveAnswers=next.refinements.inactiveAnswers.filter(a=>a.questionId!==q.id);
  next.refinements.inactiveAnswers.push({questionId:q.id,value:answer.value,strength:answer.strength,reason:'branch_changed'});
  next.refinements.answers[q.id]={value:null,strength:'unknown'};
 }
 return next;
}
export function deriveRefinement(data,confirmedAt){
 if(!data.refinements)return undefined;
 const current=reconcileRefinement(data),active=activeRefinementQuestions(current),known=active.filter(q=>{const a=current.refinements.answers[q.id];return a.value!==null&&!a.value.some(id=>['unsure','no_preference'].includes(id));});
 return {schemaVersion:'a-needs-refinement/1',questionnaireVersion:refinementVersion,
  answers:structuredClone(current.refinements.answers),inactiveAnswers:structuredClone(current.refinements.inactiveAnswers),
  needs:known.map(q=>{const a=current.refinements.answers[q.id];return {questionId:q.id,topicId:q.topicId,detailId:q.detailId,questionText:q.text,answerIds:[...a.value],answerTexts:a.value.map(id=>q.options.find(o=>o.id===id).text),strength:a.strength,userConfirmed:confirmedAt!==null};}),
  unknownQuestionIds:active.filter(q=>{const a=current.refinements.answers[q.id];return a.value===null||a.value.includes('unsure');}).map(q=>q.id),
  indifferentQuestionIds:active.filter(q=>current.refinements.answers[q.id].value?.includes('no_preference')).map(q=>q.id),
  questionProvenance:refinementQuestions.map(q=>({itemId:q.id,text:q.text,itemOrigin:'product-authored',validationStatus:'not-validated',scoring:'none',licenseStatus:'original-product-text-not-copied-scale',version:refinementVersion})),
  references:refinementReferences,measurement:'user-declared-conditions-not-psychometric-assessment'};
}
export function refinementDescription(snapshot,topicId){
 return (snapshot.refinement?.needs??[]).filter(n=>n.topicId===topicId).map(n=>({question:n.questionText,answer:n.answerTexts.join('；'),strength:refinementStrengths.find(s=>s.id===n.strength)?.text??'要求程度暂不确定',detailId:n.detailId}));
}
