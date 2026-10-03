import { z } from "zod";

export const modeSchema = z.enum(["demo", "manual", "live"]);
export const factStatusSchema = z.enum(["supported", "contradicted", "unknown", "conflicting"]);
export const searchIntentSchema = z.object({
  schemaVersion: z.literal("1.0.0"), intentId: z.string().min(1), revision: z.number().int().positive(),
  projectId: z.string().min(1), profileId: z.string().min(1), profileRevision: z.number().int().positive(),
  mode: modeSchema, industryTags: z.array(z.string()), industryCodes: z.array(z.string()),
  roleTypes: z.array(z.string()), cities: z.array(z.string()),
  filters: z.array(z.object({ key: z.string(), value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]), strength: z.enum(["hard", "soft", "unknown"]) })),
  maxCandidates: z.number().int().positive()
});

const salarySchema = z.object({ currency: z.string(), min: z.number().nullable(), max: z.number().nullable(), period: z.enum(["month", "year", "unknown"]), basis: z.enum(["fixed", "total", "unknown"]), taxBasis: z.enum(["pre_tax", "after_tax", "unknown"]), months: z.number().nullable() });
export const evidenceTopicSchema=z.enum(['growth','pay','hours','benefits','culture','position','company']);
export const candidateBundleSchema = z.object({
  schemaVersion: z.literal("1.0.0"), bundleId: z.string(), projectId: z.string(), intentId: z.string(), intentRevision: z.number().int(), mode: modeSchema, retrievedAt: z.string().datetime({ offset: true }),
  companies: z.array(z.object({ companyId: z.string(), legalName: z.string(), creditCode: z.string().nullable(), brandName: z.string().nullable(), identityStatus: z.enum(["confirmed", "ambiguous", "unresolved"]) })),
  jobs: z.array(z.object({ jobId: z.string(), companyId: z.string().nullable(), title: z.string(), rawJd: z.string(), city: z.string().nullable(), sourceUrl: z.string().url().nullable(), publishedAt: z.string().nullable(), vacancyStatus: z.enum(["open", "closed", "unknown"]), salary: salarySchema })),
  evidence: z.array(z.object({ evidenceId: z.string(), companyId: z.string().nullable(), jobId: z.string().nullable(), scope: z.enum(["company", "business", "team", "job"]), sourceType: z.string(), title: z.string(), url: z.string().url().nullable(), publishedAt: z.string().nullable(), retrievedAt: z.string().datetime({ offset: true }), excerpt: z.string(), searchTopics:z.array(evidenceTopicSchema).optional(),topicClassifierVersion:z.string().optional(),topicLinks:z.array(z.object({topicId:evidenceTopicSchema,detailIds:z.array(z.string()),quotes:z.array(z.string())})).optional(), mode: modeSchema, verification: z.enum(["verified", "unverified", "disputed"]) })),
  facts: z.array(z.object({ factId: z.string(), companyId: z.string().nullable(), jobId: z.string().nullable(), key: z.string(), value: z.union([z.string(), z.number(), z.boolean(), z.null()]), status: factStatusSchema, evidenceIds: z.array(z.string()), asOf: z.string().nullable() })),
  coverage: z.array(z.object({ companyId: z.string().nullable(), jobId: z.string().nullable(), topic: z.string(), status: z.enum(["available", "not_connected", "unavailable", "no_result", "not_public"]), reason: z.string(), checkedAt: z.string().datetime({ offset: true }) })),
  usage: z.array(z.object({ provider: z.string(), requestId: z.string(), costMinor: z.number().int().nullable() }))
});

export type SearchIntent = z.infer<typeof searchIntentSchema>;
export type CandidateBundle = z.infer<typeof candidateBundleSchema>;
export type Job = CandidateBundle["jobs"][number];

export const userProfileSchema = z.object({
  schemaVersion: z.literal("1.0.0"), profileId: z.string().min(1), revision: z.number().int().positive(),
  projectId: z.string().min(1), mode: modeSchema, confirmedAt: z.string().datetime({ offset: true }).nullable(),
  assessment: z.object({ instrumentId: z.string(), version: z.string(), scores: z.record(z.string(), z.number().nullable()), interpretation: z.string(), status: z.enum(["draft", "confirmed"]), validation: z.enum(["prototype", "validated"]) }),
  background: z.object({ education: z.string().nullable(), major: z.string().nullable(), skills: z.array(z.string()), experiences: z.array(z.object({ text: z.string(), source: z.enum(["user", "resume"]), confirmed: z.boolean() })) }),
  goals: z.array(z.string()),
  preferences: z.array(z.object({ key: z.string(), value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]), strength: z.enum(["hard", "soft", "unknown"]), confirmed: z.boolean() }))
});

export const matchReportSchema = z.object({
  schemaVersion: z.literal("1.0.0"), reportId: z.string(), version: z.number().int().positive(), projectId: z.string(),
  profileId: z.string(), profileRevision: z.number().int().positive(), bundleId: z.string(), mode: modeSchema,
  generatedAt: z.string().datetime({ offset: true }), completeness: z.enum(["complete_for_scope", "partial"]),
  results: z.array(z.object({
    jobId: z.string(), recommendation: z.enum(["hold", "verify_first", "deprioritize", "explore", "insufficient"]),
    reasons: z.array(z.object({ text: z.string(), kind: z.enum(["fact", "inference", "unknown"]), factIds: z.array(z.string()) })),
    constraints: z.array(z.object({ key: z.string(), result: z.enum(["pass", "fail", "unknown"]), factIds: z.array(z.string()) })),
    dimensions: z.array(z.object({ key: z.enum(["identity_credit", "business", "role_clarity", "career_value", "personal_fit"]), summary: z.string(), status: factStatusSchema, factIds: z.array(z.string()) })),
    questions: z.array(z.object({ text: z.string(), priority: z.enum(["must", "optional"]), resolves: z.array(z.string()) }))
  })),
  evidenceSnapshot: candidateBundleSchema.shape.evidence, factsSnapshot: candidateBundleSchema.shape.facts,
  coverageSnapshot: candidateBundleSchema.shape.coverage, ruleVersion: z.string(), promptVersion: z.string()
});

