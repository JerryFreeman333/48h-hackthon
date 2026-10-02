import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  FileSystemCheckpointStore,
  clearCheckpointDir,
} from '../adapters/memory/in-memory-checkpoint.js';
import type { RunCheckpoint } from '../application/ports.js';

describe('P5 CheckpointStore（设计草案 §4.2）', () => {
  let baseDir: string;
  let store: FileSystemCheckpointStore;
  const projectId = 'project-cp-test';
  const runId = 'run-cp-test-1';

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'c-report-cp-test-'));
    store = new FileSystemCheckpointStore(baseDir);
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('appendStage 写入 stage + 可读取', async () => {
    await store.appendStage(projectId, runId, 'validated_inputs', { profile: { id: 'p1' } });
    const ckpt = await store.read(projectId, runId);
    assert.ok(ckpt !== null);
    assert.strictEqual(ckpt?.completedStages.length, 1);
    assert.strictEqual(ckpt?.completedStages[0]?.stage, 'validated_inputs');
    assert.deepStrictEqual(ckpt?.stageOutputs['validated_inputs'], { profile: { id: 'p1' } });
    assert.strictEqual(ckpt?.startedAt.length > 0, true);
    assert.strictEqual(ckpt?.lastCheckpointAt.length > 0, true);
  });

  it('appendStage 重复 stage：stageOutputs 覆盖；completedStages 不重复追加', async () => {
    await store.appendStage(projectId, runId, 'validated_inputs', { v: 1 });
    await store.appendStage(projectId, runId, 'validated_inputs', { v: 2 });
    const ckpt = await store.read(projectId, runId);
    assert.strictEqual(ckpt?.completedStages.length, 1);
    assert.deepStrictEqual(ckpt?.stageOutputs['validated_inputs'], { v: 2 });
  });

  it('appendStage 多阶段顺序追加', async () => {
    await store.appendStage(projectId, runId, 'validated_inputs', { v: 1 });
    await store.appendStage(projectId, runId, 'hard_prefs', ['pref-a']);
    await store.appendStage(projectId, runId, 'per_job_eval', { perJob: [], traces: [] });
    const ckpt = await store.read(projectId, runId);
    assert.strictEqual(ckpt?.completedStages.length, 3);
    assert.deepStrictEqual(
      ckpt?.completedStages.map((s) => s.stage),
      ['validated_inputs', 'hard_prefs', 'per_job_eval'],
    );
  });

  it('appendStage 原子：tmp 文件不应残留', async () => {
    await store.appendStage(projectId, runId, 'stage1', { x: 1 });
    const files = await readdir(join(baseDir, projectId));
    assert.deepStrictEqual(files, [`${runId}.json`]);
  });

  it('read 不存在 → 返回 null（不抛错）', async () => {
    const ckpt = await store.read(projectId, 'run-not-exists');
    assert.strictEqual(ckpt, null);
  });

  it('finalize 标记 finalized=true；read 仍可读但 finalized=true', async () => {
    await store.appendStage(projectId, runId, 'validated_inputs', { v: 1 });
    await store.finalize(projectId, runId, 'completed');
    const ckpt = await store.read(projectId, runId);
    assert.strictEqual(ckpt?.finalized, true);
    assert.strictEqual(ckpt?.finalStatus, 'completed');
  });

  it('listInterrupted：不返回 finalized 的 checkpoint', async () => {
    await store.appendStage(projectId, runId, 'a', {});
    await store.appendStage(projectId, 'run-cp-test-2', 'a', {});
    await store.finalize(projectId, runId, 'completed');
    const interrupted = await store.listInterrupted(projectId);
    assert.strictEqual(interrupted.length, 1);
    assert.strictEqual(interrupted[0]?.runId, 'run-cp-test-2');
  });

  it('listInterrupted 空目录 → 返回 []', async () => {
    const interrupted = await store.listInterrupted('project-empty');
    assert.deepStrictEqual(interrupted, []);
  });

  it('finalize 不存在的 checkpoint → 抛错', async () => {
    await assert.rejects(() => store.finalize(projectId, 'never-written', 'failed'));
  });

  it('appendStage 阶段输出含 partialOutputHash（SHA-1 风格 40 hex）', async () => {
    await store.appendStage(projectId, runId, 'hard_prefs', [{ k: 'accept_sales_kpi' }]);
    const ckpt = await store.read(projectId, runId);
    assert.match(ckpt?.completedStages[0]?.partialOutputHash ?? '', /^[0-9a-f]{40}$/);
  });

  it('clearCheckpointDir 辅助：删 baseDir', async () => {
    await store.appendStage(projectId, runId, 'a', {});
    await clearCheckpointDir(baseDir);
    const ckpt = await store.read(projectId, runId);
    assert.strictEqual(ckpt, null);
  });

  it('跨项目隔离：projectId A 的 read 不会读到 projectId B 的 checkpoint', async () => {
    await store.appendStage(projectId, runId, 'a', { fromA: true });
    await store.appendStage('project-other', runId, 'a', { fromB: true });
    const ckptA = await store.read(projectId, runId);
    const ckptB = await store.read('project-other', runId);
    assert.deepStrictEqual(ckptA?.stageOutputs['a'], { fromA: true });
    assert.deepStrictEqual(ckptB?.stageOutputs['a'], { fromB: true });
  });

  it('文件内容是合法 JSON（手动验证）', async () => {
    await store.appendStage(projectId, runId, 'a', { x: 1 });
    const buf = await readFile(join(baseDir, projectId, `${runId}.json`), 'utf8');
    const parsed = JSON.parse(buf) as RunCheckpoint;
    assert.strictEqual(parsed.runId, runId);
    assert.strictEqual(parsed.projectId, projectId);
  });
});
