import assert from "node:assert/strict";
import test from "node:test";
import { ResearchService, demoSample } from "./research-service";
import { createResearchApi } from "./api";
import { validateBundleReferences } from "./contract";
import { manualJobSchema } from "./inputs";
import { candidateBundleSchema, searchIntentSchema } from "./contract";
import { addManualJob as addLocalJob, companyCandidates as localCandidates, selectIdentity as selectLocalIdentity } from "./service";
const createService = () => new ResearchService(() => new Date("2026-10-02T12:00:00Z"));
const intent = (projectId = "p1") => ({ ...demoSample().intent, projectId, mode: "manual" as const, cities: [], roleTypes: [] });
const jd = (projectId = "p1") => ({ projectId, title: "测试岗位", rawJd: "销售KPI：有", companyName: "测试同名公司" });

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
  const result = createService().createResearchRun({ ...sample.intent, revision: 3, roleTypes: [], cities: [] });
  assert.equal(result.bundle.intentRevision, 3);
  assert.equal(result.bundle.mode, "demo");
  assert.equal(result.bundle.jobs.some((job) => job.vacancyStatus === "closed"), false);
  assert.equal(candidateBundleSchema.safeParse(result.bundle).success, true);
});

test("manual JD requires original title and body, and defaults vacancy to unknown", () => {
  const service = createService();
  assert.throws(() => service.addManualJob({ title: "产品运营" }));
  const saved = service.addManualJob(jd());
  assert.equal(saved.job.vacancyStatus, "unknown");
  assert.equal(saved.evidence.verification, "unverified");
  assert.equal(saved.evidence.excerpt, saved.job.rawJd);
});

test("manual retrieval records missing identity and company sources as coverage", () => {
  const result = createService().createResearchRun(intent());
  assert.equal(result.bundle.companies.length, 0);
  assert.ok(result.bundle.coverage.some((entry) => entry.topic === "company_identity" && entry.status === "no_result"));
  assert.ok(result.bundle.coverage.some((entry) => entry.status === "not_connected"));
});

test("live mode does not silently fall back to demo or manual evidence", () => {
  const sample = demoSample();
  const result = createService().createResearchRun({ ...sample.intent, mode: "live" });
  assert.equal(result.run.status, "partial");
  assert.equal(result.bundle.jobs.length, 0);
  assert.equal(result.bundle.evidence.length, 0);
  assert.equal(result.bundle.coverage[0].status, "not_connected");
});

test("manual evidence rejects empty excerpts and malformed source URLs", () => {
  const service = createService();
  const { job } = service.addManualJob(jd());
  const material = { projectId: "p1", jobId: job.jobId, scope: "job", sourceType: "user_material", title: "官方公示", excerpt: "材料片段" };
  assert.throws(() => service.addEvidence({ ...material, url: "javascript:alert(1)" }));
  assert.throws(() => service.addEvidence({ ...material, excerpt: "  " }));
});

test("salary and date input reject coercion, impossible values and unsupported URLs", () => {
  for (const fields of [{ salaryMin: -1 }, { salaryMin: 20, salaryMax: 10 }, { salaryMonths: "13" }, { salaryMonths: 1.5 }, { publishedAt: "2026-02-30T00:00:00Z" }, { publishedAt: "nonsense" }, { sourceUrl: "file:///secret" }, { sourceUrl: "https://user:pass@example.org" }, { sourceUrl: "invalid" }]) {
    assert.equal(manualJobSchema.safeParse({ ...jd(), ...fields }).success, false);
  }
  const parsed = manualJobSchema.parse({ ...jd(), salaryMin: 0, salaryMonths: 13 });
  assert.equal(parsed.salaryMin, 0); assert.equal(parsed.salaryMonths, 13); assert.equal(parsed.salaryBasis, "unknown");
});

test("submitted company and stable JD evidence persist; same-name ads stay separate", () => {
  const service = createService(); const saved = service.addManualJob(jd());
  assert.equal(service.addManualJob(jd()).duplicate, true);
  const second = service.addManualJob({ ...jd(), title: "另一岗位" });
  assert.notEqual(saved.job.companyId, second.job.companyId);
  const { bundle, run } = service.createResearchRun(intent());
  assert.equal(bundle.companies.length, 2); assert.equal(bundle.companies[0].identityStatus, "unresolved");
  assert.ok(bundle.evidence.some(e => e.evidenceId === saved.evidence.evidenceId && e.retrievedAt === saved.evidence.retrievedAt));
  assert.equal(run.status, "partial"); assert.deepEqual(validateBundleReferences(bundle), []);
});

