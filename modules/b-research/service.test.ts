import assert from "node:assert/strict";
import test from "node:test";
import { addEvidence, addManualJob, createResearchRun, demoSample } from "./service";
import { candidateBundleSchema, searchIntentSchema } from "./contract";

test("public SearchIntent and demo CandidateBundle validate against 1.0.0", () => {
  const sample = demoSample();
  assert.equal(searchIntentSchema.parse(sample.intent).schemaVersion, "1.0.0");
  assert.equal(candidateBundleSchema.parse(sample.bundle).schemaVersion, "1.0.0");
  assert.equal(sample.bundle.jobs[0].vacancyStatus, "unknown");
});

test("SearchIntent rejects maxCandidates above the service cap", () => {
  const sample = demoSample();
  assert.throws(() => searchIntentSchema.parse({ ...sample.intent, maxCandidates: 4 }));
});

test("demo retrieval preserves intent revision and excludes closed jobs", () => {
  const sample = demoSample();
  const result = createResearchRun({ ...sample.intent, revision: 3, roleTypes: [], cities: [] });
  assert.equal(result.bundle.intentRevision, 3);
  assert.equal(result.bundle.mode, "demo");
  assert.equal(result.bundle.jobs.some((job) => job.vacancyStatus === "closed"), false);
  assert.equal(candidateBundleSchema.safeParse(result.bundle).success, true);
});

test("manual JD requires original title and body, and defaults vacancy to unknown", () => {
  assert.throws(() => addManualJob({ title: "产品运营" }));
  const saved = addManualJob({ title: "QA test product operations", rawJd: "真实用户提交的 JD 正文", city: "上海" });
  assert.equal(saved.job.vacancyStatus, "unknown");
  assert.equal(saved.evidence.verification, "unverified");
  assert.equal(saved.evidence.excerpt, saved.job.rawJd);
});

test("manual retrieval records missing identity and company sources as coverage", () => {
  const sample = demoSample();
  const intent = { ...sample.intent, mode: "manual" as const, roleTypes: ["QA test product operations"], cities: [] };
  const result = createResearchRun(intent);
  assert.equal(result.bundle.companies.length, 0);
  assert.ok(result.bundle.coverage.some((entry) => entry.topic === "company_identity" && entry.status === "no_result"));
  assert.ok(result.bundle.coverage.some((entry) => entry.status === "not_connected"));
});

test("live mode does not silently fall back to demo or manual evidence", () => {
  const sample = demoSample();
  const result = createResearchRun({ ...sample.intent, mode: "live" });
  assert.equal(result.run.status, "partial");
  assert.equal(result.bundle.jobs.length, 0);
  assert.equal(result.bundle.evidence.length, 0);
  assert.equal(result.bundle.coverage[0].status, "not_connected");
});

test("manual evidence rejects empty excerpts and malformed source URLs", () => {
  assert.throws(() => addEvidence({ title: "官方公示", excerpt: "材料片段", url: "javascript:alert(1)" }));
  assert.throws(() => addEvidence({ title: "官方公示", excerpt: "  " }));
});
