/**
 * C 私有 DecisionTrace（规格 §7.4/§12）：记录 profilePath、消费的 Fact/片段、
 * 规则 ID、推理与缺口。不对外充当 B 事实；随私有快照保存，不进入公共 MatchReport。
 */
import type { ConstraintTrace } from './constraints.js';

export interface DimensionTrace {
  key: string;
  ruleId: string;
  factIds: string[];
  notes: string[];
}

export interface ActionTrace {
  ruleId: string;
  recommendation: string;
  triggeredBy: string[];
  notes: string[];
}

export interface DecisionTrace {
  jobId: string;
  constraints: ConstraintTrace[];
  dimensions: DimensionTrace[];
  action: ActionTrace;
}
