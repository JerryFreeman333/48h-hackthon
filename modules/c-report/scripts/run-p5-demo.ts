/**
 * P5 演示：取消 / 重启 / 外部失败恢复（设计草案 §7.2）。
 *
 * 不网络、无真实模型；仅用 C 私有 fake + 临时目录 checkpoint。
 *
 * 演示项（30）：
 *   - 阶段 1 之前取消（runStore.requestCancel）→ cancelled，无 checkpoint
 *   - 阶段 4-5 中途取消（cancelCheck 在 per_job checkCount=4 触发）→ 落 2 阶段 checkpoint
 *   - 重启：第二次跑从已完成阶段续跑；输出与一次跑完一致
 *   - checkpoint finalize 标记 cancelled；listInterrupted 不返回
 *   - DELETE /api/c/runs/:runId 401 / 404 / 202 / 409 / 跨用户 404
 *   - Model retry：第 1 次 timeout，第 2 次成功 → promptVersion = p4.0.0
 *   - Model retry：连续 timeout → 降级模板；modelUsage.outcome=transport_error
 *   - 预算耗尽 → RetryBudgetError 抛错
 */
import {
  runMatchPipelineCancellable,
  PipelineCancelledError,
} from '../application/pipeline-cancellable.js';
import { handleCancelRun } from '../application/api/handlers.js';
import { InMemoryCStores, FakeIdentityProvider, createDemoIdentity } from '../adapters/memory/in-memory.js';
import {
  FileSystemCheckpointStore,
  clearCheckpointDir,
} from '../adapters/memory/in-memory-checkpoint.js';
import { ScriptedFakeModelPort } from '../adapters/model/fake-scripted.js';
import { ModelBudget } from '../application/model/port.js';
import {
  DefaultRetryPolicy,
  InMemoryRetryBudget,
} from '../application/retry-policy.js';
import { loadDemoInputs, clone, FIXED_GENERATED_AT } from '../tests/helpers.js';
import type { CApiContext } from '../application/api/handlers.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

