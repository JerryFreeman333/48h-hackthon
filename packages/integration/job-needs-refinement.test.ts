import test from 'node:test';
import assert from 'node:assert/strict';
import {topics} from '../../modules/a-profile/src/needs/catalog.mjs';
import {refinementVersion,refinementQuestions} from '../../modules/a-profile/src/needs/refinement-catalog.mjs';
import {deriveNeeds,emptyData} from '../../modules/a-profile/src/needs/service.mjs';
import {emptyRefinement} from '../../modules/a-profile/src/needs/refinement.mjs';
import {demoSample} from '../../modules/b-research/research-service';
import {buildInvestigationPlan,respondToJobNeeds,renderNeedsHtml,needsMarkdown} from './job-needs';
import {productActions} from './product-action';
import {feedbackQuestions} from './verification-feedback';

type Answer={value:string[]|null;strength:'must'|'prefer'|'learn'|'unknown'};
function snapshot(selected=topics.flatMap(t=>t.details.map((d:{id:string})=>t.id+'.'+d.id))){
 const b=demoSample().bundle;
 return {schemaVersion:'a-job-needs-1',projectId:b.projectId,profileId:'confirmed-profile',profileRevision:b.intentRevision,mode:b.mode,confirmedAt:b.retrievedAt,topics:topics.map(t=>({topicId:t.id,title:t.title,priority:'secondary',verificationItemIds:t.details.filter((d:{id:string})=>selected.includes(t.id+'.'+d.id)).map((d:{id:string})=>d.id),unknownHandling:'continue_with_unknown',userConfirmed:true}))};
}
function refined(selected:string[],overrides:Record<string,Answer>={}){
 const s=snapshot(selected),answers:Record<string,Answer>=Object.fromEntries(refinementQuestions.map(q=>[q.id,{value:null,strength:'unknown'}]));
 Object.assign(answers,overrides);
 const active=refinementQuestions.filter(q=>s.topics.some(t=>t.topicId===q.topicId&&t.verificationItemIds.includes(q.detailId))&&(!q.when||q.when.answerIds.some((id:string)=>answers[q.when.questionId].value?.includes(id))));
 const known=active.filter(q=>answers[q.id].value&&!answers[q.id].value!.some(id=>['unsure','no_preference'].includes(id)));
 const refinement={schemaVersion:'a-needs-refinement/1',questionnaireVersion:refinementVersion,answers:structuredClone(answers),needs:known.map(q=>({questionId:q.id,topicId:q.topicId,detailId:q.detailId,questionText:q.text,answerIds:answers[q.id].value!,answerTexts:answers[q.id].value!.map(id=>q.options.find(o=>o.id===id)!.text),strength:answers[q.id].strength,userConfirmed:true})),unknownQuestionIds:active.filter(q=>answers[q.id].value===null||answers[q.id].value!.includes('unsure')).map(q=>q.id),indifferentQuestionIds:active.filter(q=>answers[q.id].value?.includes('no_preference')).map(q=>q.id)};
 return {...s,refinement,selectionData:{refinements:{schemaVersion:'a-needs-refinement/1',questionnaireVersion:refinementVersion,answers:structuredClone(answers)}}};
}

test('legacy 7/28 snapshots and immutable response histories keep their existing mapping and rendering',()=>{
 const s=snapshot(),b=demoSample().bundle,plan=buildInvestigationPlan(s);assert.equal(plan.items.length,28);assert.ok(plan.items.every(i=>i.declaredNeeds.length===0));assert.equal(plan.refinement,undefined);
 const response=respondToJobNeeds(s,b);assert.equal(response.candidates[0].actionGate,'no_additional_gate');
 const before=renderNeedsHtml(response,undefined,b),old=structuredClone(response) as any;
 for(const item of old.plan.items)delete item.declaredNeeds;for(const c of old.candidates)for(const item of c.items)delete item.declaredNeeds;
 assert.equal(renderNeedsHtml(old,undefined,b),before);assert.equal(needsMarkdown(old,b),needsMarkdown(response,b));assert.ok(!before.includes('你的具体期望：'));
});

