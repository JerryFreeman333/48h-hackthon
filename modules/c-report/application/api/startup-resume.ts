/**
 * P5 §6.2 [C-IMPL-STARTUP-RESUME]：handler 启动时遍历 CheckpointStore.listInterrupted 续跑。
 *
 * 设计要点：
 * - 检查点 CheckpointStore.init 时携带 storedInputs（profile + intentContext + bundle），
 *   resume 时无需回退 snapshot bundle，archive 完全自治。
 * - 未配置 storedInputs 的旧 ckpt 视为不可续跑，记录 skip 计数（不抛错）。
 * - 续跑用 runMatchPipelineCancellable —— 它读到 ckpt 已存在 completedStages 会跳过；
 *   若 ckpt 仅 init（无 completedStages），从第一阶段开始。
 * - resume 完成后 checkpoint.finalize 写入 finalStatus；
 *   pipeline 报错也走 finalize('failed')，避免下次启动再次尝试。
 * - 接口为 CApiContext.onStartup 一等公民：调用方在合适时机触发（demo runtime setTimeout，
 *   生产 boot 同步；§6.2).
 */
import type { CApiContext } from './handlers.js';
import type { RunCheckpoint } from '../ports.js';
import { runMatchPipelineCancellable, PipelineCancelledError } from '../pipeline-cancellable.js';

export interface ResumeOutcome {
  projectId: string;
  runId: string;
  reportId: string;
  status: 'completed' | 'partial' | 'failed' | 'skipped_no_inputs' | 'skip_cancelled';
  reason?: string;
}

export interface ResumeReport {
  resumed: number;
  failed: number;
  skipped: number;
  outcomes: ResumeOutcome[];
}

