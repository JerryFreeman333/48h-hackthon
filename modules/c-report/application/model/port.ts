/**
 * P4 模型端口与预算（规格 §11/§13/§14；C 私有接口提案）。
 *
 * 与公共底座的关系：packages/runtime 目前只有 CallBudget（reserve(null) 一律拒绝）
 * 与 UsageRecord，没有模型客户端接口。C 按规格 §13「接入时写 adapter；没有公共
 * 实现就用显式本地 fake」定义本端口；生产接入时以公共 ModelClient adapter 实现
 * ModelPort，语义映射记录在交付文档。
 *
 * 预算语义（§14，与 runtime.CallBudget 对齐但有明确差异）：
 * - 次数上限默认 8（修复计入）；每次调用前 reserve。
 * - 付费调用必须有已知的费用上界；无法形成上界（null）+ 付费 → 拒绝（UNKNOWN_COST 语义）。
 * - 显式本地 fake（paid=false）费用确为零，上界 0 允许通过——这是 demo/test 唯一路径。
 * 差异说明：runtime.CallBudget.reserve(null) 无条件拒绝；C 侧区分「免费 fake」与
 * 「付费无上界」，免费路径仅服务离线闭环，生产一律要求有界。
 */

export interface ModelCompletionRequest {
  system: string;
  prompt: string;
  maxOutputTokens: number;
  /** 单次调用时限（毫秒）；端口实现必须在此时限内返回或抛错（§14 单请求 30s）。 */
  deadlineMs: number;
}

/** 与 packages/runtime.UsageRecord 字段对齐（costMinor null=未知，不是零）。 */
export interface ModelUsage {
  provider: string;
  requestId: string | null;
  costMinor: number | null;
  tokens: number | null;
}

export interface ModelCompletion {
  text: string;
  usage: ModelUsage;
}

export interface ModelPort {
  /** 供应商标识（进 usage 记录；fake 为 fake-scripted 等）。 */
  readonly provider: string;
  /** 是否付费通道：付费且无上界 → 预算门拒绝。 */
  readonly paid: boolean;
  /** 单次调用费用上界（整数分）；null=未知（付费通道不可用）。 */
  readonly costUpperBoundMinorPerCall: number | null;
  complete(request: ModelCompletionRequest): Promise<ModelCompletion>;
}

export type ModelBudgetErrorCode = 'MODEL_BUDGET_EXHAUSTED' | 'MODEL_COST_UNKNOWN' | 'MODEL_COST_INVALID';

/** 预算异常：管线将其转为 stage 跳过 + diagnostics，不中断整份报告。 */
export class ModelBudgetError extends Error {
  constructor(
    public readonly code: ModelBudgetErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export class ModelBudget {
  private calls = 0;
  private spent = 0;

  constructor(
    public readonly maxCalls: number = 8,
    public readonly maxCostMinor: number = 0,
  ) {
    if (!Number.isInteger(maxCalls) || maxCalls < 0) {
      throw new Error('Invalid model budget: maxCalls');
    }
    if (!Number.isSafeInteger(maxCostMinor) || maxCostMinor < 0) {
      throw new Error('Invalid model budget: maxCostMinor');
    }
  }

  get callsUsed(): number {
    return this.calls;
  }

  get spentMinor(): number {
    return this.spent;
  }

  /**
   * 调用前预留。paid=false 时 upperBound 允许 0（本地免费 fake）；
   * paid=true 且上界未知（null）→ MODEL_COST_UNKNOWN；超次数/超金额 → MODEL_BUDGET_EXHAUSTED。
   */
  reserve(upperBoundMinor: number | null, paid: boolean): void {
    if (upperBoundMinor === null) {
      if (paid) {
        throw new ModelBudgetError('MODEL_COST_UNKNOWN', '付费模型调用缺少已知费用上界：按规格 §14 拒绝自动付费调用');
      }
      upperBoundMinor = 0;
    }
    if (!Number.isSafeInteger(upperBoundMinor) || upperBoundMinor < 0) {
      throw new ModelBudgetError('MODEL_COST_INVALID', `非法费用上界：${String(upperBoundMinor)}`);
    }
    if (this.calls >= this.maxCalls || this.spent + upperBoundMinor > this.maxCostMinor) {
      throw new ModelBudgetError('MODEL_BUDGET_EXHAUSTED', `模型调用预算耗尽（已用 ${String(this.calls)}/${String(this.maxCalls)}，累计上界 ${String(this.spent)}/${String(this.maxCostMinor)} 分）`);
    }
    this.calls += 1;
    this.spent += upperBoundMinor;
  }
}
