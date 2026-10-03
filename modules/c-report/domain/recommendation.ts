/**
 * 建议动作与优先级（规格 §8；登记 C-10 本地预案，跨模块启用前需确认，
 * 未确认时仅用于 demo/test 验收）。
 *
 * 优先级：insufficient → hold → deprioritize → verify_first → explore；多原因全部保留。
 * hold 规则表 1.0.0 为空：没有已协调的命题协议（如私人账户付款），
 * 不得凭标题/匿名帖/文本样式自动触发。小公司、参保少、共址、无负面检索结果
 * 均不单独影响 hold 或安全保证。
 */
import type { ConstraintEvaluation } from './constraints.js';
import type { MatchReportResultReason, MatchReportResultDimension, Recommendation } from './contract.js';
import type { Fact, Job } from './contract.js';
import type { JobFactIndex } from './constraints.js';
import { PREFERENCE_LABELS } from './dimensions.js';

export const ACTION_PRIORITY: readonly Recommendation[] = [
  'insufficient',
  'hold',
  'deprioritize',
  'verify_first',
  'explore',
] as const;

/** hold 规则表：1.0.0 为空。规则启用需公共命题协议 + 直接材料，逐条登记，不由模型触发。 */
export const HOLD_RULES: readonly never[] = [];

export interface ActionInput {
  job: Job;
  company: { identityStatus: string } | undefined;
  constraintEvaluations: ConstraintEvaluation[];
  dimensions: MatchReportResultDimension[];
  jobFacts: Fact[];
  jobEvidenceCount: number;
  factIndex: JobFactIndex;
}

export interface ActionDecision {
  recommendation: Recommendation;
  /** 全部原因（含未改变最高优先级的次级原因），按 事实/推断/未知 分类。 */
  reasons: MatchReportResultReason[];
  /** 触发最高优先级动作的原因 ID（trace 用）。 */
  triggeredBy: string[];
}

function reason(text: string, kind: MatchReportResultReason['kind'], factIds: string[] = []): MatchReportResultReason {
  return { text, kind, factIds };
}

/** 该岗位是否具备"基本可判断内容"：至少一条事实或一条证据。 */
function hasAssessableContent(jobFacts: Fact[], jobEvidenceCount: number): boolean {
  return jobFacts.length > 0 || jobEvidenceCount > 0;
}

