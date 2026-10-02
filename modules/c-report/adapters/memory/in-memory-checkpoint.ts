/**
 * P5 FileSystemCheckpointStore（C 私有 fake；非生产）。
 *
 * 路径布局（设计草案 §12 + 实际工程惯例）：
 *   ${baseDir}/${projectId}/${runId}.json
 *
 * 原子性保证：
 * - appendStage 先写 ${runId}.json.tmp，fsync 后 rename 为 ${runId}.json
 *   POSIX 下 rename 原子；中断时最多留下 .tmp 残骸，下次 read 自动忽略
 * - finalize 写 finalized=true 字段；listInterrupted 过滤 finalized=true
 *
 * 不变性（§3.2）：
 * - 不存 MatchReport；只存 stageOutputs（中间态）+ acceptedDimensionOverrides
 * - 阶段一旦写入不可变；appendStage 仅追加 completedStages，不修改既有项
 *
 * 测试/demo 用例：baseDir 显式指定；默认用 os.tmpdir() + 'c-report-checkpoints-' + process.pid
 */

import { mkdir, readFile, rename as fsRenameFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import type {
  AcceptedDimensionOverrides,
  CheckpointMetadata,
  CheckpointStage,
  CheckpointStore,
  RunCheckpoint,
} from '../../application/ports.js';

function defaultBaseDir(): string {
  return join(tmpdir(), `c-report-checkpoints-${String(process.pid)}`);
}

function projectDir(base: string, projectId: string): string {
  return join(base, projectId);
}

function runPath(base: string, projectId: string, runId: string): string {
  return join(projectDir(base, projectId), `${runId}.json`);
}

function tmpPath(base: string, projectId: string, runId: string): string {
  return join(projectDir(base, projectId), `${runId}.json.tmp`);
}

function sha1Of(value: unknown): string {
  return createHash('sha1').update(JSON.stringify(value)).digest('hex');
}

function nowIso(): string {
  return new Date().toISOString();
}

export class FileSystemCheckpointStore implements CheckpointStore {
  constructor(public readonly baseDir: string = defaultBaseDir()) {}

  /**
   * 初始化 checkpoint 元数据；已存在则保留既有 metadata 不覆盖（idempotent）。
   * 不写 completedStages（init 不代表有阶段完成过）。
   * 原子：tmp + rename 同 appendStage。
   */
  async init(projectId: string, runId: string, metadata: CheckpointMetadata): Promise<void> {
    const base = this.baseDir;
    const dir = projectDir(base, projectId);
    await mkdir(dir, { recursive: true });
    const path = runPath(base, projectId, runId);
    const existing = await this.read(projectId, runId);
    if (existing !== null && existing.completedStages.length > 0) {
      // 已有 completedStages，跳过（保护 resume 不被 init 覆盖关键中间态）
      return;
    }
    const checkpoint: RunCheckpoint = existing ?? {
      runId,
      projectId,
      reportId: metadata.reportId,
      version: metadata.version,
      ruleVersion: metadata.ruleVersion,
      promptVersion: metadata.promptVersion,
      inputHashes: metadata.inputHashes,
      completedStages: [],
      stageOutputs: {},
      acceptedDimensionOverrides: null,
      startedAt: nowIso(),
      lastCheckpointAt: nowIso(),
    };
    // 若 existing 是空的 completedStages ckpt，仅 patch metadata 字段
    const merged: RunCheckpoint = existing === null
      ? checkpoint
      : {
          ...existing,
          reportId: existing.reportId.length > 0 ? existing.reportId : metadata.reportId,
          version: existing.version > 0 ? existing.version : metadata.version,
          ruleVersion: existing.ruleVersion.length > 0 ? existing.ruleVersion : metadata.ruleVersion,
          promptVersion: existing.promptVersion.length > 0 ? existing.promptVersion : metadata.promptVersion,
          inputHashes: existing.inputHashes ?? metadata.inputHashes,
        };
    // storedInputs 总是 patch（最新 init 调用覆盖旧值；handler 单线程负责这点）
    if (metadata.storedInputs !== undefined) {
      (merged as RunCheckpoint & { storedInputs?: unknown }).storedInputs = metadata.storedInputs ?? undefined;
    }
    merged.lastCheckpointAt = nowIso();
    const tmp = tmpPath(base, projectId, runId);
    await writeFile(tmp, JSON.stringify(merged), 'utf8');
    await fsRenameFile(tmp, path);
  }

  async listProjects(): Promise<string[]> {
    const base = this.baseDir;
    let entries: string[];
    try {
      entries = await readdir(base);
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code === 'ENOENT') return [];
      throw err;
    }
    return entries.filter((name) => !name.startsWith('.')).sort();
  }

  async appendStage(projectId: string, runId: string, stage: string, stageOutput: unknown): Promise<void> {
    const base = this.baseDir;
    const dir = projectDir(base, projectId);
    await mkdir(dir, { recursive: true });
    const path = runPath(base, projectId, runId);
    const existing = await this.read(projectId, runId);
    const completedStages: CheckpointStage[] = existing
      ? [...existing.completedStages.filter((s) => s.stage !== stage), { stage, completedAt: nowIso(), partialOutputHash: sha1Of(stageOutput) }]
      : [{ stage, completedAt: nowIso(), partialOutputHash: sha1Of(stageOutput) }];
    const stageOutputs = { ...(existing?.stageOutputs ?? {}), [stage]: stageOutput };
    const existingRaw = existing as (RunCheckpoint & { storedInputs?: { profile: unknown; intentContext: unknown; bundle: unknown } | null }) | null;
    const checkpoint: RunCheckpoint = {
      runId,
      projectId,
      reportId: existing?.reportId ?? '',
      version: existing?.version ?? 0,
      ruleVersion: existing?.ruleVersion ?? '',
      promptVersion: existing?.promptVersion ?? '',
      inputHashes: existing?.inputHashes ?? null,
      completedStages,
      stageOutputs,
      acceptedDimensionOverrides: existing?.acceptedDimensionOverrides ?? null,
      startedAt: existing?.startedAt ?? nowIso(),
      lastCheckpointAt: nowIso(),
    };
    // 保留 storedInputs（init 写入后 appendStage 必须透传）
    if (existingRaw?.storedInputs !== undefined && existingRaw.storedInputs !== null) {
      (checkpoint as RunCheckpoint & { storedInputs?: unknown }).storedInputs = existingRaw.storedInputs;
    }
    // 原子：写 .tmp → rename
    const tmp = tmpPath(base, projectId, runId);
    await writeFile(tmp, JSON.stringify(checkpoint), 'utf8');
    await fsRenameFile(tmp, path);
  }

  async read(projectId: string, runId: string): Promise<RunCheckpoint | null> {
    const path = runPath(this.baseDir, projectId, runId);
    try {
      const buf = await readFile(path, 'utf8');
      const parsed = JSON.parse(buf) as RunCheckpoint & { finalized?: boolean; finalStatus?: string };
      if (parsed.finalized === true) {
        // finalized 也允许读（供诊断）；appendStage 不会修改 finalized 标记
        return parsed;
      }
      return parsed;
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code === 'ENOENT') return null;
      throw err;
    }
  }

  async finalize(projectId: string, runId: string, finalStatus: 'completed' | 'partial' | 'cancelled' | 'failed'): Promise<void> {
    const existing = await this.read(projectId, runId);
    if (!existing) {
      throw new Error(`checkpoint not found: ${projectId}/${runId}`);
    }
    const updated: RunCheckpoint & { finalized: true } = {
      ...existing,
      finalized: true,
      finalStatus,
      lastCheckpointAt: nowIso(),
    };
    const tmp = tmpPath(this.baseDir, projectId, runId);
    await writeFile(tmp, JSON.stringify(updated), 'utf8');
    await fsRenameFile(tmp, runPath(this.baseDir, projectId, runId));
  }

  async listInterrupted(projectId: string): Promise<RunCheckpoint[]> {
    const dir = projectDir(this.baseDir, projectId);
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code === 'ENOENT') return [];
      throw err;
    }
    const out: RunCheckpoint[] = [];
    for (const name of entries) {
      if (!name.endsWith('.json')) continue;
      const runId = name.slice(0, -'.json'.length);
      const ckpt = await this.read(projectId, runId);
      if (ckpt === null) continue;
      const finalized = (ckpt as RunCheckpoint & { finalized?: boolean }).finalized === true;
      if (finalized) continue;
      out.push(ckpt);
    }
    return out;
  }
}

/** 测试/demo 辅助：清空指定 baseDir（不删进程共享目录）。 */
export async function clearCheckpointDir(baseDir: string): Promise<void> {
  const { rm } = await import('node:fs/promises');
  await rm(baseDir, { recursive: true, force: true });
}

/** 测试/demo 辅助：读取 acceptedDimensionOverrides。 */
export function readAcceptedOverrides(ckpt: RunCheckpoint | null): AcceptedDimensionOverrides | null {
  return ckpt?.acceptedDimensionOverrides ?? null;
}
