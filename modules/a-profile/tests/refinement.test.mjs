import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NeedsService,digest} from '../src/needs/service.mjs';
import {topics,version} from '../src/needs/catalog.mjs';
import {refinementQuestions,refinementVersion} from '../src/needs/refinement-catalog.mjs';
import {industries,roles} from '../src/taxonomy.mjs';

const ready=(s)=>{const d=structuredClone(s.data);d.goalIds=['find_first_job'];d.industryTags=['software_it'];d.roleTypes=['engineering'];return d;};
const update=(svc,s,data,step=0)=>svc.update('owner',s.id,{expectedRevision:s.revision,questionnaireVersion:version,step,data});
const select=(data,topicId,detailIds)=>{data.answers[topicId+'.priority']='priority';data.answers[topicId+'.details']=detailIds;data.answers[topicId+'.policy']='continue_with_unknown';};
const answer=(data,id,value,strength='prefer')=>data.refinements.answers[id]={value,strength};

test('original refinements cover all 28 details and 8 bounded branches without an industry-specific gate or a score',()=>{
 assert.equal(refinementQuestions.length,36);assert.equal(new Set(refinementQuestions.map(q=>q.id)).size,36);
 for(const t of topics)for(const d of t.details)assert.equal(refinementQuestions.filter(q=>q.topicId===t.id&&q.detailId===d.id&&!q.when).length,1);
 const prior=new Set();for(const q of refinementQuestions){assert(q.options.some(o=>o.id==='unsure'&&o.exclusive));assert.equal(new Set(q.options.map(o=>o.id)).size,q.options.length);assert(!q.industryId);if(q.when){assert(prior.has(q.when.questionId));const parent=refinementQuestions.find(x=>x.id===q.when.questionId);assert(q.when.answerIds.every(id=>parent.options.some(o=>o.id===id)));}prior.add(q.id);}
 assert.equal(refinementQuestions.filter(q=>q.when).length,8);assert.deepEqual([...new Set(industries.flatMap(i=>i.codes))].sort(),[...'ABCDEFGHIJKLMNOPQRST']);assert(roles.length>=19);
});

test('declared mandatory arrangements never invent any of the five public filters or scores',()=>{
 const svc=new NeedsService({});let s=svc.create('owner',{}),d=ready(s);select(d,'hours',['schedule']);answer(d,'hours.schedule.arrangement',['stable_day'],'must');s=update(svc,s,d,8);
 const out=svc.confirm('owner',s.id,{expectedRevision:s.revision,confirmed:true}).export,n=out.JobNeedsSnapshot;
 assert.equal(n.refinement.schemaVersion,'a-needs-refinement/1');assert.equal(n.refinement.questionnaireVersion,refinementVersion);assert.equal(n.refinement.needs[0].strength,'must');assert.equal(n.refinement.needs[0].userConfirmed,true);assert(n.refinement.questionProvenance.every(p=>p.itemOrigin==='product-authored'&&p.scoring==='none'&&p.validationStatus==='not-validated'));
 assert.equal(out.taxonomyVersion,'a-taxonomy-2');assert(out.SearchIntent.filters.every(c=>c.value===null&&c.strength==='unknown'));assert(Object.values(out.UserProfile.assessment.scores).every(x=>x===null));assert(out.Report.markdown.includes('相对固定的白天工作时段'));assert(out.Report.markdown.includes('必须满足'));
});

test('changed branch deactivates child, retains an audit record, and never auto-restores an old mandatory condition',()=>{
 const svc=new NeedsService({});let s=svc.create('owner',{}),d=ready(s);select(d,'hours',['schedule']);answer(d,'hours.schedule.arrangement',['planned_shifts']);answer(d,'hours.schedule.shift_conditions',['daytime_roster'],'must');s=update(svc,s,d);
 assert.equal(svc.preview('owner',s.id).snapshot.refinement.needs.length,2);
 d=structuredClone(s.data);answer(d,'hours.schedule.arrangement',['stable_day']);s=update(svc,s,d);let n=svc.preview('owner',s.id).snapshot;
 assert.equal(n.refinement.needs.length,1);assert.equal(s.data.refinements.answers['hours.schedule.shift_conditions'].value,null);assert.equal(n.refinement.inactiveAnswers[0].questionId,'hours.schedule.shift_conditions');assert.equal(n.refinement.inactiveAnswers[0].strength,'must');assert(!n.refinement.unknownQuestionIds.includes('hours.schedule.shift_conditions'));
 d=structuredClone(s.data);answer(d,'hours.schedule.arrangement',['planned_shifts']);s=update(svc,s,d);n=svc.preview('owner',s.id).snapshot;assert(n.refinement.unknownQuestionIds.includes('hours.schedule.shift_conditions'));assert.equal(n.refinement.needs.length,1);
 d=structuredClone(s.data);d.answers['hours.details']=['unsure'];s=update(svc,s,d);assert.equal(svc.preview('owner',s.id).snapshot.refinement.needs.length,0);
});

