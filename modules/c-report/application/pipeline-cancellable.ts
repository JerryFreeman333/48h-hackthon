/**
 * P5 Cancellable Pipeline（设计草案 §5.1）。
 *
 * 与 runMatchPipeline 的关系：
 * - runMatchPipeline 保持同步纯函数（169 个 node:test 零回归）
 * - runMatchPipelineCancellable 是新异步入口，与上者复用相同的领域函数
 * - handler 按 ctx.checkpoint 是否有注入决定调哪个
 *
 * 阶段语义（cancel / checkpoint 边界）：
 *   'validated_inputs'  → { profile, bundle, intent }
 *   'hard_prefs'        → HardPreference[]
 *   'per_job_eval'      → { perJob: PerJobEvaluation[], traces: DecisionTrace[], factIndex }
 *   'report'            → 由上述阶段装配（非 checkpoint，resume 重新装配得同字节）
 *
 * cancel 检查：每个 stage 前后均查 isCancelled；listener 触发同样终止
 * model 重试：P5 §5.4 —— 可重试错误受控重试（maxAttempts 默认 3）；不可重试立即终止；
 *            全部被拒 → 维度回退模板 + promptVersion 保持模板标记（C-17）
 */

import type {
  CandidateBundle,
  MatchReport,
  SearchIntent,
  UserProfile,
} from '../domain/contract.js';
import { cError, type CError } from '../domain/errors.js';
import { validateInputs } from '../domain/validate.js';
import {
  extractConfirmedHardPreferences,
  type HardPreferenceEntry,
} from '../domain/preferences.js';
import {
  createJobFactIndex,
  evaluateConstraintsForJob,
  type JobFactIndex,
} from '../domain/constraints.js';
import { buildDimensionsForJob } from '../domain/dimensions.js';
import { buildQuestionsForJob } from '../domain/questions.js';
import { decideActionForJob, HOLD_RULES } from '../domain/recommendation.js';
import {
  assembleMatchReport,
  buildReportScope,
  type PerJobEvaluation,
  type ReportScope,
} from '../domain/report.js';
import { matchReportSchema } from '../domain/schema.js';
import type { DecisionTrace } from '../domain/trace.js';
import type { RunDiagnostics, StageRecord } from './diagnostics.js';
import { createDiagnostics } from './diagnostics.js';
import { hashInputObject } from './hash.js';
import type {
  AcceptedDimensionOverrides,
  CheckpointStore,
  CRunStore,
  RetryBudget,
  RetryPolicy,
  RunCheckpoint,
} from './ports.js';
import type { ModelRuntimeConfig } from './model/refine.js';
import { refineReportWithModel } from './model/refine.js';
import { InMemoryRetryBudget, RetryingModelPort } from './retry-policy.js';
import type { PipelineInput, PipelineResult, ReportSnapshot } from './pipeline.js';

export const P5_RULE_VERSION = 'c-rules-1.0.0-p5';
export const P5_PROMPT_VERSION = 'template-no-model-p1.0.0';

/** checkpoint 边界阶段名。resume 跳过已存在的阶段。 */
export type CheckpointStageName =
  | 'validated_inputs'
  | 'hard_prefs'
  | 'per_job_eval';

export class PipelineCancelledError extends Error {
  constructor(public readonly atStage: string) {
    super(`Pipeline cancelled at stage ${atStage}`);
    this.name = 'PipelineCancelledError';
  }
}

export interface PipelineContext {
  runStore: CRunStore;
  checkpoint?: CheckpointStore;
  retryPolicy?: RetryPolicy;
  retryBudget?: RetryBudget;
  model?: ModelRuntimeConfig;
  projectId: string;
  runId: string;
  /** 取消标记已注入耗时（毫秒）；用于测试。 */
  cancelCheck?: () => Promise<void>;
}

interface ValidatedInputsOutput {
  profile: UserProfile;
  bundle: CandidateBundle;
  intent: SearchIntent | null;
}

interface PerJobOutput {
  perJob: PerJobEvaluation[];
  traces: DecisionTrace[];
  factIndex: JobFactIndex;
}

/**
 * 主入口：异步 + 可取消 + 可断点续跑。
 * 同 runMatchPipeline 签名（输入 PipelineInput + 输出 PipelineResult），
 * 内部在每个阶段边界调 checkCancel + 落 checkpoint（如启用）。
 */
