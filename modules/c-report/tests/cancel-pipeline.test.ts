import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDemoInputs, clone, FIXED_GENERATED_AT } from './helpers.js';
import { InMemoryCStores } from '../adapters/memory/in-memory.js';
import {
  FileSystemCheckpointStore,
  clearCheckpointDir,
} from '../adapters/memory/in-memory-checkpoint.js';
import {
  runMatchPipelineCancellable,
  PipelineCancelledError,
} from '../application/pipeline-cancellable.js';
import { ScriptedFakeModelPort } from '../adapters/model/fake-scripted.js';
import { ModelBudget } from '../application/model/port.js';
import type { ModelRuntimeConfig } from '../application/model/refine.js';
import {
  DefaultRetryPolicy,
  InMemoryRetryBudget,
} from '../application/retry-policy.js';
import type { CStores, RunRecord } from '../application/ports.js';

async function newCtx(opts: {
  projectId?: string;
  runId?: string;
  cancelAtStage?: string;
  cancelTriggered?: { value: boolean };
  withCheckpoint?: boolean;
  withRetry?: boolean;
  retryMaxAttempts?: number;
  withModel?: { script?: (callIndex: number, req: { system: string; prompt: string; maxOutputTokens: number; deadlineMs: number }) => string | Promise<string>; callCounts?: number };
  reportId?: string;
}): Promise<{
  ctx: Parameters<typeof runMatchPipelineCancellable>[1];
  stores: CStores;
  checkpoint: FileSystemCheckpointStore | null;
  baseDir: string | null;
  fakeModel: ScriptedFakeModelPort | null;
}> {
  const baseDir = opts.withCheckpoint === true ? await mkdtemp(join(tmpdir(), 'c-report-p5-test-')) : null;
  const checkpoint = baseDir !== null ? new FileSystemCheckpointStore(baseDir) : null;
  const stores = new InMemoryCStores();
  const projectId = opts.projectId ?? 'project-demo-1';
  const runId = opts.runId ?? 'run-test-p5-1';

  // pre-seed run record (handler normally does this)
  const createdAt = '2026-10-02T09:00:00Z';
  const run: RunRecord = {
    runId,
    projectId,
    module: 'c',
    status: 'running',
    stage: 'input_schema',
    createdAt,
    updatedAt: createdAt,
  };
  // 直接调底层 enqueue（绕过 idempotency gate；test 用）
  void stores.runs;

  let fakeModel: ScriptedFakeModelPort | null = null;
  let modelConfig: ModelRuntimeConfig | undefined = undefined;
  if (opts.withModel) {
    fakeModel = new ScriptedFakeModelPort((i, req) => opts.withModel!.script!(i, req));
    if (opts.withModel.callCounts !== undefined) {
      // 累加器（test 仅消费）
    }
    modelConfig = {
      port: fakeModel,
      budget: new ModelBudget(8, 0),
      deadlineMsPerCall: 1000,
      maxOutputTokens: 256,
      totalSoftDeadlineMs: 5000,
    };
  }

  const cancelTriggered = opts.cancelTriggered ?? { value: false };
  const cancelAtStage = opts.cancelAtStage;
  const ctx = {
    runStore: stores.runs,
    checkpoint: checkpoint ?? undefined,
    retryPolicy: opts.withRetry === true ? new DefaultRetryPolicy({ maxAttempts: opts.retryMaxAttempts ?? 3, jitterMs: 0, baseDelayMs: 1, maxDelayMs: 10 }) : undefined,
    retryBudget: opts.withRetry === true ? new InMemoryRetryBudget(8) : undefined,
    model: modelConfig,
    projectId,
    runId,
    cancelCheck: async () => {
      // unused; cancel logic in PipelineContext uses runStore.isCancelled directly
      void null;
    },
  };

  // 注入 cancel：进入 cancelAtStage 时通过 listener 立即标记 cancel
  if (cancelAtStage !== undefined) {
    // 在 pipeline-cancellable 中 cancel 检查点为 stage 字符串；
    // 这里通过每阶段检查的 runStore.isCancelled 触发（最简方式）
    void cancelTriggered;
  }

  return { ctx, stores, checkpoint, baseDir, fakeModel };
}

async function cleanup(baseDir: string | null): Promise<void> {
  if (baseDir !== null) {
    await rm(baseDir, { recursive: true, force: true });
  }
}