test("materials are saved; contradictory statements remain conflicting; snapshots are immutable", () => {
  const service = createService(); const { job } = service.addManualJob(jd());
  const first = service.createResearchRun(intent());
  const evidence = service.addEvidence({ projectId: "p1", jobId: job.jobId, scope: "job", sourceType: "interview_feedback", title: "测试反馈", excerpt: "销售KPI：无" });
  const next = service.createResearchRun({ ...intent(), revision: 2 });
  assert.equal(next.bundle.facts[0].status, "conflicting"); assert.equal(next.bundle.facts[0].value, null);
  assert.ok(next.bundle.facts[0].evidenceIds.includes(evidence.evidenceId));
  next.bundle.evidence.length = 0; next.run.intentSnapshot.cities.push("changed");
  assert.equal(service.getBundle("p1", next.bundle.bundleId)?.evidence.length, 2);
  assert.deepEqual(service.getRun("p1", next.run.runId)?.intentSnapshot.cities, []);
  assert.equal(service.getBundle("p1", first.bundle.bundleId)?.facts[0].status, "supported");
});

test("project data, snapshots, identity and evidence never cross project boundaries", () => {
  const service = createService(); const { job } = service.addManualJob(jd());
  const { bundle, run } = service.createResearchRun(intent());
  assert.equal(service.listManualJobs("p2").length, 0);
  assert.equal(service.getBundle("p2", bundle.bundleId), null); assert.equal(service.getRun("p2", run.runId), null);
  assert.throws(() => service.selectIdentity({ projectId: "p2", companyId: job.companyId, selectedLegalName: jd().companyName }));
  assert.throws(() => service.addEvidence({ projectId: "p2", jobId: job.jobId, scope: "job", title: "跨项目", excerpt: "销售KPI：无", sourceType: "user_material" }));
});

test("explicit unknowns survive filtering; closed jobs excluded and stale open jobs downgraded", () => {
  const service = createService();
  const stale = service.addManualJob({ ...jd(), vacancyStatus: "open", publishedAt: "2026-01-01T00:00:00Z" });
  const closed = service.addManualJob({ ...jd(), title: "关闭岗位", vacancyStatus: "closed" });
  const result = service.createResearchRun({ ...intent(), cities: ["上海"], roleTypes: ["product_operations"] });
  assert.equal(result.bundle.jobs.length, 1); assert.equal(result.bundle.jobs[0].jobId, stale.job.jobId);
  assert.equal(result.bundle.jobs[0].vacancyStatus, "unknown");
  assert.equal(result.run.decisions.find(d => d.jobId === closed.job.jobId)?.included, false);
  assert.ok(result.bundle.companies.some(c => c.companyId === closed.job.companyId));
});

test("anonymous, related-company and historical legal material cannot become job or company facts", () => {
  const service = createService(); const { job } = service.addManualJob({ ...jd(), rawJd: "岗位描述，职责比例未知" });
  for (const [scope, sourceType, excerpt] of [["job", "public_discussion", "销售KPI：有"], ["company", "official_record", "2020年异常，2021年已移出"], ["team", "user_material", "销售KPI：有"]]) {
    service.addEvidence({ projectId: "p1", companyId: job.companyId, ...(scope === "job" ? { jobId: job.jobId } : {}), scope, sourceType, title: "测试资料", excerpt });
  }
  const { bundle } = service.createResearchRun(intent());
  assert.equal(bundle.facts.length, 0); assert.equal(bundle.evidence.length, 4);
});

test("identity selection does not verify entity and cannot transfer old-company material", () => {
  const service = createService(); const a = service.addManualJob(jd()); const b = service.addManualJob({ ...jd(), title: "另一岗位" });
  const old = service.addEvidence({ projectId: "p1", jobId: a.job.jobId, scope: "job", title: "旧主体资料", sourceType: "user_material", excerpt: "销售KPI：无" });
  const selection = service.selectIdentity({ projectId: "p1", companyId: b.job.companyId, selectedLegalName: jd().companyName, jobId: a.job.jobId });
  assert.equal(selection.identityStatus, "unresolved");
  const { bundle } = service.createResearchRun(intent());
  assert.ok(!bundle.evidence.some(e => e.evidenceId === old.evidenceId)); assert.deepEqual(validateBundleReferences(bundle), []);
});

