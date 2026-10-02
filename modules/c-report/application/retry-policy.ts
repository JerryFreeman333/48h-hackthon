/**
 * P5 重试策略与预算（C 私有；端口定义在 ports.ts）。
 *
 * 设计原则（v3 §10 + 设计草案 §3）：
 * - 可重试 = timeout / 5xx / 网络重置；其他不可重试（4xx、解析错、未识别错误）
 * - 预算先于调用（与 P4 模型预算同构：调用前 reserve）
 * - 退避：2^attempt * baseDelay + jitter[0, jitterMs)；上限 maxDelayMs
 * - 与 P4 §13"响应丢失不盲重发"的关系：加严为"预算允许则受控重试一次"
 *
 * 与公共 runtime 的关系：本端口为 C 侧私有提案；公共 ModelClient adapter 接入时
 * 实现方按同决策树对齐（参见 design §9.7）。
 */

export type RetryableUpstreamErrorShape =
  | { kind: 'timeout'; afterMs: number }
  | { kind: 'http_5xx'; status: number }
  | { kind: 'network_reset' };

export class NonRetryableUpstreamError extends Error {
  constructor(
    public readonly status: number | null,
    message: string,
  ) {
    super(message);
    this.name = 'NonRetryableUpstreamError';
  }
}
export class RetryBudgetError extends Error {
  constructor(
    public readonly used: number,
    public readonly max: number,
  ) {
    super(`Retry budget exhausted: ${String(used)}/${String(max)}`);
    this.name = 'RetryBudgetError';
  }
}
export type RetryDecisionReason =
  | 'retry_budget_left'
  | 'non_retryable'
  | 'budget_exhausted';

export interface RetryDecision {
  attempt: number;
  /** 0 = 不再重试。 */
  nextDelayMs: number;
  reason: RetryDecisionReason;
}
export interface RetryPolicy {
  shouldRetry(error: unknown, attempt: number): RetryDecision;
}
export interface RetryBudget {
  /** 调用前 reserve；预算耗尽抛 RetryBudgetError。 */
  reserve(): void;
  /** 已 reserve 次数。 */
  get callsUsed(): number;
}
export interface DefaultRetryPolicyOptions {
  /** 单次 run 内允许的最大重试次数（含原始 attempt）。默认 3。 */
  maxAttempts?: number;
  /** 退避基数毫秒；实际延迟 = min(maxDelayMs, baseDelayMs * 2^(attempt-1)) + jitter[0, jitterMs)。默认 100。 */
  baseDelayMs?: number;
  /** 退避上限毫秒。默认 5000。 */
  maxDelayMs?: number;
  /** 抖动毫秒。默认 100。 */
  jitterMs?: number;
}
/** 默认重试策略实现：可重试错误退避重试，不可重试立即终止。 */
export class DefaultRetryPolicy implements RetryPolicy {
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly jitterMs: number;

