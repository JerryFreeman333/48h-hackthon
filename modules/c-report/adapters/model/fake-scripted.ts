/**
 * 显式脚本化 fake 模型端口（非生产，仅 demo/test）。
 *
 * 无网络、无真实模型：按注入的脚本函数返回预置文本。用于 P4 全部离线路径：
 * 行为良好输出、非法 JSON、截断、越权改动作、编造编号/数字、注入回声。
 * provider=fake-scripted、paid=false、上界 0 —— 预算门只放行免费路径（§14）。
 */
import type { ModelCompletion, ModelCompletionRequest, ModelPort, ModelUsage } from '../../application/model/port.js';

export class ScriptedFakeModelPort implements ModelPort {
  readonly provider = 'fake-scripted';
  readonly paid = false;
  readonly costUpperBoundMinorPerCall = 0;

  /** 已收到的请求（测试断言 prompt 内容/注入隔离用）。 */
  readonly receivedRequests: ModelCompletionRequest[] = [];
  private counter = 0;

  constructor(
    private readonly script: (callIndex: number, request: ModelCompletionRequest) => string | Promise<string>,
  ) {}

  get callCount(): number {
    return this.counter;
  }

  async complete(request: ModelCompletionRequest): Promise<ModelCompletion> {
    this.counter += 1;
    const callIndex = this.counter;
    this.receivedRequests.push(request);
    const text = await this.script(callIndex, request);
    const usage: ModelUsage = { provider: this.provider, requestId: `fake-${String(callIndex)}`, costMinor: null, tokens: null };
    return { text, usage };
  }
}

/** 付费且无费用上界的端口：预算门必须拒绝（C-17）。 */
export class UnboundedPaidFakeModelPort implements ModelPort {
  readonly provider = 'fake-paid-unbounded';
  readonly paid = true;
  readonly costUpperBoundMinorPerCall = null;

  private counter = 0;

  get callCount(): number {
    return this.counter;
  }

  async complete(request: ModelCompletionRequest): Promise<ModelCompletion> {
    void request;
    this.counter += 1;
    return { text: '{"dimensions":[]}', usage: { provider: this.provider, requestId: null, costMinor: null, tokens: null } };
  }
}
