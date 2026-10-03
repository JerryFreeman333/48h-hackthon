import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { CandidateBundle, Evidence, Fact } from '../domain/contract.js';
import { buildDimensionsForJob } from '../domain/dimensions.js';
import { createJobFactIndex } from '../domain/constraints.js';
import { runMatchPipeline, loadDemoInputs, clone, deepFreeze } from './helpers.js';

function inputs() {
  const result = clone(loadDemoInputs());
  result.profile.preferences = [];
  result.profile.goals = ['寻找第一份全职工作', '提高固定收入', '改善工作与生活平衡'];
  result.profile.background.experiences = [];
  result.bundle.facts = [];
  result.bundle.evidence[0]!.verification = 'unverified';
  result.bundle.jobs[0]!.city = '深圳';
  result.bundle.companies[0]!.identityStatus = 'ambiguous';
  return result;
}

function append(bundle: CandidateBundle, key: string, value: Fact['value'], options: { company?: boolean; verified?: boolean; status?: Fact['status']; date?: string | null; excerpt?: string } = {}) {
  const suffix = String(bundle.facts.length + 1);
  const evidence: Evidence = {
    ...bundle.evidence[0]!, evidenceId: 'ev-' + suffix,
    jobId: options.company ? null : bundle.jobs[0]!.jobId,
    scope: options.company ? 'company' : 'job',
    title: options.company ? '公司资料或员工评价' : '当前岗位资料',
    excerpt: options.excerpt ?? String(value), publishedAt: options.date ?? null,
    verification: options.verified ? 'verified' : 'unverified',
  };
  const fact: Fact = {
    factId: 'fact-' + suffix, companyId: bundle.companies[0]!.companyId,
    jobId: evidence.jobId, key, value, status: options.status ?? 'unknown',
    evidenceIds: [evidence.evidenceId], asOf: options.date ?? null,
  };
  bundle.evidence.push(evidence);
  bundle.facts.push(fact);
  return fact;
}

function report(input: ReturnType<typeof inputs>) {
  const result = runMatchPipeline({ profile: deepFreeze(input.profile), intentContext: deepFreeze(input.intent), bundle: deepFreeze(input.bundle), options: { reportId: 'report-dimension-material', generatedAt: '2026-10-02T09:00:00Z' } });
  assert.strictEqual(result.ok, true, !result.ok ? JSON.stringify(result.error) : undefined);
  if (!result.ok) throw new Error('资料判断管线未完成');
  return result.report.results[0]!;
}

