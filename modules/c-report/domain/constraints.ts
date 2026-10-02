/**
 * 硬约束确定性评估（规格 §7）与 C 私有 DecisionTrace（§12）。
 *
 * 1.0.0 范围内的事实边界：
 * - 只有 job.sales_kpi 是已协调的 B Fact key（公共样例基线）。
 * - job.salary / job.city 等字段没有逐字段 provenance（登记 C-05/C-06）：
 *   按 §6(3)，未建立对应标准 Fact 的字段不用于确定的收入/在招/主体结论，
 *   相关约束保留 unknown。§7.2/§7.3 的比较器作为确定性框架实现并单测，
 *   待公共 provenance/Fact key 协调后自动生效。
 * - accept_travel / accept_outsourcing 需要对应岗位 Fact，key 未登记 → unknown。
 */
import type { ConstraintResult, Fact, Job, JobSalary } from './contract.js';
import { cError, type CError } from './errors.js';
import type { HardPreferenceEntry } from './preferences.js';

export interface ConstraintTrace {
  key: string;
  /** 用户侧来源路径（画像偏好），混合结论是 inference，不发明 profile Fact（§7.4）。 */
  profilePath: string;
  /** 岗位侧消费的 B Fact id（仅已协调 key）。 */
  jobFactIds: string[];
  ruleId: string;
  result: ConstraintResult;
  /** 判定依据类型：fact=已协调 Fact；declared_field=未provenance的B声明字段；user_only=仅用户侧；unavailable=不可判定。 */
  basis: 'fact' | 'declared_field' | 'user_only' | 'unavailable';
  diagnostics: string[];
  notes: string[];
}

export interface ConstraintEvaluation {
  key: string;
  result: ConstraintResult;
  /** 公共 constraints.factIds：只放支持岗位侧条件的 B Fact，不为个人偏好硬塞引用（§7.4）。 */
  factIds: string[];
  trace: ConstraintTrace;
}

export interface JobFactIndex {
  /** 取某岗位某 key 的全部事实（含非 supported；调用方负责状态过滤）。 */
  factsForJob(jobId: string, key: string): Fact[];
}

export function createJobFactIndex(facts: Fact[]): JobFactIndex {
  const byKeyJob = new Map<string, Fact[]>();
  for (const fact of facts) {
    if (fact.jobId === null) {
      continue;
    }
    const mapKey = `${fact.jobId}\u0000${fact.key}`;
    const bucket = byKeyJob.get(mapKey);
    if (bucket === undefined) {
      byKeyJob.set(mapKey, [fact]);
    } else {
      bucket.push(fact);
    }
  }
  return {
    factsForJob(jobId: string, key: string): Fact[] {
      return byKeyJob.get(`${jobId}\u0000${key}`) ?? [];
    },
  };
}