export function decideActionForJob(input: ActionInput): ActionDecision {
  const { job, company, constraintEvaluations, dimensions, jobFacts, jobEvidenceCount, factIndex } = input;
  const reasons: MatchReportResultReason[] = [];
  const triggeredBy: string[] = [];

  // --- 事实类原因（引用已协调 Fact） ---
  const salesFacts = factIndex.factsForJob(job.jobId, 'job.sales_kpi').filter((f) => f.status === 'supported' && typeof f.value === 'boolean');
  for (const fact of salesFacts) {
    reasons.push(
      reason(
        `岗位资料明确声明${fact.value === true ? '存在销售签单考核' : '没有销售签单考核'}；这项记载不证明实际执行或本人能力。`,
        'fact',
        [fact.factId],
      ),
    );
  }

  // --- 约束结论 ---
  const fails = constraintEvaluations.filter((c) => c.result === 'fail');
  const passes = constraintEvaluations.filter((c) => c.result === 'pass');
  const unknowns = constraintEvaluations.filter((c) => c.result === 'unknown');
  const materialUnknowns = unknowns.filter(
    (c) => !c.trace.diagnostics.some((d) => d.endsWith('_NO_PROVENANCE') || d === 'UNREGISTERED_FACT_KEY' || d === 'UNREGISTERED_PREFERENCE_KEY'),
  );

  for (const fail of fails) {
    const factText = fail.factIds.length > 0 ? '（有对应岗位资料）' : '';
    reasons.push(
      reason(
        `已确认硬条件「${PREFERENCE_LABELS[fail.key] ?? '其他条件'}」与岗位资料冲突${factText}，软偏好不能抵消。`,
        'inference',
        fail.factIds,
      ),
    );
    triggeredBy.push(`constraint:${fail.key}:fail`);
  }
  for (const pass of passes) {
    if (pass.trace.basis === 'fact') {
      reasons.push(
        reason(`已确认硬条件「${PREFERENCE_LABELS[pass.key] ?? '其他条件'}」通过（岗位资料支持这项条件）。`, 'inference', pass.factIds),
      );
    } else if (pass.trace.basis === 'user_only') {
      reasons.push(reason(`本人接受「${PREFERENCE_LABELS[pass.key] ?? '其他条件'}」，这项条件不构成排除理由；不代表能力判断。`, 'inference', []));
    }
  }

  // --- 未知类原因（结构性 unknown 与关键 unknown 分开表述） ---
  for (const unknown of materialUnknowns) {
    reasons.push(
      reason(
        `已确认硬条件「${PREFERENCE_LABELS[unknown.key] ?? '其他条件'}」尚缺可用或一致的岗位资料，需先核实。`,
        'unknown',
        [],
      ),
    );
    triggeredBy.push(`constraint:${unknown.key}:unknown`);
  }
  if (job.salary.basis !== 'fixed') {
    reasons.push(
      reason('该岗位固定月薪未明确：需区分底薪、绩效、发放周期与税前税后，综合收入不能代替固定底薪。', 'unknown', []),
    );
  }
  if (job.vacancyStatus === 'unknown') {
    reasons.push(reason('真实在招状态未知：公司适合不等于当前有招聘。', 'unknown', []));
  }
  const financialsUnknown =
    input.dimensions.find((d) => d.key === 'business')?.status === 'unknown';
  if (financialsUnknown) {
    reasons.push(reason('经营状况尚无法判断：已有线索须核对范围与来源；财务及当前稳定性未知，未知不等于安全。', 'unknown', []));
  }

  // --- 主体状态 ---
  if (company && company.identityStatus !== 'confirmed') {
    reasons.push(
      reason(`已有公司资料线索，但当前岗位签约主体未确认：需核对「${company.identityStatus === 'ambiguous' ? '品牌、集团、法人及岗位的对应关系' : '招聘、签约、发薪和社保主体'}」后再做决定。`, 'unknown', []),
    );
    triggeredBy.push('company:identity_unconfirmed');
  }
  if (!company) {
    // job.companyId=null 是合法输入，但主体未定位的结论受限，不能自动绑定第一个公司（§5）。
    reasons.push(
      reason('当前岗位主体未定位，尚不能确定招聘与签约公司；需先确认具体主体。', 'unknown', []),
    );
    triggeredBy.push('company:missing');
  }

  // --- 动作判定（优先级从高到低） ---
  // insufficient：岗位没有任何事实与证据，无基本可判断内容。
  if (!hasAssessableContent(jobFacts, jobEvidenceCount)) {
    return {
      recommendation: 'insufficient',
      reasons: [
        reason('该岗位没有任何事实或证据材料，无法形成有依据的判断；请补充候选或调查材料。', 'unknown', []),
      ],
      triggeredBy: ['job:no_content'],
    };
  }

  // hold：规则表为空（1.0.0），无触发路径；保留实现位，激活需公共命题协议。
  if (HOLD_RULES.length > 0) {
    throw new Error('hold 规则表非空但触发逻辑未实现：激活前必须登记命题协议');
  }

  if (fails.length > 0) {
    return { recommendation: 'deprioritize', reasons, triggeredBy };
  }

  if (materialUnknowns.length > 0 || (company && company.identityStatus !== 'confirmed') || !company) {
    return { recommendation: 'verify_first', reasons, triggeredBy };
  }

  // 资料支持公司或职责命题不等于个人需求得到满足；本人表示接受也不是岗位侧适配依据。
  const hasPositiveBasis = passes.some((p) => p.trace.basis === 'fact');
  if (hasPositiveBasis) {
    return { recommendation: 'explore', reasons, triggeredBy: ['positive_basis'] };
  }
  reasons.push(reason('缺少正向适配依据（无事实支持的通过项）：建议先补充材料再评估。', 'unknown', []));
  return { recommendation: 'verify_first', reasons, triggeredBy: ['no_positive_basis'] };
}