test('refined canonical choices map to all 28 existing details with explicit company/job scopes and version',()=>{
 const selected=topics.flatMap(t=>t.details.map((d:{id:string})=>t.id+'.'+d.id)),answers=Object.fromEntries(refinementQuestions.filter(q=>!q.when).map(q=>[q.id,{value:[q.options[0].id],strength:'prefer' as const}]));
 const plan=buildInvestigationPlan(refined(selected,answers));assert.equal(plan.items.length,28);assert.equal(plan.refinement?.questionnaireVersion,refinementVersion);assert.ok(plan.items.every(i=>i.declaredNeeds.length===1));
 assert.ok(plan.items.filter(i=>i.topicId==='company').every(i=>i.scope==='company'&&i.declaredNeeds[0].scope==='company'));
 assert.ok(plan.items.filter(i=>i.topicId!=='company').every(i=>i.scope==='job'&&i.declaredNeeds[0].scope==='job'));assert.ok(plan.items.every(i=>!i.mustVerify));
});

test('verified materials remain available while declared must fulfilment stays unknown and blocks explore',()=>{
 const s=refined(['pay.fixed'],{'pay.fixed.arrangement':{value:['fixed_first'],strength:'must'}}),b=demoSample().bundle,j=b.jobs[0];
 b.evidence.push({...b.evidence[0],evidenceId:'fixed-proof',companyId:j.companyId,jobId:j.jobId,scope:'job',verification:'verified',excerpt:'固定工资已经核实，但还没有与用户具体期望逐项比较。'});
 b.facts.push({factId:'fixed-fact',companyId:j.companyId,jobId:j.jobId,key:'needs.pay.fixed',value:'已核实固定工资记载',status:'supported',evidenceIds:['fixed-proof'],asOf:null});
 const response=respondToJobNeeds(s,b),item=response.candidates[0].items[0];assert.equal(item.status,'available');assert.equal(item.declaredNeeds[0].strength,'must');assert.equal(item.declaredNeeds[0].fulfilment,'unknown');assert.equal(item.requiresAction,true);assert.equal(response.candidates[0].actionGate,'verify_first');assert.match(item.question,/固定工资/);
 const report:any={results:[{jobId:j.jobId,recommendation:'explore',constraints:[]}]},prior=structuredClone(report);assert.equal(productActions(report,response)[0].recommendation,'verify_first');assert.deepEqual(report,prior);
 assert.ok(renderNeedsHtml(response).includes('必须满足'));assert.ok(renderNeedsHtml(response).includes('尚未对照判定是否满足'));assert.ok(needsMarkdown(response).includes('尚未对照判定是否满足'));
});

test('prefer, learn and undecided strength do not invent mandatory constraints or silently drop known arrangements',()=>{
 for(const strength of ['prefer','learn','unknown'] as const){
  const s=refined(['growth.learning'],{'growth.learning.arrangement':{value:['named_support','practice_feedback'],strength}}),response=respondToJobNeeds(s,demoSample().bundle),item=response.candidates[0].items[0];
  assert.equal(item.declaredNeeds.length,1);assert.equal(item.declaredNeeds[0].strength,strength);assert.equal(item.declaredNeeds[0].fulfilment,'unknown');assert.equal(item.mustVerify,false);assert.equal(response.candidates[0].actionGate,'no_additional_gate');assert.deepEqual(response.plan.refinement?.unknownQuestionIds,[]);
 }
});

test('conditional refinements stay in one detail and do not expand the existing confirmation question count',()=>{
 const s=refined(['pay.fixed'],{'pay.fixed.arrangement':{value:['fixed_variable'],strength:'prefer'},'pay.fixed.variable_conditions':{value:['minimum_fixed','no_unwritten_income'],strength:'must'}}),b=demoSample().bundle,response=respondToJobNeeds(s,b),item=response.candidates[0].items[0];
 assert.equal(response.plan.items.length,1);assert.equal(item.declaredNeeds.length,2);assert.equal(item.requiresAction,true);assert.match(item.question,/固定部分单独说明/);assert.match(item.question,/书面约定/);
 const record:any={report:{results:[{jobId:b.jobs[0].jobId,constraints:[],questions:[]}]},inputs:{bundle:b,needsResponse:response}};assert.equal(feedbackQuestions(record).length,1);
 const inactive=refined(['pay.fixed'],{'pay.fixed.arrangement':{value:['fixed_first'],strength:'prefer'},'pay.fixed.variable_conditions':{value:['minimum_fixed'],strength:'must'}});assert.equal(buildInvestigationPlan(inactive).items[0].declaredNeeds.length,1);
 const forged:any=structuredClone(inactive);delete forged.selectionData;delete forged.refinement.answers;forged.refinement.needs.push(s.refinement.needs[1]);assert.throws(()=>buildInvestigationPlan(forged),/条件分支/);
});

