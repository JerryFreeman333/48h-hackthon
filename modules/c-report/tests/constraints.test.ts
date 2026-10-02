import { describe, expect, it } from 'vitest';
import {
  compareFixedMonthlySalary,
  compareCity,
  createJobFactIndex,
  evaluateSalesKpiConstraint,
} from '../domain/constraints.js';
import { extractConfirmedHardPreferences } from '../domain/preferences.js';
import type { Fact, Job, UserProfile } from '../domain/contract.js';
import { loadDemoInputs, clone } from './helpers.js';

const BASE_SALARY = {
  currency: 'CNY',
  min: 12000,
  max: 15000,
  period: 'month' as const,
  basis: 'fixed' as const,
  taxBasis: 'pre_tax' as const,
  months: null,
};

function makeJob(overrides?: Partial<Job>): Job {
  return {
    jobId: 'job-1',
    companyId: 'company-1',
    title: '测试岗位',
    rawJd: '职责：示例。',
    city: '上海',
    sourceUrl: null,
    publishedAt: null,
    vacancyStatus: 'unknown',
    salary: { ...BASE_SALARY },
    ...overrides,
  };
}

function makeFact(overrides?: Partial<Fact>): Fact {
  return {
    factId: 'fact-1',
    companyId: 'company-1',
    jobId: 'job-1',
    key: 'job.sales_kpi',
    value: true,
    status: 'supported',
    evidenceIds: ['evidence-1'],
    asOf: null,
    ...overrides,
  };
}

describe('薪资确定性比较器（规格 §7.2）', () => {
  it('L>=T → pass（仅表示披露区间达到下限）', () => {
    const result = compareFixedMonthlySalary({ ...BASE_SALARY, min: 12000, max: 15000 }, 10000);
    expect(result.result).toBe('pass');
  });

  it('U<T → fail', () => {
    const result = compareFixedMonthlySalary({ ...BASE_SALARY, min: 12000, max: 15000 }, 16000);
    expect(result.result).toBe('fail');
  });

  it('L<T<=U 跨阈值 → unknown', () => {
    const result = compareFixedMonthlySalary({ ...BASE_SALARY, min: 9000, max: 15000 }, 10000);
    expect(result.result).toBe('unknown');
    expect(result.diagnostics).toContain('CROSSES_THRESHOLD');
  });

  it('仅披露下限：min>=T pass；min<T unknown', () => {
    expect(compareFixedMonthlySalary({ ...BASE_SALARY, min: 12000, max: null }, 10000).result).toBe('pass');
    expect(compareFixedMonthlySalary({ ...BASE_SALARY, min: 9000, max: null }, 10000).result).toBe('unknown');
  });

  it('仅披露上限：max<T fail；max>=T unknown', () => {
    expect(compareFixedMonthlySalary({ ...BASE_SALARY, min: null, max: 9000 }, 10000).result).toBe('fail');
    expect(compareFixedMonthlySalary({ ...BASE_SALARY, min: null, max: 15000 }, 10000).result).toBe('unknown');
  });

  it('区间完全未知 → unknown', () => {
    const result = compareFixedMonthlySalary({ ...BASE_SALARY, min: null, max: null }, 10000);
    expect(result.result).toBe('unknown');
    expect(result.diagnostics).toContain('NO_INTERVAL');
  });

  it('total 不能冒充 fixed → unknown', () => {
    const result = compareFixedMonthlySalary({ ...BASE_SALARY, basis: 'total' }, 10000);
    expect(result.result).toBe('unknown');
    expect(result.diagnostics).toContain('BASIS_NOT_FIXED');
  });

  it('币种不同不自动换算 → unknown', () => {
    const result = compareFixedMonthlySalary({ ...BASE_SALARY, currency: 'USD' }, 10000);
    expect(result.result).toBe('unknown');
    expect(result.diagnostics).toContain('NO_SHARED_CURRENCY');
  });

  it('非月周期不自动换算 → unknown', () => {
    const result = compareFixedMonthlySalary({ ...BASE_SALARY, period: 'year' }, 10000);
    expect(result.result).toBe('unknown');
    expect(result.diagnostics).toContain('PERIOD_NOT_MONTHLY');
  });

  it('税后/口径未知 → unknown', () => {
    expect(compareFixedMonthlySalary({ ...BASE_SALARY, taxBasis: 'after_tax' }, 10000).diagnostics).toContain('TAX_BASIS_UNKNOWN');
    expect(compareFixedMonthlySalary({ ...BASE_SALARY, taxBasis: 'unknown' }, 10000).result).toBe('unknown');
  });

  it('月周期附带 months（如13薪）口径歧义 → unknown', () => {
    const result = compareFixedMonthlySalary({ ...BASE_SALARY, months: 13 }, 10000);
    expect(result.result).toBe('unknown');
    expect(result.diagnostics).toContain('MONTHS_AMBIGUOUS');
  });
});

describe('城市比较器（规格 §7.3，demo/test 最严格匹配）', () => {
  it('全等 → pass', () => {
    const result = compareCity(['上海'], '上海');
    expect(result.result).toBe('pass');
  });

  it('不等 → unknown（无共同地理规范，不得字符串包含或直接 fail）', () => {
    const result = compareCity(['上海'], '上海市');
    expect(result.result).toBe('unknown');
    expect(result.diagnostics).toContain('NO_SHARED_GEO_NORMALIZATION');
  });

  it('岗位城市缺失 → unknown', () => {
    expect(compareCity(['上海'], null).result).toBe('unknown');
  });
});