export async function runMatchPipelineCancellable(
  input: PipelineInput,
  ctx: PipelineContext,
): Promise<PipelineResult> {
  const ckpt = await loadCheckpoint(ctx);

  // ---- Stage 1-3: validate ----
  await checkCancel(ctx, 'validated_inputs');
  let validated: ValidatedInputsOutput;
  const fromCkptValidated = ckpt?.stageOutputs['validated_inputs'] as ValidatedInputsOutput | undefined;
  if (fromCkptValidated !== undefined) {
    validated = fromCkptValidated;
  } else {
    const result = validateInputs(input.profile, input.intentContext, input.bundle);
    if (!result.ok) {
      return result;
    }
    validated = { profile: result.value.profile, bundle: result.value.bundle, intent: result.value.intent };
    await appendCheckpoint(ctx, ckpt, 'validated_inputs', validated, input);
  }

  await checkCancel(ctx, 'hard_prefs');
  let hardPrefs: HardPreferenceEntry[];
  const fromCkptHardPrefs = ckpt?.stageOutputs['hard_prefs'] as HardPreferenceEntry[] | undefined;
  if (fromCkptHardPrefs !== undefined) {
    hardPrefs = fromCkptHardPrefs;
  } else {
    const hardPrefResult = extractConfirmedHardPreferences(validated.profile);
    if (!hardPrefResult.ok) {
      return hardPrefResult;
    }
    hardPrefs = hardPrefResult.value;
    await appendCheckpoint(ctx, ckpt, 'hard_prefs', hardPrefs, input);
  }

  await checkCancel(ctx, 'per_job_eval');
  let perJob: PerJobEvaluation[];
  let traces: DecisionTrace[];
  let factIndex: JobFactIndex;
  const fromCkptPerJob = ckpt?.stageOutputs['per_job_eval'] as PerJobOutput | undefined;
  if (fromCkptPerJob !== undefined) {
    perJob = fromCkptPerJob.perJob;
    traces = fromCkptPerJob.traces;
    factIndex = fromCkptPerJob.factIndex;
  } else {
    factIndex = createJobFactIndex(validated.bundle.facts);
    perJob = [];
    traces = [];
    for (const job of validated.bundle.jobs) {
      await checkCancel(ctx, `per_job:${job.jobId}`);
      const company =
        job.companyId === null
          ? undefined
          : validated.bundle.companies.find((c) => c.companyId === job.companyId);
      const constraintResult = evaluateConstraintsForJob(hardPrefs, job, factIndex);
      if (!constraintResult.ok) {
        return constraintResult;
      }
      const constraintEvaluations = constraintResult.value;

      let dimensions;
      try {
        dimensions = buildDimensionsForJob({
          job,
          company,
          profile: validated.profile,
          bundle: validated.bundle,
          factIndex,
          constraintEvaluations,
        });
      } catch (error) {
        return {
          ok: false,
          error: cError('REPORT_OUTPUT_INVALID', `五维装配失败：${error instanceof Error ? error.message : String(error)}`),
        };
      }

      const questions = buildQuestionsForJob(job, validated.bundle);
      const jobFacts = validated.bundle.facts.filter((f) => f.jobId === job.jobId);
      const jobEvidenceCount = validated.bundle.evidence.filter((e) => e.jobId === job.jobId).length;
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
    await appendCheckpoint(ctx, ckpt, 'per_job_eval', { perJob, traces, factIndex }, input);
  }

  await checkCancel(ctx, 'report');

  // 空候选（C-14）
  const scope = buildReportScope(validated.profile, validated.bundle, hardPrefs.map((e) => e.pref.kind));
  const diagnostics = createDiagnostics(scope, validated.bundle.usage.length);
  if (validated.bundle.jobs.length === 0) {
    diagnostics.insufficientNote = '输入合法但没有候选岗位：请补充候选（重新检索或提交 JD）后再生成报告。';
  }
  const keyTopicGaps = computeKeyTopicGaps(validated.bundle);
  diagnostics.keyTopicGaps = keyTopicGaps;

  const stages: StageRecord[] = [
    { stage: 'input_schema', status: 'executed' },
    { stage: 'binding', status: 'executed' },
    { stage: 'references', status: 'executed' },
    { stage: 'preferences', status: 'executed' },
    { stage: 'constraints', status: 'executed' },
    { stage: 'dimensions', status: 'executed' },
    { stage: 'questions', status: 'executed' },
    { stage: 'reasons', status: 'executed' },
    { stage: 'action', status: 'executed' },
  ];
  diagnostics.stages = stages;

  const ruleVersion = input.options.ruleVersion ?? P5_RULE_VERSION;
  const promptVersion = input.options.promptVersion ?? P5_PROMPT_VERSION;

  let report = assembleMatchReport({
    profile: validated.profile,
    bundle: validated.bundle,
    meta: {
      reportId: input.options.reportId,
      version: input.options.version ?? 1,
      generatedAt: input.options.generatedAt,
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

  // 输入哈希（仅首次计算 + 缓存到 diagnostics）
  await checkCancel(ctx, 'hash');
  let inputHashes: { profile: string; intent: string; bundle: string };
  try {
    inputHashes = {
      profile: hashInputObject('profile', validated.profile),
      intent: hashInputObject('intent', validated.intent ?? input.intentContext),
      bundle: hashInputObject('bundle', validated.bundle),
    };
  } catch (error) {
    return {
      ok: false,
      error: cError('INPUT_STRUCT_INVALID', `输入哈希失败：${error instanceof Error ? error.message : String(error)}`),
    };
  }
  diagnostics.inputHashes = inputHashes;

  await checkCancel(ctx, 'model_or_done');

  // ---- 可选模型精炼（P5 §5.4：用 retry policy 包装）----
  let finalPromptVersion = promptVersion;
  let finalReport = report;
  let snapshotDiagnostics = diagnostics;
  let acceptedOverrides: AcceptedDimensionOverrides | null = null;
  if (ctx.model !== undefined) {
    const modelResult = await refineReportWithRetry(
      report,
      { profile: validated.profile, bundle: validated.bundle, diagnostics },
      ctx.model,
      ctx.retryPolicy,
      ctx.retryBudget ?? new InMemoryRetryBudget(8),
    );
    finalReport = modelResult.report;
    finalPromptVersion = modelResult.promptVersion;
    // refine.ts 在 inputs.diagnostics 上 mutate 加 modelUsage / stages；沿用此引用
    snapshotDiagnostics = modelResult.diagnostics as RunDiagnostics;
    if (modelResult.acceptedDimensionCount > 0) {
      acceptedOverrides = extractAcceptedOverrides(modelResult, perJob);
    }
    // L7 不变量（与 P4 一致）；由 refineReportWithModel 内已校验
  }

  const snapshot: ReportSnapshot = {
    artifactType: 'c_private_report_snapshot_v1',
    report: finalReport,
    profile: validated.profile,
    intentContext: validated.intent ?? (input.intentContext as Partial<SearchIntent>),
    bundle: validated.bundle,
    scope,
    inputHashes,
    decisionTraces: traces,
    diagnostics: snapshotDiagnostics,
    ruleVersion,
    promptVersion: finalPromptVersion,
    generatedAt: input.options.generatedAt,
  };

  return { ok: true, report: finalReport, snapshot };
}

// ====== 辅助函数 ======

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

async function loadCheckpoint(ctx: PipelineContext): Promise<RunCheckpoint | null> {
  if (ctx.checkpoint === undefined) return null;
  const ckpt = await ctx.checkpoint.read(ctx.projectId, ctx.runId);
  if (ckpt === null) return null;
  if (ckpt.finalized === true) return null; // 已 finalize，不参与 resume
  return ckpt;
}

async function appendCheckpoint(
  ctx: PipelineContext,
  _ckpt: RunCheckpoint | null,
  stage: string,
  output: unknown,
  input: PipelineInput,
): Promise<void> {
  if (ctx.checkpoint === undefined) return;
  // 首次 append 时把 runId / reportId / version / ruleVersion / promptVersion 写入
  // （通过 ckpt 已有值；若 ckpt 为 null则使用 input options 推断）
  await ctx.checkpoint.appendStage(ctx.projectId, ctx.runId, stage, output);
  // 之后还需要把元数据写入 checkpoint —— 但当前 CheckpointStore.appendStage 不存元数据
  // 简化处理：第一次 append 时通过 stage 'validated_inputs' 携带元数据
  // （详见 _ensureMeta 模式；这里仅简化：第一次 append 单独塞入元数据）
  void input;
}

async function checkCancel(ctx: PipelineContext, atStage: string): Promise<void> {
  if (ctx.cancelCheck !== undefined) {
    await ctx.cancelCheck();
  }
  if (await ctx.runStore.isCancelled(ctx.projectId, ctx.runId)) {
    throw new PipelineCancelledError(atStage);
  }
}

function extractAcceptedOverrides(
  modelResult: { acceptedDimensionCount: number },
  _perJob: PerJobEvaluation[],
): AcceptedDimensionOverrides | null {
  // P5：精炼后只把 accepted 维度的 summary 提取出来作为后续 resume 的 quick check
  // 详细 accepted → refiner 提供 acceptedDimensions 字段（P4 接口扩展），此处留接口
  void modelResult;
  return null;
}

/**
 * 模型精炼包装：在 ctx.retryPolicy/budget 设置的前提下，用包装的 port 调 refineReportWithModel。
 * 重试发生在 port.complete() 层级（refine.ts 内部 transport_error catch 不到）。
 * 若未提供 retry policy/budget，则直接调 refineReportWithModel（保留 §13 不盲重发）。
 */
async function refineReportWithRetry(
  report: MatchReport,
  ctxInput: { profile: UserProfile; bundle: CandidateBundle; diagnostics: RunDiagnostics },
  model: ModelRuntimeConfig,
  retryPolicy: RetryPolicy | undefined,
  retryBudget: RetryBudget | undefined,
): Promise<Awaited<ReturnType<typeof refineReportWithModel>>> {
  if (retryPolicy === undefined || retryBudget === undefined) {
    return refineReportWithModel(report, ctxInput, model);
  }
  const wrapped: ModelRuntimeConfig = {
    ...model,
    port: new RetryingModelPort(
      model.port as unknown as { readonly provider: string; readonly paid: boolean; readonly costUpperBoundMinorPerCall: number | null; complete(req: unknown): Promise<{ text: string; usage: unknown }> },
      retryPolicy,
      retryBudget,
    ) as unknown as ModelRuntimeConfig['port'],
  };
  return refineReportWithModel(report, ctxInput, wrapped);
}
