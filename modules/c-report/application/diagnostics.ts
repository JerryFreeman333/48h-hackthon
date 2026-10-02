/**
 * C 私有 run 诊断（规格 §4/§10/§12）。不属于公共 MatchReport；
 * 页面/比较（P3）从 diagnostics 读取空候选说明等投影，不伪造公共字段。
 */
import type { ReportScope } from '../domain/report.js';

export interface StageRecord {
  stage: string;
  status: 'executed' | 'skipped';
  detail?: string;
}

export interface RunDiagnostics {
  stages: StageRecord[];
  /** demo 模式允许的部分意向上下文（规格 §3）；live/manual 拒绝。 */
  intentContextPartial: boolean;
  /** jobs=[] 时的空状态说明（C-13）：显示用，不进入公共 MatchReport。 */
  insufficientNote: string | null;
  keyTopicGaps: string[];
  scope: ReportScope;
  inputHashes: { profile: string; intent: string; bundle: string } | null;
  /** B usage 原样保留的条数（成本归集属 P2+ UsagePort）。 */
  bundleUsageEntryCount: number;
  /**
   * P4：模型调用用量（C 私有诊断）。costMinor null=未知（不是零，C-17）；
   * 传输失败的调用也记录（用量在取消后仍保留，§13/§14）。
   */
  modelUsage?: { provider: string; requestId: string | null; costMinor: number | null; tokens: number | null }[];
}

export function createDiagnostics(scope: ReportScope, bundleUsageEntryCount: number): RunDiagnostics {
  return {
    stages: [],
    intentContextPartial: false,
    insufficientNote: null,
    keyTopicGaps: [],
    scope,
    inputHashes: null,
    bundleUsageEntryCount,
  };
}
