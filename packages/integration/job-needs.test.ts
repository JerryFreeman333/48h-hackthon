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
 evidence.verification="unverified" as any; assert.equal(get().status,"unknown");
 evidence.verification="verified"; evidence.jobId="other"; assert.equal(get().status,"unknown");
 evidence.jobId=j.jobId; b.facts.push({...b.facts.at(-1)!,factId:"need-f2",value:"无带教"}); assert.equal(get().status,"conflicting");
 assert.equal(get().requiresAction,true);
});
test("binding, directory and HTML safety are enforced",()=>{
 const s=snapshot(),b=demoSample().bundle;
 assert.throws(()=>respondToJobNeeds({...s,projectId:"other"},b));
 assert.throws(()=>buildInvestigationPlan({...s,topics:[s.topics[0],...s.topics.slice(0,6)]}));
 const r=respondToJobNeeds(s,b); r.candidates[0].items[0].question="<script>alert(1)</script>";
 assert.ok(!renderNeedsHtml(r).includes("<script>"));
 b.jobs[0].title="<script>岗位</script> [坏链接](javascript:bad)";assert.ok(!renderNeedsHtml(r,undefined,b).includes("<script>"));assert.ok(renderNeedsHtml(r,undefined,b).includes("&lt;script&gt;岗位"));assert.ok(needsMarkdown(r,b).includes("\\[坏链接\\]"));
});
