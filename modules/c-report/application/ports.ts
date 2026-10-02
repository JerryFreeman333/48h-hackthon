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
  /** 检查 run 是否已被标记取消（O(1) 查 cancel flag set）。 */
  isCancelled(projectId: string, runId: string): Promise<boolean>;
  /** 订阅取消事件；返回 unsubscribe。listener 在取消被消费后自动失效。 */
  addCancelListener(projectId: string, runId: string, fn: () => void): () => void;
  /** 标记 cancel；幂等；返回 wasRunning（曾为 queued/running 则 true）。 */
  requestCancel(projectId: string, runId: string): Promise<{ wasRunning: boolean }>;
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
    /** 复现包内含其对应的公共 MatchReport（同 c_private_report_snapshot_v1 工件形状）。 */
    report: MatchReport;
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

// =====================================================================
// P5（设计草案 §4）：取消 / 重启 / 外部失败恢复 —— C 私有追加
// 公共契约 1.0.0 不动；新增的是 C 私有 run 调度与 checkpoint 机制。
// =====================================================================

/**
 * P5 §4.1：CRunStore 扩展已合并入上方原 CRunStore 定义（取消语义保留；新增 3 个方法用于 cooperative 取消）。
 */

/**
 * P5 §4.2：CheckpointStore（新增端口）。
 * 阶段结果原子落盘；用于断点续跑。
 *
 * 不变性：
 * - 阶段一旦写入不可变；addAtStage 是追加，不修改既有 completedStages
 * - 同 checkpoint 的 stageOutputs 决定 resume 后跳过哪些 stage；resume 后 stage 重跑会重写 stageOutputs[stage]
 * - 不存 MatchReport（最终 report 在 reportVersions/reportSelfcheck 后由 handler 落不可变存储）
 */
export interface CheckpointStage {
  stage: string;
  completedAt: string;
  /** 阶段输出 SHA-1（用于完整性校验；不参与决策）。 */
  partialOutputHash: string;
}

/**
 * 已接受维度摘要（模型精炼最终被采纳的维度 summary 映射，jobId -> { dimensionKey -> summary }）。
 * 维度被模型拒绝的维度不要进入 acceptedDimensions；restart 时只重放已接受的。
 */
export type AcceptedDimensionOverrides = Record<string, Record<string, string>>;

export interface RunCheckpoint {
  runId: string;
  projectId: string;
  reportId: string;
  version: number;
  ruleVersion: string;
  promptVersion: string;
  inputHashes: { profile: string; intent: string; bundle: string } | null;
  completedStages: CheckpointStage[];
  /** 阶段输出快照；仅做 phase→data。模型精炼不在此存（存于 acceptedDimensionOverrides）。 */
  stageOutputs: Record<string, unknown>;
  /** 模型精炼后被接受的维度摘要；null 表示未配置 / 未运行 / 全部被拒。 */
  acceptedDimensionOverrides: AcceptedDimensionOverrides | null;
  startedAt: string;
  lastCheckpointAt: string;
  /** P5 finalize 写入；true 后 listInterrupted 不再返回该 checkpoint。 */
  finalized?: boolean;
  finalStatus?: 'completed' | 'partial' | 'cancelled' | 'failed';
}

export interface CheckpointStore {
  /** 原子：appendStage 阶段追加到 completedStages + 写入 stageOutputs[stage]。已存在的 stage 直接覆盖 stageOutputs[stage]（用于重跑）。 */
  appendStage(projectId: string, runId: string, stage: string, stageOutput: unknown): Promise<void>;
  /** 读取 checkpoint；finalize 后仍可读（仅供诊断）。 */
  read(projectId: string, runId: string): Promise<RunCheckpoint | null>;
  /** 标记结束；finalize 后该 runId 不会再出现在 listInterrupted 中。 */
  finalize(projectId: string, runId: string, finalStatus: 'completed' | 'partial' | 'cancelled' | 'failed'): Promise<void>;
  /** 列出 project 下未 final 化的 checkpoint，用于启动时恢复。 */
  listInterrupted(projectId: string): Promise<RunCheckpoint[]>;
}

/**
 * P5 §4.3：RetryPolicy 与 RetryBudget（新增端口）。
 * 重试策略本身是值对象；RetryBudget 是调用前预占门（与 P4 ModelBudget 同构）。
 *
 * Note: 重试预算不能与 P4 模型预算合并：模型预算针对"模型调用"，重试预算针对"重试次数"。
 * 一层调用最多消耗重试预算 1 次；调多次调用各消耗 1 次。
 */
export interface RetryDecision {
  attempt: number;
  /** 0 = 不再重试。 */
  nextDelayMs: number;
  reason: 'retry_budget_left' | 'non_retryable' | 'budget_exhausted';
}

export interface RetryPolicy {
  shouldRetry(error: unknown, attempt: number): RetryDecision;
}

export interface RetryBudget {
  reserve(): void;
  get callsUsed(): number;
}
