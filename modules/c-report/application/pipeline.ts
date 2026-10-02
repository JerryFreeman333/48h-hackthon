/**
 * P1 匹配管线：固定阶段编排，纯函数，无网络、无模型（规格 §16 P1）。
 *
 * 阶段：input_schema → binding → references → preferences → constraints
 *       → dimensions → questions → reasons → action → report_selfcheck
 *
 * 输出：公共 MatchReport（经 Zod 自检）+ C 私有 DecisionTrace/RunDiagnostics/
 * ReportSnapshot。规则产物不改写输入 B facts/evidence（不修改输入对象）。
 */
import type {
  CandidateBundle,
  MatchReport,
  SearchIntent,
  UserProfile,
} from '../domain/contract.js';
import { cError, type CError } from '../domain/errors.js';
import { validateInputs, validateReferences } from '../domain/validate.js';
import { extractConfirmedHardPreferences } from '../domain/preferences.js';
import { createJobFactIndex, evaluateConstraintsForJob } from '../domain/constraints.js';
import { buildDimensionsForJob } from '../domain/dimensions.js';
import { buildQuestionsForJob } from '../domain/questions.js';
import { decideActionForJob, HOLD_RULES } from '../domain/recommendation.js';
import {
  assembleMatchReport,
  buildReportScope,
  type PerJobEvaluation,
  type ReportScope,
} from '../domain/report.js';
import { matchReportSchema, userProfileSchema, candidateBundleSchema } from '../domain/schema.js';
import type { DecisionTrace } from '../domain/trace.js';
import type { RunDiagnostics, StageRecord } from './diagnostics.js';
import { createDiagnostics } from './diagnostics.js';
import { hashInputObject } from './hash.js';

export const RULE_VERSION = 'c-rules-1.0.0-p1';
/** 明确非空模板版本标记：P1 未运行任何模型（§11）。 */
export const PROMPT_VERSION = 'template-no-model-p1.0.0';

export interface PipelineInput {
  profile: unknown;
  /** 完整 SearchIntent 快照（优先），或至少含 intentId/revision/profileRevision 的部分上下文。 */
  intentContext: unknown;
  bundle: unknown;
  options: {
    reportId: string;
    generatedAt: string;
    version?: number;
    ruleVersion?: string;
    promptVersion?: string;
  };
}

export interface ReportSnapshot {
  artifactType: 'c_private_report_snapshot_v1';
  report: MatchReport;
  profile: UserProfile;
  intentContext: SearchIntent | Partial<SearchIntent>;
  bundle: CandidateBundle;
  scope: ReportScope;
  inputHashes: { profile: string; intent: string; bundle: string };
  decisionTraces: DecisionTrace[];
  diagnostics: RunDiagnostics;
  ruleVersion: string;
  promptVersion: string;
  generatedAt: string;
}

export type PipelineResult =
  | { ok: true; report: MatchReport; snapshot: ReportSnapshot }
  | { ok: false; error: CError };

function isFullIntentContext(value: unknown): value is SearchIntent {
  return (
    typeof value === 'object' &&
    value !== null &&
    'schemaVersion' in value &&
    'projectId' in value &&
    'profileId' in value
  );
}

function isPartialIntentContext(
  value: unknown,
): value is { intentId: string; revision: number; profileRevision: number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'intentId' in value &&
    'revision' in value &&
    'profileRevision' in value
  );
}

function computeKeyTopicGaps(bundle: CandidateBundle): string[] {
  const gaps: string[] = [];
  const salesSupported = bundle.facts.some((f) => f.key === 'job.sales_kpi' && f.status === 'supported');
  if (!salesSupported) {
    gaps.push('job.sales_kpi');
  }
  if (bundle.jobs.some((job) => job.salary.basis !== 'fixed')) {
    gaps.push('salary_income_assessability');
  }
  if (bundle.jobs.some((job) => job.vacancyStatus === 'unknown')) {
    gaps.push('current_real_vacancy');
  }
  const financialsAvailable = bundle.coverage.some(
    (item) => item.topic === 'business_financials' && item.status === 'available',
  );
  if (!financialsAvailable) {
    gaps.push('business_financials');
  }
  const identityConfirmed = bundle.companies.every((c) => c.identityStatus === 'confirmed');
  if (!identityConfirmed) {
    gaps.push('company_identity');
  }
  return gaps;
}