/** 岗位事实能否用于该岗位的确定性结论：jobId 匹配，companyId 为 null（主体未定位）或与岗位一致。 */
function factUsableForJob(fact: Fact, job: Job): boolean {
  if (fact.jobId !== job.jobId) {
    return false;
  }
  if (fact.companyId !== null && job.companyId !== null && fact.companyId !== job.companyId) {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// accept_sales_kpi（§7.1）
// ---------------------------------------------------------------------------

const SALES_RULE_ID = 'c.constraint.accept_sales_kpi.v1';

export function evaluateSalesKpiConstraint(
  userAccepts: boolean,
  profilePath: string,
  job: Job,
  factIndex: JobFactIndex,
): ConstraintEvaluation {
  if (userAccepts) {
    // 用户接受销售：该约束不否定岗位；不代表销售能力（§7.1）。
    return {
      key: 'accept_sales_kpi',
      result: 'pass',
      factIds: [],
      trace: {
        key: 'accept_sales_kpi',
        profilePath,
        jobFactIds: [],
        ruleId: SALES_RULE_ID,
        result: 'pass',
        basis: 'user_only',
        diagnostics: [],
        notes: ['用户已确认接受销售KPI，本约束不构成否定；接受销售不证明销售能力。'],
      },
    };
  }

  const relevantFacts = factIndex
    .factsForJob(job.jobId, 'job.sales_kpi')
    .filter((fact) => factUsableForJob(fact, job));
  const supportedTrue = relevantFacts.filter((f) => f.status === 'supported' && f.value === true);
  const supportedFalse = relevantFacts.filter((f) => f.status === 'supported' && f.value === false);

  if (supportedTrue.length > 0 && supportedFalse.length > 0) {
    return {
      key: 'accept_sales_kpi',
      result: 'unknown',
      factIds: [...supportedTrue, ...supportedFalse].map((f) => f.factId),
      trace: {
        key: 'accept_sales_kpi',
        profilePath,
        jobFactIds: [...supportedTrue, ...supportedFalse].map((f) => f.factId),
        ruleId: SALES_RULE_ID,
        result: 'unknown',
        basis: 'fact',
        diagnostics: ['FACT_CONFLICTING'],
        notes: ['岗位侧销售KPI命题同时存在 supported=true 与 supported=false，无法判定。'],
      },
    };
  }
  if (supportedTrue.length > 0) {
    return {
      key: 'accept_sales_kpi',
      result: 'fail',
      factIds: supportedTrue.map((f) => f.factId),
      trace: {
        key: 'accept_sales_kpi',
        profilePath,
        jobFactIds: supportedTrue.map((f) => f.factId),
        ruleId: SALES_RULE_ID,
        result: 'fail',
        basis: 'fact',
        diagnostics: [],
        notes: ['已确认不接受销售KPI，且岗位事实（supported）明确销售签单指标存在。'],
      },
    };
  }
  if (supportedFalse.length > 0) {
    return {
      key: 'accept_sales_kpi',
      result: 'pass',
      factIds: supportedFalse.map((f) => f.factId),
      trace: {
        key: 'accept_sales_kpi',
        profilePath,
        jobFactIds: supportedFalse.map((f) => f.factId),
        ruleId: SALES_RULE_ID,
        result: 'pass',
        basis: 'fact',
        diagnostics: [],
        notes: ['岗位侧材料明确支持无销售KPI（supported=false）。没写销售不等于无销售，此处以明确支持为准。'],
      },
    };
  }
  // 无 supported 事实：缺失、未核验或被驳斥 → unknown。
  const seenFactIds = relevantFacts.map((f) => f.factId);
  const diagnostics = relevantFacts.length === 0 ? ['NO_COORDINATED_FACT'] : ['FACT_NOT_SUPPORTED'];
  return {
    key: 'accept_sales_kpi',
    result: 'unknown',
    factIds: [],
    trace: {
      key: 'accept_sales_kpi',
      profilePath,
      jobFactIds: seenFactIds,
      ruleId: SALES_RULE_ID,
      result: 'unknown',
      basis: relevantFacts.length === 0 ? 'unavailable' : 'fact',
      diagnostics,
      notes: [
        relevantFacts.length === 0
          ? '岗位侧没有已协调的 job.sales_kpi 事实，无法判定；没写销售不等于无销售。'
          : '存在 job.sales_kpi 事实但状态不是 supported，不能用于确定性判定。',
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// min_fixed_monthly_salary（§7.2）：确定性比较器 + provenance 守门
// ---------------------------------------------------------------------------

const SALARY_RULE_ID = 'c.constraint.min_fixed_monthly_salary.v1';

export interface SalaryComparison {
  result: ConstraintResult;
  diagnostics: string[];
  notes: string[];
}

/**
 * §7.2 确定性比较器：仅当 同币种(CNY)、month、fixed、pre_tax、months 无歧义时
 * 按 [L,U] 与阈值 T 比较：L>=T → pass；U<T → fail；其余 → unknown。
 * 阈值单位假定为人民币主单位（元）——该语义待公共字典协调（登记 §3.2），
 * 协调前仅用于 demo/test。
 */
export function compareFixedMonthlySalary(
  salary: JobSalary,
  thresholdCNY: number,
): SalaryComparison {
  const diagnostics: string[] = [];
  const notes: string[] = [];
  if (salary.currency !== 'CNY') {
    diagnostics.push('NO_SHARED_CURRENCY');
    notes.push(`薪资币种 ${salary.currency} 与阈值币种（人民币）不同，无可靠换算资料，不自动转换。`);
  }
  if (salary.period !== 'month') {
    diagnostics.push('PERIOD_NOT_MONTHLY');
    notes.push('薪资周期不是月，不自动换算年薪/其他周期。');
  }
  if (salary.basis !== 'fixed') {
    diagnostics.push('BASIS_NOT_FIXED');
    notes.push('薪资口径不是 fixed；total 不能冒充固定底薪。');
  }
  if (salary.taxBasis !== 'pre_tax') {
    diagnostics.push('TAX_BASIS_UNKNOWN');
    notes.push('税前/税后口径未知或非税前，不比较。');
  }
  if (salary.months !== null && salary.period === 'month') {
    diagnostics.push('MONTHS_AMBIGUOUS');
    notes.push('月周期却附带 months（如13薪），口径歧义，保守按 unknown。');
  }
  if (diagnostics.length > 0) {
    return { result: 'unknown', diagnostics, notes };
  }
  const lower = salary.min;
  const upper = salary.max;
  if (lower === null && upper === null) {
    return { result: 'unknown', diagnostics: ['NO_INTERVAL'], notes: ['薪资区间完全未知。'] };
  }
  if (lower !== null && lower >= thresholdCNY) {
    return {
      result: 'pass',
      diagnostics: [],
      notes: [`披露固定月薪下限 ${lower} 达到阈值 ${thresholdCNY}；仅表示披露区间达到下限，不等于可确保的待遇。`],
    };
  }
  if (upper !== null && upper < thresholdCNY) {
    return {
      result: 'fail',
      diagnostics: [],
      notes: [`披露固定月薪上限 ${upper} 低于阈值 ${thresholdCNY}。`],
    };
  }
  return {
    result: 'unknown',
    diagnostics: ['CROSSES_THRESHOLD'],
    notes: ['披露区间跨越阈值，无法判定固定月薪是否达到要求。'],
  };
}

/**
 * 管线层评估：1.0.0 中 job.salary 无逐字段 provenance、无对应标准 Fact key
 * （登记 C-05/C-06），按 §6(3) 一律 unknown；比较器结果记入 trace 供协调后启用。
 */
export function evaluateSalaryConstraint(
  threshold: number,
  profilePath: string,
  job: Job,
): ConstraintEvaluation {
  const comparison = compareFixedMonthlySalary(job.salary, threshold);
  return {
    key: 'min_fixed_monthly_salary',
    result: 'unknown',
    factIds: [],
    trace: {
      key: 'min_fixed_monthly_salary',
      profilePath,
      jobFactIds: [],
      ruleId: SALARY_RULE_ID,
      result: 'unknown',
      basis: 'declared_field',
      diagnostics: ['SALARY_FIELD_NO_PROVENANCE', ...comparison.diagnostics],
      notes: [
        '1.0.0 中 job.salary 没有逐字段来源（provenance）与标准 Fact key，不用于确定的收入结论，约束保留 unknown（规格 §6(3)）。',
        ...comparison.notes,
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// city（§7.3）：确定性比较器 + provenance 守门
// ---------------------------------------------------------------------------

const CITY_RULE_ID = 'c.constraint.city.v1';

export interface CityComparison {
  result: ConstraintResult;
  diagnostics: string[];
  notes: string[];
}

/**
 * 最严格比较器：trim 后全等 → pass；不等 → unknown（可能是别名/层级差异，
 * 无公共地理规范时不得用字符串包含法，也不得直接 fail）。
 */
export function compareCity(userCities: string[], jobCity: string | null): CityComparison {
  if (jobCity === null) {
    return { result: 'unknown', diagnostics: ['JOB_CITY_MISSING'], notes: ['岗位城市未知。'] };
  }
  const normalizedJob = jobCity.trim();
  const equal = userCities.some((city) => city.trim() === normalizedJob);
  if (equal) {
    return { result: 'pass', diagnostics: [], notes: [`岗位城市 ${jobCity} 与已确认范围全等（demo/test 最严格匹配）。`] };
  }
  return {
    result: 'unknown',
    diagnostics: ['NO_SHARED_GEO_NORMALIZATION'],
    notes: [`岗位城市 ${jobCity} 与已确认范围不一致；无共同地理规范时不判定 fail。`],
  };
}

/** 管线层：job.city 无 provenance、无公共地理规范（登记 §3.2/§3.3）→ 一律 unknown。 */
export function evaluateCityConstraint(
  userCities: string[],
  profilePath: string,
  job: Job,
): ConstraintEvaluation {
  const comparison = compareCity(userCities, job.city);
  return {
    key: 'city',
    result: 'unknown',
    factIds: [],
    trace: {
      key: 'city',
      profilePath,
      jobFactIds: [],
      ruleId: CITY_RULE_ID,
      result: 'unknown',
      basis: 'declared_field',
      diagnostics: ['CITY_FIELD_NO_PROVENANCE', ...comparison.diagnostics],
      notes: [
        '1.0.0 中 job.city 没有逐字段来源，且公共地理规范未建立；城市约束保留 unknown（规格 §6(3)/§7.3）。',
        ...comparison.notes,
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// accept_travel / accept_outsourcing（§7.3）
// ---------------------------------------------------------------------------

const TRAVEL_RULE_ID = 'c.constraint.accept_travel.v1';
const OUTSOURCING_RULE_ID = 'c.constraint.accept_outsourcing.v1';

function evaluateBooleanConstraintRequiringFact(
  key: 'accept_travel' | 'accept_outsourcing',
  userAccepts: boolean,
  profilePath: string,
  requiredFactKey: string,
  ruleId: string,
  factIndex: JobFactIndex,
  job: Job,
): ConstraintEvaluation {
  const relevantFacts = factIndex.factsForJob(job.jobId, requiredFactKey).filter((f) => factUsableForJob(f, job));
  const supported = relevantFacts.filter((f) => f.status === 'supported');
  const diagnostics = relevantFacts.length === 0 ? ['UNREGISTERED_FACT_KEY'] : ['FACT_NOT_SUPPORTED'];
  const notes = [
    `${key} 需要消费对应岗位事实（${requiredFactKey}）；该 Fact key 未在公共契约 1.0.0 登记，不用于确定性结论，约束保留 unknown（规格 §6）。`,
  ];
  if (relevantFacts.length > 0) {
    notes.push(`存在 ${String(relevantFacts.length)} 条同 key 事实但状态不支持确定性判定；用户侧取值为 ${String(userAccepts)}。`);
  } else {
    notes.push(`用户侧取值为 ${String(userAccepts)}；岗位侧无对应事实。`);
  }
  return {
    key,
    result: 'unknown',
    factIds: [],
    trace: {
      key,
      profilePath,
      jobFactIds: supported.map((f) => f.factId),
      ruleId,
      result: 'unknown',
      basis: 'unavailable',
      diagnostics,
      notes,
    },
  };
}

// ---------------------------------------------------------------------------
// 汇总：单个岗位的全部约束评估
// ---------------------------------------------------------------------------

export function evaluateConstraintsForJob(
  hardPreferences: HardPreferenceEntry[],
  job: Job,
  factIndex: JobFactIndex,
): { ok: true; value: ConstraintEvaluation[] } | { ok: false; error: CError } {
  const evaluations: ConstraintEvaluation[] = [];
  for (const entry of hardPreferences) {
    const { pref, profilePath } = entry;
    switch (pref.kind) {
      case 'accept_sales_kpi':
        evaluations.push(evaluateSalesKpiConstraint(pref.value, profilePath, job, factIndex));
        break;
      case 'min_fixed_monthly_salary':
        evaluations.push(evaluateSalaryConstraint(pref.value, profilePath, job));
        break;
      case 'city':
        evaluations.push(evaluateCityConstraint(pref.value, profilePath, job));
        break;
      case 'accept_travel':
        evaluations.push(
          evaluateBooleanConstraintRequiringFact('accept_travel', pref.value, profilePath, 'job.travel', TRAVEL_RULE_ID, factIndex, job),
        );
        break;
      case 'accept_outsourcing':
        evaluations.push(
          evaluateBooleanConstraintRequiringFact('accept_outsourcing', pref.value, profilePath, 'job.outsourcing', OUTSOURCING_RULE_ID, factIndex, job),
        );
        break;
      case 'unregistered':
        evaluations.push({
          key: pref.key,
          result: 'unknown',
          factIds: [],
          trace: {
            key: pref.key,
            profilePath,
            jobFactIds: [],
            ruleId: 'c.constraint.unregistered.v1',
            result: 'unknown',
            basis: 'unavailable',
            diagnostics: ['UNREGISTERED_PREFERENCE_KEY'],
            notes: ['该硬约束 key 未在公共契约登记，不用于确定性结论；保留 unknown 并在报告中展示。'],
          },
        });
        break;
      default: {
        const exhaustive: never = pref;
        return { ok: false, error: cError('PREFERENCE_INVALID', `未处理的硬约束类型：${JSON.stringify(exhaustive)}`) };
      }
    }
  }
  return { ok: true, value: evaluations };
}
