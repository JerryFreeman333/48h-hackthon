import assert from "node:assert/strict";
import test from "node:test";
import profile from "./fixtures/user-profile.json";
import intent from "./fixtures/search-intent.json";
import bundle from "./fixtures/candidate-bundle.json";
import report from "./fixtures/match-report.json";
import { userProfileSchema, searchIntentSchema, candidateBundleSchema, matchReportSchema, validateIntegration, validateBundleReferences } from "./index";

test("four public fixture schemas and handoff validate", () => {
  const p = userProfileSchema.parse(profile); const i = searchIntentSchema.parse(intent); const b = candidateBundleSchema.parse(bundle);
  matchReportSchema.parse(report);
  assert.deepEqual(validateIntegration(p, i, b), []);
  assert.deepEqual(report.evidenceSnapshot, b.evidence);
  assert.deepEqual(report.factsSnapshot, b.facts);
  assert.deepEqual(report.coverageSnapshot, b.coverage);
});
test("stale profile, intent and cross-project handoffs fail", () => {
  const p = userProfileSchema.parse(profile); const i = searchIntentSchema.parse(intent); const b = candidateBundleSchema.parse(bundle);
  assert.ok(validateIntegration({ ...p, revision: 2 }, i, b).length);
  assert.ok(validateIntegration(p, { ...i, revision: 2 }, b).length);
  assert.ok(validateIntegration(p, i, { ...b, projectId: "other" }).length);
});
test("unsupported citations and demo contamination fail", () => {
  const b = candidateBundleSchema.parse(bundle);
  assert.ok(validateBundleReferences({ ...b, mode: "live" }).length);
  assert.ok(validateBundleReferences({ ...b, facts: [{ ...b.facts[0], evidenceIds: ["invented"] }] }).length);
  assert.ok(validateBundleReferences({ ...b, evidence: [{ ...b.evidence[0], companyId: "other" }] }).length);
});
test("version changes are not silently accepted", () => {
  assert.equal(searchIntentSchema.safeParse({ ...intent, schemaVersion: "2.0.0" }).success, false);
});
