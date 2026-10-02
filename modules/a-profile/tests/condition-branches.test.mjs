import test from 'node:test';
import assert from 'node:assert/strict';
import {NeedsService} from '../src/needs/service.mjs';
import {version} from '../src/needs/catalog.mjs';
test('stage branches allow one current task plus independent expectations; server rejects conflicting selections without saving',()=>{
 const state={},svc=new NeedsService(state);let s=svc.create('u',{});
 for(const [stageId,goalIds] of [['graduate',['find_internship','transition_role']],['graduate',['find_first_job','find_internship']],['internship',['transition_role']],['changing',['find_internship']],[null,['find_first_job']]]){
  const before=JSON.stringify(state);assert.throws(()=>svc.update('u',s.id,{expectedRevision:s.revision,questionnaireVersion:version,step:7,data:{...s.data,stageId,goalIds}}));assert.equal(JSON.stringify(state),before);
 }
 for(const [stageId,goalIds] of [['graduate',['find_first_job','increase_income','better_balance']],['internship',['find_internship','better_balance']],['changing',['transition_role','increase_income']],['exploring',['clarify_direction']],[null,['better_balance']]])s=svc.update('u',s.id,{expectedRevision:s.revision,questionnaireVersion:version,step:7,data:{...s.data,stageId,goalIds}});
});
test('ordered multiple cities survive save, confirmation, JSON restore and old immutable versions; legacy goal snapshots remain readable',()=>{
 const state={},svc=new NeedsService(state);let s=svc.create('u',{}),data=structuredClone(s.data);data.conditions[0]={key:'city',value:['上海','杭州','南京'],strength:'soft'};
 s=svc.update('u',s.id,{expectedRevision:s.revision,questionnaireVersion:version,step:7,data});const first=svc.confirm('u',s.id,{expectedRevision:s.revision,confirmed:true});s=first.session;
 assert.deepEqual(first.export.SearchIntent.cities,['上海','杭州','南京']);assert.deepEqual(first.export.UserProfile.preferences[0].value,['上海','杭州','南京']);
 data=structuredClone(s.data);data.conditions[0].value=['杭州','南京','上海'];s=svc.update('u',s.id,{expectedRevision:s.revision,questionnaireVersion:version,step:8,data});s=svc.confirm('u',s.id,{expectedRevision:s.revision,confirmed:true}).session;
 assert.deepEqual(svc.export('u',s.id,1),first.export);const restored=svc.import('other',svc.export('u',s.id));assert.deepEqual(svc.export('other',restored.id).SearchIntent.cities,['杭州','南京','上海']);
 const raw=state.needs.sessions[s.id];raw.data.stageId='graduate';raw.data.goalIds=['find_first_job','find_internship'];const frozen=svc.export('u',s.id,1);s=svc.update('u',s.id,{expectedRevision:raw.revision,questionnaireVersion:version,step:0,data:raw.data});assert.throws(()=>svc.confirm('u',s.id,{expectedRevision:s.revision,confirmed:true}));assert.deepEqual(svc.export('u',s.id,1),frozen);
});