test('unknown and neutral choices are separately preserved without an inferred expectation; substantive none remains a need',()=>{
 const unknown=refined(['hours.rest']);assert.deepEqual(buildInvestigationPlan(unknown).refinement?.unknownQuestionIds,['hours.rest.arrangement']);assert.equal(buildInvestigationPlan(unknown).items[0].declaredNeeds.length,0);assert.match(renderNeedsHtml(respondToJobNeeds(unknown,demoSample().bundle)),/暂未确定/);
 const neutral=refined(['hours.rest'],{'hours.rest.arrangement':{value:['no_preference'],strength:'unknown'}}),plan=buildInvestigationPlan(neutral);assert.equal(plan.items[0].declaredNeeds.length,0);assert.deepEqual(plan.refinement?.unknownQuestionIds,[]);assert.deepEqual(plan.refinement?.indifferentQuestionIds,['hours.rest.arrangement']);
 const none=buildInvestigationPlan(refined(['pay.formula'],{'pay.formula.arrangement':{value:['none'],strength:'must'}}));assert.equal(none.items[0].declaredNeeds[0].answerIds[0],'none');assert.equal(none.items[0].mustVerify,true);
});

test('unconfirmed snapshots, scope mapping and altered canonical text/options are rejected',()=>{
 const s=refined(['growth.learning'],{'growth.learning.arrangement':{value:['named_support'],strength:'prefer'}});
 const variants=[(x:any)=>x.confirmedAt=null,(x:any)=>x.confirmedAt='invalid',(x:any)=>x.topics[0].userConfirmed=false,(x:any)=>x.refinement.needs[0].userConfirmed=false,(x:any)=>x.refinement.questionnaireVersion='other-version',(x:any)=>x.refinement.needs[0].topicId='company',(x:any)=>x.refinement.needs[0].detailId='public_finance',(x:any)=>x.refinement.needs[0].questionText='伪造的题干',(x:any)=>x.refinement.needs[0].answerTexts[0]='伪造的偏好',(x:any)=>{x.refinement.needs[0].answerIds=['not-an-option'];x.refinement.needs[0].answerTexts=['伪造选项'];}];
 for(const mutate of variants){const x=structuredClone(s);mutate(x);assert.throws(()=>buildInvestigationPlan(x));}
 const b=demoSample().bundle;for(const [field,value] of [['projectId','other-project'],['profileRevision',9],['mode','live']] as const){assert.throws(()=>respondToJobNeeds({...s,[field]:value},b));}
});

test('duplicate records, illegal single/multiple combinations and inconsistent raw branch answers are rejected',()=>{
 assert.throws(()=>buildInvestigationPlan(refined(['pay.fixed'],{'pay.fixed.arrangement':{value:['fixed_first','fixed_variable'],strength:'prefer'}})),/选项/);
 assert.throws(()=>buildInvestigationPlan(refined(['growth.learning'],{'growth.learning.arrangement':{value:['named_support','no_preference'],strength:'unknown'}})),/选项/);
 assert.throws(()=>buildInvestigationPlan(refined(['growth.learning'],{'growth.learning.arrangement':{value:['named_support','named_support'],strength:'prefer'}})),/选项/);
 assert.throws(()=>buildInvestigationPlan(refined(['hours.rest'],{'hours.rest.arrangement':{value:['unsure'],strength:'must'}})),/暂不确定/);
 assert.throws(()=>buildInvestigationPlan(refined(['hours.rest'],{'hours.rest.arrangement':{value:['no_preference'],strength:'must'}})),/偏好/);
 const s=refined(['pay.fixed'],{'pay.fixed.arrangement':{value:['fixed_first'],strength:'prefer'}}),duplicate=structuredClone(s);duplicate.refinement.needs.push(duplicate.refinement.needs[0]);assert.throws(()=>buildInvestigationPlan(duplicate),/重复/);
 const overlap=structuredClone(s);overlap.refinement.unknownQuestionIds.push('pay.fixed.arrangement');assert.throws(()=>buildInvestigationPlan(overlap),/重复/);
 const mismatch=structuredClone(s);mismatch.refinement.answers['pay.fixed.arrangement'].value=['fixed_variable'];assert.throws(()=>buildInvestigationPlan(mismatch),/原始回答/);
 const omitted=structuredClone(s);omitted.refinement.needs=[];assert.throws(()=>buildInvestigationPlan(omitted),/条件分支/);
});