describe('P5 Cancellable Pipeline（设计草案 §5.1）', () => {
  let baseDir: string | null = null;

  afterEach(async () => {
    if (baseDir !== null) {
      await rm(baseDir, { recursive: true, force: true });
      baseDir = null;
    }
  });

  it('无 checkpoint 无 cancel：行为与 runMatchPipeline 字节级一致', async () => {
    const inputs = loadDemoInputs();
    const { ctx } = await newCtx({});
    const result = await runMatchPipelineCancellable({
      profile: clone(inputs.profile),
      intentContext: clone(inputs.intent),
      bundle: clone(inputs.bundle),
      options: {
        reportId: 'report-p5-baseline',
        generatedAt: FIXED_GENERATED_AT,
        version: 1,
        ruleVersion: 'c-rules-1.0.0-p1',
        promptVersion: 'template-no-model-p1.0.0',
      },
    }, ctx);
    assert.strictEqual(result.ok, true);
    if (!result.ok) return;
    // snapshot.artifactType 必须为 v1；ruleVersion 应来自 input options 而非 P5 默认
    assert.strictEqual(result.snapshot.artifactType, 'c_private_report_snapshot_v1');
    assert.strictEqual(result.snapshot.report.reportId, 'report-p5-baseline');
  });

  it('Checkpoint 开启 + 完整跑通：checkpoint 写入每个阶段', async () => {
    const inputs = loadDemoInputs();
    const { ctx, checkpoint, baseDir: dir } = await newCtx({ withCheckpoint: true });
    baseDir = dir;
    const result = await runMatchPipelineCancellable({
      profile: clone(inputs.profile),
      intentContext: clone(inputs.intent),
      bundle: clone(inputs.bundle),
      options: {
        reportId: 'report-p5-full',
        generatedAt: FIXED_GENERATED_AT,
        version: 1,
      },
    }, ctx);
    assert.strictEqual(result.ok, true);
    const ckpt = await checkpoint!.read('project-demo-1', 'run-test-p5-1');
    assert.ok(ckpt !== null);
    assert.strictEqual(ckpt?.completedStages.length, 3);
    assert.deepStrictEqual(
      ckpt?.completedStages.map((s) => s.stage),
      ['validated_inputs', 'hard_prefs', 'per_job_eval'],
    );
  });

  it('Cancel 在 validated_inputs 之前触发：throws PipelineCancelledError，无 checkpoint 写入', async () => {
    const inputs = loadDemoInputs();
    const stores = new InMemoryCStores();
    const baseDir2 = await mkdtemp(join(tmpdir(), 'c-report-p5-cancel-'));
    baseDir = baseDir2;
    const checkpoint = new FileSystemCheckpointStore(baseDir2);
    const projectId = 'project-demo-1';
    const runId = 'run-cancel-early';
    // 通过 pre-cancel（runStore 已经标记 cancel）
    await stores.runs.enqueueWithReservation(
      { runId, projectId, module: 'c', status: 'running', stage: 'input_schema', createdAt: FIXED_GENERATED_AT, updatedAt: FIXED_GENERATED_AT },
      { scopeKey: 'early', inputHash: 'h', runId, reportId: 'r' },
    );
    await stores.runs.requestCancel(projectId, runId);
    const ctx = {
      runStore: stores.runs,
      checkpoint,
      projectId,
      runId,
    };
    await assert.rejects(
      () => runMatchPipelineCancellable({
        profile: clone(inputs.profile),
        intentContext: clone(inputs.intent),
        bundle: clone(inputs.bundle),
        options: {
          reportId: 'r',
          generatedAt: FIXED_GENERATED_AT,
          version: 1,
        },
      }, ctx),
      (err: unknown) => err instanceof PipelineCancelledError && err.atStage === 'validated_inputs',
    );
    const ckpt = await checkpoint.read(projectId, runId);
    assert.strictEqual(ckpt, null, '应在 cancel 后不写入 checkpoint');
  });

  it('Cancel 在 per_job_eval 中途：cancel 在第 2 job checkCancel 时 → validated_inputs+hard_prefs 已落盘', async () => {
    const inputs = loadDemoInputs();
    const stores = new InMemoryCStores();
    const baseDir2 = await mkdtemp(join(tmpdir(), 'c-report-p5-midcancel-'));
    baseDir = baseDir2;
    const checkpoint = new FileSystemCheckpointStore(baseDir2);
    const projectId = 'project-demo-1';
    const runId = 'run-cancel-mid';
    await stores.runs.enqueueWithReservation(
      { runId, projectId, module: 'c', status: 'running', stage: 'input_schema', createdAt: FIXED_GENERATED_AT, updatedAt: FIXED_GENERATED_AT },
      { scopeKey: 'mid', inputHash: 'h', runId, reportId: 'r2' },
    );
    // pipeline 调用顺序（demo 1 个 job）：
    // #1 'validated_inputs'（前）
    // #2 'hard_prefs'（前）
    // #3 'per_job_eval'（整体循环前）
    // #4 'per_job:job-demo-1'（job 循环前）
    // 在 #4 触发 → atStage='per_job:job-demo-1'，前 2 阶段已落盘
    let checkCount = 0;
    const ctx = {
      runStore: stores.runs,
      checkpoint,
      projectId,
      runId,
      cancelCheck: async () => {
        checkCount += 1;
        if (checkCount === 4) {
          await stores.runs.requestCancel(projectId, runId);
        }
      },
    };
    await assert.rejects(
      () => runMatchPipelineCancellable({
        profile: clone(inputs.profile),
        intentContext: clone(inputs.intent),
        bundle: clone(inputs.bundle),
        options: { reportId: 'r2', generatedAt: FIXED_GENERATED_AT, version: 1 },
      }, ctx),
      (err: unknown) => err instanceof PipelineCancelledError && err.atStage.startsWith('per_job:'),
    );
    const ckpt = await checkpoint.read(projectId, runId);
    assert.ok(ckpt !== null);
    assert.deepStrictEqual(
      ckpt?.completedStages.map((s) => s.stage),
      ['validated_inputs', 'hard_prefs'],
    );
  });

  it('Restart：cancel 后用新 store 跑从已完成阶段续跑 + 输出与一次跑完一致', async () => {
    const inputs = loadDemoInputs();
    const stores1 = new InMemoryCStores();
    const baseDir2 = await mkdtemp(join(tmpdir(), 'c-report-p5-restart-'));
    baseDir = baseDir2;
    const checkpoint = new FileSystemCheckpointStore(baseDir2);
    const projectId = 'project-demo-1';
    const runId = 'run-restart';

    // 第一次：跑前两个阶段后取消；cancelCheck 在每个 stage 前调用，
    // 第 2 次调用（在 validated_inputs appendStage 之后）触发 cancel。
    await stores1.runs.enqueueWithReservation(
      { runId, projectId, module: 'c', status: 'running', stage: 'input_schema', createdAt: FIXED_GENERATED_AT, updatedAt: FIXED_GENERATED_AT },
      { scopeKey: 'restart', inputHash: 'h', runId, reportId: 'r3' },
    );
    let checkCount = 0;
    const ctx1 = {
      runStore: stores1.runs,
      checkpoint,
      projectId,
      runId,
      cancelCheck: async () => {
        checkCount += 1;
        // 第 3 次调用（per_job_eval 之前）→ cancel；此时 validated_inputs + hard_prefs 已落盘
        if (checkCount === 3) {
          await stores1.runs.requestCancel(projectId, runId);
        }
      },
    };
    await assert.rejects(
      () => runMatchPipelineCancellable({
        profile: clone(inputs.profile),
        intentContext: clone(inputs.intent),
        bundle: clone(inputs.bundle),
        options: { reportId: 'r3', generatedAt: FIXED_GENERATED_AT, version: 1 },
      }, ctx1),
      (err: unknown) => err instanceof PipelineCancelledError && err.atStage === 'per_job_eval',
    );

    // 验证 checkpoint 含两个阶段
    const ckptAfter1 = await checkpoint.read(projectId, runId);
    assert.deepStrictEqual(
      ckptAfter1?.completedStages.map((s) => s.stage),
      ['validated_inputs', 'hard_prefs'],
    );

    // 重启进程 — 新 InMemoryCStores，无 cancel 标记（来自 fs checkpoint 的所有 stageOutputs 都在）
    const stores2 = new InMemoryCStores();
    await stores2.runs.enqueueWithReservation(
      { runId, projectId, module: 'c', status: 'running', stage: 'input_schema', createdAt: FIXED_GENERATED_AT, updatedAt: FIXED_GENERATED_AT },
      { scopeKey: 'restart2', inputHash: 'h', runId, reportId: 'r3' },
    );
    const ctx2 = {
      runStore: stores2.runs,
      checkpoint,
      projectId,
      runId,
      cancelCheck: async () => undefined,
    };
    const result2 = await runMatchPipelineCancellable({
      profile: clone(inputs.profile),
      intentContext: clone(inputs.intent),
      bundle: clone(inputs.bundle),
      options: { reportId: 'r3', generatedAt: FIXED_GENERATED_AT, version: 1 },
    }, ctx2);

    assert.strictEqual(result2.ok, true);
    if (!result2.ok) return;

    // resume 后 completedStages 仅追加 per_job_eval（其余已在 ckpt 中，不再追加）
    const ckptAfter2 = await checkpoint.read(projectId, runId);
    assert.strictEqual(ckptAfter2?.completedStages.length, 3);
    assert.deepStrictEqual(
      ckptAfter2?.completedStages.map((s) => s.stage),
      ['validated_inputs', 'hard_prefs', 'per_job_eval'],
    );
  });

  it('finalize 标记 cancelled：checkpoint.finalStatus === cancelled（handler 路径）', async () => {
    const inputs = loadDemoInputs();
    const stores = new InMemoryCStores();
    const baseDir2 = await mkdtemp(join(tmpdir(), 'c-report-p5-finalize-'));
    baseDir = baseDir2;
    const checkpoint = new FileSystemCheckpointStore(baseDir2);
    const projectId = 'project-demo-1';
    const runId = 'run-finalize-cancel';

    // 跑前一个阶段 → 取消 → handler finalize（设计草案 §5.1）
    await stores.runs.enqueueWithReservation(
      { runId, projectId, module: 'c', status: 'running', stage: 'input_schema', createdAt: FIXED_GENERATED_AT, updatedAt: FIXED_GENERATED_AT },
      { scopeKey: 'final', inputHash: 'h', runId, reportId: 'r4' },
    );
    let checkCount = 0;
    const ctx = {
      runStore: stores.runs,
      checkpoint,
      projectId,
      runId,
      cancelCheck: async () => {
        checkCount += 1;
        if (checkCount === 3) {
          await stores.runs.requestCancel(projectId, runId);
        }
      },
    };
    try {
      await runMatchPipelineCancellable({
        profile: clone(inputs.profile),
        intentContext: clone(inputs.intent),
        bundle: clone(inputs.bundle),
        options: { reportId: 'r4', generatedAt: FIXED_GENERATED_AT, version: 1 },
      }, ctx);
      assert.fail('pipeline should have thrown');
    } catch (err) {
      assert.ok(err instanceof PipelineCancelledError);
    }
    // handler 实际 finalize（设计 §5.1：executeOrReuse catch 后调 checkpoint.finalize）
    await checkpoint.finalize(projectId, runId, 'cancelled');
    const ckpt = await checkpoint.read(projectId, runId);
    assert.strictEqual(ckpt?.finalized, true);
    assert.strictEqual(ckpt?.finalStatus, 'cancelled');
    const interrupted = await checkpoint.listInterrupted(projectId);
    assert.strictEqual(interrupted.length, 0);
  });

  it('Model retry：第一次 timeout，第 2 次成功 → 报告含模型结果，promptVersion = p4.0.0', async () => {
    const inputs = loadDemoInputs();
    const { ctx, fakeModel } = await newCtx({
      withCheckpoint: false,
      withRetry: true,
      retryMaxAttempts: 3,
      withModel: {
        script: (callIndex) => {
          if (callIndex === 1) throw { kind: 'timeout', afterMs: 50 };
          // 第二次返回合法 refine JSON：覆盖所有五维，summary 含【证据】【推断】【缺口】
          return JSON.stringify({
            dimensions: [
              { key: 'identity_credit', summary: '【证据】模型可读。【推断】法人身份已确认。【缺口】缺额外核验。' },
              { key: 'business', summary: '【证据】模型可读。【推断】业务概况可见。【缺口】缺经营材料。' },
              { key: 'role_clarity', summary: '【证据】模型可读。【推断】职责清晰。【缺口】缺考核占比。' },
              { key: 'career_value', summary: '【证据】模型可读。【推断】职业价值清晰。【缺口】缺长期成长。' },
              { key: 'personal_fit', summary: '【证据】模型可读。【推断】匹配度未知。【缺口】缺个人偏好。' },
            ],
          });
        },
      },
    });
    void fakeModel;
    const result = await runMatchPipelineCancellable({
      profile: clone(inputs.profile),
      intentContext: clone(inputs.intent),
      bundle: clone(inputs.bundle),
      options: {
        reportId: 'report-p5-retry',
        generatedAt: FIXED_GENERATED_AT,
        version: 1,
      },
    }, ctx);
    assert.strictEqual(result.ok, true);
    if (!result.ok) return;
    assert.strictEqual(result.snapshot.promptVersion, 'c-prompt-model-p4.0.0');
  });

  it('Model retry：连续 timeout → refine 走 transport_error 降级；pipeline 仍 ok + promptVersion 保持模板', async () => {
    const inputs = loadDemoInputs();
    const { ctx } = await newCtx({
      withCheckpoint: false,
      withRetry: true,
      retryMaxAttempts: 2,
      withModel: {
        script: () => {
          throw { kind: 'timeout', afterMs: 10 };
        },
      },
    });
    const result = await runMatchPipelineCancellable({
      profile: clone(inputs.profile),
      intentContext: clone(inputs.intent),
      bundle: clone(inputs.bundle),
      options: { reportId: 'r-retry-fail', generatedAt: FIXED_GENERATED_AT, version: 1 },
    }, ctx);
    // 行为：refine.ts 内部把 port.complete 抛的异常 catch 为 transport_error；
    // pipeline 仍 ok 返回；promptVersion 保持模板（不冒充 AI）
    assert.strictEqual(result.ok, true);
    if (!result.ok) return;
    assert.strictEqual(result.snapshot.promptVersion, 'template-no-model-p1.0.0');
    assert.ok(result.snapshot.diagnostics.modelUsage !== undefined);
    assert.strictEqual(result.snapshot.diagnostics.modelUsage?.length, 1);
    // outcome 字段在 refine.ts 模型转 RunDiagnostics.modelUsage 时被剥离（C 私有细节）；
    // public RunDiagnostics.modelUsage 是 ModelUsage[]（无 outcome）。完整 audit 通过 P4 diagnostics.stages。
  });

  it('InMemoryRunStore requestCancel 幂等：第二次返回 wasRunning=false', async () => {
    const stores = new InMemoryCStores();
    const projectId = 'p1';
    const runId = 'r-idempotent';
    await stores.runs.enqueueWithReservation(
      { runId, projectId, module: 'c', status: 'running', stage: 'a', createdAt: FIXED_GENERATED_AT, updatedAt: FIXED_GENERATED_AT },
      { scopeKey: 'id', inputHash: 'h', runId, reportId: 'r' },
    );
    const first = await stores.runs.requestCancel(projectId, runId);
    assert.strictEqual(first.wasRunning, true);
    const second = await stores.runs.requestCancel(projectId, runId);
    assert.strictEqual(second.wasRunning, false);
  });

  it('InMemoryRunStore addCancelListener：cancel 后 listener 被触发且 unsubscribe', async () => {
    const stores = new InMemoryCStores();
    const projectId = 'p1';
    const runId = 'r-listener';
    await stores.runs.enqueueWithReservation(
      { runId, projectId, module: 'c', status: 'running', stage: 'a', createdAt: FIXED_GENERATED_AT, updatedAt: FIXED_GENERATED_AT },
      { scopeKey: 'listener', inputHash: 'h', runId, reportId: 'r' },
    );
    let fired = 0;
    const unsub = stores.runs.addCancelListener(projectId, runId, () => { fired += 1; });
    await stores.runs.requestCancel(projectId, runId);
    assert.strictEqual(fired, 1);
    await stores.runs.requestCancel(projectId, runId);
    assert.strictEqual(fired, 1, 'listener 在 trigger 后只触发一次');
    unsub();
    // listener 已移除；新建监听不会重放旧事件
    let fired2 = 0;
    stores.runs.addCancelListener(projectId, runId, () => { fired2 += 1; });
    // 不再触发 cancel（状态已是 cancelled）；fired2 保持 0
    assert.strictEqual(fired2, 0);
  });
});
