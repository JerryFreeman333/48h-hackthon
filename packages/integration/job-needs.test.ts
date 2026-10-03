import test from "node:test";
import assert from "node:assert/strict";
import { buildInvestigationPlan, respondToJobNeeds, renderNeedsHtml,needsMarkdown } from "./job-needs";
import { topics } from "../../modules/a-profile/src/needs/catalog.mjs";
import { demoSample } from "../../modules/b-research/research-service";
function snapshot() { const b=demoSample().bundle; return {schemaVersion:"a-job-needs-1", projectId:b.projectId, profileId:"p", profileRevision:b.intentRevision, mode:b.mode, confirmedAt:b.retrievedAt, topics:topics.map(t=>({topicId:t.id,title:t.title,priority:"priority",verificationItemIds:t.details.map((d: { id: string })=>d.id),unknownHandling:"verify_first",userConfirmed:true}))}; }
test("all 28 need details generate specific questions; coverage or unrelated JD cannot satisfy them", () => {
 const s=snapshot(), b=demoSample().bundle;
 assert.equal(buildInvestigationPlan(s).items.length,28);
 const r=respondToJobNeeds(s,b);
 assert.equal(r.candidates[0].items.length,28);
 assert.ok(r.candidates[0].items.every(i=>i.status==="unknown"));
 assert.equal(r.candidates[0].actionGate,"verify_first");
 s.topics.forEach(t=>t.unknownHandling="continue_with_unknown");
 assert.equal(respondToJobNeeds(s,b).candidates[0].actionGate,"no_additional_gate");
});
test("verified same-job facts respond; other jobs, unverified evidence and conflicts remain actionable",()=>{
 const s=snapshot(), b=demoSample().bundle, j=b.jobs[0];
 const evidence={...b.evidence[0], evidenceId:"need-e",companyId:j.companyId,jobId:j.jobId,scope:"job" as const,verification:"verified" as const,excerpt:"具体带教资料"};
 b.evidence.push(evidence); b.facts.push({factId:"need-f",companyId:j.companyId,jobId:j.jobId,key:"needs.growth.learning",value:"每周带教",status:"supported",evidenceIds:["need-e"],asOf:null});
 const get=()=>respondToJobNeeds(s,b).candidates[0].items.find(i=>i.itemId==="learning")!;
 assert.equal(get().status,"available");
 evidence.verification="unverified" as any; assert.equal(get().status,"lead"); assert.equal(get().requiresAction,true);
 evidence.verification="verified"; evidence.jobId="other"; assert.equal(get().status,"unknown");
 evidence.jobId=j.jobId; b.facts.push({...b.facts.at(-1)!,factId:"need-f2",value:"无带教",status:"conflicting"}); assert.equal(get().status,"conflicting");
 assert.equal(get().requiresAction,true);
});
test("complementary wording and different dates are not automatic conflicts; invalid dates remain leads",()=>{
 const s=snapshot(),b=demoSample().bundle,j=b.jobs[0];
 b.evidence.push({...b.evidence[0],evidenceId:"learning-e",companyId:j.companyId,jobId:j.jobId,scope:"job",verification:"verified",excerpt:"每周带教，并提供内部课程"});
 const fact={factId:"learning-1",companyId:j.companyId,jobId:j.jobId,key:"needs.growth.learning",value:"每周带教" as string|boolean,status:"supported" as const,evidenceIds:["learning-e"],asOf:"2025-04"};
 b.facts.push(fact,{...fact,factId:"learning-2",value:"内部课程"});
 const get=()=>respondToJobNeeds(s,b).candidates[0].items.find(i=>i.itemId==="learning")!;
 assert.equal(get().status,"available");assert.equal(get().materials.length,2);
 b.facts.slice(-2).forEach((f,n)=>f.value=!!n);assert.equal(get().status,"conflicting");
 b.facts.at(-1)!.asOf="2025-05";assert.equal(get().status,"available");
 b.facts.slice(-2).forEach(f=>f.asOf="not-a-date");assert.equal(get().status,"lead");assert.ok(get().gaps.some(g=>g.includes("日期无效")));
 b.facts.slice(-2).forEach(f=>f.asOf="2099-01-01");assert.equal(get().status,"lead");
});
test("company and employee material remains a cited lead without becoming a job promise",()=>{
 const s=snapshot(),b=demoSample().bundle,j=b.jobs[0];
 b.companies.find(c=>c.companyId===j.companyId)!.identityStatus="unresolved";
 const e={...b.evidence[0],evidenceId:"company-training-e",companyId:j.companyId,jobId:null,scope:"company" as const,verification:"unverified" as const,title:"员工评价 · 公司培训安排",excerpt:"周期性带薪内部培训",publishedAt:"2025-04"};
 b.evidence.push(e);b.facts.push({factId:"company-training-f",companyId:j.companyId,jobId:null,key:"needs.growth.learning",value:"周期性带薪内部培训",status:"unknown",evidenceIds:[e.evidenceId],asOf:"2025-04"});
 const r=respondToJobNeeds(s,b,{sourceDates:[{evidenceId:e.evidenceId,publishedAtRaw:"2025-04",retrievedAtRaw:"2026-10-02 12:20:00"}]}),i=r.candidates[0].items.find(i=>i.itemId==="learning")!;
 assert.equal(i.status,"lead");assert.equal(i.requiresAction,true);assert.equal(i.materials[0].jobId,null);assert.equal(i.materials[0].verifiedForNeed,false);
 assert.equal(i.materials[0].sources[0].publishedAt,"2025-04");assert.equal(i.materials[0].sources[0].collectedAt,"2026-10-02 12:20:00");
 assert.ok(i.gaps.some(g=>g.includes("这份岗位")));assert.ok(i.gaps.some(g=>g.includes("签约主体")));assert.ok(i.question.includes("是否同样适用"));
 const html=renderNeedsHtml(r,undefined,b),md=needsMarkdown(r,b);
 assert.ok(html.includes("周期性带薪内部培训"));assert.ok(html.includes("已有待确认线索"));assert.ok(html.includes("2026-10-02 12:20:00"));assert.ok(html.includes("未记录时区"));
 assert.ok(md.includes("已有待确认线索"));assert.ok(!md.includes("verify_first"));assert.ok(!html.includes("引用事实："));
 // A verified company source still cannot establish a particular job arrangement.
 e.verification="verified" as any;b.facts.at(-1)!.status="supported";
 assert.equal(respondToJobNeeds(s,b).candidates[0].items.find(i=>i.itemId==="learning")!.status,"lead");
});
test("invalid fact references cannot confirm needs; independently scoped source text remains a lead",()=>{
 const s=snapshot(),b=demoSample().bundle,j=b.jobs[0];
 const base={factId:"missing-f",companyId:j.companyId,jobId:null,key:"needs.benefits.coverage",value:"六险一金",status:"unknown" as const,evidenceIds:[] as string[],asOf:null};
 b.facts.push(base);
 const get=()=>respondToJobNeeds(s,b).candidates[0].items.find(i=>i.topicId==="benefits"&&i.itemId==="coverage")!;
 assert.equal(get().status,"unknown");assert.ok(get().gaps.some(g=>g.includes("完整引用")));
 b.evidence.push({...b.evidence[0],evidenceId:"another-job-e",companyId:j.companyId,jobId:"another-job",scope:"job",verification:"verified",excerpt:"六险一金"});
 b.facts.push({...base,factId:"another-job-f",jobId:"another-job",status:"supported",evidenceIds:["another-job-e"]});
 assert.equal(get().status,"unknown");assert.equal(get().materials.length,0);
 b.evidence.push({...b.evidence[0],evidenceId:"mixed-e",companyId:j.companyId,jobId:j.jobId,scope:"job",verification:"verified",excerpt:"六险一金"});
 b.facts[0]={...base,factId:"mixed-f",evidenceIds:["mixed-e"]};
 assert.equal(get().status,"lead");assert.deepEqual(get().factIds,[]);assert.deepEqual(get().evidenceIds,["mixed-e"]);
});
test("company inquiry needs a confirmed subject for verified availability; disputes are retained",()=>{
 const s=snapshot(),b=demoSample().bundle,j=b.jobs[0],company=b.companies.find(c=>c.companyId===j.companyId)!;
 const e={...b.evidence[0],evidenceId:"business-e",companyId:j.companyId,jobId:null,scope:"company" as const,verification:"verified" as const,excerpt:"主营业务记录",publishedAt:"2025-04"};
 b.evidence.push(e);b.facts.push({factId:"business-f",companyId:j.companyId,jobId:null,key:"needs.company.business",value:"主营业务记录",status:"supported",evidenceIds:[e.evidenceId],asOf:"2025-04"});
 const get=()=>respondToJobNeeds(s,b).candidates[0].items.find(i=>i.topicId==="company"&&i.itemId==="business")!;
 company.identityStatus="ambiguous";assert.equal(get().status,"lead");
 company.identityStatus="confirmed";assert.equal(get().status,"available");assert.equal(get().requiresAction,false);
 e.verification="disputed" as any;assert.equal(get().status,"conflicting");assert.equal(get().requiresAction,true);assert.equal(get().materials.length,1);
});
test("binding, directory and HTML safety are enforced",()=>{
 const s=snapshot(),b=demoSample().bundle;
 assert.throws(()=>respondToJobNeeds({...s,projectId:"other"},b));
 assert.throws(()=>buildInvestigationPlan({...s,topics:[s.topics[0],...s.topics.slice(0,6)]}));
 const r=respondToJobNeeds(s,b); r.candidates[0].items[0].question="<script>alert(1)</script>";
 assert.ok(!renderNeedsHtml(r).includes("<script>"));
 b.jobs[0].title="<script>岗位</script> [坏链接](javascript:bad)";assert.ok(!renderNeedsHtml(r,undefined,b).includes("<script>"));assert.ok(renderNeedsHtml(r,undefined,b).includes("&lt;script&gt;岗位"));assert.ok(needsMarkdown(r,b).includes("\\[坏链接\\]"));
});
