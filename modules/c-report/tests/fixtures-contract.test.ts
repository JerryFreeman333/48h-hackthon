import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runMatchPipeline, FIXED_GENERATED_AT, FIXED_REPORT_ID, loadDemoInputs, clone } from './helpers.js';

function run(overrides?: { profile?: unknown; intent?: unknown; bundle?: unknown }) {
  const inputs = loadDemoInputs();
  return runMatchPipeline({
    profile: overrides?.profile ?? clone(inputs.profile),
    intentContext: overrides?.intent ?? clone(inputs.intent),
    bundle: overrides?.bundle ?? clone(inputs.bundle),
    options: { reportId: FIXED_REPORT_ID, generatedAt: FIXED_GENERATED_AT },
  });
}

describe('公共合成样例契约（C_EXPECTED_BEHAVIOR.demo.v1.json）', () => {
  it('生成 deprioritize，销售约束 fail 引用 fact-demo-1', () => {
    const result = run();
    assert.strictEqual(result.ok, true);
    if (!result.ok) return;
    const report = result.report;
    assert.strictEqual(report.schemaVersion, '1.0.0');
    assert.strictEqual(report.mode, 'demo');
    assert.strictEqual(report.completeness, 'partial');
    assert.strictEqual((report.results).length, 1);

    const first = report.results[0];
    assert.strictEqual(first?.jobId, 'job-demo-1');
    assert.strictEqual(first?.recommendation, 'deprioritize');

    const sales = first?.constraints.find((c) => c.key === 'accept_sales_kpi');
    assert.strictEqual(sales?.result, 'fail');
    assert.deepStrictEqual(sales?.factIds, ['fact-demo-1']);
    // 不发明新硬约束：constraints 只包含用户已确认硬 key。
    assert.deepStrictEqual(first?.constraints.map((c) => c.key), ['accept_sales_kpi']);
  });

  it('五维恰好各一次，未知维度不画成 supported', () => {
    const result = run();
    if (!result.ok) throw new Error('pipeline failed');
    const dimensions = result.report.results[0]?.dimensions ?? [];
    assert.deepStrictEqual(
      dimensions.map((d) => d.key).sort(),
      ['business', 'career_value', 'identity_credit', 'personal_fit', 'role_clarity'].sort(),
    );
    const byKey = new Map(dimensions.map((d) => [d.key, d]));
    assert.strictEqual(byKey.get('identity_credit')?.status, 'unknown');
    assert.strictEqual(byKey.get('business')?.status, 'unknown');
    assert.strictEqual(byKey.get('role_clarity')?.status, 'unknown');
    assert.strictEqual(byKey.get('career_value')?.status, 'unknown');
    assert.strictEqual(byKey.get('personal_fit')?.status, 'contradicted');
    assert.deepStrictEqual(byKey.get('personal_fit')?.factIds, ['fact-demo-1']);
  });

  it('mustStayUnknown：固定月薪/真实在招/财务 不产生确定性结论', () => {
    const result = run();
    if (!result.ok) throw new Error('pipeline failed');
    const first = result.report.results[0];
    assert.strictEqual(first?.reasons.some((r) => r.kind === 'unknown' && r.text.includes('固定月薪')), true);
    assert.strictEqual(first?.reasons.some((r) => r.kind === 'unknown' && r.text.includes('在招状态未知')), true);
    assert.ok(first?.dimensions.find((d) => d.key === 'business')?.summary.includes('not_connected'));
    // 没有为薪资/城市发明 hard 约束条目。
    assert.strictEqual(first?.constraints.some((c) => c.key === 'min_fixed_monthly_salary'), false);
    assert.strictEqual(first?.constraints.some((c) => c.key === 'city'), false);
  });

  it('mustNotClaim：无占比数字、无产品设计声称、无匹配概率、不称主体已真实核验', () => {
    const result = run();
    if (!result.ok) throw new Error('pipeline failed');
    const first = result.report.results[0];
    const allTexts = [
      ...(first?.reasons.map((r) => r.text) ?? []),
      ...(first?.dimensions.map((d) => d.summary) ?? []),
      ...(first?.questions.map((q) => q.text) ?? []),
    ];
    for (const text of allTexts) {
      assert.doesNotMatch(text, /\d+(\.\d+)?\s*%|％/);
      assert.ok(!(text).includes('匹配概率'));
      assert.ok(!(text).includes('匹配度'));
    }
    const career = first?.dimensions.find((d) => d.key === 'career_value');
    assert.deepStrictEqual(career?.factIds, []);
    assert.ok((career?.summary).includes('不声称'));
    const identity = first?.dimensions.find((d) => d.key === 'identity_credit');
    assert.strictEqual(identity?.status, 'unknown');
  });

  it('核验问题具体且 resolves 全部命中 C 私有目标字典', async () => {
    const { QUESTION_TARGETS } = await import('../domain/questions.js');
    const result = run();
    if (!result.ok) throw new Error('pipeline failed');
    const questions = result.report.results[0]?.questions ?? [];
    assert.ok((questions.length) > (0));
    for (const question of questions) {
      assert.ok((question.text.length) > (6));
      assert.ok((['must', 'optional']).includes(question.priority));
      assert.ok((question.resolves.length) > (0));
      for (const target of question.resolves) {
        assert.ok((QUESTION_TARGETS as readonly string[]).includes(target));
      }
    }
    // 薪资 total → 必须有 must 级薪资拆分问题。
    const mustQuestions = questions.filter((q) => q.priority === 'must');
    assert.strictEqual(mustQuestions.some((q) => q.resolves.includes('job.salary.basis')), true);
  });

  it('三个快照与输入 bundle 逐值一致，B 数据未被改写', () => {
    const inputs = loadDemoInputs();
    const result = run();
    if (!result.ok) throw new Error('pipeline failed');
    assert.deepStrictEqual(result.report.factsSnapshot, inputs.bundle.facts);
    assert.deepStrictEqual(result.report.evidenceSnapshot, inputs.bundle.evidence);
    assert.deepStrictEqual(result.report.coverageSnapshot, inputs.bundle.coverage);
  });

  it('版本标记非空且明确未运行模型；输入哈希稳定可复现', () => {
    const result = run();
    if (!result.ok) throw new Error('pipeline failed');
    assert.strictEqual(result.report.ruleVersion, 'c-rules-1.0.0-p1');
    assert.ok((result.report.promptVersion).includes('no-model'));
    const result2 = run();
    if (!result2.ok) throw new Error('pipeline failed');
    // 注入相同 reportId/generatedAt 后两次运行完全一致（纯函数可复现）。
    assert.deepStrictEqual(result2.report, result.report);
    assert.deepStrictEqual(result2.snapshot.inputHashes, result.snapshot.inputHashes);
  });
});
