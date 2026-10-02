import { randomUUID } from "node:crypto";
import demoIntent from "./fixtures/search-intent.json";
import demoBundle from "./fixtures/candidate-bundle.json";
import { candidateBundleSchema, searchIntentSchema, validateBundleReferences, type CandidateBundle, type Job, type SearchIntent } from "./contract";
import { RuntimeError } from "../../packages/runtime";
import { manualJobSchema, materialSchema, identitySchema, projectIdSchema } from "./inputs";
import { deduplicateEvidence, extractJobFacts, fingerprint, materialKey } from "./evidence";

type Company = CandidateBundle["companies"][number];
type Evidence = CandidateBundle["evidence"][number];
type StoredJob = { job: Job; evidence: Evidence; signature: string; industryTags: string[]; industryCodes: string[]; roleTypes: string[]; createdAt: string };
export type SearchDecision = { jobId: string; included: boolean; reasons: string[] };
export type ResearchRun = { runId: string; projectId: string; status: "completed" | "partial"; stage: "snapshot_saved"; createdAt: string; bundleId: string; intentRevision: number; intentSnapshot: SearchIntent; decisions: SearchDecision[]; warnings: string[]; cost: { knownCostMinor: number; hasUnknown: boolean; externalCalls: number } };
type ProjectData = { jobs: StoredJob[]; companies: Company[]; materials: Evidence[]; selections: Map<string, string>; runs: Map<string, ResearchRun>; bundles: Map<string, CandidateBundle> };
const clone = <T,>(value: T): T => structuredClone(value);
const id = (prefix: string) => `${prefix}-${randomUUID()}`;
const normalized = (value: string) => value.normalize("NFKC").trim().toLowerCase();
const topicList = ["company_identity", "business", "business_financials", "credit_legal", "work_conditions", "team_growth"];
export function demoSample() { return { intent: searchIntentSchema.parse(demoIntent), bundle: candidateBundleSchema.parse(demoBundle) }; }

