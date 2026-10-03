import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NeedsService} from '../src/needs/service.mjs';
import {version} from '../src/needs/catalog.mjs';
const patch=(svc,s,data,step=7)=>svc.update('u',s.id,{expectedRevision:s.revision,questionnaireVersion:version,step,data});
const ready=s=>({...structuredClone(s.data),stageId:null,goalIds:['find_first_job'],industryTags:['software_it'],roleTypes:['engineering']});
test('three opportunity choices are single select; independent expectations survive and obsolete stage/tasks are rejected atomically',()=>{
 const state={},svc=new NeedsService(state);let s=svc.create('u',{});
 assert.deepEqual(svc.bootstrap('u').opportunities.map(x=>x.id),['find_internship','find_first_job','change_job']);
 assert.equal(svc.bootstrap('u').stages,undefined);
 for(const [stageId,goalIds] of [[null,['find_first_job','find_internship']],[null,['transition_role']],[null,['clarify_direction']],['graduate',['find_first_job']]]){
  const before=JSON.stringify(state);assert.throws(()=>patch(svc,s,{...s.data,stageId,goalIds}));assert.equal(JSON.stringify(state),before);
 }
 for(const goal of ['find_internship','find_first_job','change_job'])s=patch(svc,s,{...s.data,stageId:null,goalIds:[goal,'increase_income','better_balance']});
 assert.deepEqual(s.data.goalIds,['change_job','increase_income','better_balance']);
});
test('partial requirements save and restore; opportunity, industry and role are required before review or direct API confirmation',()=>{
 const state={},svc=new NeedsService(state);let s=svc.create('u',{});
 for(const missing of ['goalIds','industryTags','roleTypes']){
  const data=ready(s);data[missing]=[];s=patch(svc,s,data);assert.deepEqual(svc.get('u',s.id).data,data);
  const before=JSON.stringify(state);assert.throws(()=>patch(svc,s,data,8));assert.throws(()=>svc.confirm('u',s.id,{expectedRevision:s.revision,confirmed:true}));assert.equal(JSON.stringify(state),before);
 }
 s=patch(svc,s,ready(s),8);assert.equal(svc.confirm('u',s.id,{expectedRevision:s.revision,confirmed:true}).export.UserProfile.revision,1);
});
test('ordered cities survive save, confirmation, JSON restoration and immutable versions',()=>{
 const state={},svc=new NeedsService(state);let s=svc.create('u',{}),data=ready(s);data.conditions[0]={key:'city',value:['上海','杭州','南京'],strength:'soft'};
 s=patch(svc,s,data);const first=svc.confirm('u',s.id,{expectedRevision:s.revision,confirmed:true});s=first.session;
 assert.deepEqual(first.export.SearchIntent.cities,['上海','杭州','南京']);assert.deepEqual(first.export.UserProfile.preferences[0].value,['上海','杭州','南京']);assert.deepEqual(first.export.UserProfile.goals,['寻找第一份全职工作']);
 data=structuredClone(s.data);data.conditions[0].value=['杭州','南京','上海'];s=patch(svc,s,data,8);s=svc.confirm('u',s.id,{expectedRevision:s.revision,confirmed:true}).session;
 assert.deepEqual(svc.export('u',s.id,1),first.export);const restored=svc.import('other',svc.export('u',s.id));assert.deepEqual(svc.export('other',restored.id).SearchIntent.cities,['杭州','南京','上海']);
});
test('legacy stage snapshots remain readable/importable and earlier drafts editable; new confirmation requires current opportunity selection',()=>{
 const old=JSON.parse(readFileSync(new URL('../rubbish/opportunity-entry-20261003/AJobNeedsExport.demo.json',import.meta.url),'utf8'));
 const state={},svc=new NeedsService(state);let s=svc.import('u',old);const frozen=svc.export('u',s.id,1);assert.equal(frozen.JobNeedsSnapshot.selectionData.stageId,'graduate');
 s=patch(svc,s,s.data,0);assert.throws(()=>svc.confirm('u',s.id,{expectedRevision:s.revision,confirmed:true}));assert.deepEqual(svc.export('u',s.id,1),frozen);
 s=patch(svc,s,ready(s),8);svc.confirm('u',s.id,{expectedRevision:s.revision,confirmed:true});assert.deepEqual(svc.export('u',s.id,1),frozen);
});
