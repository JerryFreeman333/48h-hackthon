import { randomUUID } from "node:crypto";
import demoIntent from "./fixtures/search-intent.json";
import demoBundle from "./fixtures/candidate-bundle.json";
import { candidateBundleSchema, searchIntentSchema, type CandidateBundle, type Job, type SearchIntent } from "./contract";

type Run = { runId: string; status: "completed" | "partial"; createdAt: string; bundleId: string; intentRevision: number };
const manualJobs: Job[] = [];
const runs = new Map<string, Run>();
const bundles = new Map<string, CandidateBundle>();
const identitySelections = new Map<string, string>();

export function demoSample() {
  return { intent: searchIntentSchema.parse(demoIntent), bundle: candidateBundleSchema.parse(demoBundle) };
}

export function addManualJob(input: Record<string, unknown>) {
  const now = new Date().toISOString();
  const id = `job-${randomUUID()}`;
  const job: Job = {
    jobId: id, companyId: null, title: String(input.title ?? "").trim(), rawJd: String(input.rawJd ?? "").trim(),
    city: input.city ? String(input.city).trim() : null,
    sourceUrl: input.sourceUrl ? String(input.sourceUrl).trim() : null,
    publishedAt: input.publishedAt ? String(input.publishedAt) : null,
    vacancyStatus: input.vacancyStatus === "open" || input.vacancyStatus === "closed" ? input.vacancyStatus : "unknown",
    salary: {
      currency: typeof input.currency === "string" && input.currency ? input.currency : "CNY",
      min: typeof input.salaryMin === "number" ? input.salaryMin : null,
      max: typeof input.salaryMax === "number" ? input.salaryMax : null,
      period: input.salaryPeriod === "month" || input.salaryPeriod === "year" ? input.salaryPeriod : "unknown",
      basis: input.salaryBasis === "fixed" || input.salaryBasis === "total" ? input.salaryBasis : "unknown",
      taxBasis: input.taxBasis === "pre_tax" || input.taxBasis === "after_tax" ? input.taxBasis : "unknown",
      months: typeof input.salaryMonths === "number" ? input.salaryMonths : null
    }
  };
  const parsed = candidateBundleSchema.shape.jobs.element.safeParse(job);
  if (!parsed.success) throw new Error("职位字段不符合契约");
  if (!job.title || !job.rawJd) throw new Error("岗位名称和 JD 正文为必填项");
  if (job.sourceUrl && (!URL.canParse(job.sourceUrl) || !["http:", "https:"].includes(new URL(job.sourceUrl).protocol))) throw new Error("来源 URL 格式无效");
  manualJobs.unshift(job);
  return { job, companyName: String(input.companyName ?? "").trim() || null, evidence: {
    evidenceId: `evidence-${randomUUID()}`, companyId: null, jobId: id, scope: "job" as const,
    sourceType: "user_submitted_jd", title: String(input.sourceTitle ?? "用户提交 JD"), url: job.sourceUrl,
    publishedAt: job.publishedAt, retrievedAt: now, excerpt: job.rawJd, mode: "manual" as const, verification: "unverified" as const
  } };
}

export function addEvidence(input: Record<string, unknown>) {
  const excerpt = String(input.excerpt ?? "").trim();
  const title = String(input.title ?? "").trim();
  if (!excerpt || !title) throw new Error("材料标题和原文片段为必填项");
  if (input.url && (!URL.canParse(String(input.url)) || !["http:", "https:"].includes(new URL(String(input.url)).protocol))) throw new Error("来源 URL 格式无效");
  const result = candidateBundleSchema.shape.evidence.element.parse({
    evidenceId: `evidence-${randomUUID()}`, companyId: input.companyId ? String(input.companyId) : null,
    jobId: input.jobId ? String(input.jobId) : null, scope: input.scope ?? "company",
    sourceType: String(input.sourceType ?? "user_material"), title, url: input.url ? String(input.url) : null,
    publishedAt: input.publishedAt ? String(input.publishedAt) : null, retrievedAt: new Date().toISOString(),
    excerpt, mode: "manual", verification: "unverified"
  });
  return result;
}

