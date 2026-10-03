/**
 * P4 模型精炼编排（规格 §11/§14）。
 *
 * 位置：确定性管线（runMatchPipeline）之后、落存储之前。模型输出只允许替换
 * 五维 summary 文本；动作/约束/维度状态/事实引用/问题全部由引擎持有——重建后
 * 逐字段核对（L7 不变量，违反即抛错，属编程错误而非运行时降级）。
 *
 * 降级规则（§11）：结构非法（JSON/枚举/截断）→ 恰好一次修复 → 仍失败则该岗位
 * 全部回退模板；L2–L6 按维度失败 → 该维度回退模板；全部维度被拒 → 报告保持
 * 纯模板并显式标注"模型输出未被采用"，promptVersion 保持模板标记（不冒充运行过 AI）。
 * 传输错误不重发（§13 外部调用响应丢失不盲重试），记录 unknown 用量后跳过该岗位。
 */
import type { CandidateBundle, Company, MatchReport, MatchReportResult, UserProfile } from '../../domain/contract.js';
import { matchReportSchema } from '../../domain/schema.js';
import { cError, type CError } from '../../domain/errors.js';
import type { RunDiagnostics, StageRecord } from '../diagnostics.js';
import type { ModelBudget, ModelPort, ModelUsage } from './port.js';
import { ModelBudgetError } from './port.js';
import { SYSTEM_PROMPT, MODEL_PROMPT_VERSION, buildRefinePrompt, buildRepairPrompt } from './prompts.js';
import { validateRefineOutput } from './validate-output.js';

/** 每模型运行的时间/次数/金额约束（§14 默认：8 次、单次 30s、整体 120s 软上限）。 */
export interface ModelRuntimeConfig {
  port: ModelPort;
  budget: ModelBudget;
  deadlineMsPerCall?: number;
  maxOutputTokens?: number;
  totalSoftDeadlineMs?: number;
}

export interface ModelUsageEntry extends ModelUsage {
  /** 调用序号（含修复轮）；transport_error 条目表示响应丢失、用量未知。 */
  callIndex: number;
  outcome: 'ok' | 'transport_error';
}

export interface ModelRefineOutcome {
  report: MatchReport;
  diagnostics: RunDiagnostics;
  /** 至少一个维度被模型改写 → MODEL_PROMPT_VERSION；否则保持模板标记。 */
  promptVersion: string;
  modelUsage: ModelUsageEntry[];
  acceptedDimensionCount: number;
  rejectedDimensionCount: number;
}

const DEFAULT_DEADLINE_MS = 30_000;
const DEFAULT_TOTAL_SOFT_MS = 120_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 2048;

function cloneDiagnostics(diagnostics: RunDiagnostics): RunDiagnostics {
  return { ...diagnostics, stages: [...diagnostics.stages], keyTopicGaps: [...diagnostics.keyTopicGaps] };
}

function applyOverrides(
  result: MatchReportResult,
  overrides: Map<string, string>,
): MatchReportResult {
  if (overrides.size === 0) {
    return result;
  }
  return {
    ...result,
    dimensions: result.dimensions.map((dimension) =>
      overrides.has(dimension.key) ? { ...dimension, summary: overrides.get(dimension.key) as string } : dimension,
    ),
  };
}

/** L7 不变量：除五维 summary 外，逐字段与确定性结果一致。 */
function assertInvariantsPreserved(before: MatchReport, after: MatchReport): void {
  if (before.results.length !== after.results.length) {
    throw new Error('L7 不变量被破坏：结果数量改变');
  }
  for (let index = 0; index < before.results.length; index += 1) {
    const a = before.results[index];
    const b = after.results[index];
    if (a === undefined || b === undefined) {
      throw new Error('L7 不变量被破坏：结果缺失');
    }
    if (a.jobId !== b.jobId || a.recommendation !== b.recommendation) {
      throw new Error('L7 不变量被破坏：jobId 或建议动作被模型改变');
    }
    if (JSON.stringify(a.constraints) !== JSON.stringify(b.constraints)) {
      throw new Error('L7 不变量被破坏：约束结果被模型改变');
    }
    if (JSON.stringify(a.reasons) !== JSON.stringify(b.reasons)) {
      throw new Error('L7 不变量被破坏：理由被模型改变');
    }
    if (JSON.stringify(a.questions) !== JSON.stringify(b.questions)) {
      throw new Error('L7 不变量被破坏：核验问题被模型改变');
    }
    if (a.dimensions.length !== b.dimensions.length) {
      throw new Error('L7 不变量被破坏：维度数量改变');
    }
    for (let d = 0; d < a.dimensions.length; d += 1) {
      const da = a.dimensions[d];
      const db = b.dimensions[d];
      if (da === undefined || db === undefined || da.key !== db.key || da.status !== db.status || JSON.stringify(da.factIds) !== JSON.stringify(db.factIds)) {
        throw new Error('L7 不变量被破坏：维度 key/status/factIds 被模型改变');
      }
    }
  }
}

