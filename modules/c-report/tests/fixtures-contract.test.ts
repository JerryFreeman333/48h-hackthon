import { describe, expect, it } from 'vitest';
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
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const report = result.report;
    expect(report.schemaVersion).toBe('1.0.0');
    expect(report.mode).toBe('demo');
    expect(report.completeness).toBe('partial');
    expect(report.results).toHaveLength(1);

    const first = report.results[0];
    expect(first?.jobId).toBe('job-demo-1');
    expect(first?.recommendation).toBe('deprioritize');

    const sales = first?.constraints.find((c) => c.key === 'accept_sales_kpi');
    expect(sales?.result).toBe('fail');
    expect(sales?.factIds).toEqual(['fact-demo-1']);
    // 不发明新硬约束：constraints 只包含用户已确认硬 key。
    expect(first?.constraints.map((c) => c.key)).toEqual(['accept_sales_kpi']);
  });

  it('五维恰好各一次，未知维度不画成 supported', () => {
    const result = run();
    if (!result.ok) throw new Error('pipeline failed');
    const dimensions = result.report.results[0]?.dimensions ?? [];
    expect(dimensions.map((d) => d.key).sort()).toEqual(
      ['business', 'career_value', 'identity_credit', 'personal_fit', 'role_clarity'].sort(),
    );
    const byKey = new Map(dimensions.map((d) => [d.key, d]));
    expect(byKey.get('identity_credit')?.status).toBe('unknown');
    expect(byKey.get('business')?.status).toBe('unknown');
    expect(byKey.get('role_clarity')?.status).toBe('unknown');
    expect(byKey.get('career_value')?.status).toBe('unknown');
    expect(byKey.get('personal_fit')?.status).toBe('contradicted');
    expect(byKey.get('personal_fit')?.factIds).toEqual(['fact-demo-1']);
  });

  it('mustStayUnknown：固定月薪/真实在招/财务 不产生确定性结论', () => {
    const result = run();
    if (!result.ok) throw new Error('pipeline failed');
    const first = result.report.results[0];
    expect(first?.reasons.some((r) => r.kind === 'unknown' && r.text.includes('固定月薪'))).toBe(true);
    expect(first?.reasons.some((r) => r.kind === 'unknown' && r.text.includes('在招状态未知'))).toBe(true);
    expect(first?.dimensions.find((d) => d.key === 'business')?.summary).toContain('not_connected');
    // 没有为薪资/城市发明 hard 约束条目。
    expect(first?.constraints.some((c) => c.key === 'min_fixed_monthly_salary')).toBe(false);
    expect(first?.constraints.some((c) => c.key === 'city')).toBe(false);
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
      expect(text).not.toMatch(/\d+(\.\d+)?\s*%|％/);
      expect(text).not.toContain('匹配概率');
      expect(text).not.toContain('匹配度');
    }
    const career = first?.dimensions.find((d) => d.key === 'career_value');
    expect(career?.factIds).toEqual([]);
    expect(career?.summary).toContain('不声称');
    const identity = first?.dimensions.find((d) => d.key === 'identity_credit');
    expect(identity?.status).toBe('unknown');
  });

  it('核验问题具体且 resolves 全部命中 C 私有目标字典', async () => {
    const { QUESTION_TARGETS } = await import('../domain/questions.js');
    const result = run();
    if (!result.ok) throw new Error('pipeline failed');
    const questions = result.report.results[0]?.questions ?? [];
    expect(questions.length).toBeGreaterThan(0);
    for (const question of questions) {
      expect(question.text.length).toBeGreaterThan(6);
      expect(['must', 'optional']).toContain(question.priority);
      expect(question.resolves.length).toBeGreaterThan(0);
      for (const target of question.resolves) {
        expect(QUESTION_TARGETS as readonly string[]).toContain(target);
      }
    }
    // 薪资 total → 必须有 must 级薪资拆分问题。
    const mustQuestions = questions.filter((q) => q.priority === 'must');
    expect(mustQuestions.some((q) => q.resolves.includes('job.salary.basis'))).toBe(true);
  });

  it('三个快照与输入 bundle 逐值一致，B 数据未被改写', () => {
    const inputs = loadDemoInputs();
    const result = run();
    if (!result.ok) throw new Error('pipeline failed');
    expect(result.report.factsSnapshot).toEqual(inputs.bundle.facts);
    expect(result.report.evidenceSnapshot).toEqual(inputs.bundle.evidence);
    expect(result.report.coverageSnapshot).toEqual(inputs.bundle.coverage);
  });

  it('版本标记非空且明确未运行模型；输入哈希稳定可复现', () => {
    const result = run();
    if (!result.ok) throw new Error('pipeline failed');
    expect(result.report.ruleVersion).toBe('c-rules-1.0.0-p1');
    expect(result.report.promptVersion).toContain('no-model');
    const result2 = run();
    if (!result2.ok) throw new Error('pipeline failed');
    // 注入相同 reportId/generatedAt 后两次运行完全一致（纯函数可复现）。
    expect(result2.report).toEqual(result.report);
    expect(result2.snapshot.inputHashes).toEqual(result.snapshot.inputHashes);
  });
});