describe('资料→五维判断与需求解释', () => {
  it('同范围有引用且已核验的命题进入四维；资料支持不会自动变成可探索', () => {
    const input = inputs();
    input.bundle.companies[0]!.identityStatus = 'confirmed';
    for (const key of ['company.legal_name', 'company.industry']) append(input.bundle, key, key === 'company.legal_name' ? '示例主体' : '软件服务', { company: true, verified: true, status: 'supported' });
    append(input.bundle, 'job.description', '负责库存盘点和数据记录', { verified: true, status: 'supported' });
    append(input.bundle, 'needs.growth.learning', '每月开展岗位培训', { verified: true, status: 'supported' });
    const result = report(input);
    assert.deepStrictEqual(result.dimensions.slice(0, 4).map((d) => d.status), ['supported', 'supported', 'supported', 'supported']);
    assert.strictEqual(result.recommendation, 'verify_first');
    assert.ok(result.dimensions.every((d) => !/identityStatus=|mode=|supported|unknown/.test(d.summary)));
    assert.ok(result.dimensions[0]!.summary.includes('不能自动认定为该岗位签约主体'));
  });

  it('公司培训与福利是有内容的线索，不能变成岗位已确认机会', () => {
    const input = inputs();
    append(input.bundle, 'needs.growth.learning', '员工评价提到内部培训和保险补贴', { company: true, excerpt: '员工评价：不打卡，有保险、补贴与内部培训。' });
    const result = report(input);
    const growth = result.dimensions.find((d) => d.key === 'career_value')!;
    assert.strictEqual(growth.status, 'unknown');
    assert.ok(growth.summary.includes('内部培训'));
    assert.ok(growth.summary.includes('尚未独立核验'));
    assert.ok(growth.summary.includes('不能代替该岗位承诺'));
    assert.ok(growth.summary.includes('本流程未采集经历'));
    assert.ok(!growth.summary.includes('已确认经历：无'));
    assert.ok(growth.factIds.length > 0);
  });

  it('同一主题的不同文字线索可以互补，不能仅凭值不同认定资料冲突', () => {
    const input = inputs();
    append(input.bundle, 'company.industry', '软件服务', { company: true });
    append(input.bundle, 'company.industry', '电商服务', { company: true });
    const business = report(input).dimensions.find((d) => d.key === 'business')!;
    assert.strictEqual(business.status, 'unknown');
    assert.strictEqual(business.factIds.length, 2);
  });

  it('同一命题的相反记载展示冲突，不择一判通过，也不声称公司不安全', () => {
    const input = inputs();
    append(input.bundle, 'job.sales_kpi', true, { verified: true, status: 'supported' });
    append(input.bundle, 'job.sales_kpi', false, { verified: true, status: 'supported' });
    input.profile.preferences = [{ key: 'accept_sales_kpi', value: false, strength: 'hard', confirmed: true }];
    const result = report(input);
    assert.strictEqual(result.constraints[0]!.result, 'unknown');
    assert.strictEqual(result.dimensions.find((d) => d.key === 'role_clarity')!.status, 'conflicting');
    assert.strictEqual(result.recommendation, 'verify_first');
  });

  it('真实缺失和没有引用的采集记录不变成可用事实', () => {
    const input = inputs();
    const missing = report(clone(input)).dimensions.find((d) => d.key === 'business')!;
    assert.strictEqual(missing.status, 'unknown');
    assert.ok(missing.summary.includes('资料缺失或引用不完整'));
    input.bundle.facts.push({ factId: 'orphan', companyId: input.bundle.jobs[0]!.companyId, jobId: null, key: 'company.industry', value: '软件服务', status: 'unknown', evidenceIds: [], asOf: null });
    const business = buildDimensionsForJob({ profile: input.profile, bundle: input.bundle, job: input.bundle.jobs[0]!, company: input.bundle.companies[0], factIndex: createJobFactIndex(input.bundle.facts), constraintEvaluations: [] }).find((d) => d.key === 'business')!;
    assert.strictEqual(business.status, 'unknown');
    assert.deepStrictEqual(business.factIds, []);
    assert.ok(business.summary.includes('缺少完整引用'));
    assert.ok(business.summary.includes('资料缺失或引用不完整'));
    assert.ok(!business.summary.includes('已有摘录可作为调查线索'));
  });

  it('软城市、薪资及销售偏好逐项回应，不新增硬条件或用公司薪资代替', () => {
    const input = inputs();
    input.profile.preferences = [
      { key: 'city', value: ['上海', '深圳'], strength: 'soft', confirmed: true },
      { key: 'min_fixed_monthly_salary', value: 10000, strength: 'soft', confirmed: true },
      { key: 'accept_sales_kpi', value: false, strength: 'soft', confirmed: true },
    ];
    append(input.bundle, 'job.sales_kpi', true);
    const result = report(input);
    const fit = result.dimensions.find((d) => d.key === 'personal_fit')!;
    assert.deepStrictEqual(result.constraints, []);
    assert.ok(fit.summary.includes('没有已确认硬条件'));
    assert.ok(fit.summary.includes('深圳，位于意向范围内'));
    assert.ok(fit.summary.includes('10000 元'));
    assert.ok(fit.summary.includes('公司平均或其他岗位薪资不能代替'));
    assert.ok(fit.summary.includes('与软偏好有偏离'));
    assert.strictEqual(fit.status, 'unknown');
  });

  it('不同岗位的培训资料不串用，日期异常也不证明当前事项', () => {
    const input = inputs();
    const job = { ...input.bundle.jobs[0]!, jobId: 'other-job', title: '其他岗位' };
    input.bundle.jobs.push(job);
    const fact = append(input.bundle, 'needs.growth.learning', '其他岗位有培训', { verified: true, status: 'supported' });
    fact.jobId = job.jobId;
    input.bundle.evidence.at(-1)!.jobId = job.jobId;
    append(input.bundle, 'company.industry', '软件业务', { company: true, verified: true, status: 'supported', date: '2099-01-01T00:00:00Z' });
    const result = report(input);
    assert.strictEqual(result.dimensions.find((d) => d.key === 'career_value')!.factIds.length, 0);
    const business = result.dimensions.find((d) => d.key === 'business')!;
    assert.strictEqual(business.status, 'unknown');
    assert.ok(business.summary.includes('晚于本次资料读取'));
  });

  it('有岗位资料支持的硬条件通过仍可探索，与本人单方面接受区分', () => {
    const input = inputs();
    input.bundle.companies[0]!.identityStatus = 'confirmed';
    input.profile.preferences = [{ key: 'accept_sales_kpi', value: false, strength: 'hard', confirmed: true }];
    append(input.bundle, 'job.sales_kpi', false, { verified: true, status: 'supported' });
    const result = report(input);
    assert.strictEqual(result.constraints[0]!.result, 'pass');
    assert.strictEqual(result.recommendation, 'explore');
  });
});