test('minimal exported needs can validate branches without private raw answers; legacy HTML/Markdown escape declared text',()=>{
 const s=refined(['pay.fixed'],{'pay.fixed.arrangement':{value:['fixed_variable'],strength:'prefer'},'pay.fixed.variable_conditions':{value:['minimum_fixed'],strength:'must'}}),minimal:any=structuredClone(s);delete minimal.refinement.answers;delete minimal.selectionData;
 assert.equal(buildInvestigationPlan(minimal).items[0].declaredNeeds.length,2);
 const response=respondToJobNeeds(s,demoSample().bundle);response.candidates[0].items[0].declaredNeeds[0].answerTexts=['<script>bad</script> [不安全](javascript:bad)'];response.candidates[0].items[0].declaredNeeds[0].questionText='<img src=x onerror=bad>';
 const html=renderNeedsHtml(response),markdown=needsMarkdown(response);assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img src=x'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(markdown.includes('\\[不安全\\]'));
});

test('actual confirmed A exports reach the existing B/C mapping and branch revisions preserve old snapshots',()=>{
 const b=demoSample().bundle,data=emptyData();data.refinements=emptyRefinement();
 const answers=data.refinements.answers as Record<string,Answer>;
 Object.assign(data.answers,{'growth.priority':'secondary','growth.details':['learning'],'growth.policy':'continue_with_unknown','hours.priority':'secondary','hours.details':['schedule'],'hours.policy':'continue_with_unknown'});
 answers['growth.learning.arrangement']={value:['named_support'],strength:'must'};
 answers['hours.schedule.arrangement']={value:['planned_shifts'],strength:'prefer'};
 answers['hours.schedule.shift_conditions']={value:['daytime_roster'],strength:'must'};
 const context={projectId:b.projectId,profileId:'real-builder-profile',revision:b.intentRevision,confirmedAt:b.retrievedAt,mode:b.mode},confirmed=deriveNeeds(data,context),frozen=structuredClone(confirmed),response=respondToJobNeeds(confirmed,b);
 assert.equal(response.plan.items.length,2);assert.equal(response.candidates[0].items.reduce((n,i)=>n+i.declaredNeeds.length,0),3);assert.ok(response.candidates[0].items.every(i=>i.declaredNeeds.every(n=>n.fulfilment==='unknown')));assert.equal(response.candidates[0].actionGate,'verify_first');assert.match(renderNeedsHtml(response),/不考虑夜班/);
 answers['hours.schedule.arrangement']={value:['stable_day'],strength:'prefer'};
 const revised=deriveNeeds(data,{...context,revision:context.revision+1});assert.deepEqual(confirmed,frozen);assert.ok(revised.refinement);assert.ok(revised.refinement.inactiveAnswers.some((a:{questionId:string})=>a.questionId==='hours.schedule.shift_conditions'));assert.ok(!revised.refinement.needs.some((n:{questionId:string})=>n.questionId==='hours.schedule.shift_conditions'));
 const revisedBundle=structuredClone(b);revisedBundle.intentRevision++;const next=respondToJobNeeds(revised,revisedBundle);assert.ok(!renderNeedsHtml(next).includes('不考虑夜班'));assert.equal(next.plan.items.find(i=>i.itemId==='schedule')!.declaredNeeds.length,1);assert.ok(renderNeedsHtml(response).includes('不考虑夜班'));
});
