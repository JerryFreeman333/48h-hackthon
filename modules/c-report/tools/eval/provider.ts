/**
 * P4 promptfoo 自定义 provider：通过 prompt 模板直接渲染 test case vars。
 *
 * 设计约束：
 * - 不引入任何 A/B/packages/根工程的 import
 * - 仅依赖 `adapters/model/fake-scripted.ts` 与 `application/model/prompts.ts`
 * - 类形式导出（promptfoo `file://` provider 要求 `new Module(config)`）
 *
 * 用途：每个 test case 在 prompt 模板中嵌入 JSON 字符串（jinja 渲染后），
 *       本 provider 解析后回灌 ScriptedFakeModelPort；assertions 校验输出。
 */
import type { CallApiContextParams, CallApiOptionsParams, ProviderResponse } from 'promptfoo';
import { ScriptedFakeModelPort } from '../../adapters/model/fake-scripted.js';
import { SYSTEM_PROMPT } from '../../application/model/prompts.js';

export interface ProviderConfig {
  /** Echo provider for dry-run（不调 fake model，直接返回 prompt） */
  echo?: boolean;
}

export interface P4ProviderOptions {
  id?: string;
  config?: ProviderConfig;
}

/**
 * promptfoo 类 provider
 */
export class P4Provider {
  readonly providerId: string;
  readonly config: ProviderConfig;

  constructor(options: P4ProviderOptions = {}) {
    this.providerId = options.id ?? 'c-p4-fake-scripted';
    this.config = options.config ?? {};
  }

  id(): string {
    return this.providerId;
  }

  async callApi(
    prompt: string,
    _options?: CallApiOptionsParams,
    _context?: CallApiContextParams,
  ): Promise<ProviderResponse> {
    if (this.config.echo === true) {
      return { output: prompt };
    }
    // Prompt 模板渲染后，prompt 是完整的 JSON 字符串；直接传 ScriptedFakeModelPort
    const fake = new ScriptedFakeModelPort(() => prompt);
    const result = await fake.complete({
      system: SYSTEM_PROMPT,
      prompt: 'rendered',
      maxOutputTokens: 2048,
      deadlineMs: 5000,
    });
    return {
      output: result.text,
      tokenUsage: { total: result.usage.tokens ?? 0 },
    };
  }
}

export default P4Provider;