async function callModel(
  port: ModelPort,
  budget: ModelBudget,
  request: { system: string; prompt: string },
  config: ModelRuntimeConfig,
  callIndex: number,
  usage: ModelUsageEntry[],
): Promise<{ ok: true; text: string } | { ok: false }> {
  try {
    budget.reserve(port.costUpperBoundMinorPerCall, port.paid);
  } catch (error) {
    if (error instanceof ModelBudgetError) {
      throw error;
    }
    throw new ModelBudgetError('MODEL_COST_INVALID', String(error));
  }
  try {
    const completion = await port.complete({
      system: request.system,
      prompt: request.prompt,
      maxOutputTokens: config.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      deadlineMs: config.deadlineMsPerCall ?? DEFAULT_DEADLINE_MS,
    });
    usage.push({
      provider: completion.usage.provider,
      requestId: completion.usage.requestId,
      costMinor: completion.usage.costMinor,
      tokens: completion.usage.tokens,
      callIndex,
      outcome: 'ok',
    });
    return { ok: true, text: completion.text };
  } catch {
    // 响应丢失：执行与费用 outcome=unknown；不盲重发（§13）。记录后由调用方跳过。
    usage.push({ provider: port.provider, requestId: null, costMinor: null, tokens: null, callIndex, outcome: 'transport_error' });
    return { ok: false };
  }
}

