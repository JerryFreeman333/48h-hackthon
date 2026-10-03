/**
 * 五维模板（规格 §9）：每个有效岗位恰好五个 key 各一次。
 * summary 必须区分【证据】【推断】【缺口】；Status 表示命题核验状态，不是好坏分。
 * 不生成综合匹配百分比，不用问卷兴趣分推岗位匹配概率，不编职责占比。
 * 无对应标准 Fact 的字段（identityStatus/city/salary/vacancy）不产生确定性结论（§6(3)）。
 */
import type { CandidateBundle, DimensionKey, Fact, Job, MatchReportResultDimension, Status, UserProfile } from './contract.js';
import type { JobFactIndex } from './constraints.js';
import type { ConstraintEvaluation } from './constraints.js';
import { collectNonHardPreferences } from './preferences.js';

export const DIMENSION_KEYS: readonly DimensionKey[] = [
  'identity_credit',
  'business',
  'role_clarity',
  'career_value',
  'personal_fit',
] as const;

interface DimensionBuildInput {
  job: Job;
  company: CandidateBundle['companies'][number] | undefined;
  profile: UserProfile;
  bundle: CandidateBundle;
  factIndex: JobFactIndex;
  constraintEvaluations: ConstraintEvaluation[];
}

function salesFactsForJob(job: Job, factIndex: JobFactIndex): Fact[] {
  return factIndex.factsForJob(job.jobId, 'job.sales_kpi').filter((f) => f.jobId === job.jobId);
}

function supportedSalesFact(job: Job, factIndex: JobFactIndex): Fact | undefined {
  return salesFactsForJob(job, factIndex).find((f) => f.status === 'supported' && f.value === true);
}

function coverageForTopic(bundle: CandidateBundle, job: Job, topic: string): CandidateBundle['coverage'][number] | undefined {
  return bundle.coverage.find(
    (item) => item.topic === topic && (item.jobId === job.jobId || (item.jobId === null && item.companyId !== null && item.companyId === job.companyId)),
  );
}

function buildIdentityCredit(input: DimensionBuildInput): MatchReportResultDimension {
  const { company, job } = input;
  // identityStatus 是 B 声明字段，无逐字段 provenance（C-05）；
  // demo 的 confirmed 只是模拟，不证明现实主体核验（预期 mustNotClaim）。
  const declared = company?.identityStatus ?? 'unresolved';
  const summary =
    `【证据】B 声明招聘主体 identityStatus=${declared}${company ? `（legalName=${company.legalName}）` : '，岗位未关联公司主体'}。` +
    `【缺口】1.0.0 中该字段无逐字段来源，mode=${input.bundle.mode} 的声明不能当作现实主体核验结果；` +
    `信用线索（统一社会信用代码）${company?.creditCode ? '已提供' : '未提供'}。` +
    `【推断】在主体来源得到核验前，本维度保持 unknown，不产生确定的公司风险结论。`;
  return { key: 'identity_credit', summary, status: 'unknown', factIds: [] };
}

function buildBusiness(input: DimensionBuildInput): MatchReportResultDimension {
  const { bundle, job } = input;
  const financials = coverageForTopic(bundle, job, 'business_financials');
  const coverageText = financials
    ? `business_financials 覆盖状态=${financials.status}（${financials.reason}，checkedAt=${financials.checkedAt}）`
    : 'bundle 中没有 business_financials 覆盖记录';
  const summary =
    `【证据】${coverageText}。` +
    `【缺口】经营稳定性/财务状况没有可核验材料。` +
    `【推断】未知不等于安全；没有查到负面信息不等于没有风险。在获得可靠经营证据前本维度保持 unknown。`;
  return { key: 'business', summary, status: 'unknown', factIds: [] };
}

function buildRoleClarity(input: DimensionBuildInput): MatchReportResultDimension {
  const { job, factIndex } = input;
  const salesFact = salesFactsForJob(job, factIndex).find(f=>f.status==='supported'&&typeof f.value==='boolean');
  const salesText = salesFact
    ? `考核方面：来源材料${salesFact.value?'声明存在销售签单指标':'声明无销售KPI'}（事实 ${salesFact.factId}）。这是材料中的声明；实际执行与其他考核仍待核实。`
    : '考核方面：没有已协调的 supported 销售KPI事实，是否存在其他考核未知。';
  const summary =
    `【证据】岗位名称「${job.title}」，JD 原文列出的任务需以原文为准（evidenceSnapshot 中可查）；${salesText}` +
    `【缺口】JD 未写明各项职责的占比（本报告不生成占比），是否存在 JD 未列出的其他任务与考核未知；` +
    `岗位名称与实际任务是否一致需向招聘方确认。` +
    `【推断】在职责构成得到确认前，本维度保持 unknown；supported 状态表示命题有支持，不等于岗位清晰适合。`;
  return {
    key: 'role_clarity',
    summary,
    status: 'unknown',
    factIds: salesFact ? [salesFact.factId] : [],
  };
}

