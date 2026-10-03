import test from "node:test";
import assert from "node:assert/strict";
import type {CandidateBundle} from "../contracts";
import {topics} from "../../modules/a-profile/src/needs/catalog.mjs";
import {demoSample} from "../../modules/b-research/research-service";
import {extractNeedLeads,needSignals} from "./database-investigation";
import {respondToJobNeeds} from "./job-needs";

// Small synthetic passages exercise boundaries, never populate user history.
function fixture(excerpt:string,scope:"job"|"company"="job") {
 const bundle=structuredClone(demoSample().bundle),job=bundle.jobs[0],original=bundle.evidence[0];
 bundle.jobs=[job];bundle.evidence=[];bundle.facts=[];
 bundle.evidence.push({...original,evidenceId:"passage",companyId:job.companyId,jobId:scope==="job"?job.jobId:null,scope,sourceType:"local_database_job_summary",title:"本地资料摘录",excerpt,verification:"unverified",publishedAt:"2025-04"});
 const snapshot={schemaVersion:"a-job-needs-1",projectId:bundle.projectId,profileId:"test-profile",profileRevision:bundle.intentRevision,mode:bundle.mode,confirmedAt:bundle.retrievedAt,topics:topics.map(t=>({topicId:t.id,title:t.title,priority:"priority",verificationItemIds:t.details.map((d:{id:string})=>d.id),unknownHandling:"verify_first",userConfirmed:true}))};
 return {bundle,snapshot};
}
const keys=(bundle:CandidateBundle)=>bundle.facts.map(f=>f.key);

test("every selectable need has a retrieval key, and clear text remains a dated cited lead",()=>{
 const expected=topics.flatMap(t=>t.details.map((d:{id:string})=>t.id+"."+d.id));
 assert.deepEqual(Object.keys(needSignals).sort(),expected.sort());
 const {bundle,snapshot}=fixture("岗位安排双休；税前固定月薪10000元；每周由导师带教。");
 // Even an upstream source flag cannot turn keyword extraction into a verified fact.
 bundle.evidence[0].verification="verified";
 extractNeedLeads(bundle);
 assert.ok(keys(bundle).includes("needs.hours.rest"));assert.ok(keys(bundle).includes("needs.pay.fixed"));assert.ok(keys(bundle).includes("needs.growth.learning"));
 assert.ok(bundle.facts.every(f=>f.status==="unknown"&&f.jobId===bundle.jobs[0].jobId&&f.asOf==="2025-04"&&f.evidenceIds[0]==="passage"));
 const response=respondToJobNeeds(snapshot,bundle,{sourceDates:[{evidenceId:"passage",publishedAtRaw:"2025-04",retrievedAtRaw:"2026-10-02"}]});
 const rest=response.candidates[0].items.find(i=>i.itemId==="rest")!;
 assert.equal(rest.status,"lead");assert.equal(rest.requiresAction,true);assert.equal(rest.materials[0].sources[0].collectedAt,"2026-10-02");
 assert.equal(response.candidates[0].actionGate,"verify_first");
 const count=bundle.facts.length;extractNeedLeads(bundle);assert.equal(bundle.facts.length,count);
});

test("negative insurance, training and rest statements retain their wording without positive inference",()=>{
 const {bundle,snapshot}=fixture("本岗位不提供五险一金，不提供内部培训，暂无双休；入职不缴社保。");
 extractNeedLeads(bundle);
 assert.ok(keys(bundle).includes("needs.benefits.coverage"));assert.ok(keys(bundle).includes("needs.growth.learning"));assert.ok(keys(bundle).includes("needs.hours.rest"));
 assert.ok(bundle.facts.every(f=>typeof f.value==="string"&&f.value.includes("不提供")&&f.status==="unknown"));
 const response=respondToJobNeeds(snapshot,bundle);
 assert.equal(response.candidates[0].items.find(i=>i.itemId==="learning")!.status,"lead");
 assert.ok(response.candidates[0].items.find(i=>i.itemId==="learning")!.materials[0].value!.toString().includes("不提供内部培训"));
});

test("training delivered as teaching duties is not treated as the applicant's learning resource",()=>{
 const {bundle}=fixture("负责医考课程培训，为客户提供培训机会，承担内部培训讲师授课职责。");
 bundle.jobs[0].title="医考讲师";
 extractNeedLeads(bundle);
 assert.ok(!keys(bundle).includes("needs.growth.learning"));
});

test("employee-review clues preserve company scope and do not invent rest, overtime or fixed salary",()=>{
 const {bundle,snapshot}=fixture("公司定期给员工安排周期性带薪内部培训；入职即缴六险一金；不打卡，提供餐补和交通补贴。","company");
 bundle.evidence[0].title="员工评价";
 extractNeedLeads(bundle);
 for(const key of ["needs.growth.learning","needs.benefits.coverage","needs.benefits.start","needs.hours.schedule"])assert.ok(keys(bundle).includes(key));
 for(const key of ["needs.hours.overtime","needs.hours.rest","needs.pay.fixed"])assert.ok(!keys(bundle).includes(key));
 const response=respondToJobNeeds(snapshot,bundle),learning=response.candidates[0].items.find(i=>i.itemId==="learning")!;
 assert.equal(learning.status,"lead");assert.equal(learning.materials[0].jobId,null);assert.equal(learning.materials[0].sources[0].scope,"company");
 assert.ok(learning.gaps.some(g=>g.includes("这份岗位")));assert.equal(response.candidates[0].items.find(i=>i.itemId==="fixed")!.status,"unknown");
});

test("another job and database field-conflict notes cannot become the chosen job's needs",()=>{
 const {bundle,snapshot}=fixture("双休，有员工培训。");
 const other={...bundle.jobs[0],jobId:"other-job",title:"同公司另一个岗位"};bundle.jobs.push(other);bundle.evidence[0].jobId=other.jobId;
 extractNeedLeads(bundle);
 const selected=respondToJobNeeds(snapshot,bundle).candidates[0];
 assert.equal(selected.items.find(i=>i.itemId==="rest")!.status,"unknown");assert.equal(selected.items.find(i=>i.itemId==="learning")!.status,"unknown");
 const field=fixture("主体比较记录提到营收，但不是原始经营报道。");field.bundle.evidence[0].sourceType="local_database_field_comparison";
 extractNeedLeads(field.bundle);assert.equal(field.bundle.facts.length,0);
 const disputed=fixture("公开财报记载亏损。","company");disputed.bundle.evidence[0].verification="disputed";extractNeedLeads(disputed.bundle);
 assert.ok(disputed.bundle.facts.every(f=>f.status==="conflicting"));
 assert.equal(respondToJobNeeds(disputed.snapshot,disputed.bundle).candidates[0].items.find(i=>i.itemId==="public_finance")!.status,"conflicting");
});
