import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DefaultRetryPolicy,
  InMemoryRetryBudget,
  NonRetryableUpstreamError,
  RetryBudgetError,
} from '../application/retry-policy.js';

describe('P5 重试策略与预算（设计草案 §4.3）', () => {
  it('可重试 timeout：第 1 次退避，nextDelayMs > 0 且 reason=retry_budget_left', () => {
    const p = new DefaultRetryPolicy({ maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 5000, jitterMs: 0 });
    const d = p.shouldRetry({ kind: 'timeout', afterMs: 1000 }, 1);
    assert.strictEqual(d.reason, 'retry_budget_left');
    assert.ok(d.nextDelayMs >= 100);
  });

  it('可重试 5xx：放行重试', () => {
    const p = new DefaultRetryPolicy({ jitterMs: 0 });
    const d = p.shouldRetry({ kind: 'http_5xx', status: 503 }, 1);
    assert.strictEqual(d.reason, 'retry_budget_left');
    assert.ok(d.nextDelayMs > 0);
  });

  it('可重试 network_reset：放行重试', () => {
    const p = new DefaultRetryPolicy({ jitterMs: 0 });
    const d = p.shouldRetry({ kind: 'network_reset' }, 1);
    assert.strictEqual(d.reason, 'retry_budget_left');
  });

  it('不可重试 4xx：NonRetryableUpstreamError 立即终止', () => {
    const p = new DefaultRetryPolicy();
    const e = new NonRetryableUpstreamError(422, 'bad request');
    const d = p.shouldRetry(e, 1);
    assert.strictEqual(d.reason, 'non_retryable');
    assert.strictEqual(d.nextDelayMs, 0);
  });

  it('不可重试未知错误：不重试，避免"什么都重试"', () => {
    const p = new DefaultRetryPolicy();
    const d = p.shouldRetry(new Error('random'), 1);
    assert.strictEqual(d.reason, 'non_retryable');
    assert.strictEqual(d.nextDelayMs, 0);
  });

  it('不可重试 null/字符串：完全不重试', () => {
    const p = new DefaultRetryPolicy();
    assert.strictEqual(p.shouldRetry(null, 1).reason, 'non_retryable');
    assert.strictEqual(p.shouldRetry('error', 1).reason, 'non_retryable');
  });

  it('退避指数：baseDelayMs=100 时 attempt 1→100ms, 2→200ms, 3→400ms（±jitter）', () => {
    const p = new DefaultRetryPolicy({ maxAttempts: 5, baseDelayMs: 100, maxDelayMs: 5000, jitterMs: 0 });
    assert.strictEqual(p.shouldRetry({ kind: 'timeout', afterMs: 1 }, 1).nextDelayMs, 100);
    assert.strictEqual(p.shouldRetry({ kind: 'timeout', afterMs: 1 }, 2).nextDelayMs, 200);
    assert.strictEqual(p.shouldRetry({ kind: 'timeout', afterMs: 1 }, 3).nextDelayMs, 400);
  });

  it('退避上限：maxDelayMs 触发后封顶', () => {
    const p = new DefaultRetryPolicy({ maxAttempts: 10, baseDelayMs: 100, maxDelayMs: 500, jitterMs: 0 });
    assert.strictEqual(p.shouldRetry({ kind: 'timeout', afterMs: 1 }, 8).nextDelayMs, 500);
  });

  it('预算耗尽：maxAttempts 触顶后 reason=budget_exhausted', () => {
    const p = new DefaultRetryPolicy({ maxAttempts: 3, jitterMs: 0 });
    const d = p.shouldRetry({ kind: 'timeout', afterMs: 1 }, 3);
    assert.strictEqual(d.reason, 'budget_exhausted');
    assert.strictEqual(d.nextDelayMs, 0);
  });

  it('maxAttempts=0 非法', () => {
    assert.throws(() => new DefaultRetryPolicy({ maxAttempts: 0 }));
  });

  it('jitter：nextDelayMs 含抖动（多次抽样落在 [base, base+jitterMs)）', () => {
    const p = new DefaultRetryPolicy({ maxAttempts: 5, baseDelayMs: 100, maxDelayMs: 5000, jitterMs: 50 });
    const samples = new Set<number>();
    for (let i = 0; i < 30; i += 1) {
      samples.add(p.shouldRetry({ kind: 'timeout', afterMs: 1 }, 1).nextDelayMs);
    }
    // 至少应出现不同值（jitter 真起作用）
    assert.ok(samples.size > 1, 'jitter should produce varied samples');
    for (const s of samples) {
      assert.ok(s >= 100 && s < 150, `sample ${String(s)} out of range`);
    }
  });

  it('InMemoryRetryBudget：reserve 计数；超 max 抛 RetryBudgetError', () => {
    const b = new InMemoryRetryBudget(3);
    assert.strictEqual(b.callsUsed, 0);
    b.reserve();
    b.reserve();
    assert.strictEqual(b.callsUsed, 2);
    b.reserve();
    assert.strictEqual(b.callsUsed, 3);
    assert.throws(() => b.reserve(), RetryBudgetError);
  });

  it('InMemoryRetryBudget：max=0 永不抛（用于显式关闭重试预算门）', () => {
    const b = new InMemoryRetryBudget(0);
    assert.throws(() => b.reserve(), RetryBudgetError);
  });

  it('InMemoryRetryBudget：max 非法负数抛错', () => {
    assert.throws(() => new InMemoryRetryBudget(-1));
  });
});