export type UserProfile = z.infer<typeof userProfileSchema>;
export type MatchReport = z.infer<typeof matchReportSchema>;
export type Mode = z.infer<typeof modeSchema>;
export const SCHEMA_VERSION = "1.0.0" as const;
export const constraintKeys = ["city", "min_fixed_monthly_salary", "accept_sales_kpi", "accept_travel", "accept_outsourcing"] as const;

export function validateBundleReferences(bundle: CandidateBundle): string[] {
  const errors: string[] = [];
  const companies = new Set(bundle.companies.map(x => x.companyId));
  const jobs = new Map(bundle.jobs.map(x => [x.jobId, x]));
  const evidence = new Map(bundle.evidence.map(x => [x.evidenceId, x]));
  for (const collection of [bundle.companies.map(x => x.companyId), bundle.jobs.map(x => x.jobId), bundle.evidence.map(x => x.evidenceId), bundle.facts.map(x => x.factId)]) {
    if (new Set(collection).size !== collection.length) errors.push("Duplicate ID");
  }
  for (const item of [...bundle.jobs, ...bundle.evidence, ...bundle.facts, ...bundle.coverage]) {
    if (item.companyId && !companies.has(item.companyId)) errors.push(`Unknown company: ${item.companyId}`);
    if ("jobId" in item && item.jobId && !jobs.has(item.jobId)) errors.push(`Unknown job: ${item.jobId}`);
    if ("jobId" in item && item.jobId && item.companyId && jobs.get(item.jobId)?.companyId !== item.companyId) errors.push("Job/company scope mismatch");
  }
  for (const item of bundle.evidence) {
    if (bundle.mode !== "demo" && item.mode === "demo") errors.push("Demo evidence in real bundle");
  }
  for (const fact of bundle.facts) {
    if (fact.status !== "unknown" && !fact.evidenceIds.length) errors.push(`Unsupported fact: ${fact.factId}`);
    for (const id of fact.evidenceIds) {
      const source = evidence.get(id);
      if (!source) errors.push(`Unknown evidence: ${id}`);
      else if (source.companyId !== fact.companyId || (fact.jobId && source.jobId !== fact.jobId)) errors.push(`Evidence scope mismatch: ${id}`);
    }
  }
  return errors;
}

export function validateIntegration(profile: UserProfile, intent: SearchIntent, bundle: CandidateBundle): string[] {
  const errors = validateBundleReferences(bundle);
  if (profile.projectId !== intent.projectId || intent.projectId !== bundle.projectId) errors.push("Project mismatch");
  if (profile.profileId !== intent.profileId || profile.revision !== intent.profileRevision) errors.push("Profile revision mismatch");
  if (intent.intentId !== bundle.intentId || intent.revision !== bundle.intentRevision) errors.push("Intent revision mismatch");
  if (profile.mode !== intent.mode || intent.mode !== bundle.mode) errors.push("Mode mismatch");
  if (!profile.confirmedAt || profile.assessment.status !== "confirmed") errors.push("Profile not confirmed");
  return errors;
}

export function validateReportReferences(report: MatchReport, bundle: CandidateBundle): string[] {
  const errors: string[] = [];
  const jobs = new Set(bundle.jobs.map(x => x.jobId));
  const facts = new Map(bundle.facts.map(x => [x.factId, x]));
  if (report.bundleId !== bundle.bundleId || report.projectId !== bundle.projectId || report.mode !== bundle.mode) errors.push("Report/bundle mismatch");
  if (JSON.stringify(report.evidenceSnapshot) !== JSON.stringify(bundle.evidence) || JSON.stringify(report.factsSnapshot) !== JSON.stringify(bundle.facts) || JSON.stringify(report.coverageSnapshot) !== JSON.stringify(bundle.coverage)) errors.push("Snapshot mismatch");
  for (const result of report.results) {
    if (!jobs.has(result.jobId)) errors.push(`Unknown result job: ${result.jobId}`);
    const dimensions = new Set(result.dimensions.map(x => x.key));
    if (dimensions.size !== 5 || result.dimensions.length !== 5) errors.push("Five unique dimensions required");
    for (const reason of result.reasons) if (reason.kind === "fact" && !reason.factIds.length) errors.push("Fact reason requires citations");
    for (const item of [...result.reasons, ...result.constraints, ...result.dimensions]) {
      for (const id of item.factIds) {
        const fact = facts.get(id);
        if (!fact) errors.push(`Unknown report fact: ${id}`);
        else if (fact.jobId && fact.jobId !== result.jobId) errors.push(`Report fact/job mismatch: ${id}`);
        else if (fact.companyId && bundle.jobs.find(job => job.jobId === result.jobId)?.companyId !== fact.companyId) errors.push(`Report fact/company mismatch: ${id}`);
      }
    }
  }
  return errors;
}
