/**
 * 公共数据契约 1.0.0 的 TypeScript 镜像。
 *
 * 来源：modules/c-report/docs/source/C_Matching_Report.original.md「统一对象与基本类型」。
 * 本文件逐字段复刻公共契约，不新增、不重命名、不改枚举。
 * 公共契约变更必须三方协调后同步修改此处，并在提交说明中注明。
 */

export type Mode = 'demo' | 'manual' | 'live';

export type Status = 'supported' | 'contradicted' | 'unknown' | 'conflicting';

export type ConstraintResult = 'pass' | 'fail' | 'unknown';

export type Recommendation = 'hold' | 'verify_first' | 'deprioritize' | 'explore' | 'insufficient';

export const PUBLIC_SCHEMA_VERSION = '1.0.0' as const;

export interface Preference {
  key: string;
  value: string | number | boolean | string[] | null;
  strength: 'hard' | 'soft' | 'unknown';
  confirmed: boolean;
}

export interface Experience {
  text: string;
  source: 'user' | 'resume';
  confirmed: boolean;
}

export interface UserProfile {
  schemaVersion: '1.0.0';
  profileId: string;
  revision: number;
  projectId: string;
  mode: Mode;
  confirmedAt: string | null;
  assessment: {
    instrumentId: string;
    version: string;
    scores: Record<string, number | null>;
    interpretation: string;
    status: 'draft' | 'confirmed';
    validation: 'prototype' | 'validated';
  };
  background: {
    education: string | null;
    major: string | null;
    skills: string[];
    experiences: Experience[];
  };
  goals: string[];
  preferences: Preference[];
}

export interface IntentFilter {
  key: string;
  value: string | number | boolean | string[] | null;
  strength: 'hard' | 'soft' | 'unknown';
}

export interface SearchIntent {
  schemaVersion: '1.0.0';
  intentId: string;
  revision: number;
  projectId: string;
  profileId: string;
  profileRevision: number;
  mode: Mode;
  industryTags: string[];
  industryCodes: string[];
  roleTypes: string[];
  cities: string[];
  filters: IntentFilter[];
  maxCandidates: number;
}

export interface JobSalary {
  currency: string;
  min: number | null;
  max: number | null;
  period: 'month' | 'year' | 'unknown';
  basis: 'fixed' | 'total' | 'unknown';
  taxBasis: 'pre_tax' | 'after_tax' | 'unknown';
  months: number | null;
}

export interface Company {
  companyId: string;
  legalName: string;
  creditCode: string | null;
  brandName: string | null;
  identityStatus: 'confirmed' | 'ambiguous' | 'unresolved';
}

export interface Job {
  jobId: string;
  companyId: string | null;
  title: string;
  rawJd: string;
  city: string | null;
  sourceUrl: string | null;
  publishedAt: string | null;
  vacancyStatus: 'open' | 'closed' | 'unknown';
  salary: JobSalary;
}

export interface Evidence {
  evidenceId: string;
  companyId: string | null;
  jobId: string | null;
  scope: 'company' | 'business' | 'team' | 'job';
  sourceType: string;
  title: string;
  url: string | null;
  publishedAt: string | null;
  retrievedAt: string;
  excerpt: string;
  mode: Mode;
  verification: 'verified' | 'unverified' | 'disputed';
}

export interface Fact {
  factId: string;
  companyId: string | null;
  jobId: string | null;
  key: string;
  value: string | number | boolean | null;
  status: Status;
  evidenceIds: string[];
  asOf: string | null;
}

export interface Coverage {
  companyId: string | null;
  jobId: string | null;
  topic: string;
  status: 'available' | 'not_connected' | 'unavailable' | 'no_result' | 'not_public';
  reason: string;
  checkedAt: string;
}

export interface UsageEntry {
  provider: string;
  requestId: string;
  costMinor: number | null;
}

export interface CandidateBundle {
  schemaVersion: '1.0.0';
  bundleId: string;
  projectId: string;
  intentId: string;
  intentRevision: number;
  mode: Mode;
  retrievedAt: string;
  companies: Company[];
  jobs: Job[];
  evidence: Evidence[];
  facts: Fact[];
  coverage: Coverage[];
  usage: UsageEntry[];
}

export type DimensionKey =
  | 'identity_credit'
  | 'business'
  | 'role_clarity'
  | 'career_value'
  | 'personal_fit';

export interface MatchReportResultReason {
  text: string;
  kind: 'fact' | 'inference' | 'unknown';
  factIds: string[];
}

export interface MatchReportResultConstraint {
  key: string;
  result: ConstraintResult;
  factIds: string[];
}

export interface MatchReportResultDimension {
  key: DimensionKey;
  summary: string;
  status: Status;
  factIds: string[];
}

export interface MatchReportResultQuestion {
  text: string;
  priority: 'must' | 'optional';
  resolves: string[];
}

export interface MatchReportResult {
  jobId: string;
  recommendation: Recommendation;
  reasons: MatchReportResultReason[];
  constraints: MatchReportResultConstraint[];
  dimensions: MatchReportResultDimension[];
  questions: MatchReportResultQuestion[];
}

export interface MatchReport {
  schemaVersion: '1.0.0';
  reportId: string;
  version: number;
  projectId: string;
  profileId: string;
  profileRevision: number;
  bundleId: string;
  mode: Mode;
  generatedAt: string;
  completeness: 'complete_for_scope' | 'partial';
  results: MatchReportResult[];
  evidenceSnapshot: Evidence[];
  factsSnapshot: Fact[];
  coverageSnapshot: Coverage[];
  ruleVersion: string;
  promptVersion: string;
}

/** 公共初版登记的硬约束 key。新增 key 必须三方协调，不得在 C 私自扩展。 */
export const PUBLIC_PREFERENCE_KEYS = [
  'city',
  'min_fixed_monthly_salary',
  'accept_sales_kpi',
  'accept_travel',
  'accept_outsourcing',
] as const;

export type PublicPreferenceKey = (typeof PUBLIC_PREFERENCE_KEYS)[number];

/**
 * 1.0.0 中唯一已通过公共样例协调的 B Fact key。
 * 其他 Fact key 未经协调不得用于确定性结论（规格 §6）。
 */
export const COORDINATED_FACT_KEYS = ['job.sales_kpi'] as const;