  constructor(options: DefaultRetryPolicyOptions = {}) {
    this.maxAttempts = options.maxAttempts ?? 3;
    this.baseDelayMs = options.baseDelayMs ?? 100;
    this.maxDelayMs = options.maxDelayMs ?? 5000;
    this.jitterMs = options.jitterMs ?? 100;
    if (!Number.isInteger(this.maxAttempts) || this.maxAttempts < 1) {
      throw new Error(`Invalid maxAttempts: ${String(this.maxAttempts)}`);
    }
    if (!Number.isFinite(this.baseDelayMs) || this.baseDelayMs < 0) {
      throw new Error(`Invalid baseDelayMs: ${String(this.baseDelayMs)}`);
    }
    if (!Number.isFinite(this.maxDelayMs) || this.maxDelayMs < this.baseDelayMs) {
      throw new Error(`Invalid maxDelayMs: ${String(this.maxDelayMs)}`);
    }
    if (!Number.isFinite(this.jitterMs) || this.jitterMs < 0) {
      throw new Error(`Invalid jitterMs: ${String(this.jitterMs)}`);
    }
  }
  shouldRetry(error: unknown, attempt: number): RetryDecision {
    if (attempt >= this.maxAttempts) {
      return { attempt, nextDelayMs: 0, reason: 'budget_exhausted' };
    }
    if (error instanceof NonRetryableUpstreamError) {
      return { attempt, nextDelayMs: 0, reason: 'non_retryable' };
    }
    if (!isRetryableShape(error)) {
      return { attempt, nextDelayMs: 0, reason: 'non_retryable' };
    }
    return {
      attempt,
      nextDelayMs: this.computeBackoff(attempt),
      reason: 'retry_budget_left',
    };
  }
  private computeBackoff(attempt: number): number {
    const exp = Math.min(this.maxDelayMs, this.baseDelayMs * 2 ** (attempt - 1));
    const jitter = Math.floor(Math.random() * this.jitterMs);
    return exp + jitter;
  }
}
/** 单 run 内可重试调用的预算门；预算耗尽抛 RetryBudgetError。 */
export class InMemoryRetryBudget implements RetryBudget {
  private used = 0;
  constructor(public readonly max: number = 8) {
    if (!Number.isInteger(max) || max < 0) {
      throw new Error(`Invalid retry budget max: ${String(max)}`);
    }
  }
  reserve(): void {
    if (this.used >= this.max) {
      throw new RetryBudgetError(this.used, this.max);
    }
    this.used += 1;
  }
  get callsUsed(): number {
    return this.used;
  }
}
function isRetryableShape(error: unknown): boolean {
  if (error === null || typeof error !== 'object') return false;
  const e = error as { kind?: unknown; name?: unknown };
  if (e.kind === 'timeout' || e.kind === 'http_5xx' || e.kind === 'network_reset') {
    return true;
  }
  if (typeof e.name === 'string') {
    const n = e.name;
    if (n === 'TimeoutError' || n === 'AbortError') return false;
  }
  return false;
}

/**
 * ModelPort 包装：在最底层 port.complete() 上加受控重试（设计草案 §5.4）。
 *
 * 与 refine.ts 的关系：
 * - refine.ts 内部把 port.complete 抛的 transport_error 转化为 outcome=transport_error
 *   并返回 { ok: false }（§13 边界：不盲重发）
 * - P5 RetryingModelPort 在更细的粒度上（每次 complete() 调用前）做受控重试
 * - 两次调用都失败 → refine.ts 拿到 ok=false → 走 transport_error 降级路径
 * - 一次失败一次成功 → refine.ts 拿到正常 completion → 走正常精炼路径
 *
 * 重试预算：每次 attempt 都 reserve 一次；预算耗尽则不再重试。
 */
export class RetryingModelPort {
  constructor(
    private readonly base: { readonly provider: string; readonly paid: boolean; readonly costUpperBoundMinorPerCall: number | null; complete(req: unknown): Promise<{ text: string; usage: unknown }> },
    private readonly policy: RetryPolicy,
    private readonly budget: RetryBudget,
    private readonly sleep: (ms: number) => Promise<void> = defaultSleep,
  ) {}
  get provider(): string {
    return this.base.provider;
  }
  get paid(): boolean {
    return this.base.paid;
  }
  get costUpperBoundMinorPerCall(): number | null {
    return this.base.costUpperBoundMinorPerCall;
  }
  async complete<TReq, TRes>(req: TReq): Promise<TRes> {
    let attempt = 0;
    while (true) {
      attempt += 1;
      this.budget.reserve();
      try {
        return (await this.base.complete(req)) as TRes;
      } catch (error) {
        const decision = this.policy.shouldRetry(error, attempt);
        if (decision.nextDelayMs === 0) {
          throw error;
        }
        await this.sleep(decision.nextDelayMs);
      }
    }
  }
}
function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