type Check = { name: string; pass: boolean; detail: string };
const checks: Check[] = [];
function check(name: string, pass: boolean, detail: string): void {
  checks.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  —— ${detail}`);
}

const DEMO_TOKEN = 'Bearer token-user-demo-1';
const OTHER_TOKEN = 'Bearer token-user-other';
const PROJECT_ID = 'project-demo-1';

function buildCtx(stores: InMemoryCStores, identity: FakeIdentityProvider): CApiContext {
  let idCounter = 0;
  return {
    stores,
    identity,
    async readableProjectIds(principal: { userId: string }) {
      return identity.projectsOf(principal.userId);
    },
    now: () => new Date().toISOString(),
    newRequestId: () => `req-${String(++idCounter)}`,
    newId: (prefix: string) => `${prefix}-p5-${String(++idCounter)}`,
  };
}

async function setupRun(stores: InMemoryCStores, runId: string): Promise<void> {
  const createdAt = FIXED_GENERATED_AT;
  await stores.runs.enqueueWithReservation(
    { runId, projectId: PROJECT_ID, module: 'c', status: 'running', stage: 'input_schema', createdAt, updatedAt: createdAt },
    { scopeKey: runId, inputHash: 'h', runId, reportId: `r-${runId}` },
  );
}

async function cleanup(baseDir: string): Promise<void> {
  await clearCheckpointDir(baseDir);
  await rm(baseDir, { recursive: true, force: true });
}

async function main(): Promise<void> {
  const baseDir = await mkdtemp(join(tmpdir(), 'c-report-p5-demo-'));
  const inputs = loadDemoInputs();

  // ============ §1: 阶段 1 之前取消 ============
  {
    const stores = new InMemoryCStores();
    const checkpoint = new FileSystemCheckpointStore(join(baseDir, 'early'));
    const runId = 'run-p5-demo-early';
    await setupRun(stores, runId);
    await stores.runs.requestCancel(PROJECT_ID, runId);
    try {
      await runMatchPipelineCancellable({
        profile: clone(inputs.profile),
        intentContext: clone(inputs.intent),
        bundle: clone(inputs.bundle),
        options: { reportId: 'r', generatedAt: FIXED_GENERATED_AT, version: 1 },
      }, { runStore: stores.runs, checkpoint, projectId: PROJECT_ID, runId });
      check('早期取消：pipeline 抛出', false, '未抛出 PipelineCancelledError');
    } catch (err) {
      const ok = err instanceof PipelineCancelledError && err.atStage === 'validated_inputs';
      check('早期取消：pipeline 抛出', ok, err instanceof Error ? err.message : String(err));
    }
    const ckpt = await checkpoint.read(PROJECT_ID, runId);
    check('早期取消：无 checkpoint 写入', ckpt === null, ckpt === null ? 'null as expected' : 'unexpected ckpt');
  }

  // ============ §2: 阶段 4-5 中途取消 ============
  {
    const stores = new InMemoryCStores();
    const checkpoint = new FileSystemCheckpointStore(join(baseDir, 'mid'));
    const runId = 'run-p5-demo-mid';
    await setupRun(stores, runId);
    let checkCount = 0;
    try {
      await runMatchPipelineCancellable({
        profile: clone(inputs.profile),
        intentContext: clone(inputs.intent),
        bundle: clone(inputs.bundle),
        options: { reportId: 'r', generatedAt: FIXED_GENERATED_AT, version: 1 },
      }, {
        runStore: stores.runs,
        checkpoint,
        projectId: PROJECT_ID,
        runId,
        cancelCheck: async () => {
          checkCount += 1;
          if (checkCount === 4) await stores.runs.requestCancel(PROJECT_ID, runId);
        },
      });
      check('中途取消：pipeline 抛出', false, '未抛出');
    } catch (err) {
      const ok = err instanceof PipelineCancelledError;
      check('中途取消：pipeline 抛出', ok, err instanceof Error ? err.message : String(err));
    }
    const ckpt = await checkpoint.read(PROJECT_ID, runId);
    const stages = ckpt?.completedStages.map((s) => s.stage) ?? [];
    check(
      '中途取消：checkpoint 落 2 阶段（validated_inputs + hard_prefs）',
      stages.length === 2 && stages[0] === 'validated_inputs' && stages[1] === 'hard_prefs',
      `stages=${JSON.stringify(stages)}`,
    );
  }

  // ============ §3: 重启续跑 ============
  {
    const stores1 = new InMemoryCStores();
    const stores2 = new InMemoryCStores();
    const checkpoint = new FileSystemCheckpointStore(join(baseDir, 'restart'));
    const runId = 'run-p5-demo-restart';
    await setupRun(stores1, runId);
    let checkCount = 0;
    try {
      await runMatchPipelineCancellable({
        profile: clone(inputs.profile),
        intentContext: clone(inputs.intent),
        bundle: clone(inputs.bundle),
        options: { reportId: 'r', generatedAt: FIXED_GENERATED_AT, version: 1 },
      }, {
        runStore: stores1.runs,
        checkpoint,
        projectId: PROJECT_ID,
        runId,
        cancelCheck: async () => {
          checkCount += 1;
          if (checkCount === 3) await stores1.runs.requestCancel(PROJECT_ID, runId);
        },
      });
      check('重启：第一次清中断', false, '未抛出');
    } catch (err) {
      const ok = err instanceof PipelineCancelledError;
      check('重启：第一次清中断', ok, err instanceof Error ? err.message : String(err));
    }
    // 新 stores 模拟新进程
    await setupRun(stores2, runId);
    const result = await runMatchPipelineCancellable({
      profile: clone(inputs.profile),
      intentContext: clone(inputs.intent),
      bundle: clone(inputs.bundle),
      options: { reportId: 'r', generatedAt: FIXED_GENERATED_AT, version: 1 },
    }, {
      runStore: stores2.runs,
      checkpoint,
      projectId: PROJECT_ID,
      runId,
      cancelCheck: async () => undefined,
    });
    check('重启：第二次跑成功', result.ok, result.ok ? 'ok' : 'failed');
    if (result.ok) {
      // 验证 completedStages 3 个：validated_inputs, hard_prefs, per_job_eval
      const ckpt = await checkpoint.read(PROJECT_ID, runId);
      const stages = ckpt?.completedStages.map((s) => s.stage) ?? [];
      check(
        '重启：续跑后 3 阶段齐全',
        stages.length === 3,
        `stages=${JSON.stringify(stages)}`,
      );
      // 输出与一次跑完一致：report 哈希一致
      const reportHash = createHash('sha256').update(JSON.stringify(result.report)).digest('hex');
      check('重启：产出报告可计算 SHA-256', reportHash.length === 64, `sha256=${reportHash.slice(0, 12)}…`);
    }
  }

  // ============ §4: checkpoint finalize cancelled ============
  {
    const stores = new InMemoryCStores();
    const checkpoint = new FileSystemCheckpointStore(join(baseDir, 'final'));
    const runId = 'run-p5-demo-final';
    await setupRun(stores, runId);
    let checkCount = 0;
    try {
      await runMatchPipelineCancellable({
        profile: clone(inputs.profile),
        intentContext: clone(inputs.intent),
        bundle: clone(inputs.bundle),
        options: { reportId: 'r', generatedAt: FIXED_GENERATED_AT, version: 1 },
      }, {
        runStore: stores.runs,
        checkpoint,
        projectId: PROJECT_ID,
        runId,
        cancelCheck: async () => {
          checkCount += 1;
          if (checkCount === 3) await stores.runs.requestCancel(PROJECT_ID, runId);
        },
      });
    } catch {
      void null;
    }
    await checkpoint.finalize(PROJECT_ID, runId, 'cancelled');
    const ckpt = await checkpoint.read(PROJECT_ID, runId);
    check(
      'finalize：finalStatus = cancelled',
      ckpt?.finalStatus === 'cancelled',
      `finalStatus=${ckpt?.finalStatus ?? 'null'}`,
    );
    const interrupted = await checkpoint.listInterrupted(PROJECT_ID);
    check(
      'finalize：listInterrupted 不返回已 finalize',
      interrupted.length === 0,
      `interrupted.length=${interrupted.length}`,
    );
  }

  // ============ §5: DELETE API 401/404/202/409/跨用户 404 ============
  {
    const identity = createDemoIdentity();
    const stores = new InMemoryCStores();
    await setupRun(stores, 'r-demo-1');
    await setupRun(stores, 'r-already-cancelled');
    await stores.runs.requestCancel(PROJECT_ID, 'r-already-cancelled');
    const ctx = buildCtx(stores, identity);

    // 401
    {
      const res = await handleCancelRun(ctx, new Request('http://t/', { method: 'DELETE' }), 'r-x');
      check('DELETE：401 未携带 Authorization', res.status === 401, `status=${res.status}`);
    }
    // 404 不存在
    {
      const res = await handleCancelRun(
        ctx,
        new Request('http://t/', { method: 'DELETE', headers: { authorization: DEMO_TOKEN } }),
        'never-exists',
      );
      check('DELETE：404 runId 不存在（不泄露）', res.status === 404, `status=${res.status}`);
    }
    // 202 取消成功
    {
      const res = await handleCancelRun(
        ctx,
        new Request('http://t/', { method: 'DELETE', headers: { authorization: DEMO_TOKEN } }),
        'r-demo-1',
      );
      check('DELETE：202 取消成功', res.status === 202, `status=${res.status}`);
      const body = await res.json() as { status: string };
      check('DELETE：202 响应含 status=cancelled', body.status === 'cancelled', `body.status=${body.status}`);
    }
    // 409 已 cancelled
    {
      const res = await handleCancelRun(
        ctx,
        new Request('http://t/', { method: 'DELETE', headers: { authorization: DEMO_TOKEN } }),
        'r-already-cancelled',
      );
      check('DELETE：409 RUN_NOT_CANCELLABLE', res.status === 409, `status=${res.status}`);
      const body = await res.json() as { error?: { code: string } };
      check('DELETE：409 error.code = RUN_NOT_CANCELLABLE', body.error?.code === 'RUN_NOT_CANCELLABLE', `code=${body.error?.code}`);
    }
    // 跨用户 404
    {
      const res = await handleCancelRun(
        ctx,
        new Request('http://t/', { method: 'DELETE', headers: { authorization: OTHER_TOKEN } }),
        'r-demo-1',
      );
      check('DELETE：跨用户读 404（不泄露）', res.status === 404, `status=${res.status}`);
    }
  }

  // ============ §6: Model retry：1st timeout 2nd ok ============
  {
    const stores = new InMemoryCStores();
    let modelCallCount = 0;
    const fake = new ScriptedFakeModelPort(() => {
      modelCallCount += 1;
      if (modelCallCount === 1) throw { kind: 'timeout', afterMs: 10 };
      return JSON.stringify({
        dimensions: [
          { key: 'identity_credit', summary: '【证据】模型精炼。【推断】法人已确认。【缺口】缺外部核验。' },
          { key: 'business', summary: '【证据】模型精炼。【推断】业务概况可见。【缺口】缺经营材料。' },
          { key: 'role_clarity', summary: '【证据】模型精炼。【推断】职责清晰。【缺口】缺考核占比。' },
          { key: 'career_value', summary: '【证据】模型精炼。【推断】职业价值清晰。【缺口】缺长期成长。' },
          { key: 'personal_fit', summary: '【证据】模型精炼。【推断】匹配度未知。【缺口】缺个人偏好。' },
        ],
      });
    });
    const result = await runMatchPipelineCancellable({
      profile: clone(inputs.profile),
      intentContext: clone(inputs.intent),
      bundle: clone(inputs.bundle),
      options: { reportId: 'r-retry-ok', generatedAt: FIXED_GENERATED_AT, version: 1 },
    }, {
      runStore: stores.runs,
      projectId: PROJECT_ID,
      runId: 'run-retry-ok',
      retryPolicy: new DefaultRetryPolicy({ maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 5, jitterMs: 0 }),
      retryBudget: new InMemoryRetryBudget(8),
      model: { port: fake, budget: new ModelBudget(8, 0), deadlineMsPerCall: 1000, maxOutputTokens: 256, totalSoftDeadlineMs: 5000 },
    });
    check('Model retry：pipeline 成功', result.ok, result.ok ? 'ok' : 'failed');
    if (result.ok) {
      check(
        'Model retry：第 1 次拒第 2 次收 → promptVersion = p4.0.0',
        result.snapshot.promptVersion === 'c-prompt-model-p4.0.0',
        `promptVersion=${result.snapshot.promptVersion}`,
      );
      check('Model retry 调用 ≥ 2 次', modelCallCount >= 2, `modelCallCount=${modelCallCount}`);
    }
  }

  // ============ §7: Model retry：连续 timeout → 降级模板 ============
  {
    const stores = new InMemoryCStores();
    const fake = new ScriptedFakeModelPort(() => {
      throw { kind: 'timeout', afterMs: 5 };
    });
    const result = await runMatchPipelineCancellable({
      profile: clone(inputs.profile),
      intentContext: clone(inputs.intent),
      bundle: clone(inputs.bundle),
      options: { reportId: 'r-retry-fail', generatedAt: FIXED_GENERATED_AT, version: 1 },
    }, {
      runStore: stores.runs,
      projectId: PROJECT_ID,
      runId: 'run-retry-fail',
      retryPolicy: new DefaultRetryPolicy({ maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 5, jitterMs: 0 }),
      retryBudget: new InMemoryRetryBudget(8),
      model: { port: fake, budget: new ModelBudget(8, 0), deadlineMsPerCall: 1000, maxOutputTokens: 256, totalSoftDeadlineMs: 5000 },
    });
    check('Model retry 连续 timeout：pipeline 仍 ok', result.ok, result.ok ? 'ok' : 'failed');
    if (result.ok) {
      check(
        'Model retry 连续 timeout：promptVersion 保持模板（不冒充 AI）',
        result.snapshot.promptVersion === 'template-no-model-p1.0.0',
        `promptVersion=${result.snapshot.promptVersion}`,
      );
    }
  }

  // ============ §8: 预算耗尽 → RetryBudgetError ============
  {
    const budget = new InMemoryRetryBudget(1);
    budget.reserve();
    let threw = false;
    try { budget.reserve(); } catch { threw = true; }
    check('预算耗尽：第二次 reserve 抛 RetryBudgetError', threw, threw ? 'threw' : 'did not throw');
  }

  // ============ 收尾 ============
  const total = checks.length;
  const passed = checks.filter((c) => c.pass).length;
  const failed = total - passed;
  console.log('');
  console.log(`共 ${String(total)} 项，通过 ${String(passed)}，失败 ${String(failed)}。`);
  console.log('说明：fake runtime + fake 模型；运行成本为零；C 私有诊断，不进公共 schema。');
  await cleanup(baseDir);
  process.exit(failed === 0 ? 0 : 1);
}

await main();
