/**
 * 核验问题（规格 §9）：每条问题具体可验证，resolves 指向 C 私有目标路径字典中
 * 已存在的目标；未知目标一律拒绝。目标路径是 C 内部追踪约定，不新增 B Fact key。
 */
import type { CandidateBundle, Job, MatchReportResultQuestion } from './contract.js';

/**
 * C 私有目标路径字典（1.0.0）。只列输入对象中真实存在的字段/命题；
 * 扩展字典须同步登记，模型（P4）只能从中选择。
 */
export const QUESTION_TARGETS = [
  'job.title',
  'job.rawJd',
  'job.city',
  'job.vacancyStatus',
  'job.salary.currency',
  'job.salary.min',
  'job.salary.max',
  'job.salary.period',
  'job.salary.basis',
  'job.salary.taxBasis',
  'job.salary.months',
  'company.legalName',
  'company.creditCode',
  'company.identityStatus',
  'fact:job.sales_kpi',
  'coverage:business_financials',
] as const;

export type QuestionTarget = (typeof QUESTION_TARGETS)[number];

function isQuestionTarget(value: string): value is QuestionTarget {
  return (QUESTION_TARGETS as readonly string[]).includes(value);
}

export function buildQuestionsForJob(
  job: Job,
  bundle: CandidateBundle,
): MatchReportResultQuestion[] {
  const questions: MatchReportResultQuestion[] = [];
  const company = bundle.companies.find((c) => c.companyId === job.companyId);

  // 薪资口径：非 fixed（total/unknown）→ 收入无法判断，must。
  if (job.salary.basis !== 'fixed') {
    questions.push({
      text: '固定底薪和绩效各是多少？签单指标是否计入固定底薪考核？',
      priority: 'must',
      resolves: ['job.salary.basis', 'job.salary.min', 'job.salary.max'].filter(isQuestionTarget),
    });
  } else if (job.salary.taxBasis === 'unknown' || job.salary.period === 'unknown') {
    questions.push({
      text: '该薪资是税前还是税后？按月发放吗？',
      priority: 'must',
      resolves: ['job.salary.taxBasis', 'job.salary.period'].filter(isQuestionTarget),
    });
  }

  // 主体：声明非 confirmed（或无主体）→ must；已声明 confirmed（demo 模拟）→ optional 复核。
  if (!company || company.identityStatus !== 'confirmed') {
    questions.push({
      text: '招聘主体公司的全称与统一社会信用代码是什么？',
      priority: 'must',
      resolves: ['company.legalName', 'company.creditCode', 'company.identityStatus'].filter(isQuestionTarget),
    });
  } else {
    questions.push({
      text: '能否提供招聘主体公司全称与统一社会信用代码，用于入职前主体复核？',
      priority: 'optional',
      resolves: ['company.legalName', 'company.creditCode', 'company.identityStatus'].filter(isQuestionTarget),
    });
  }

  // 在招状态：unknown → optional（投递行为本身可核验，成本低）。
  if (job.vacancyStatus === 'unknown') {
    questions.push({
      text: '该岗位当前是否仍在真实招聘？可通过招聘平台状态或直接联系招聘方确认。',
      priority: 'optional',
      resolves: ['job.vacancyStatus'],
    });
  }

  // 经营证据：business_financials 未接入/无结果 → optional。
  const financials = bundle.coverage.find(
    (item) =>
      item.topic === 'business_financials' &&
      (item.jobId === job.jobId || (item.jobId === null && item.companyId !== null && item.companyId === job.companyId)),
  );
  if (!financials || financials.status !== 'available') {
    questions.push({
      text: '能否提供可核验的基本经营信息（如官方公示、官网或财报链接）？',
      priority: 'optional',
      resolves: ['coverage:business_financials'],
    });
  }

  // 目标关联证据：用户有目标但无事实支持成长声称 → optional，向招聘方要实例。
  // resolves 指向 JD 职责原文：问题的答案将更新对 JD 职责构成的解释。
  questions.push({
    text: '能否举一个该岗位近期基于产品反馈推动改进的具体例子？',
    priority: 'optional',
    resolves: ['job.rawJd'],
  });

  // 稳定排序：must 在前，同类按插入序。
  const mustFirst = [...questions].sort((a, b) => (a.priority === b.priority ? 0 : a.priority === 'must' ? -1 : 1));
  // resolves 全部必须命中字典（不变量自检）。
  for (const question of mustFirst) {
    for (const target of question.resolves) {
      if (!isQuestionTarget(target)) {
        throw new Error(`resolves 目标不在字典中：${target}`);
      }
    }
  }
  return mustFirst;
}
