/**
 * P4 七层输出校验单元测试（规格 §11 的确定性可自动化层）。
 * 直接以 bundle/岗位构造上下文，不经管线（层逻辑独立可测）。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadDemoInputs, clone } from './helpers.js';
import { validateRefineOutput } from '../application/model/validate-output.js';

function ctx() {
  const inputs = loadDemoInputs();
  return { job: clone(inputs.bundle.jobs[0]), bundle: clone(inputs.bundle) };
}

function summary(overrides: Partial<Record<string, string>> = {}): string {
  return [
    '【证据】岗位名称与 JD 原文见材料；考核方面存在销售签单指标（事实 fact-demo-1）。',
    '【推断】职责构成需向招聘方确认，证据只支持命题本身，不等于岗位清晰适合。',
    overrides.role ?? '【缺口】JD 未写明职责占比；是否存在其他考核未知。',
  ].join('');
}

const VALID = JSON.stringify({
  dimensions: [
    { key: 'role_clarity', summary: summary() },
    {
      key: 'career_value',
      summary:
        '【证据】本人目标与已确认经历见材料。【推断】经历与目标存在表面关联线索，自报内容不证明实际能力。【缺口】成长价值需通过面试核验。',
    },
  ],
});

describe('P4 七层校验：L1 结构与枚举', () => {
  it('合法输出通过且按维度接受', () => {
    const result = validateRefineOutput(VALID, ctx());
    assert.strictEqual(result.kind, 'ok');
    if (result.kind !== 'ok') return;
    assert.strictEqual(result.accepted.length, 2);
    assert.strictEqual(result.rejected.length, 0);
  });

  it('非 JSON 输出 → structural_error（修复轮触发条件）', () => {
    const result = validateRefineOutput('{"dimensions":[{"key":"role_clarity","summ', ctx());
    assert.strictEqual(result.kind, 'structural_error');
  });

  it('顶层多余字段（如模型试图改 recommendation）→ structural_error', () => {
    const malicious = JSON.stringify({ recommendation: 'explore', dimensions: [] });
    const result = validateRefineOutput(malicious, ctx());
    assert.strictEqual(result.kind, 'structural_error');
    if (result.kind !== 'structural_error') return;
    assert.ok(result.errors.some((error) => error.includes('recommendation')));
  });

  it('维度对象多余字段、非法 key、重复 key、缺段落标记 → 全部拒绝', () => {
    const bad = JSON.stringify({
      dimensions: [
        { key: 'role_clarity', summary: summary(), confidence: 0.9 },
        { key: 'not_a_dimension', summary: summary() },
        { key: 'role_clarity', summary: summary() },
        { key: 'business', summary: '【证据】只有一段。' },
      ],
    });
    const result = validateRefineOutput(bad, ctx());
    assert.strictEqual(result.kind, 'ok');
    if (result.kind !== 'ok') return;
    assert.strictEqual(result.accepted.length, 0);
    assert.strictEqual(result.rejected.length, 4);
    const joined = result.rejected.map((item) => item.errors.join('')).join('');
    assert.ok(joined.includes('confidence'));
    assert.ok(joined.includes('not_a_dimension'));
    assert.ok(joined.includes('重复'));
    assert.ok(joined.includes('【缺口】'));
  });
});

describe('P4 七层校验：L2 引用与主体', () => {
  it('发明不存在的编号 → 该维度拒绝', () => {
    const text = JSON.stringify({
      dimensions: [{ key: 'business', summary: summary({ role: '【证据】见事实 fact-invented-9。【推断】。【缺口】。' }) }],
    });
    const result = validateRefineOutput(text, ctx());
    assert.strictEqual(result.kind, 'ok');
    if (result.kind !== 'ok') return;
    assert.strictEqual(result.accepted.length, 0);
    assert.match(result.rejected[0]?.errors.join('') ?? '', /不存在/);
  });

  it('跨主体引用（他人岗位的事实编号）→ 该维度拒绝', () => {
    const context = ctx();
    context.bundle.facts.push({
      factId: 'fact-other-1',
      companyId: 'company-other',
      jobId: 'job-other',
      key: 'job.sales_kpi',
      value: false,
      status: 'supported',
      evidenceIds: [],
      asOf: null,
    });
    const text = JSON.stringify({
      dimensions: [{ key: 'business', summary: summary({ role: '【证据】对照事实 fact-other-1。【推断】。【缺口】。' }) }],
    });
    const result = validateRefineOutput(text, context);
    assert.strictEqual(result.kind, 'ok');
    if (result.kind !== 'ok') return;
    assert.match(result.rejected[0]?.errors.join('') ?? '', /跨主体|不属于本岗位主体/);
  });

  it('引用本岗位自有编号（fact-demo-1）→ 通过', () => {
    const result = validateRefineOutput(VALID, ctx());
    assert.strictEqual(result.kind, 'ok');
    if (result.kind !== 'ok') return;
    assert.ok(result.accepted.every((item) => !item.summary.includes('不存在的编号')));
  });
});

describe('P4 七层校验：L3/L4 声明支持与时间', () => {
  it('在招状态非 open 时写出"正在招聘" → 拒绝', () => {
    const text = JSON.stringify({
      dimensions: [{ key: 'business', summary: summary({ role: '【证据】。【推断】。【缺口】该岗位正在招聘中，机会窗口有限。' }) }],
    });
    const result = validateRefineOutput(text, ctx());
    assert.strictEqual(result.kind, 'ok');
    if (result.kind !== 'ok') return;
    assert.match(result.rejected[0]?.errors.join('') ?? '', /正在招聘/);
  });

  it('total 口径岗位写出固定底薪数字 → 拒绝', () => {
    const text = JSON.stringify({
      dimensions: [{ key: 'business', summary: summary({ role: '【证据】。【推断】。【缺口】固定月薪 10000 需确认构成。' }) }],
    });
    const result = validateRefineOutput(text, ctx());
    assert.strictEqual(result.kind, 'ok');
    if (result.kind !== 'ok') return;
    assert.ok(result.rejected.some((item) => item.errors.join('').includes('固定')));
  });

  it('"已核验主体/实时"类断言 → 拒绝', () => {
    for (const phrase of ['主体已完成核验，信用良好', '数据为实时更新']) {
      const text = JSON.stringify({
        dimensions: [{ key: 'business', summary: summary({ role: `【证据】。【推断】。【缺口】${phrase}。` }) }],
      });
      const result = validateRefineOutput(text, ctx());
      assert.strictEqual(result.kind, 'ok');
      if (result.kind !== 'ok') return;
      assert.strictEqual(result.accepted.length, 0, phrase);
    }
  });
});

describe('P4 七层校验：L5 数值', () => {
  it('材料中不存在的数字 → 拒绝；材料中存在的数字 → 通过', () => {
    const invented = JSON.stringify({
      dimensions: [{ key: 'business', summary: summary({ role: '【证据】。【推断】。【缺口】团队约 500 人规模需核实。' }) }],
    });
    const result = validateRefineOutput(invented, ctx());
    assert.strictEqual(result.kind, 'ok');
    if (result.kind !== 'ok') return;
    assert.match(result.rejected[0]?.errors.join('') ?? '', /500/);

    const inCorpus = JSON.stringify({
      dimensions: [{ key: 'business', summary: summary({ role: '【证据】声明薪资区间 10000–15000 为 total 口径。【推断】。【缺口】' }) }],
    });
    const okResult = validateRefineOutput(inCorpus, ctx());
    assert.strictEqual(okResult.kind, 'ok');
    if (okResult.kind !== 'ok') return;
    assert.ok(okResult.accepted.some((item) => item.key === 'business'));
  });

  it('百分比表述一律拒绝', () => {
    const text = JSON.stringify({
      dimensions: [{ key: 'business', summary: summary({ role: '【证据】。【推断】。【缺口】销售职责占比 30% 需确认。' }) }],
    });
    const result = validateRefineOutput(text, ctx());
    assert.strictEqual(result.kind, 'ok');
    if (result.kind !== 'ok') return;
    assert.ok(result.rejected.some((item) => item.errors.join('').includes('百分比')));
  });
});

describe('P4 七层校验：L6 个人', () => {
  it('概率/保证/能力证明类表述 → 拒绝', () => {
    for (const phrase of ['匹配率较高', '保证能拿到 offer', '证明了你的产品能力']) {
      const text = JSON.stringify({
        dimensions: [{ key: 'career_value', summary: summary({ role: `【证据】。【推断】。【缺口】${phrase}。` }) }],
      });
      const result = validateRefineOutput(text, ctx());
      assert.strictEqual(result.kind, 'ok');
      if (result.kind !== 'ok') return;
      assert.strictEqual(result.accepted.length, 0, phrase);
    }
  });
});