export async function refineReportWithModel(
  report: MatchReport,
  inputs: { profile: UserProfile; bundle: CandidateBundle; diagnostics: RunDiagnostics },
  config: ModelRuntimeConfig,
): Promise<ModelRefineOutcome> {
  const { port, budget } = config;
  const diagnostics = cloneDiagnostics(inputs.diagnostics);
  const modelUsage: ModelUsageEntry[] = [];
  const notes: string[] = [];
  let callIndex = 0;
  let acceptedTotal = 0;
  let rejectedTotal = 0;

  const deadline = Date.now() + (config.totalSoftDeadlineMs ?? DEFAULT_TOTAL_SOFT_MS);

  let working = report;
  let anyAccepted = false;

  for (const result of report.results) {
    if (Date.now() >= deadline) {
      notes.push('整体软时限已到：剩余候选未调用模型，保持模板文本（§14）。');
      break;
    }
    const job = inputs.bundle.jobs.find((item) => item.jobId === result.jobId);
    if (job === undefined) {
      notes.push(`jobId=${result.jobId} 在 bundle 快照中缺失：跳过模型精炼。`);
      continue;
    }
    const company: Company | null = job.companyId === null
      ? null
      : inputs.bundle.companies.find((item) => item.companyId === job.companyId) ?? null;
    const templateSummaries = result.dimensions.map((dimension) => ({ key: dimension.key, summary: dimension.summary }));
    const prompt = buildRefinePrompt({ job, company, profile: inputs.profile, bundle: inputs.bundle }, templateSummaries);

    let text: string;
    callIndex += 1;
    try {
      const outcome = await callModel(port, budget, { system: SYSTEM_PROMPT, prompt }, config, callIndex, modelUsage);
      if (!outcome.ok) {
        notes.push(`jobId=${result.jobId}：模型调用失败（响应丢失，不重发）；该候选保持模板文本。`);
        continue;
      }
      text = outcome.text;
    } catch (error) {
      if (error instanceof ModelBudgetError) {
        notes.push(`jobId=${result.jobId}：${error.message}；剩余候选全部保持模板文本。`);
        diagnostics.stages.push({ stage: 'model_refine', status: 'skipped', detail: `${error.code}: ${error.message}` } satisfies StageRecord);
        break;
      }
      throw error;
    }

    const ctx = { job, bundle: inputs.bundle };
    let verdict = validateRefineOutput(text, ctx);

    // 恰好一次修复（§11）：仅结构错误触发；修复轮同样受预算/时限约束。
    if (verdict.kind === 'structural_error') {
      if (Date.now() >= deadline) {
        notes.push(`jobId=${result.jobId}：整体软时限已到，不进行修复轮；保持模板文本。`);
        continue;
      }
      callIndex += 1;
      let repair: Awaited<ReturnType<typeof callModel>>;
      try {
        repair = await callModel(
          port,
          budget,
          { system: SYSTEM_PROMPT, prompt: buildRepairPrompt(prompt, text, verdict.errors) },
          config,
          callIndex,
          modelUsage,
        );
      } catch (error) {
        if (error instanceof ModelBudgetError) {
          notes.push(`jobId=${result.jobId}：修复轮${error.message}；剩余候选全部保持模板文本。`);
          diagnostics.stages.push({ stage: 'model_refine', status: 'skipped', detail: `${error.code}: 修复轮 ${error.message}` } satisfies StageRecord);
          break;
        }
        throw error;
      }
      if (repair.ok) {
        verdict = validateRefineOutput(repair.text, ctx);
      } else {
        notes.push(`jobId=${result.jobId}：修复轮调用失败（响应丢失）；保持模板文本。`);
        continue;
      }
    }

    if (verdict.kind === 'structural_error') {
      notes.push(`jobId=${result.jobId}：两次输出均未通过结构校验（${verdict.errors.length} 项）；保持模板文本。`);
      diagnostics.stages.push({ stage: 'model_refine', status: 'skipped', detail: `job=${result.jobId} 结构校验失败已降级` } satisfies StageRecord);
      continue;
    }

    const overrides = new Map<string, string>();
    for (const dimension of verdict.accepted) {
      overrides.set(dimension.key, dimension.summary);
    }
    for (const rejected of verdict.rejected) {
      notes.push(`jobId=${result.jobId} 维度 ${rejected.key ?? '(key 非法)'} 被拒（${rejected.errors[0] ?? ''}）；该维度回退模板。`);
    }
    acceptedTotal += verdict.accepted.length;
    rejectedTotal += verdict.rejected.length;
    if (overrides.size > 0) {
      working = { ...working, results: working.results.map((item) => (item.jobId === result.jobId ? applyOverrides(item, overrides) : item)) };
      anyAccepted = true;
    }
    diagnostics.stages.push({
      stage: 'model_refine',
      status: 'executed',
      detail: `job=${result.jobId} 接受 ${String(verdict.accepted.length)} 维/拒绝 ${String(verdict.rejected.length)} 维`,
    } satisfies StageRecord);
  }

  diagnostics.modelUsage = modelUsage.map((entry) => ({
    provider: entry.provider,
    requestId: entry.requestId,
    costMinor: entry.costMinor,
    tokens: entry.tokens,
  }));
  if (modelUsage.some((entry) => entry.outcome === 'transport_error')) {
    notes.push('存在响应丢失的模型调用：用量记为 unknown（不是零），未重发（§13）。');
  }

  const promptVersion = anyAccepted ? MODEL_PROMPT_VERSION : report.promptVersion;
  let finalReport = working;
  if (anyAccepted) {
    finalReport = { ...working, promptVersion };
    const selfCheck = matchReportSchema.safeParse(finalReport);
    if (!selfCheck.success) {
      throw cError('REPORT_OUTPUT_INVALID', '模型精炼后的报告未通过公共 schema 自检');
    }
    assertInvariantsPreserved(report, finalReport);
  } else {
    assertInvariantsPreserved(report, finalReport);
  }

  return {
    report: finalReport,
    diagnostics,
    promptVersion,
    modelUsage,
    acceptedDimensionCount: acceptedTotal,
    rejectedDimensionCount: rejectedTotal,
  };
}
