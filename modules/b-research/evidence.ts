import { createHash } from "node:crypto";
import type { CandidateBundle } from "./contract";
type Evidence = CandidateBundle["evidence"][number];
type Fact = CandidateBundle["facts"][number];

export function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function materialKey(item: Evidence) {
  // Exact normalized copies share one source, even when reposted at another URL.
  return fingerprint([item.companyId, item.jobId, item.scope, item.sourceType === "public_discussion" ? "discussion" : "material", item.publishedAt, item.excerpt.normalize("NFKC").replace(/\s+/gu, "").toLowerCase()]);
}

export function deduplicateEvidence(items: Evidence[]) {
  const seen = new Set<string>();
  return items.filter(item => { const key = materialKey(item); if (seen.has(key)) return false; seen.add(key); return true; });
}

export function extractJobFacts(items: Evidence[]): Fact[] {
  const claims = new Map<string, { companyId: string | null; jobId: string; values: Set<boolean>; evidenceIds: string[] }>();
  for (const source of items) {
    // Anonymous and company-level material never becomes a job/company assertion.
    if (source.scope !== "job" || !source.jobId || !["user_submitted_jd", "interview_feedback", "user_material"].includes(source.sourceType)) continue;
    const values = new Set<boolean>();
    for (const sentence of source.excerpt.split(/[。；;\n]/u).map(part => part.trim()).filter(Boolean)) {
      // Deliberately narrow grammar. Unsupported paraphrases stay unknown.
      if (/^(?:销售KPI|销售指标)\s*[:：]\s*(?:无|不考核|否)$/iu.test(sentence) || /^(?:本岗位)?(?:不承担|不考核)销售(?:KPI|指标)$/iu.test(sentence)) values.add(false);
      if (/^(?:销售KPI|销售指标)\s*[:：]\s*(?:有|考核|是)$/iu.test(sentence) || /^(?:本岗位)?(?:承担|考核)销售(?:KPI|指标)$/iu.test(sentence) || /^(?:负责客户拓展[，,]\s*)?完成签单指标(?:[，,]收集产品反馈)?$/u.test(sentence)) values.add(true);
    }
    if (!values.size) continue;
    const key = JSON.stringify([source.companyId, source.jobId]);
    const claim = claims.get(key) ?? { companyId: source.companyId, jobId: source.jobId, values: new Set<boolean>(), evidenceIds: [] };
    for (const value of values) claim.values.add(value);
    claim.evidenceIds.push(source.evidenceId); claims.set(key, claim);
  }
  return Array.from(claims.values(), claim => ({
    factId: `fact-${fingerprint([claim.jobId, "job.sales_kpi", claim.evidenceIds]).slice(0, 24)}`,
    companyId: claim.companyId, jobId: claim.jobId, key: "job.sales_kpi",
    value: claim.values.size === 1 ? Array.from(claim.values)[0] : null,
    status: claim.values.size === 1 ? "supported" : "conflicting",
    evidenceIds: claim.evidenceIds, asOf: null
  }));
}
