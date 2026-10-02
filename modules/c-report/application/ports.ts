/**
 * C 私有 ports（规格 §13 的 C 侧接口提案；登记 C-16）。
 *
 * 与公共底座 packages/runtime 的形状保持结构等价（IdentityProvider / Project /
 * Principal / RunRecord / RunStatus / SnapshotRepository），公共实现就绪后写
 * adapter 直接替换，不需要改 handler。在公共实现存在之前，使用 adapters/memory
 * 中的显式 fake（非生产，仅 demo/test）——不复制、不假装生产鉴权/队列/存储。
 */

/** 等价 packages/runtime.Principal。 */
export interface Principal {
  userId: string;
}

/** 等价 packages/runtime.Project。 */
export interface Project {
  projectId: string;
  ownerId: string;
  mode: 'demo' | 'manual' | 'live';
}

/**
 * 等价 packages/runtime.IdentityProvider。
 * authenticate 返回 null = 未登录（401）；getProject 无记录或非本人 = 403。
 */
export interface IdentityProvider {
  authenticate(request: Request): Promise<Principal | null>;
  getProject(projectId: string): Promise<Project | null>;
}

/** 等价 packages/runtime.RunStatus。 */
export type RunStatus = 'queued' | 'running' | 'completed' | 'partial' | 'failed' | 'cancelled';

/** 等价 packages/runtime.RunRecord。 */
export interface RunRecord {
  runId: string;
  projectId: string;
  module: 'a' | 'b' | 'c';
  status: RunStatus;
  stage: string;
  createdAt: string;
  updatedAt: string;
}

/** 等价 packages/runtime.SnapshotRepository<T>：insert 重复主键必须失败（不可变）。 */
export interface SnapshotRepository<T> {
  insert(projectId: string, snapshotId: string, snapshot: T): Promise<void>;
  read(projectId: string, snapshotId: string): Promise<T | null>;
}

export interface RunReservation {
  /** 幂等作用域：所有者+项目+C操作+幂等键（规格 §13）。 */
  scopeKey: string;
  /** canonical 输入哈希（含执行配置）。 */
  inputHash: string;
  runId: string;
  reportId: string;
}

export interface EnqueueOutcome {
  inserted: boolean;
  /** 未插入时返回既有 reservation 与 run（同键复用/同键冲突判定用）。 */
  existing: RunReservation | null;
  existingRun: RunRecord | null;
}

/**
 * 运行记录存储：DurableScheduler 形状 + C 执行器需要的扩展。
 * enqueueWithReservation 必须原子：幂等预留与 run 插入在同一临界区
 * （生产对应数据库唯一约束 + 冲突读取，规格 §13「不只查内存」；
 * fake 用单事件循环同步临界区对应）。恢复/租约属 P5。
 */
export interface CRunStore {
  enqueueWithReservation(run: RunRecord, reservation: RunReservation): Promise<EnqueueOutcome>;
  read(projectId: string, runId: string): Promise<RunRecord | null>;
  cancel(projectId: string, runId: string): Promise<void>;
  updateStatus(projectId: string, runId: string, status: RunStatus, stage: string): Promise<void>;
}

export interface StoredReportVersion {
  report: MatchReport;
  ownerId: string;
  runId: string;
  createdAt: string;
}

/** C 私有快照：包含复现所需的全部输入与决策痕迹（规格 §12），仅所有者可读。 */
export interface StoredReportSnapshot {
  report: MatchReport;
  snapshot: {
    artifactType: string;
    profile: unknown;
    intentContext: unknown;
    bundle: unknown;
    scope: unknown;
    inputHashes: { profile: string; intent: string; bundle: string };
    decisionTraces: unknown[];
    diagnostics: unknown;
    ruleVersion: string;
    promptVersion: string;
    generatedAt: string;
  };
  ownerId: string;
  projectId: string;
  runId: string;
  createdAt: string;
}

export interface ReportIndexRecord {
  ownerId: string;
  projectId: string;
  latestVersion: number;
  versions: { version: number; runId: string; createdAt: string; status: RunStatus }[];
}

/** 报告索引：版本记录本身不可变，仅索引允许追加版本指针。 */
export interface ReportIndexStore {
  get(projectId: string, reportId: string): Promise<ReportIndexRecord | null>;
  putInitial(projectId: string, reportId: string, record: ReportIndexRecord): Promise<void>;
  appendVersion(projectId: string, reportId: string, version: number, runId: string, createdAt: string, status: RunStatus): Promise<void>;
}

/** 存储的报告即公共 MatchReport（ports 位于 application 层，依赖 domain 是正常方向）。 */
import type { MatchReport } from '../domain/contract.js';

/** C 全部存储端口集合。 */
export interface CStores {
  runs: CRunStore;
  reportVersions: SnapshotRepository<StoredReportVersion>;
  reportSnapshots: SnapshotRepository<StoredReportSnapshot>;
  reportIndex: ReportIndexStore;
}