/** Resume 一条 checkpoint（per-runId）；handler 不调，但作为 `runOne` 单测入口。 */
export async function runOne(
  ctx: CApiContext,
  ckpt: RunCheckpoint,
): Promise<ResumeOutcome> {
  if (ctx.checkpoint === undefined) {
    return { projectId: ckpt.projectId, runId: ckpt.runId, reportId: ckpt.reportId, status: 'skipped_no_inputs', reason: 'ctx.checkpoint 未配置' };
  }
  // storedInputs 可选：老 ckpt 文件可能没有
  const rawCkpt = ckpt as RunCheckpoint & { storedInputs?: { profile: unknown; intentContext: unknown; bundle: unknown } | null };
  const stored = rawCkpt.storedInputs ?? null;
  if (stored === null) {
    return { projectId: ckpt.projectId, runId: ckpt.runId, reportId: ckpt.reportId, status: 'skipped_no_inputs', reason: 'checkpoint 未携带 storedInputs（老 ckpt 文件或生产侧未存）' };
  }
  if (ctx.stores.runs.isCancelled === undefined) {
    return { projectId: ckpt.projectId, runId: ckpt.runId, reportId: ckpt.reportId, status: 'failed', reason: 'ctx.stores.runs 缺少 isCancelled' };
  }
  // 取消检查：若 run 被取消标记，跳过续跑
  if (await ctx.stores.runs.isCancelled(ckpt.projectId, ckpt.runId)) {
    return { projectId: ckpt.projectId, runId: ckpt.runId, reportId: ckpt.reportId, status: 'skip_cancelled', reason: 'run 已被 requestCancel' };
  }

  const reportId = ckpt.reportId.length > 0 ? ckpt.reportId : ctx.newId('report');
  const nextVersion = ckpt.version > 0 ? ckpt.version : 1;

  try {
    const pipeline = await runMatchPipelineCancellable({
      profile: stored.profile,
      intentContext: stored.intentContext,
      bundle: stored.bundle,
      options: {
        reportId,
        generatedAt: ctx.now(),
        version: nextVersion,
        ruleVersion: ckpt.ruleVersion.length > 0 ? ckpt.ruleVersion : 'c-rules-1.0.0-p1',
        promptVersion: ckpt.promptVersion.length > 0 ? ckpt.promptVersion : 'template-no-model-p1.0.0',
      },
    }, {
      runStore: ctx.stores.runs,
      checkpoint: ctx.checkpoint,
      retryPolicy: ctx.retryPolicy,
      retryBudget: ctx.retryBudget,
      model: ctx.model,
      projectId: ckpt.projectId,
      runId: ckpt.runId,
    });

    if (!pipeline.ok) {
      await ctx.checkpoint.finalize(ckpt.projectId, ckpt.runId, 'failed');
      return { projectId: ckpt.projectId, runId: ckpt.runId, reportId, status: 'failed', reason: pipeline.error.code };
    }

    // 写不可变版本 + 索引（与 executeOrReuse 同步：不可变 + index 双写快照）
    await ctx.stores.reportVersions.insert(ckpt.projectId, `${reportId}:v${pipeline.report.version}`, {
      report: pipeline.report,
      ownerId: 'demo-owner-resume', // demo runtime 单 owner；生产 ownerId 从 snapshot 推
      runId: ckpt.runId,
      createdAt: pipeline.report.generatedAt,
    });
    await ctx.stores.reportSnapshots.insert(ckpt.projectId, `${reportId}:v${pipeline.report.version}`, {
      report: pipeline.report,
      snapshot: pipeline.snapshot,
      ownerId: 'demo-owner-resume', // demo runtime 单 owner；生产 ownerId 从 snapshot 推
      projectId: ckpt.projectId,
      runId: ckpt.runId,
      createdAt: pipeline.report.generatedAt,
    });
    try {
      await ctx.stores.reportIndex.appendVersion(ckpt.projectId, reportId, pipeline.report.version, ckpt.runId, ctx.now(), pipeline.report.completeness === 'complete_for_scope' ? 'completed' : 'partial');
    } catch {
      // index 可能已存在；resume 不强制重建
    }
    await ctx.stores.runs.updateStatus(ckpt.projectId, ckpt.runId, pipeline.report.completeness === 'complete_for_scope' ? 'completed' : 'partial', 'report_selfcheck_resumed');
    await ctx.checkpoint.finalize(ckpt.projectId, ckpt.runId, pipeline.report.completeness === 'complete_for_scope' ? 'completed' : 'partial');

    return {
      projectId: ckpt.projectId,
      runId: ckpt.runId,
      reportId,
      status: pipeline.report.completeness === 'complete_for_scope' ? 'completed' : 'partial',
    };
  } catch (err) {
    if (err instanceof PipelineCancelledError) {
      await ctx.checkpoint.finalize(ckpt.projectId, ckpt.runId, 'cancelled');
      return { projectId: ckpt.projectId, runId: ckpt.runId, reportId, status: 'skip_cancelled', reason: `cancelled at ${err.atStage}` };
    }
    await ctx.checkpoint.finalize(ckpt.projectId, ckpt.runId, 'failed');
    return { projectId: ckpt.projectId, runId: ckpt.runId, reportId, status: 'failed', reason: err instanceof Error ? err.message : String(err) };
  }
}

/** Resume 所有 interrupted checkpoints（按 project 遍历）。 */
export async function resumeInterruptedRuns(ctx: CApiContext, options?: { projects?: string[] }): Promise<ResumeReport> {
  if (ctx.checkpoint === undefined) {
    return { resumed: 0, failed: 0, skipped: 0, outcomes: [] };
  }
  const store = ctx.checkpoint;
  const projects = options?.projects ?? await store.listProjects();
  const outcomes: ResumeOutcome[] = [];
  for (const projectId of projects) {
    let interrupted;
    try {
      interrupted = await store.listInterrupted(projectId);
    } catch {
      continue;
    }
    for (const ckpt of interrupted) {
      const out = await runOne(ctx, ckpt);
      outcomes.push(out);
    }
  }
  return {
    resumed: outcomes.filter((o) => o.status === 'completed' || o.status === 'partial').length,
    failed: outcomes.filter((o) => o.status === 'failed').length,
    skipped: outcomes.filter((o) => o.status === 'skipped_no_inputs' || o.status === 'skip_cancelled').length,
    outcomes,
  };
}

/**
 * 注入到 CApiContext.onStartup（§6.2 推荐签名）。
 * - demo runtime：用 setTimeout 异步触发，避免 boot 阻塞首请求
 * - 生产宿主：boot 同步触发；如需 durable scheduler，宿主自行包装
 */
export async function onStartup(ctx: CApiContext): Promise<ResumeReport> {
  return resumeInterruptedRuns(ctx);
}