test('a changed previously mandatory answer returns its acceptance standard to unknown until reconfirmed',()=>{
 const svc=new NeedsService({});let s=svc.create('owner',{}),d=ready(s);select(d,'hours',['rest']);answer(d,'hours.rest.arrangement',['fixed_days'],'must');s=update(svc,s,d);
 d=structuredClone(s.data);answer(d,'hours.rest.arrangement',['advance_roster'],'must');s=update(svc,s,d);assert.equal(s.data.refinements.answers['hours.rest.arrangement'].strength,'unknown');
 d=structuredClone(s.data);d.refinements.answers['hours.rest.arrangement'].strength='must';s=update(svc,s,d);assert.equal(svc.preview('owner',s.id).snapshot.refinement.needs[0].strength,'must');
});

test('unknown, indifference and known-but-undecided strength have distinct meanings; substantive none stays recorded',()=>{
 const svc=new NeedsService({});let s=svc.create('owner',{}),d=ready(s);select(d,'pay',['fixed','formula','probation']);answer(d,'pay.fixed.arrangement',['no_preference'],'must');answer(d,'pay.formula.arrangement',['none'],'must');answer(d,'pay.probation.arrangement',['same_fixed'],'unknown');s=update(svc,s,d);
 const n=svc.preview('owner',s.id).snapshot.refinement;assert.deepEqual(n.indifferentQuestionIds,['pay.fixed.arrangement']);assert.equal(s.data.refinements.answers['pay.fixed.arrangement'].strength,'unknown');assert.equal(n.unknownQuestionIds.length,0);assert.equal(n.needs.length,2);assert(n.needs.some(x=>x.answerIds.includes('none')&&x.strength==='must'));assert(n.needs.some(x=>x.questionId==='pay.probation.arrangement'&&x.strength==='unknown'));
});

test('server rejects forged choices, versions, duplicate/neutral combinations and mandatory unknown without mutating state',()=>{
 const state={},svc=new NeedsService(state),s=svc.create('owner',{});
 for(const mutate of [d=>d.refinements.questionnaireVersion='later',d=>answer(d,'growth.learning.arrangement',['invented']),d=>answer(d,'growth.learning.arrangement',['named_support','named_support']),d=>answer(d,'growth.learning.arrangement',['no_preference','named_support']),d=>answer(d,'hours.schedule.arrangement',['stable_day','planned_shifts']),d=>answer(d,'hours.rest.arrangement',['unsure'],'must'),d=>d.refinements.answers['hours.rest.arrangement'].resume='private',d=>d.refinements.inactiveAnswers.push({questionId:'hours.rest.arrangement',value:['injected'],strength:'must',reason:'branch_changed'})]){const d=ready(s),before=JSON.stringify(state);mutate(d);assert.throws(()=>update(svc,s,d));assert.equal(JSON.stringify(state),before);}
});

test('confirmed refined exports are immutable, import canonical data, and reject rehashed fabricated summaries',()=>{
 const svc=new NeedsService({});let s=svc.create('owner',{}),d=ready(s);select(d,'culture',['communication']);answer(d,'culture.communication.arrangement',['agreed_autonomy']);answer(d,'culture.communication.autonomy_conditions',['decision_scope'],'must');s=update(svc,s,d,8);
 const first=svc.confirm('owner',s.id,{expectedRevision:s.revision,confirmed:true});s=first.session;const out=first.export;assert.equal(out.JobNeedsSnapshot.refinement.needs.length,2);const imported=svc.import('other',out);assert.deepEqual(svc.export('other',imported.id).JobNeedsSnapshot.refinement,out.JobNeedsSnapshot.refinement);
 d=structuredClone(s.data);answer(d,'culture.communication.arrangement',['regular_feedback']);s=update(svc,s,d,8);svc.confirm('owner',s.id,{expectedRevision:s.revision,confirmed:true});assert.deepEqual(svc.export('owner',s.id,1),out);
 for(const mutate of [x=>x.JobNeedsSnapshot.refinement.needs[0].answerTexts=['系统已证实满足需求'],x=>x.JobNeedsSnapshot.refinement.needs[0].strength='must',x=>x.JobNeedsSnapshot.refinement.needs[0].userConfirmed=false,x=>x.JobNeedsSnapshot.refinement.scores={accurate:99}]){const x=structuredClone(out);mutate(x);delete x.checksum;x.checksum=digest(x);assert.throws(()=>svc.import('other',x));}
});

test('old shipped export imports unchanged; refinement rollback creates the old flow and preserves new confirmed snapshots',()=>{
 const old=JSON.parse(readFileSync(new URL('../fixtures/AJobNeedsExport.demo.json',import.meta.url),'utf8')),bytes=JSON.stringify(old),svc=new NeedsService({});const restored=svc.import('owner',old);assert.equal(svc.export('owner',restored.id).JobNeedsSnapshot.refinement,undefined);assert.equal(JSON.stringify(old),bytes);
 const prior=process.env.A_NEEDS_REFINEMENT_ENABLED;try{process.env.A_NEEDS_REFINEMENT_ENABLED='false';const s=svc.create('owner',{});assert.equal(s.data.refinements,undefined);assert.equal(svc.bootstrap('owner').features.refinement,false);assert.equal(svc.preview('owner',s.id).snapshot.refinement,undefined);}finally{if(prior===undefined)delete process.env.A_NEEDS_REFINEMENT_ENABLED;else process.env.A_NEEDS_REFINEMENT_ENABLED=prior;}
});
