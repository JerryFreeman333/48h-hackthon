import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createAHost} from './a-host';
import {createSelectedNeeds} from './test-needs-fixture';
import {createResearchJobs} from './research-jobs';
test('background investigation deduplicates, isolates owner, and persists completion across restart',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'xray-jobs-')),a=createAHost(join(dir,'a')),draft=createSelectedNeeds(a.service,'owner',{mode:'manual'});
 const input=a.service.confirm('owner',draft.id,{expectedRevision:draft.revision,confirmed:true}).export;
 let complete!:(r:any)=>void;let calls=0;const jobs=createResearchJobs(join(dir,'jobs'),async(_o,_i,_ids,progress)=>{calls++;progress({message:'正在调查测试候选'});return await new Promise(r=>{complete=r;});});
 const first=jobs.start('owner',input,[95]);assert.equal(jobs.start('owner',input,[95]).runId,first.runId);
 assert.throws(()=>jobs.read('other',first.runId),/不存在/);assert.throws(()=>jobs.read('owner','../../state'),/不存在/);
 await new Promise(r=>setImmediate(r));assert.equal(calls,1);assert.equal(jobs.read('owner',first.runId).message,'正在调查测试候选');
 assert.ok(!JSON.stringify(jobs.read('owner',first.runId)).includes('owner'));
 complete({reportUrl:'/flow/reports/report-test',warnings:['测试']});await new Promise(r=>setImmediate(r));
 assert.equal(createResearchJobs(join(dir,'jobs')).read('owner',first.runId).status,'completed');
});
test('interrupted jobs fail safely rather than automatically repeating paid work',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'xray-interrupted-')),a=createAHost(join(dir,'a')),draft=createSelectedNeeds(a.service,'owner',{mode:'manual'});
 const input=a.service.confirm('owner',draft.id,{expectedRevision:draft.revision,confirmed:true}).export;
 const jobs=createResearchJobs(join(dir,'jobs'),async()=>new Promise(()=>{}));
 const first=jobs.start('owner',input,[95]);const restored=createResearchJobs(join(dir,'jobs'));
 assert.equal(restored.read('owner',first.runId).status,'failed');assert.match(restored.read('owner',first.runId).message,/不会自动重复调用/);
});