export class ResearchService {
  private projects = new Map<string, ProjectData>();
  constructor(private clock: () => Date = () => new Date(), private staleDays = 30) {
    if (!Number.isFinite(staleDays) || staleDays < 1) throw new Error("Invalid freshness policy");
  }
  private project(projectId: string) {
    projectIdSchema.parse(projectId);
    let project = this.projects.get(projectId);
    if (!project) {
      if (this.projects.size >= 100) throw new RuntimeError("CAPACITY_REACHED", "本地原型项目容量已满", 429);
      project = { jobs: [], companies: [], materials: [], selections: new Map(), runs: new Map(), bundles: new Map() };
      this.projects.set(projectId, project);
    }
    return project;
  }
  addManualJob(raw: unknown) {
    const input = manualJobSchema.parse(raw); const project = this.project(input.projectId);
    const signature = fingerprint(input);
    const existing = project.jobs.find(row => row.signature === signature);
    if (existing) return clone({ job: existing.job, evidence: existing.evidence, duplicate: true });
    if (project.jobs.length >= 300) throw new RuntimeError("CAPACITY_REACHED", "本地项目最多保存 300 条 JD", 429);
    const now = this.clock().toISOString();
    // Names are leads; two ads with the same name need not share a legal entity.
    const company: Company | null = input.companyName ? { companyId: id("company"), legalName: input.companyName, creditCode: null, brandName: null, identityStatus: "unresolved" } : null;
    const job: Job = { jobId: id("job"), companyId: company?.companyId ?? null, title: input.title, rawJd: input.rawJd, city: input.city, sourceUrl: input.sourceUrl, publishedAt: input.publishedAt, vacancyStatus: input.vacancyStatus, salary: { currency: input.currency, min: input.salaryMin, max: input.salaryMax, period: input.salaryPeriod, basis: input.salaryBasis, taxBasis: input.taxBasis, months: input.salaryMonths } };
    const evidence: Evidence = { evidenceId: id("evidence"), companyId: job.companyId, jobId: job.jobId, scope: "job", sourceType: "user_submitted_jd", title: input.sourceTitle, url: job.sourceUrl, publishedAt: job.publishedAt, retrievedAt: now, excerpt: job.rawJd, mode: "manual", verification: "unverified" };
    if (company) project.companies.push(company);
    project.jobs.unshift({ job, evidence, signature, createdAt: now, industryTags: input.industryTags, industryCodes: input.industryCodes, roleTypes: input.roleTypes });
    return clone({ job, evidence, duplicate: false });
  }
  addEvidence(raw: unknown) {
    const input = materialSchema.parse(raw); const project = this.project(input.projectId);
    const job = input.jobId ? project.jobs.find(row => row.job.jobId === input.jobId)?.job : null;
    const companyId = input.companyId ?? job?.companyId ?? null;
    if (input.jobId && !job || companyId && !project.companies.some(c => c.companyId === companyId)) throw new RuntimeError("NOT_FOUND", "当前项目不存在该岗位或主体", 404);
    if (job && job.companyId !== companyId) throw new RuntimeError("SCOPE_MISMATCH", "材料与岗位主体不一致", 422);
    if (input.scope === "job" && !job || input.scope !== "job" && (!companyId || input.jobId)) throw new RuntimeError("SCOPE_MISMATCH", "岗位材料须关联岗位；公司/业务/团队材料须仅关联主体", 422);
    const { projectId: _projectId, ...fields } = input;
    const evidence: Evidence = { ...fields, companyId, evidenceId: id("evidence"), retrievedAt: this.clock().toISOString(), mode: "manual", verification: "unverified" };
    const existing = project.materials.find(item => materialKey(item) === materialKey(evidence));
    if (existing) return clone({ ...existing, duplicate: true });
    if (project.materials.length >= 1000) throw new RuntimeError("CAPACITY_REACHED", "本地项目材料容量已满", 429);
    project.materials.push(evidence); return clone({ ...evidence, duplicate: false });
  }
  listManualJobs(projectId: string) { return clone(this.project(projectId).jobs.map(row => row.job)); }
  companyCandidates(projectId: string, name = "") {
    return { candidates: clone(this.project(projectId).companies.filter(c => !name || normalized(c.legalName).includes(normalized(name)))), status: "unresolved", note: "仅列出本项目已录入名称；未查询工商，同名不代表同主体。" };
  }
  selectIdentity(raw: unknown) {
    const input = identitySchema.parse(raw); const project = this.project(input.projectId);
    const company = project.companies.find(c => c.companyId === input.companyId);
    if (!company) throw new RuntimeError("NOT_FOUND", "当前项目不存在该主体", 404);
    if (company.legalName !== input.selectedLegalName) throw new RuntimeError("IDENTITY_MISMATCH", "选择名称必须与候选主体一致", 422);
    if (input.jobId) {
      const row = project.jobs.find(row => row.job.jobId === input.jobId);
      if (!row) throw new RuntimeError("NOT_FOUND", "当前项目不存在该岗位", 404);
      row.job.companyId = company.companyId; row.evidence.companyId = company.companyId;
      // Old-company materials stay stored, but are not transferred to this entity.
    }
    project.selections.set(company.companyId, input.selectedLegalName);
    return { companyId: company.companyId, selectedLegalName: input.selectedLegalName, status: "user_selected_unverified", identityStatus: company.identityStatus };
  }
  createResearchRun(raw: unknown) {
    const intent = searchIntentSchema.parse(raw); const project = this.project(intent.projectId);
    if (project.runs.size >= 100) throw new RuntimeError("CAPACITY_REACHED", "本地项目达到 100 个快照上限；请导出备份", 429);
    const now = this.clock().toISOString();
    const bundle: CandidateBundle = { schemaVersion: "1.0.0", bundleId: id("bundle"), projectId: intent.projectId, intentId: intent.intentId, intentRevision: intent.revision, mode: intent.mode, retrievedAt: now, companies: [], jobs: [], evidence: [], facts: [], coverage: [], usage: [] };
    const warnings: string[] = []; const decisions: SearchDecision[] = [];
    const cover = (topic: string, status: CandidateBundle["coverage"][number]["status"], reason: string, companyId: string | null = null, jobId: string | null = null) => bundle.coverage.push({ companyId, jobId, topic, status, reason, checkedAt: now });
    if (intent.mode === "live") {
      cover("job_search", "not_connected", "招聘和企业 provider 未授权配置；未执行外部检索，不回退演示数据。"); warnings.push("LIVE 数据源未接入");
    } else {
      const demo = demoSample().bundle;
      const rows: StoredJob[] = intent.mode === "demo" ? demo.jobs.map(job => ({ job, evidence: demo.evidence.find(e => e.jobId === job.jobId)!, signature: job.jobId, industryTags: demoIntent.industryTags, industryCodes: demoIntent.industryCodes, roleTypes: demoIntent.roleTypes, createdAt: demo.retrievedAt })) : project.jobs;
      const selected: StoredJob[] = [];
      for (const row of [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.job.jobId.localeCompare(b.job.jobId))) {
        const decision = evaluateCandidate(row, intent);
        if (decision.included && selected.length >= intent.maxCandidates) { decision.included = false; decision.reasons.push("达到数量上限，按采集时间排序；非适配评分"); }
        if (decision.included) selected.push(row); decisions.push(decision);
      }
      bundle.jobs = selected.map(row => {
        const job = clone(row.job); const date = job.publishedAt ? Date.parse(job.publishedAt) : NaN;
        if (job.vacancyStatus === "open" && (!Number.isFinite(date) || date > this.clock().getTime() || this.clock().getTime() - date > this.staleDays * 86400000)) {
          job.vacancyStatus = "unknown";
          cover("vacancy_freshness", "unavailable", `发布日期未知、未来或超过 ${this.staleDays} 天；需重新确认在招，未推定已关闭。`, job.companyId, job.jobId);
        }
        return job;
      });
      const jobIds = new Set(bundle.jobs.map(job => job.jobId)); const companyIds = new Set(bundle.jobs.map(job => job.companyId).filter(Boolean));
      const companies = intent.mode === "demo" ? demo.companies : project.companies;
      const relevant = companies.filter(company => companyIds.has(company.companyId));
      const watch = companies.filter(company => !companyIds.has(company.companyId) && !rows.some(row => row.job.companyId === company.companyId && row.job.vacancyStatus !== "closed"));
      bundle.companies = clone([...relevant, ...watch.slice(0, 30)]);
      const exportedCompanies = new Set(bundle.companies.map(company => company.companyId));
      const materials = project.materials.filter(item => item.jobId ? jobIds.has(item.jobId) && bundle.jobs.find(job => job.jobId === item.jobId)?.companyId === item.companyId : item.companyId && exportedCompanies.has(item.companyId));
      bundle.evidence = deduplicateEvidence(clone([...selected.map(row => row.evidence), ...(intent.mode === "demo" ? [] : materials)]));
      bundle.facts = intent.mode === "demo" ? clone(demo.facts.filter(fact => !fact.jobId || jobIds.has(fact.jobId))) : extractJobFacts(bundle.evidence);
      cover("job_search", selected.length ? "available" : "no_result", intent.mode === "demo" ? "仅检索明确标注的合成演示样例。" : `仅检索本项目人工池（${rows.length} 条），不代表全市场；未知条件保留。`);
      if (intent.filters.length) warnings.push("个性化硬/软偏好交由 C 判断；B 不以销售偏好或薪资目标隐藏候选。");
      for (const job of bundle.jobs) cover("job_description", "available", "已保存原始 JD，人工材料未经独立核验。", job.companyId, job.jobId);
      for (const company of bundle.companies) for (const topic of topicList) cover(topic, topic === "company_identity" ? "unavailable" : "not_connected", topic === "company_identity" ? (intent.mode === "demo" ? "合成身份仅用于演示。" : `${project.selections.has(company.companyId) ? "用户已选择候选；" : ""}名称仅为线索，法人/品牌/招聘及签约关系未核验，暂停公司事实汇总。`) : "未连接授权主题数据源；人工片段仅作材料，未知不等于安全。", company.companyId);
      if (!bundle.companies.length) for (const topic of topicList) cover(topic, topic === "company_identity" ? "no_result" : "not_connected", "没有已关联公司主体或获授权调查源。");
    }
    const valid = candidateBundleSchema.parse(bundle);
    if (validateBundleReferences(valid).length) throw new RuntimeError("INVALID_REFERENCES", "快照引用或主体边界校验失败", 422);
    const run: ResearchRun = { runId: id("run"), projectId: intent.projectId, status: valid.jobs.length && valid.coverage.every(row => row.status === "available") ? "completed" : "partial", stage: "snapshot_saved", createdAt: now, bundleId: valid.bundleId, intentRevision: intent.revision, intentSnapshot: clone(intent), decisions, warnings, cost: { knownCostMinor: 0, hasUnknown: false, externalCalls: 0 } };
    project.bundles.set(valid.bundleId, clone(valid)); project.runs.set(run.runId, clone(run)); return clone({ run, bundle: valid });
  }
  getRun(projectId: string, runId: string) { return clone(this.projects.get(projectId)?.runs.get(runId) ?? null); }
  getBundle(projectId: string, bundleId: string) { return clone(this.projects.get(projectId)?.bundles.get(bundleId) ?? null); }
}
function evaluateCandidate(row: StoredJob, intent: SearchIntent): SearchDecision {
  const reasons: string[] = []; let included = true;
  if (row.job.vacancyStatus === "closed") { included = false; reasons.push("来源标注已关闭，不列入职位结果"); }
  if (intent.cities.length) {
    if (!row.job.city) reasons.push("城市未知，保留待核验");
    else if (!intent.cities.some(city => normalized(city).replace(/市$/u, "") === normalized(row.job.city!).replace(/市$/u, ""))) { included = false; reasons.push("来源城市与检索城市不一致"); }
    else reasons.push("城市符合检索条件（用户录入）");
  }
  for (const [label, wanted, actual] of [["岗位类型", intent.roleTypes, row.roleTypes], ["行业标签", intent.industryTags, row.industryTags], ["行业代码", intent.industryCodes, row.industryCodes]] as const) {
    if (!wanted.length) continue;
    if (!actual.length) reasons.push(`${label}未标注，保留待核验`);
    else if (label === "岗位类型" && !actual.some(value => wanted.includes(value))) { included = false; reasons.push(`${label}与来源标签不一致`); }
    else if (actual.some(value => wanted.includes(value))) reasons.push(`${label}有相同来源标签`);
    else reasons.push(`${label}未匹配；分类多对多且版本未确认，保留待核验`);
  }
  return { jobId: row.job.jobId, included, reasons: reasons.length ? reasons : ["按采集时间排序；无个性化权重"] };
}