describe('销售KPI约束（规格 §7.1）', () => {
  const job = makeJob();

  it('用户接受销售 → pass，不代表能力判断', () => {
    const result = evaluateSalesKpiConstraint(true, 'preferences[0]', job, createJobFactIndex([makeFact()]));
    expect(result.result).toBe('pass');
    expect(result.trace.basis).toBe('user_only');
    expect(result.factIds).toEqual([]);
  });

  it('用户拒绝 + supported=true → fail 并引用事实', () => {
    const result = evaluateSalesKpiConstraint(false, 'preferences[0]', job, createJobFactIndex([makeFact()]));
    expect(result.result).toBe('fail');
    expect(result.factIds).toEqual(['fact-1']);
  });

  it('用户拒绝 + supported=false（材料明确无KPI）→ pass', () => {
    const result = evaluateSalesKpiConstraint(
      false,
      'preferences[0]',
      job,
      createJobFactIndex([makeFact({ value: false })]),
    );
    expect(result.result).toBe('pass');
    expect(result.factIds).toEqual(['fact-1']);
  });

  it('supported=true 与 supported=false 并存 → unknown（命题冲突）', () => {
    const result = evaluateSalesKpiConstraint(
      false,
      'preferences[0]',
      job,
      createJobFactIndex([makeFact({ factId: 'f1', value: true }), makeFact({ factId: 'f2', value: false })]),
    );
    expect(result.result).toBe('unknown');
    expect(result.trace.diagnostics).toContain('FACT_CONFLICTING');
  });

  it('事实存在但状态非 supported → unknown；没写销售不等于无销售', () => {
    const result = evaluateSalesKpiConstraint(
      false,
      'preferences[0]',
      job,
      createJobFactIndex([makeFact({ status: 'unknown' })]),
    );
    expect(result.result).toBe('unknown');
    expect(result.trace.diagnostics).toContain('FACT_NOT_SUPPORTED');
    expect(evaluateSalesKpiConstraint(false, 'p', job, createJobFactIndex([])).result).toBe('unknown');
    expect(evaluateSalesKpiConstraint(false, 'p', job, createJobFactIndex([])).trace.diagnostics).toContain('NO_COORDINATED_FACT');
  });

  it('contradicted 的“无KPI”命题不能当 pass 使用', () => {
    const result = evaluateSalesKpiConstraint(
      false,
      'preferences[0]',
      job,
      createJobFactIndex([makeFact({ value: false, status: 'contradicted' })]),
    );
    expect(result.result).toBe('unknown');
  });

  it('事实主体与岗位不一致时不可用', () => {
    const result = evaluateSalesKpiConstraint(
      false,
      'preferences[0]',
      makeJob({ companyId: 'company-2' }),
      createJobFactIndex([makeFact({ companyId: 'company-1' })]),
    );
    expect(result.result).toBe('unknown');
  });
});

describe('硬偏好提取（规格 §7）', () => {
  function profileWithPreferences(preferences: UserProfile['preferences']): UserProfile {
    const inputs = loadDemoInputs();
    const profile = clone(inputs.profile);
    profile.preferences = preferences;
    return profile;
  }

  it('重复 hard key 拒绝', () => {
    const result = extractConfirmedHardPreferences(
      profileWithPreferences([
        { key: 'accept_sales_kpi', value: false, strength: 'hard', confirmed: true },
        { key: 'accept_sales_kpi', value: true, strength: 'hard', confirmed: true },
      ]),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('DUPLICATE_HARD_KEY');
  });

  it('min_fixed_monthly_salary 非数字/负数/非有限 拒绝', () => {
    for (const bad of ['10000', -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = extractConfirmedHardPreferences(
        profileWithPreferences([{ key: 'min_fixed_monthly_salary', value: bad as number, strength: 'hard', confirmed: true }]),
      );
      expect(result.ok).toBe(false);
    }
  });

  it('布尔硬约束非布尔值拒绝', () => {
    const result = extractConfirmedHardPreferences(
      profileWithPreferences([{ key: 'accept_sales_kpi', value: 'yes', strength: 'hard', confirmed: true }]),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('PREFERENCE_INVALID');
  });

  it('city 需要字符串或非空字符串数组', () => {
    expect(
      extractConfirmedHardPreferences(
        profileWithPreferences([{ key: 'city', value: ['上海', '杭州'], strength: 'hard', confirmed: true }]),
      ).ok,
    ).toBe(true);
    expect(
      extractConfirmedHardPreferences(
        profileWithPreferences([{ key: 'city', value: [], strength: 'hard', confirmed: true }]),
      ).ok,
    ).toBe(false);
  });

  it('soft 与 unconfirmed hard 不进入硬判定', () => {
    const result = extractConfirmedHardPreferences(
      profileWithPreferences([
        { key: 'accept_sales_kpi', value: false, strength: 'soft', confirmed: true },
        { key: 'accept_sales_kpi', value: false, strength: 'hard', confirmed: false },
      ]),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(0);
  });

  it('未登记 hard key 保留为 unknown，不用于确定性结论', () => {
    const result = extractConfirmedHardPreferences(
      profileWithPreferences([{ key: 'must_have_parking', value: true, strength: 'hard', confirmed: true }]),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.pref.kind).toBe('unregistered');
    }
  });
});