function matches(job: Job, intent: SearchIntent) {
  if (job.vacancyStatus === "closed") return false;
  // Only the documented demo role has a local alias; A owns the real taxonomy.
  const roleTokens = intent.roleTypes.map((value) => value === "product_operations" ? "产品运营" : value.toLowerCase()).filter(Boolean);
  if (roleTokens.length && !roleTokens.some((token) => `${job.title} ${job.rawJd}`.toLowerCase().includes(token))) return false;
  if (intent.cities.length && job.city && !intent.cities.includes(job.city)) return false;
  return true;
}

export function createResearchRun(rawIntent: unknown) {
  const intent = searchIntentSchema.parse(rawIntent);
  if (intent.mode === "demo") {
    const bundle = demoSample().bundle;
    const jobs = bundle.jobs.filter((job) => matches(job, intent)).slice(0, intent.maxCandidates);
    const selected = new Set(jobs.map(job => job.jobId));
    const filtered = { ...bundle, bundleId: `bundle-${randomUUID()}`, retrievedAt: new Date().toISOString(), intentId: intent.intentId, intentRevision: intent.revision, projectId: intent.projectId, jobs,
      evidence: bundle.evidence.filter(item => !item.jobId || selected.has(item.jobId)),
      facts: bundle.facts.filter(item => !item.jobId || selected.has(item.jobId)) };
    const checked = candidateBundleSchema.parse(filtered);
    return saveRun(checked, intent);
  }
  if (intent.mode === "live") {
    const bundle: CandidateBundle = {
      schemaVersion: "1.0.0", bundleId: `bundle-${randomUUID()}`, projectId: intent.projectId,
      intentId: intent.intentId, intentRevision: intent.revision, mode: "live", retrievedAt: new Date().toISOString(),
      companies: [], jobs: [], evidence: [], facts: [],
      coverage: [{ companyId: null, jobId: null, topic: "job_search", status: "not_connected", reason: "尚未配置获授权的招聘或企业数据 provider；未执行外部检索。", checkedAt: new Date().toISOString() }], usage: []
    };
    return saveRun(bundle, intent, "partial");
  }
  const matched = manualJobs.filter((job) => matches(job, intent)).slice(0, intent.maxCandidates);
  const bundle: CandidateBundle = {
    schemaVersion: "1.0.0", bundleId: `bundle-${randomUUID()}`, projectId: intent.projectId,
    intentId: intent.intentId, intentRevision: intent.revision, mode: "manual", retrievedAt: new Date().toISOString(),
    companies: [], jobs: matched, evidence: matched.map((job) => ({ evidenceId: `evidence-${job.jobId}`, companyId: null, jobId: job.jobId, scope: "job", sourceType: "user_submitted_jd", title: "用户提交 JD", url: job.sourceUrl, publishedAt: job.publishedAt, retrievedAt: new Date().toISOString(), excerpt: job.rawJd, mode: "manual", verification: "unverified" })),
    facts: [], coverage: [{ companyId: null, jobId: null, topic: "company_identity", status: "no_result", reason: "人工职位池尚未绑定并确认法人主体。", checkedAt: new Date().toISOString() }, { companyId: null, jobId: null, topic: "company_research", status: "not_connected", reason: "公司资料数据源未接入；未将职位来源推断为公司事实。", checkedAt: new Date().toISOString() }], usage: []
  };
  return saveRun(bundle, intent, matched.length ? "completed" : "partial");
}

function saveRun(bundle: CandidateBundle, intent: SearchIntent, status: Run["status"] = "completed") {
  const valid = candidateBundleSchema.parse(bundle);
  const runId = `run-${randomUUID()}`;
  const run = { runId, status, createdAt: new Date().toISOString(), bundleId: valid.bundleId, intentRevision: intent.revision } as Run;
  runs.set(runId, run); bundles.set(valid.bundleId, valid);
  return { run, bundle: valid };
}

export function getRun(id: string) { return runs.get(id) ?? null; }
export function getBundle(id: string) { return bundles.get(id) ?? null; }
export function listManualJobs() { return [...manualJobs]; }
export function selectIdentity(companyId: string, selectedLegalName: string) { identitySelections.set(companyId, selectedLegalName); return { companyId, selectedLegalName, status: "user_selected_unverified" as const }; }
export function currentDemoBundle() { return demoSample().bundle; }
