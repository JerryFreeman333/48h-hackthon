/**
 * MatchReport 装配（规格 §12/§10）：
 * - 公共字段严格 1.0.0，不私加 nextActions/fieldProvenance/顶层 recommendation。
 * - 三个快照逐字段复制自输入 bundle，规则产物不得改写 B facts/evidence。
 * - completeness 与调用成功分开：关键主题 unknown 或岗位不可判 → partial。
 */
import type {
  CandidateBundle,
  MatchReport,
  MatchReportResult,
  MatchReportResultDimension,
  MatchReportResultQuestion,
  UserProfile,
} from './contract.js';
import { PUBLIC_SCHEMA_VERSION } from './contract.js';
import type { ConstraintEvaluation } from './constraints.js';
import type { ActionDecision } from './recommendation.js';

export interface ReportScope {
  profileId: string;
  /** 声明范围：请求中的候选集合、五维、已确认硬约束 key、关键主题、必须执行阶段。 */
  candidateJobIds: string[];
  dimensionKeys: readonly string[];
  confirmedHardConstraintKeys: string[];
  keyTopics: readonly string[];
  requiredStages: readonly string[];
}

export interface PerJobEvaluation {
  jobId: string;
  action: ActionDecision;
  constraints: ConstraintEvaluation[];
  dimensions: MatchReportResultDimension[];
  questions: MatchReportResultQuestion[];
}

export interface ReportMeta {
  reportId: string;
  version: number;
  generatedAt: string;
  ruleVersion: string;
  promptVersion: string;
}

export const REQUIRED_STAGES = [
  'input_schema',
  'binding',
  'references',
  'preferences',
  'constraints',
  'dimensions',
  'questions',
  'reasons',
  'action',
  'report_selfcheck',
] as const;

/** demo 范围的关键主题：任一 unknown → partial（登记 C-14 的 demo 自声明语义）。 */
export const DEMO_SCOPE_KEY_TOPICS = [
  'job.sales_kpi',
  'salary_income_assessability',
  'current_real_vacancy',
  'business_financials',
  'company_identity',
] as const;

export function buildReportScope(
  profile: UserProfile,
  bundle: CandidateBundle,
  hardConstraintKeys: string[],
): ReportScope {
  return {
    profileId: profile.profileId,
    candidateJobIds: bundle.jobs.map((job) => job.jobId),
    dimensionKeys: ['identity_credit', 'business', 'role_clarity', 'career_value', 'personal_fit'],
    confirmedHardConstraintKeys: hardConstraintKeys,
    keyTopics: DEMO_SCOPE_KEY_TOPICS,
    requiredStages: REQUIRED_STAGES,
  };
}

export function assembleMatchReport(args: {
  profile: UserProfile;
  bundle: CandidateBundle;
  meta: ReportMeta;
  scope: ReportScope;
  perJob: PerJobEvaluation[];
  keyTopicGaps: string[];
  stagesSkipped: string[];
}): MatchReport {
  const { profile, bundle, meta, perJob, stagesSkipped } = args;

  const results: MatchReportResult[] = perJob.map((item) => ({
    jobId: item.jobId,
    recommendation: item.action.recommendation,
    reasons: item.action.reasons.map((r) => ({ ...r, factIds: [...r.factIds] })),
    constraints: item.constraints.map((c) => ({ key: c.key, result: c.result, factIds: [...c.factIds] })),
    dimensions: item.dimensions.map((d) => ({ ...d, factIds: [...d.factIds] })),
    questions: item.questions.map((q) => ({ ...q, resolves: [...q.resolves] })),
  }));

  let partial = stagesSkipped.length > 0 || args.keyTopicGaps.length > 0 || bundle.jobs.length === 0;

  const report: MatchReport = {
    schemaVersion: PUBLIC_SCHEMA_VERSION,
    reportId: meta.reportId,
    version: meta.version,
    projectId: profile.projectId,
    profileId: profile.profileId,
    profileRevision: profile.revision,
    bundleId: bundle.bundleId,
    mode: bundle.mode,
    generatedAt: meta.generatedAt,
    completeness: partial ? 'partial' : 'complete_for_scope',
    results,
    // 快照逐字段复制，规则输出不回写 B 数据（P1 要求 6）。
    evidenceSnapshot: bundle.evidence.map((item) => ({ ...item })),
    factsSnapshot: bundle.facts.map((item) => ({ ...item })),
    coverageSnapshot: bundle.coverage.map((item) => ({ ...item })),
    ruleVersion: meta.ruleVersion,
    promptVersion: meta.promptVersion,
  };
  return report;
}

/** 覆盖记录主题是否可用（关键主题判定用）。 */
export function topicAvailable(bundle: CandidateBundle, topic: string): boolean {
  return bundle.coverage.some((item) => item.topic === topic && item.status === 'available');
}