test("module API fails closed without shared authentication; checks all object reads and writes", async () => {
  const service = createService();
  const request = (path: string, method = "GET", body?: unknown, user = "alice") => new Request(`http://localhost/api/b/${path}`, { method, headers: { authorization: user }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal((await createResearchApi(service)(request("jobs?projectId=p1"))).status, 503);
  const api = createResearchApi(service, { authenticate: async r => r.headers.get("authorization") ? { userId: r.headers.get("authorization")! } : null, getProject: async projectId => ({ projectId, ownerId: projectId === "p1" ? "alice" : "bob", mode: "manual" }) });
  assert.equal((await api(request("jobs?projectId=p1", "GET", undefined, ""))).status, 401);
  for (const [path, method] of [["jobs", "POST"], ["evidence", "POST"], ["identity-selection", "PUT"], ["search", "POST"]]) assert.equal((await api(request(path, method, { projectId: "p1" }, "bob"))).status, 403);
  assert.equal((await api(request("jobs", "POST", jd()))).status, 201);
  const searched = await api(request("search", "POST", intent())); assert.equal(searched.status, 202); const run = await searched.json();
  for (const path of [`runs/${run.runId}`, `bundles/${run.bundleId}`, `bundles/${run.bundleId}/export`, "company-candidates", "jobs"]) {
    assert.equal((await api(request(`${path}?projectId=p1`, "GET", undefined, "bob"))).status, 403);
  }
  assert.equal((await api(request(`bundles/${run.bundleId}?projectId=p2`, "GET", undefined, "bob"))).status, 404);
  const read = await api(request(`bundles/${run.bundleId}?projectId=p1`));
  const exported = await api(request(`bundles/${run.bundleId}/export?projectId=p1`));
  assert.deepEqual(await read.json(), await exported.json()); assert.equal(exported.headers.get("cache-control"), "no-store");
});

test("legacy local candidate lookup and identity selection keep project boundaries", () => {
  const previousMode = process.env.XRAY_B_LOCAL_MODE;
  const previousProject = process.env.XRAY_B_LOCAL_PROJECT;
  const previousEnvironment = process.env.NODE_ENV;
  const projectId = "b-local-boundary-test";
  try {
    Reflect.set(process.env, "NODE_ENV", "development");
    process.env.XRAY_B_LOCAL_MODE = "1";
    process.env.XRAY_B_LOCAL_PROJECT = projectId;
    const first = addLocalJob({ ...jd(projectId), title: "本地岗位一" });
    const second = addLocalJob({ ...jd(projectId), title: "本地岗位二" });
    const candidates = localCandidates("测试同名", projectId).candidates;
    assert.equal(candidates.length, 2);
    assert.ok(candidates.some(company => company.companyId === first.job.companyId));
    const selected = selectLocalIdentity(second.job.companyId!, jd().companyName, projectId, first.job.jobId);
    assert.equal(selected.status, "user_selected_unverified");
    assert.equal(selected.identityStatus, "unresolved");
    // Duplicate submission returns the same stored job, including its selected entity.
    assert.equal(addLocalJob({ ...jd(projectId), title: "本地岗位一" }).job.companyId, second.job.companyId);
    assert.throws(() => localCandidates("测试同名", "another-project"), { code: "FORBIDDEN" });
    assert.throws(() => selectLocalIdentity(second.job.companyId!, jd().companyName, "another-project"), { code: "FORBIDDEN" });
    process.env.XRAY_B_LOCAL_MODE = "0";
    assert.throws(() => localCandidates("测试同名", projectId), { code: "NOT_CONFIGURED" });
    assert.throws(() => selectLocalIdentity(second.job.companyId!, jd().companyName, projectId), { code: "NOT_CONFIGURED" });
    process.env.XRAY_B_LOCAL_MODE = "1";
    Reflect.set(process.env, "NODE_ENV", "production");
    assert.throws(() => localCandidates("测试同名", projectId), { code: "NOT_CONFIGURED" });
    assert.throws(() => selectLocalIdentity(second.job.companyId!, jd().companyName, projectId), { code: "NOT_CONFIGURED" });
  } finally {
    for (const [key, value] of [["XRAY_B_LOCAL_MODE", previousMode], ["XRAY_B_LOCAL_PROJECT", previousProject], ["NODE_ENV", previousEnvironment]]) {
      if (value === undefined) delete process.env[key!];
      else process.env[key!] = value;
    }
  }
});
