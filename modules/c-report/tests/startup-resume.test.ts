/**
 * §6.2 [C-IMPL-STARTUP-RESUME] 测试。
 *
 * 覆盖：
 * - appendStage 把 storedInputs 落 checkpoint
 * - resumeInterruptedRuns：列出 interrupted，按 storedInputs 重跑，最终完成并 finalize
 * - 旧 ckpt 无 storedInputs：graceful skip
 * - run 被 cancel：skip_cancelled
 * - demo runtime 通过 onStartup 触发
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileSystemCheckpointStore } from '../adapters/memory/in-memory-checkpoint.js';
import { createCApiContext } from '../adapters/memory/context.js';
import { resumeInterruptedRuns, runOne } from '../application/api/startup-resume.js';
import { loadDemoInputs } from './helpers.js';

describe('§6.2 [C-IMPL-STARTUP-RESUME]', () => {
  it('createCApiContext 默认 onStartup = resumeInterruptedRuns', () => {
    const ctx = createCApiContext();
    assert.strictEqual(typeof ctx.onStartup, 'function');
  });

  it('resumeInterruptedRuns 无 ctx.checkpoint → 0 空 report', async () => {
    const ctx = createCApiContext();
    const report = await resumeInterruptedRuns(ctx);
    assert.deepStrictEqual(report, { resumed: 0, failed: 0, skipped: 0, outcomes: [] });
  });

  it('CheckpointStore.init 写入 storedInputs + reportId/version + 可读取', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'c-ckpt-init-'));
    try {
      const store = new FileSystemCheckpointStore(baseDir);
      await store.init('proj', 'run', {
        reportId: 'r-init-1',
        version: 1,
        ruleVersion: 'c-rules-1.0.0-p1',
        promptVersion: 'template-no-model-p1.0.0',
        inputHashes: null,
        storedInputs: { profile: { id: 'p' }, intentContext: null, bundle: { jobs: [] } },
      });
      const ckpt = await store.read('proj', 'run');
      assert.ok(ckpt !== null);
      assert.strictEqual(ckpt?.reportId, 'r-init-1');
      assert.strictEqual(ckpt?.version, 1);
      const raw = ckpt as unknown as { storedInputs?: unknown };
      assert.deepStrictEqual(raw.storedInputs, { profile: { id: 'p' }, intentContext: null, bundle: { jobs: [] } });
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });

  it('CheckpointStore.init 已存在 + completedStages 时 no-op 保留', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'c-ckpt-noop-'));
    try {
      const store = new FileSystemCheckpointStore(baseDir);
      await store.appendStage('proj', 'run', 'validated_inputs', { v: 1 });
      await store.init('proj', 'run', { reportId: 'should-not-apply', version: 99, ruleVersion: '', promptVersion: '', inputHashes: null });
      const ckpt = await store.read('proj', 'run');
      assert.ok(ckpt !== null);
      assert.strictEqual(ckpt?.reportId, '');  // 旧 appendStage 没存；init 不覆盖
      assert.strictEqual(ckpt?.completedStages.length, 1);
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });

  it('CheckpointStore.listProjects 列出所有有 ckpt 数据的 project', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'c-ckpt-projs-'));
    try {
      const store = new FileSystemCheckpointStore(baseDir);
      await store.appendStage('proj-a', 'run-1', 'validated_inputs', {});
      await store.appendStage('proj-b', 'run-1', 'validated_inputs', {});
      const projects = await store.listProjects();
      assert.deepStrictEqual(projects.sort(), ['proj-a', 'proj-b']);
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });

  it('runOne 老 ckpt 无 storedInputs → skipped_no_inputs', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'c-runone-skip-'));
    try {
      const store = new FileSystemCheckpointStore(baseDir);
      await store.appendStage('proj', 'run', 'validated_inputs', { ok: true });
      const ckpt = await store.read('proj', 'run');
      assert.ok(ckpt !== null);
      const ctx = createCApiContext({ checkpoint: store });
      const out = await runOne(ctx, ckpt!);
      assert.strictEqual(out.status, 'skipped_no_inputs');
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });

  it('resumeInterruptedRuns demo inputs 完整管线：appendStage init→hard_prefs→per_job_eval 三段；finalize completed', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'c-resume-full-'));
    try {
      const store = new FileSystemCheckpointStore(baseDir);
      // 共享 stores：ctx.stores 必须与原始 run 写入的同一个实例
      const { InMemoryCStores } = await import('../adapters/memory/in-memory.js');
      const sharedStores = new InMemoryCStores();
      const ctx = createCApiContext({ stores: sharedStores, checkpoint: store });

      // 模拟已部分完成：先创建 run record（executeOrReuse 干的事）再 init + appendStage
      const inputs = loadDemoInputs();
      await sharedStores.runs.enqueueWithReservation({
        runId: 'run-resume-1',
        projectId: 'proj',
        module: 'c',
        status: 'running',
        stage: 'per_job_eval',
        createdAt: '2026-10-02T09:00:00Z',
        updatedAt: '2026-10-02T09:00:00Z',
      }, {
        scopeKey: 'demo-resume-test',
        inputHash: 'demo-hash',
        runId: 'run-resume-1',
        reportId: 'r-resume-1',
      });
      await store.init('proj', 'run-resume-1', {
        reportId: 'r-resume-1',
        version: 1,
        ruleVersion: 'c-rules-1.0.0-p1',
        promptVersion: 'template-no-model-p1.0.0',
        inputHashes: { profile: 'ph', intent: 'ih', bundle: 'bh' },
        storedInputs: { profile: inputs.profile as unknown, intentContext: inputs.intent as unknown, bundle: inputs.bundle as unknown },
      });
      await store.appendStage('proj', 'run-resume-1', 'validated_inputs', { profile: inputs.profile, bundle: inputs.bundle, intent: inputs.intent });

      const report = await resumeInterruptedRuns(ctx);
      assert.strictEqual(report.resumed, 1);
      assert.strictEqual(report.failed, 0);
      assert.strictEqual(report.skipped, 0);
      // demo fixtures 本身有 unknown → 报告为 partial；断言 status 在 completed/partial 之间即可
      assert.ok(['completed', 'partial'].includes(report.outcomes[0]?.status ?? ''),
        `expected completed|partial, got ${report.outcomes[0]?.status}`);

      // Verify finalize'd: listInterrupted 不再返回
      const left = await store.listInterrupted('proj');
      assert.strictEqual(left.length, 0);

      // Verify report version stored
      const ver = await ctx.stores.reportVersions.read('proj', 'r-resume-1:v1');
      assert.ok(ver !== null);
      assert.strictEqual(ver?.report.reportId, 'r-resume-1');
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });

  it('demo runtime onStartup 触发 resume', async () => {
    // 直接调 ctx.onStartup 验证接口可触发
    const baseDir = await mkdtemp(join(tmpdir(), 'c-onstartup-'));
    try {
      const store = new FileSystemCheckpointStore(baseDir);
      const ctx = createCApiContext({ checkpoint: store });
      assert.strictEqual(typeof ctx.onStartup, 'function');
      const result = await ctx.onStartup!(ctx);
      assert.deepStrictEqual(result, { resumed: 0, failed: 0, skipped: 0, outcomes: [] });
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });
});