function buildCareerValue(input: DimensionBuildInput): MatchReportResultDimension {
  const { profile, job, factIndex } = input;
  const salesFact = supportedSalesFact(job, factIndex);
  const goalsText = profile.goals.length > 0 ? `本人目标：${profile.goals.join('；')}。` : '本人未填写目标。';
  const experiencesText = profile.background.experiences
    .filter((e) => e.confirmed)
    .map((e) => `「${e.text}」（自报${e.source === 'resume' ? '/简历' : ''}，本人确认）`)
    .join('、');
  const summary =
    `【证据】${goalsText}已确认经历：${experiencesText || '无'}。` +
    `【推断】本人目标与岗位「${job.title}」的具体职责是否相关尚未核验；自报经历与问卷兴趣不证明实际能力。` +
    `本报告不声称该岗位已被证明能带来目标技能的成长。` +
    `【缺口】成长价值未经真实材料验证；能否积累目标技能需通过面试核验（见 questions）。` +
    `${salesFact ? `注意：岗位考核含销售签单指标（事实 ${salesFact.factId}），时间分配会影响目标技能的积累空间。` : ''}`;
  return { key: 'career_value', summary, status: 'unknown', factIds: [] };
}

function buildPersonalFit(input: DimensionBuildInput): MatchReportResultDimension {
  const { profile, constraintEvaluations } = input;
  const fails = constraintEvaluations.filter((c) => c.result === 'fail');
  const passes = constraintEvaluations.filter((c) => c.result === 'pass');
  const unknowns = constraintEvaluations.filter((c) => c.result === 'unknown');
  const softPrefs = collectNonHardPreferences(profile);

  if (fails.length > 0) {
    const failKeys = fails.map((c) => c.key).join('、');
    const factIds = [...new Set(fails.flatMap((c) => c.factIds))];
    const summary =
      `【证据】已确认硬约束与岗位事实存在直接冲突（${failKeys}）。` +
      `【推断】硬冲突由确定性规则得出；软偏好不能抵消硬冲突。` +
      `【缺口】冲突是否可接受由本人决定；本报告不据此断言岗位不适合所有人。`;
    return { key: 'personal_fit', summary, status: 'contradicted', factIds };
  }

  if (passes.length > 0) {
    const passKeys = passes.map((c) => c.key).join('、');
    const unknownText = unknowns.length > 0 ? `另有 ${String(unknowns.length)} 项已确认硬约束无法判定（见 constraints）。` : '';
    const softText = softPrefs.length > 0 ? `软偏好/未确认偏好 ${String(softPrefs.length)} 项未参与硬判定，逐项见 DecisionTrace。` : '';
    const summary =
      `【证据】全部可判定的已确认硬约束通过（${passKeys}）。` +
      `【缺口】${unknownText}${softText}已确认硬约束通过不等于整体适合，也不证明能力匹配。` +
      `【推断】经历对具体任务的支持需有相应已确认材料；问卷兴趣不作为能力依据。`;
    return { key: 'personal_fit', summary, status: unknowns.length > 0 ? 'unknown' : 'supported', factIds: [...new Set(passes.flatMap((c) => c.factIds))] };
  }

  const summary =
    `【证据】没有可判定的已确认硬约束结论。` +
    `【缺口】${String(unknowns.length)} 项已确认硬约束无法判定（见 constraints 与 questions）；` +
    `${softPrefs.length > 0 ? `软偏好 ${String(softPrefs.length)} 项未参与硬判定。` : '本人未提供其他偏好。'}` +
    `【推断】个人适配尚未核验，本维度保持 unknown，不画成安全或绿色。`;
  return { key: 'personal_fit', summary, status: 'unknown', factIds: [] };
}

export function buildDimensionsForJob(input: DimensionBuildInput): MatchReportResultDimension[] {
  const builders: Record<DimensionKey, (input: DimensionBuildInput) => MatchReportResultDimension> = {
    identity_credit: buildIdentityCredit,
    business: buildBusiness,
    role_clarity: buildRoleClarity,
    career_value: buildCareerValue,
    personal_fit: buildPersonalFit,
  };
  const dimensions = DIMENSION_KEYS.map((key) => builders[key](input));
  // 不变量自检：恰好五个 key 各一次（§9），违反时抛出（管线会转 REPORT_OUTPUT_INVALID）。
  const keys = new Set(dimensions.map((d) => d.key));
  if (keys.size !== DIMENSION_KEYS.length) {
    throw new Error('五维 key 集合不完整：模板装配不变量被破坏');
  }
  return dimensions;
}

export type DimensionStatusCheck = { key: DimensionKey; status: Status };
