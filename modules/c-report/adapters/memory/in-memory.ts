/**
 * 显式内存 fake runtime（非生产）。
 *
 * 用途：P2 在公共持久 runtime 就绪前的 demo/test 独立运行（规格 §13「没有公共
 * 实现就用显式本地 fake，不新增第二套生产能力」）。
 * 边界：单进程内存态；进程重启即丢；不做跨进程并发控制（putIfAbsent 的原子性
 * 只在单事件循环内有意义）。生产须由公共维护人提供数据库唯一约束与事务。
 */
import type {
  CRunStore,
  CStores,
  EnqueueOutcome,
  StoredReportSnapshot,
  StoredReportVersion,
  IdentityProvider,
  Principal,
  Project,
  ReportIndexRecord,
  ReportIndexStore,
  RunRecord,
  RunReservation,
  RunStatus,
  SnapshotRepository,
} from '../../application/ports.js';


class MapSnapshotRepository<T> implements SnapshotRepository<T> {
  private readonly records = new Map<string, T>();

  constructor(private readonly keyPrefix: string) {}

  private key(projectId: string, snapshotId: string): string {
    return `${this.keyPrefix}\u0000${projectId}\u0000${snapshotId}`;
  }

  async insert(projectId: string, snapshotId: string, snapshot: T): Promise<void> {
    const key = this.key(projectId, snapshotId);
    if (this.records.has(key)) {
      throw new Error(`snapshot already exists: ${this.keyPrefix}/${projectId}/${snapshotId}`);
    }
    this.records.set(key, snapshot);
  }

  async read(projectId: string, snapshotId: string): Promise<T | null> {
    return this.records.get(this.key(projectId, snapshotId)) ?? null;
  }
}

class InMemoryRunStore implements CRunStore {
  private readonly runs = new Map<string, RunRecord>();
  private readonly reservations = new Map<string, RunReservation>();
  /** P5：cancel 标记集合（O(1) 查询；与 status=cancelled 同步维护）。 */
  private readonly cancelFlags = new Set<string>();
  /** P5：cancel listener 集合（按 runKey）。listener 触发后自动清空。 */
  private readonly cancelListeners = new Map<string, Set<() => void>>();

  /**
   * 原子临界区（单事件循环内无 await）：同 scopeKey 只允许一次插入。
   * 生产对应「INSERT run + INSERT 幂等记录」单事务 + 作用域唯一约束。
   */
  async enqueueWithReservation(run: RunRecord, reservation: RunReservation): Promise<EnqueueOutcome> {
    const existing = this.reservations.get(reservation.scopeKey) ?? null;
    if (existing !== null) {
      return {
        inserted: false,
        existing,
        existingRun: this.runs.get(existing.runId) ?? null,
      };
    }
    if (this.runs.has(run.runId)) {
      throw new Error(`run already exists: ${run.runId}`);
    }
    this.runs.set(run.runId, { ...run });
    this.reservations.set(reservation.scopeKey, { ...reservation });
    return { inserted: true, existing: null, existingRun: null };
  }

  async read(projectId: string, runId: string): Promise<RunRecord | null> {
    const run = this.runs.get(runId);
    return run && run.projectId === projectId ? { ...run } : null;
  }

  async cancel(projectId: string, runId: string): Promise<void> {
    const run = await this.read(projectId, runId);
    if (run && (run.status === 'queued' || run.status === 'running')) {
      await this.updateStatus(projectId, runId, 'cancelled', 'cancelled');
      // P5：保留 cancel 旧语义（status=cancelled），同时通过 requestCancel 路径
      //     确保 listener 被触发。cancel() 的设计草案语义 = requestCancel 的简写。
    }
  }

  async updateStatus(projectId: string, runId: string, status: RunStatus, stage: string): Promise<void> {
    const run = this.runs.get(runId);
    if (run && run.projectId === projectId) {
      run.status = status;
      run.stage = stage;
      run.updatedAt = new Date().toISOString();
    }
  }

  // P5 §4.1：cancel 三件套（cooperative cancel 的输入）。
  // 实现要点：
  // - isCancelled 仅查 cancel flag set（O(1)），与 status=cancelled 等价但无 IO
  // - requestCancel 是幂等；状态变更触发已注册 listener 一次
  // - listener 在触发后自动 unsubscribe（避免泄漏）
  async isCancelled(projectId: string, runId: string): Promise<boolean> {
    return this.cancelFlags.has(this.runKey(projectId, runId));
  }

