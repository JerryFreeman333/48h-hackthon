import test from 'node:test';
import assert from 'node:assert/strict';
import {NeedsService,digest,describe} from '../src/needs/service.mjs';
import {deriveTradeoff,tradeoffReviewBasis} from '../src/needs/tradeoff.mjs';
import {tradeoffVersion} from '../src/needs/tradeoff-catalog.mjs';

const update=(service,s,data,step=0)=>service.update('owner',s.id,{expectedRevision:s.revision,questionnaireVersion:s.questionnaireVersion,tradeoffCursor:1,step,data});
function ready(data){data.goalIds=['find_first_job'];data.industryTags=['manufacturing'];data.roleTypes=['engineering'];return data;}
function review(data){const proposal=deriveTradeoff(data.tradeoff);for(const t of proposal.topics)data.tradeoff.review[t.topicId]={priority:t.proposalPriority,strength:t.proposedNeeds.length?'prefer':'unknown',unknownHandling:'continue_with_unknown',confirmed:true,basis:t.reviewBasis};return data;}
function createKnown(service){let s=service.create('owner',{flow:'tradeoff'}),d=ready(structuredClone(s.data));d.tradeoff.answers.opportunity_01='left';d.tradeoff.answers.condition_01='fixed_30';d.tradeoff.answers.opportunity_02='right';s=update(service,s,d,8);return {s,d:structuredClone(s.data)};}

test('the explicit new public flow uses its own version and review while old API calls remain compatible',()=>{
 const svc=new NeedsService({}),legacy=svc.create('owner',{}),s=svc.create('owner',{flow:'tradeoff'});
 assert.equal(legacy.data.tradeoff,undefined);assert.equal(s.questionnaireVersion,tradeoffVersion);assert.equal(s.data.refinements,undefined);
 assert.equal(svc.bootstrap('owner').features.tradeoff,true);assert.equal(svc.bootstrap('owner').tradeoff.questions.length,22);
 let {s:known,d}=createKnown(svc);assert.throws(()=>svc.confirm('owner',known.id,{expectedRevision:known.revision,confirmed:true}),/检查需求整理/);
 d=review(d);known=update(svc,known,d,8);const out=svc.confirm('owner',known.id,{expectedRevision:known.revision,confirmed:true}).export;
 assert.equal(out.JobNeedsSnapshot.questionnaireVersion,tradeoffVersion);assert.equal(out.JobNeedsSnapshot.refinement,undefined);assert.equal(out.JobNeedsSnapshot.scores,null);
 assert.equal(out.questionProvenance.length,22);assert(out.questionProvenance.every(p=>p.itemOrigin==='product-authored'));
 assert(out.SearchIntent.filters.every(c=>c.value===null&&c.strength==='unknown'));assert(out.JobNeedsSnapshot.tradeoff.needs.some(n=>n.answerIds.includes('fixed_30')));
 assert(!out.Report.markdown.includes('undefined'));assert(out.Report.markdown.includes('30%'));assert(out.Report.markdown.includes('本人确认的当前重点'));
 const description=describe(out.JobNeedsSnapshot);assert(description.some(t=>t.declaredNeeds.some(n=>typeof n.question==='string'&&typeof n.answer==='string')));
});

test('new snapshots import canonically, reject rehashed invented conclusions, and preserve prior versions across edits',()=>{
 const state={},svc=new NeedsService(state);let {s,d}=createKnown(svc);d=review(d);s=update(svc,s,d,8);const first=svc.confirm('owner',s.id,{expectedRevision:s.revision,confirmed:true});s=first.session;
 const imported=svc.import('other',first.export);assert.deepEqual(svc.export('other',imported.id).JobNeedsSnapshot.tradeoff,first.export.JobNeedsSnapshot.tradeoff);
 for(const mutate of [x=>x.JobNeedsSnapshot.tradeoff.needs[0].answerTexts=['未经本人确认的底线'],x=>x.JobNeedsSnapshot.tradeoff.ranking.tiers.reverse(),x=>x.JobNeedsSnapshot.tradeoff.confirmedPriorityGroups.priority=['company'],x=>x.questionProvenance[0].itemOrigin='validated-scale']){const forged=structuredClone(first.export);mutate(forged);delete forged.checksum;forged.checksum=digest(forged);assert.throws(()=>svc.import('other',forged));}
 d=structuredClone(s.data);d.tradeoff.answers.opportunity_01='right';s=update(svc,s,d,8);assert(Object.values(s.data.tradeoff.review).every(r=>!r.confirmed));assert.equal(s.data.tradeoff.answers.condition_01,null);assert(s.data.tradeoff.inactiveAnswers.some(x=>x.questionId==='condition_01'));
 assert.throws(()=>svc.confirm('owner',s.id,{expectedRevision:s.revision,confirmed:true}));d=review(structuredClone(s.data));s=update(svc,s,d,8);svc.confirm('owner',s.id,{expectedRevision:s.revision,confirmed:true});
 assert.deepEqual(svc.export('owner',s.id,1),first.export);const restarted=new NeedsService(structuredClone(state));assert.deepEqual(restarted.export('owner',s.id,1),first.export);
});

test('mixed-version payloads and failure to persist cannot change the current flow or commit state',()=>{
 let fail=false;const state={},svc=new NeedsService(state,()=>{if(fail)throw Error('disk unavailable');}),s=svc.create('owner',{flow:'tradeoff'});
 const before=JSON.stringify(state);for(const mutate of [d=>delete d.tradeoff,d=>d.tradeoff.questionnaireVersion='unknown',d=>d.tradeoff.answers.opportunity_01='injected',d=>d.tradeoff.privateResume='data']){const d=structuredClone(s.data);mutate(d);assert.throws(()=>update(svc,s,d));assert.equal(JSON.stringify(state),before);}
 assert.throws(()=>svc.update('owner',s.id,{expectedRevision:s.revision,questionnaireVersion:'job-needs-20261002-1',step:0,data:s.data}));
 const d=structuredClone(s.data);d.tradeoff.answers.opportunity_01='left';fail=true;assert.throws(()=>update(svc,s,d),/disk unavailable/);assert.equal(JSON.stringify(state),before);
});

test('all-unknown exit produces no inferred requirement and closing the new flow leaves both histories readable',()=>{
 const svc=new NeedsService({});let s=svc.create('owner',{flow:'tradeoff'}),d=review(ready(structuredClone(s.data)));s=update(svc,s,d,8);const out=svc.confirm('owner',s.id,{expectedRevision:s.revision,confirmed:true}).export;
 assert.equal(out.JobNeedsSnapshot.tradeoff.needs.length,0);assert.equal(out.JobNeedsSnapshot.tradeoff.ranking.relations.length,0);assert.equal(out.JobNeedsSnapshot.tradeoff.unknownQuestionIds.length,14);
 assert(out.JobNeedsSnapshot.topics.every(t=>t.priority==='unknown'));assert(out.UserProfile.preferences.every(c=>c.value===null));
 const old=process.env.A_NEEDS_TRADEOFF_ENABLED;try{process.env.A_NEEDS_TRADEOFF_ENABLED='false';assert.equal(svc.bootstrap('owner').features.tradeoff,false);assert.throws(()=>svc.create('owner',{flow:'tradeoff'}));assert.equal(svc.create('owner',{}).data.tradeoff,undefined);assert.deepEqual(svc.export('owner',s.id),out);assert(svc.import('other',out).id);}finally{if(old===undefined)delete process.env.A_NEEDS_TRADEOFF_ENABLED;else process.env.A_NEEDS_TRADEOFF_ENABLED=old;}
});