export function runMatchPipeline(input: PipelineInput): PipelineResult {
  const { profile, intentContext, bundle, options } = input;
  const fullIntent = isFullIntentContext(intentContext);
  const stages: StageRecord[] = [];

  let validatedProfile: UserProfile;
  let validatedBundle: CandidateBundle;
  let validatedIntent: SearchIntent | null = null;

  // --- 阶段1-3：结构 / 绑定 / 引用 ---
  if (fullIntent) {
    const result = validateInputs(profile, intentContext, bundle);
    if (!result.ok) {
      return result;
    }
    validatedProfile = result.value.profile;
    validatedBundle = result.value.bundle;
    validatedIntent = result.value.intent;
    stages.push(
      { stage: 'input_schema', status: 'executed' },
      { stage: 'binding', status: 'executed' },
      { stage: 'references', status: 'executed' },
    );
  } else {
    // 部分上下文：只允许显式 demo；live/manual 缺绑定信息不得仅凭 revision 生成可信报告（§3）。
    const profileParsed = userProfileSchema.safeParse(profile);
    if (!profileParsed.success) {
      const first = profileParsed.error.issues[0];
      return {
        ok: false,
        error: cError('INPUT_STRUCT_INVALID', `profile 结构校验失败：${first ? first.path.map(String).join('.') : ''} ${first ? first.message : ''}`),
      };
    }
    const bundleParsed = candidateBundleSchema.safeParse(bundle);
    if (!bundleParsed.success) {
      const first = bundleParsed.error.issues[0];
      return {
        ok: false,
        error: cError('INPUT_STRUCT_INVALID', `bundle 结构校验失败：${first ? first.path.map(String).join('.') : ''} ${first ? first.message : ''}`),
      };
    }
    validatedProfile = profileParsed.data;
    validatedBundle = bundleParsed.data;

    if (!isPartialIntentContext(intentContext)) {
      return {
        ok: false,
        error: cError('INTENT_CONTEXT_INSUFFICIENT', 'intentContext 既不是完整 SearchIntent，也不含 intentId/revision/profileRevision'),
      };
    }
    if (validatedProfile.mode !== 'demo' || validatedBundle.mode !== 'demo') {
      return {
        ok: false,
        error: cError('INTENT_CONTEXT_INSUFFICIENT', `${validatedProfile.mode} 模式要求完整 SearchIntent 可信快照；部分上下文仅允许显式 demo/test`, {
          mode: validatedProfile.mode,
        }),
      };
    }
    if (validatedProfile.mode !== validatedBundle.mode) {
      return {
        ok: false,
        error: cError('MODE_CONFLICT', 'profile 与 bundle 的 mode 不一致', {
          profile: validatedProfile.mode,
          bundle: validatedBundle.mode,
        }),
      };
    }
    if (validatedProfile.confirmedAt === null || validatedProfile.assessment.status !== 'confirmed') {
      return {
        ok: false,
        error: cError('PROFILE_NOT_CONFIRMED', '画像未确认：confirmedAt 为空或 assessment.status 不是 confirmed', {
          profileId: validatedProfile.profileId,
        }),
      };
    }
    if (validatedProfile.revision !== intentContext.profileRevision) {
      return {
        ok: false,
        error: cError('BINDING_MISMATCH', 'intentContext.profileRevision 与 profile.revision 不一致', {
          profileRevision: validatedProfile.revision,
          intentProfileRevision: intentContext.profileRevision,
        }),
      };
    }
    if (validatedBundle.intentId !== intentContext.intentId || validatedBundle.intentRevision !== intentContext.revision) {
      return {
        ok: false,
        error: cError('BINDING_MISMATCH', 'intentContext 与 bundle 的意向绑定不一致（候选可能属于旧意向）'),
      };
    }
    if (validatedProfile.projectId !== validatedBundle.projectId) {
      return {
        ok: false,
        error: cError('BINDING_MISMATCH', 'profile 与 bundle 的 projectId 不一致'),
      };
    }
    stages.push(
      { stage: 'input_schema', status: 'executed', detail: 'partial intentContext（仅 demo 显式允许）' },
      { stage: 'binding', status: 'executed', detail: 'partial intentContext 绑定校验' },
    );
  }

  const references = validateReferences(validatedBundle);
  if (!references.ok) {
    return references;
  }
  if (fullIntent) {
    // fullIntent 分支的 references 已在 validateInputs 内执行；此处幂等重查以统一阶段记录。
  }
  stages.push({ stage: 'references', status: 'executed' });

  // --- 阶段4：硬偏好提取 ---
  const hardPrefs = extractConfirmedHardPreferences(validatedProfile);
  if (!hardPrefs.ok) {
    return hardPrefs;
  }
  stages.push({ stage: 'preferences', status: 'executed', detail: `hard=${String(hardPrefs.value.length)}` });

  const scope = buildReportScope(
    validatedProfile,
    validatedBundle,
    hardPrefs.value.map((entry) => (entry.pref.kind === 'unregistered' ? entry.pref.key : entry.pref.kind)),
  );

  const diagnostics = createDiagnostics(scope, validatedBundle.usage.length);
  diagnostics.stages = stages;
  diagnostics.intentContextPartial = !fullIntent;

  // intent.filters 的 hard 项不自动成为用户硬约束（§7），只登记差异。
  if (validatedIntent !== null) {
    const profileHardKeys = new Set(
      hardPrefs.value.map((entry) => (entry.pref.kind === 'unregistered' ? entry.pref.key : entry.pref.kind)),
    );
    for (const filter of validatedIntent.filters) {
      if (filter.strength === 'hard' && !profileHardKeys.has(filter.key)) {
        diagnostics.stages.push({
          stage: 'preferences',
          status: 'skipped',
          detail: `intent.filters 的 hard key ${filter.key} 不自动新增为用户硬约束`,
        });
      }
    }
  }

  // --- 阶段5-9：逐岗位约束/五维/问题/原因/动作 ---
  const factIndex = createJobFactIndex(validatedBundle.facts);
  const perJob: PerJobEvaluation[] = [];
  const traces: DecisionTrace[] = [];

  for (const job of validatedBundle.jobs) {
    const company =
      job.companyId === null
        ? undefined
        : validatedBundle.companies.find((c) => c.companyId === job.companyId);
    const constraintResult = evaluateConstraintsForJob(hardPrefs.value, job, factIndex);
    if (!constraintResult.ok) {
      return constraintResult;
    }
    const constraintEvaluations = constraintResult.value;

    let dimensions;
    try {
      dimensions = buildDimensionsForJob({
        job,
        company,
        profile: validatedProfile,
        bundle: validatedBundle,
        factIndex,
        constraintEvaluations,
      });
    } catch (error) {
      return {
        ok: false,
        error: cError('REPORT_OUTPUT_INVALID', `五维装配失败：${error instanceof Error ? error.message : String(error)}`),
      };
    }

    const questions = buildQuestionsForJob(job, validatedBundle);
    const jobFacts = validatedBundle.facts.filter((f) => f.jobId === job.jobId);
    const jobEvidenceCount = validatedBundle.evidence.filter((e) => e.jobId === job.jobId).length;
    const action = decideActionForJob({
      job,
      company,
      constraintEvaluations,
      dimensions,
      jobFacts,
      jobEvidenceCount,
      factIndex,
    });

    perJob.push({ jobId: job.jobId, action, constraints: constraintEvaluations, dimensions, questions });
    traces.push({
      jobId: job.jobId,
      constraints: constraintEvaluations.map((c) => c.trace),
      dimensions: dimensions.map((d) => ({
        key: d.key,
        ruleId: 'c.dimensions.v1',
        factIds: [...d.factIds],
        notes: [],
      })),
      action: {
        ruleId: 'c.action.priority.v1',
        recommendation: action.recommendation,
        triggeredBy: [...action.triggeredBy],
        notes: [`hold 规则表条目数：${String(HOLD_RULES.length)}（1.0.0 为空，激活需公共命题协议）`],
      },
    });
  }

  stages.push(
    { stage: 'constraints', status: 'executed' },
    { stage: 'dimensions', status: 'executed' },
    { stage: 'questions', status: 'executed' },
    { stage: 'reasons', status: 'executed' },
    { stage: 'action', status: 'executed' },
  );

  // --- 空候选（C-13）：results=[]，说明放私有 diagnostics，不伪造公共字段 ---
  if (validatedBundle.jobs.length === 0) {
    diagnostics.insufficientNote = '输入合法但没有候选岗位：请补充候选（重新检索或提交 JD）后再生成报告。';
  }

  // --- 阶段10：装配 + 关键主题 + 输出自检 ---
  const keyTopicGaps = computeKeyTopicGaps(validatedBundle);
  diagnostics.keyTopicGaps = keyTopicGaps;

  const ruleVersion = options.ruleVersion ?? RULE_VERSION;
  const promptVersion = options.promptVersion ?? PROMPT_VERSION;

  const report = assembleMatchReport({
    profile: validatedProfile,
    bundle: validatedBundle,
    meta: {
      reportId: options.reportId,
      version: options.version ?? 1,
      generatedAt: options.generatedAt,
      ruleVersion,
      promptVersion,
    },
    scope,
    perJob,
    keyTopicGaps,
    stagesSkipped: [],
  });

  const selfCheck = matchReportSchema.safeParse(report);
  if (!selfCheck.success) {
    const first = selfCheck.error.issues[0];
    return {
      ok: false,
      error: cError(
        'REPORT_OUTPUT_INVALID',
        `生成的 MatchReport 未通过公共输出 schema 自检：${first ? first.path.map(String).join('.') : '(root)'} ${first ? first.message : ''}`,
      ),
    };
  }
  stages.push({ stage: 'report_selfcheck', status: 'executed' });
  diagnostics.stages = stages;

  let inputHashes: { profile: string; intent: string; bundle: string };
  try {
    inputHashes = {
      profile: hashInputObject('profile', validatedProfile),
      intent: hashInputObject('intent', validatedIntent ?? intentContext),
      bundle: hashInputObject('bundle', validatedBundle),
    };
  } catch (error) {
    return {
      ok: false,
      error: cError('INPUT_STRUCT_INVALID', `输入哈希失败：${error instanceof Error ? error.message : String(error)}`),
    };
  }
  diagnostics.inputHashes = inputHashes;

  const snapshot: ReportSnapshot = {
    artifactType: 'c_private_report_snapshot_v1',
    report,
    profile: validatedProfile,
    intentContext: validatedIntent ?? (intentContext as Partial<SearchIntent>),
    bundle: validatedBundle,
    scope,
    inputHashes,
    decisionTraces: traces,
    diagnostics,
    ruleVersion,
    promptVersion,
    generatedAt: options.generatedAt,
  };

  return { ok: true, report, snapshot };
}