  addCancelListener(projectId: string, runId: string, fn: () => void): () => void {
    const key = this.runKey(projectId, runId);
    const set = this.cancelListeners.get(key) ?? new Set<() => void>();
    set.add(fn);
    this.cancelListeners.set(key, set);
    return () => {
      set.delete(fn);
      if (set.size === 0) this.cancelListeners.delete(key);
    };
  }

  async requestCancel(projectId: string, runId: string): Promise<{ wasRunning: boolean }> {
    const key = this.runKey(projectId, runId);
    const run = this.runs.get(runId);
    if (!run || run.projectId !== projectId) {
      return { wasRunning: false };
    }
    const wasRunning = run.status === 'queued' || run.status === 'running';
    if (!wasRunning) {
      // 幂等：已是 completed/partial/failed/cancelled，不重复触发 listener
      return { wasRunning: false };
    }
    this.cancelFlags.add(key);
    await this.updateStatus(projectId, runId, 'cancelled', 'cancelled');
    const listeners = this.cancelListeners.get(key);
    if (listeners !== undefined) {
      // 触发后清空（每个 listener 只触发一次）
      this.cancelListeners.delete(key);
      for (const fn of listeners) {
        try {
          fn();
        } catch {
          // listener 错误不传播：cancel 必须幂等成功
        }
      }
    }
    return { wasRunning: true };
  }

  private runKey(projectId: string, runId: string): string {
    return `${projectId}\u0000${runId}`;
  }
}

class InMemoryReportIndexStore implements ReportIndexStore {
  private readonly index = new Map<string, ReportIndexRecord>();

  private key(projectId: string, reportId: string): string {
    return `${projectId}\u0000${reportId}`;
  }

  async get(projectId: string, reportId: string): Promise<ReportIndexRecord | null> {
    return this.index.get(this.key(projectId, reportId)) ?? null;
  }

  async putInitial(projectId: string, reportId: string, record: ReportIndexRecord): Promise<void> {
    const key = this.key(projectId, reportId);
    if (this.index.has(key)) {
      throw new Error(`report index already exists: ${projectId}/${reportId}`);
    }
    this.index.set(key, JSON.parse(JSON.stringify(record)) as ReportIndexRecord);
  }

  async appendVersion(
    projectId: string,
    reportId: string,
    version: number,
    runId: string,
    createdAt: string,
    status: RunStatus,
  ): Promise<void> {
    const record = this.index.get(this.key(projectId, reportId));
    if (!record) {
      throw new Error(`report index missing: ${projectId}/${reportId}`);
    }
    if (record.versions.some((v) => v.version === version)) {
      throw new Error(`report version already exists: ${projectId}/${reportId}/v${version}`);
    }
    record.latestVersion = version;
    record.versions.push({ version, runId, createdAt, status });
  }
}

export class InMemoryCStores implements CStores {
  readonly runs = new InMemoryRunStore();
  readonly reportVersions = new MapSnapshotRepository<StoredReportVersion>('reportVersions');
  readonly reportSnapshots = new MapSnapshotRepository<StoredReportSnapshot>('reportSnapshots');
  readonly reportIndex = new InMemoryReportIndexStore();
}

/**
 * 测试/演示用身份提供方：Bearer token → 用户；项目-所有者映射内置。
 * 生产替换为公共鉴权 adapter（packages/runtime.IdentityProvider）。
 */
export class FakeIdentityProvider implements IdentityProvider {
  constructor(
    private readonly tokens: Map<string, string>,
    private readonly projects: Map<string, Project>,
  ) {}

  async authenticate(request: Request): Promise<Principal | null> {
    const header = request.headers.get('authorization');
    if (header === null) {
      return null;
    }
    const match = /^Bearer (.+)$/.exec(header);
    const userId = match ? this.tokens.get(match[1] ?? '') : undefined;
    return userId ? { userId } : null;
  }

  async getProject(projectId: string): Promise<Project | null> {
    return this.projects.get(projectId) ?? null;
  }

  /** fake 专用：列出某用户拥有的项目（生产按用户项目索引查询）。 */
  projectsOf(userId: string): string[] {
    const ids: string[] = [];
    for (const [projectId, project] of this.projects) {
      if (project.ownerId === userId) {
        ids.push(projectId);
      }
    }
    return ids;
  }
}

export function createDemoIdentity(): FakeIdentityProvider {
  return new FakeIdentityProvider(
    new Map([
      ['token-user-demo-1', 'user-demo-1'],
      ['token-user-other', 'user-other'],
    ]),
    new Map([
      ['project-demo-1', { projectId: 'project-demo-1', ownerId: 'user-demo-1', mode: 'demo' }],
      ['project-other', { projectId: 'project-other', ownerId: 'user-other', mode: 'demo' }],
    ]),
  );
}
