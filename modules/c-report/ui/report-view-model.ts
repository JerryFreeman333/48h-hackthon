/**
 * C 报告视图模型（P3，规格 §9/§15/§16）。
 *
 * 框架无关：输入不可变 MatchReport + C 私有快照（可选），输出纯数据 ViewModel。
 * 展示决策全部在此层定死，HTML 渲染层（render-html.ts）不做业务判断：
 * - unknown 不当 0、不画绿、不给"安全"含义（C-08）：每个状态都带显式中文文字标签。
 * - 比较视图不产生排名/冠军/综合分：候选保持快照原始顺序，仅提供查看角度。
 * - 无 URL 不造链接：URL 白名单在渲染层执行，这里只做 safeUrl 预判。
 * - 不新增公共字段：标签是 C UI 衍生展示（§9），不写回 MatchReport。
 */
import type {
  CandidateBundle,
  Company,
  Coverage,
  DimensionKey,
  Evidence,
  Job,
  JobSalary,
  MatchReport,
  MatchReportResult,
  Mode,
  Status,
} from '../domain/contract.js';
import type { StoredReportSnapshot } from '../application/ports.js';
import { DIMENSION_KEYS } from '../domain/dimensions.js';

// --- 文字标签（色彩之外的第二个通道；渲染层保证 class + 文字同时出现） ---

export const STATUS_LABELS: Record<Status, string> = {
  supported: '有支持',
  contradicted: '相矛盾',
  unknown: '未知',
  conflicting: '相互冲突',
};

export const CONSTRAINT_LABELS: Record<'pass' | 'fail' | 'unknown', string> = {
  pass: '通过',
  fail: '冲突',
  unknown: '无法判定',
};

export const ACTION_LABELS: Record<MatchReportResult['recommendation'], string> = {
  explore: '可探索',
  verify_first: '先核验',
  hold: '暂停并核验',
  deprioritize: '暂缓',
  insufficient: '材料不足',
};

/** 动作语义说明（规格 §8）：每个动作都附带边界说明，防止把动作当结论。 */
export const ACTION_NOTES: Record<MatchReportResult['recommendation'], string> = {
  explore: '有正向依据且无阻断；不保证安全、录用或正在招聘。',
  verify_first: '存在需先解决的关键未知或主体问题：先核验再决定。',
  hold: '触发已登记的核验风险规则：暂停关键操作并核验（不是骗局判定）。',
  deprioritize: '存在可信硬冲突：建议降低优先级；软偏好不能抵消硬冲突。',
  insufficient: '合法输入但没有可用岗位或基本可判断内容：请补充候选或材料。',
};

export const DIMENSION_LABELS: Record<DimensionKey, string> = {
  identity_credit: '主体与信用',
  business: '经营状况',
  role_clarity: '职责清晰度',
  career_value: '成长价值',
  personal_fit: '个人适配',
};

export const COVERAGE_STATUS_LABELS: Record<Coverage['status'], string> = {
  available: '有资料',
  not_connected: '未接入',
  unavailable: '不可用',
  no_result: '无结果',
  not_public: '未公开',
};

export const VERIFICATION_LABELS: Record<Evidence['verification'], string> = {
  verified: '已核验',
  unverified: '未核验',
  disputed: '有争议',
};

export const SCOPE_LABELS: Record<Evidence['scope'], string> = {
  company: '公司',
  business: '业务',
  team: '团队',
  job: '岗位',
};

export const MODE_LABELS: Record<Mode, string> = {
  demo: '演示数据（合成样例）',
  manual: '人工资料',
  live: '真实数据',
};

export const REASON_KIND_LABELS: Record<MatchReportResult['reasons'][number]['kind'], string> = {
  fact: '事实',
  inference: '推断',
  unknown: '未知',
};

/** 已登记硬约束 key 的展示名（公共 key 的 UI 文案；不新增 key）。 */
export const CONSTRAINT_KEY_LABELS: Record<string, string> = {
  city: '城市范围',
  min_fixed_monthly_salary: '最低固定月薪',
  accept_sales_kpi: '是否接受销售签单指标',
  accept_travel: '是否接受出差',
  accept_outsourcing: '是否接受外包',
};

export function constraintKeyLabel(key: string): string {
  return CONSTRAINT_KEY_LABELS[key] ?? key;
}

const TOPIC_LABELS: Record<string, string> = {
  job_search: '岗位查找',
  job_description: '岗位描述',
  business: '经营资料',
  credit_legal: '信用与司法资料',
  work_conditions: '工作条件',
  team_growth: '团队与成长',
  vacancy_freshness: '招聘状态时效',
  business_financials: '经营/财务信息',
  company_identity: '公司主体核验',
  current_real_vacancy: '真实在招状态',
  salary_income_assessability: '收入可判定性',
  'job.sales_kpi': '销售签单考核',
};

export function topicLabel(topic: string): string {
  return TOPIC_LABELS[topic] ?? topic;
}

/** http/https 之外一律返回 null（与 application/markdown.ts 同一白名单语义）。 */
export function safeUrl(url: string | null): string | null {
  if (url === null) {
    return null;
  }
  return /^https?:\/\//i.test(url) ? url : null;
}

// --- ViewModel 结构 ---

export interface ReportMetaVm {
  reportId: string;
  version: number;
  generatedAt: string;
  mode: Mode;
  modeLabel: string;
  completeness: MatchReport['completeness'];
  completenessLabel: string;
  ruleVersion: string;
  promptVersion: string;
  /** P1/P3 模板未运行任何模型（§11）；该标记必须始终展示。 */
  modelNote: string;
}

export interface ReasonVm {
  kind: MatchReportResult['reasons'][number]['kind'];
  kindLabel: string;
  text: string;
  factIds: string[];
}

export interface QuestionVm {
  text: string;
  priority: 'must' | 'optional';
  priorityLabel: string;
  resolves: string[];
}

export interface ConstraintVm {
  key: string;
  keyLabel: string;
  result: 'pass' | 'fail' | 'unknown';
  resultLabel: string;
  factIds: string[];
}

export interface DimensionVm {
  key: DimensionKey;
  label: string;
  status: Status;
  statusLabel: string;
  summary: string;
  factIds: string[];
}

export interface UnknownItemVm {
  /** 未知来源：constraint=硬约束无法判定；dimension=维度未知；coverage=覆盖缺口。 */
  source: 'constraint' | 'dimension' | 'coverage';
  key: string;
  label: string;
  detail: string;
}

export interface EvidenceItemVm {
  evidenceId: string;
  title: string;
  excerpt: string;
  scope: Evidence['scope'];
  scopeLabel: string;
  sourceType: string;
  /** 仅 http/https；其余 null → 渲染层显示提供方式，不造链接。 */
  url: string | null;
  urlHiddenReason: string | null;
  publishedAt: string | null;
  retrievedAt: string;
  mode: Mode;
  modeLabel: string;
  verification: Evidence['verification'];
  verificationLabel: string;
  subject: string;
}

export interface CandidateVm {
  slug: string;
  jobId: string;
  /** bundle 快照中的岗位标题；报告含 bundle 外的 jobId 时为 null（显示受控占位）。 */
  title: string | null;
  company: {
    companyId: string;
    legalName: string;
    brandName: string | null;
    identityStatus: Company['identityStatus'];
    identityStatusLabel: string;
  } | null;
  city: string | null;
  vacancyStatus: Job['vacancyStatus'];
  vacancyStatusLabel: string;
  /** 仅 http/https 的岗位来源；非空协议降级见 sourceUrlRaw。 */
  sourceUrl: string | null;
  /** 原始岗位来源 URL（未过滤）；仅用于渲染层判断是否显示"协议受限已隐藏"。 */
  sourceUrlRaw: string | null;
  salaryText: string;
  recommendation: MatchReportResult['recommendation'];
  actionLabel: string;
  actionNote: string;
  reasons: ReasonVm[];
  constraints: ConstraintVm[];
  dimensions: DimensionVm[];
  unknowns: UnknownItemVm[];
  questions: QuestionVm[];
  evidence: EvidenceItemVm[];
}

export interface CoverageRowVm {
  topic: string;
  topicLabel: string;
  status: Coverage['status'];
  statusLabel: string;
  reason: string;
}

export interface SummaryVm {
  hasResults: boolean;
  /** jobs=[] 的空状态说明（C-13）：来自私有 diagnostics，不伪造公共字段。 */
  emptyNote: string | null;
  action: {
    jobId: string;
    title: string | null;
    recommendation: MatchReportResult['recommendation'];
    actionLabel: string;
    actionNote: string;
  } | null;
  keyReasons: ReasonVm[];
  moreReasonCount: number;
  primaryQuestion: { text: string; resolves: string[] } | null;
  coverage: {
    completenessLabel: string;
    keyTopicGaps: { topic: string; topicLabel: string }[];
    insufficientNote: string | null;
    rows: CoverageRowVm[];
  };
}

export interface ProfileSummaryVm {
  profileId: string;
  revision: number;
  goals: string[];
  hardPrefs: { key: string; keyLabel: string; valueText: string }[];
  skills: string[];
  confirmedExperiences: { text: string; source: string }[];
}

export interface ComparisonCellVm {
  jobId: string;
  slug: string;
  status: Status;
  statusLabel: string;
  factIds: string[];
}

export interface ComparisonRowVm {
  key: DimensionKey;
  label: string;
  focused: boolean;
  cells: ComparisonCellVm[];
}

export interface ComparisonVm {
  /** 用户选择的查看角度（聚焦维度行）；null=默认中性视图。只调查看顺序，不构成排名。 */
  focusedKey: DimensionKey | null;
  note: string;
  columns: { jobId: string; slug: string; title: string | null }[];
  rows: ComparisonRowVm[];
}

export interface GlobalSnapshotVm {
  facts: { factId: string; key: string; valueText: string; status: Status; statusLabel: string; asOf: string | null }[];
  evidenceCount: number;
  coverageRows: CoverageRowVm[];
}

export interface ReportViewModel {
  meta: ReportMetaVm;
  summary: SummaryVm;
  profile: ProfileSummaryVm | null;
  candidates: CandidateVm[];
  comparison: ComparisonVm;
  globalSnapshots: GlobalSnapshotVm;
  notes: string[];
}

// --- 构造 ---

function formatSalaryText(salary: JobSalary): string {
  const range =
    salary.min === null && salary.max === null
      ? '未披露'
      : salary.min !== null && salary.max !== null
        ? `${String(salary.min)}–${String(salary.max)}`
        : salary.min !== null
          ? `最低 ${String(salary.min)}`
          : `最高 ${String(salary.max)}`;
  const period =
    salary.period === 'month' ? '按月' : salary.period === 'year' ? '按年' : '周期未知';
  const basis =
    salary.basis === 'fixed'
      ? '固定'
      : salary.basis === 'total'
        ? 'total（含浮动，非固定底薪）'
        : '口径未知';
  const tax =
    salary.taxBasis === 'pre_tax' ? '税前' : salary.taxBasis === 'after_tax' ? '税后' : '税项未知';
  const months = salary.months === null ? '' : `｜${String(salary.months)} 个月`;
  return `${salary.currency} ${range}｜${period}｜口径：${basis}｜${tax}${months}`;
}

const VACANCY_LABELS: Record<Job['vacancyStatus'], string> = {
  open: '在招（B 声明，未核验）',
  closed: '已关闭（B 声明）',
  unknown: '未知',
};

const IDENTITY_LABELS: Record<Company['identityStatus'], string> = {
  confirmed: '资料中已对应主体，仍需核对岗位签约关系',
  ambiguous: '已有主体线索，品牌、法人或集团对应关系待确认',
  unresolved: '主体信息尚不足',
};

function toReasonVm(reason: MatchReportResult['reasons'][number]): ReasonVm {
  return {
    kind: reason.kind,
    kindLabel: REASON_KIND_LABELS[reason.kind],
    text: reason.text,
    factIds: [...reason.factIds],
  };
}

function toQuestionVm(question: MatchReportResult['questions'][number]): QuestionVm {
  return {
    text: question.text,
    priority: question.priority,
    priorityLabel: question.priority === 'must' ? '必须核验' : '可选核验',
    resolves: [...question.resolves],
  };
}

function toEvidenceItemVm(evidence: Evidence, bundle: CandidateBundle | null): EvidenceItemVm {
  const safe = safeUrl(evidence.url);
  const company = evidence.companyId === null ? undefined : bundle?.companies.find((c) => c.companyId === evidence.companyId);
  const subject = evidence.jobId !== null
    ? `岗位 ${evidence.jobId}`
    : company
      ? `公司 ${company.legalName}`
      : evidence.companyId !== null
        ? `公司 ${evidence.companyId}`
        : '未定位主体';
  return {
    evidenceId: evidence.evidenceId,
    title: evidence.title,
    excerpt: evidence.excerpt,
    scope: evidence.scope,
    scopeLabel: SCOPE_LABELS[evidence.scope],
    sourceType: evidence.sourceType,
    url: safe,
    urlHiddenReason:
      safe === null && evidence.url !== null
        ? `原值协议不受支持已隐藏（仅允许 http/https），提供方式：${evidence.sourceType}`
        : null,
    publishedAt: evidence.publishedAt,
    retrievedAt: evidence.retrievedAt,
    mode: evidence.mode,
    modeLabel: MODE_LABELS[evidence.mode],
    verification: evidence.verification,
    verificationLabel: VERIFICATION_LABELS[evidence.verification],
    subject,
  };
}

function buildUnknowns(result: MatchReportResult, coverage: Coverage[]): UnknownItemVm[] {
  const items: UnknownItemVm[] = [];
  for (const constraint of result.constraints) {
    if (constraint.result === 'unknown') {
      items.push({
        source: 'constraint',
        key: constraint.key,
        label: constraintKeyLabel(constraint.key),
        detail: '已确认硬条件尚无法判定：对应岗位资料不足或未经核验，未知不等于安全。',
      });
    }
  }
  for (const dimension of result.dimensions) {
    if (dimension.status === 'unknown' || dimension.status === 'conflicting') {
      items.push({
        source: 'dimension',
        key: dimension.key,
        label: DIMENSION_LABELS[dimension.key],
        detail:
          dimension.status === 'unknown'
            ? '维度状态未知：证据缺口见维度详情（未知不画绿、不当作安全）。'
            : '维度证据相互冲突：以原始材料为准，需人工复核。',
      });
    }
  }
  for (const row of coverage) {
    if (row.status !== 'available') {
      items.push({
        source: 'coverage',
        key: row.topic,
        label: topicLabel(row.topic),
        detail: `覆盖状态 ${COVERAGE_STATUS_LABELS[row.status]}：${row.reason}`,
      });
    }
  }
  return items;
}

function buildCandidate(
  result: MatchReportResult,
  index: number,
  bundle: CandidateBundle | null,
  coverage: Coverage[],
): CandidateVm {
  const job: Job | null = bundle?.jobs.find((item) => item.jobId === result.jobId) ?? null;
  const company = job && job.companyId !== null && bundle ? bundle.companies.find((c) => c.companyId === job.companyId) ?? null : null;
  const evidence = bundle === null
    ? []
    : bundle.evidence
        .filter((item) => item.jobId === result.jobId || (item.jobId === null && job !== null && item.companyId !== null && item.companyId === job.companyId))
        .map((item) => toEvidenceItemVm(item, bundle));
  return {
    slug: `cand-${String(index + 1)}`,
    jobId: result.jobId,
    title: job?.title ?? null,
    company: company === null
      ? null
      : {
          companyId: company.companyId,
          legalName: company.legalName,
          brandName: company.brandName,
          identityStatus: company.identityStatus,
          identityStatusLabel: IDENTITY_LABELS[company.identityStatus],
        },
    city: job?.city ?? null,
    vacancyStatus: job?.vacancyStatus ?? 'unknown',
    vacancyStatusLabel: job ? VACANCY_LABELS[job.vacancyStatus] : '未知（bundle 快照中无此岗位）',
    sourceUrl: safeUrl(job?.sourceUrl ?? null),
    sourceUrlRaw: job?.sourceUrl ?? null,
    salaryText: job ? formatSalaryText(job.salary) : '未提供',
    recommendation: result.recommendation,
    actionLabel: ACTION_LABELS[result.recommendation],
    actionNote: ACTION_NOTES[result.recommendation],
    reasons: result.reasons.map(toReasonVm),
    constraints: result.constraints.map((constraint) => ({
      key: constraint.key,
      keyLabel: constraintKeyLabel(constraint.key),
      result: constraint.result,
      resultLabel: CONSTRAINT_LABELS[constraint.result],
      factIds: [...constraint.factIds],
    })),
    dimensions: result.dimensions.map((dimension) => ({
      key: dimension.key,
      label: DIMENSION_LABELS[dimension.key],
      status: dimension.status,
      statusLabel: STATUS_LABELS[dimension.status],
      summary: dimension.summary,
      factIds: [...dimension.factIds],
    })),
    unknowns: buildUnknowns(result, coverage.filter(row => row.jobId === result.jobId || (row.jobId === null && row.companyId !== null && row.companyId === job?.companyId))),
    questions: result.questions.map(toQuestionVm),
    evidence,
  };
}

function buildComparison(
  report: MatchReport,
  bundle: CandidateBundle | null,
  focusedKey: DimensionKey | null,
): ComparisonVm {
  const columns = report.results.map((result, index) => ({
    jobId: result.jobId,
    slug: `cand-${String(index + 1)}`,
    title: bundle?.jobs.find((job) => job.jobId === result.jobId)?.title ?? null,
  }));
  // 维度行：聚焦角度排最前（仅查看顺序），其余保持公共五维顺序；候选列永远保持快照原始顺序。
  const orderedKeys = focusedKey !== null
    ? [focusedKey, ...DIMENSION_KEYS.filter((key) => key !== focusedKey)]
    : [...DIMENSION_KEYS];
  const rows: ComparisonRowVm[] = orderedKeys.map((key) => ({
    key,
    label: DIMENSION_LABELS[key],
    focused: key === focusedKey,
    cells: report.results.map((result) => {
      const dimension = result.dimensions.find((item) => item.key === key);
      return {
        jobId: result.jobId,
        slug: `cand-${String(report.results.indexOf(result) + 1)}`,
        status: dimension?.status ?? 'unknown',
        statusLabel: dimension ? STATUS_LABELS[dimension.status] : '未知',
        factIds: dimension ? [...dimension.factIds] : [],
      };
    }),
  }));
  return {
    focusedKey,
    note: '本表逐项比较资料；候选保持原有顺序。未知保留为未知，资料状态不代表公司好坏。本表不产生排名、冠军或综合分。',
    columns,
    rows,
  };
}

function buildProfileSummary(report: MatchReport, snapshot: StoredReportSnapshot | null): ProfileSummaryVm | null {
  const profile = snapshot?.snapshot.profile as
    | {
        profileId?: string;
        revision?: number;
        goals?: string[];
        skills?: string[];
        preferences?: { key: string; value: unknown; strength: string; confirmed: boolean }[];
        background?: { experiences?: { text: string; source: string; confirmed: boolean }[] };
      }
    | undefined;
  if (!profile) {
    return null;
  }
  const hardPrefs = (profile.preferences ?? [])
    .filter((p) => p.strength === 'hard' && p.confirmed === true)
    .map((p) => ({
      key: p.key,
      keyLabel: constraintKeyLabel(p.key),
      valueText: p.value === null ? 'null（未知）' : String(p.value),
    }));
  return {
    profileId: report.profileId,
    revision: report.profileRevision,
    goals: [...(profile.goals ?? [])],
    hardPrefs,
    skills: [...(profile.skills ?? [])],
    confirmedExperiences: (profile.background?.experiences ?? [])
      .filter((e) => e.confirmed)
      .map((e) => ({ text: e.text, source: e.source })),
  };
}

function toCoverageRow(row: Coverage): CoverageRowVm {
  return {
    topic: row.topic,
    topicLabel: topicLabel(row.topic),
    status: row.status,
    statusLabel: COVERAGE_STATUS_LABELS[row.status],
    reason: row.reason,
  };
}

export interface ViewModelInput {
  report: MatchReport;
  /** C 私有快照（含 diagnostics/bundle/profile）：可选；为 null 时仅用公共报告字段。 */
  snapshot: StoredReportSnapshot | null;
  /** 比较视图查看角度（用户显式选择）；非法值一律回退 null（中性视图）。 */
  comparisonAngle?: string | null;
}

export function buildReportViewModel(input: ViewModelInput): ReportViewModel {
  const { report, snapshot } = input;
  const bundle = (snapshot?.snapshot.bundle as CandidateBundle | undefined) ?? null;
  const diagnostics = (snapshot?.snapshot.diagnostics as { insufficientNote?: string | null; keyTopicGaps?: string[] } | undefined) ?? null;

  const angle = input.comparisonAngle ?? null;
  const focusedKey = (DIMENSION_KEYS as readonly string[]).includes(angle ?? '') ? (angle as DimensionKey) : null;

  const first = report.results[0] ?? null;
  const primaryQuestion = first
    ? (first.questions.find((q) => q.priority === 'must') ?? first.questions[0] ?? null)
    : null;

  const coverageRows = report.coverageSnapshot.map(toCoverageRow);
  const keyTopicGaps = (diagnostics?.keyTopicGaps ?? []).map((topic) => ({ topic, topicLabel: topicLabel(topic) }));

  const meta: ReportMetaVm = {
    reportId: report.reportId,
    version: report.version,
    generatedAt: report.generatedAt,
    mode: report.mode,
    modeLabel: MODE_LABELS[report.mode],
    completeness: report.completeness,
    completenessLabel: report.completeness === 'complete_for_scope' ? '声明范围内完整' : '部分资料',
    ruleVersion: report.ruleVersion,
    promptVersion: report.promptVersion,
    modelNote: '本报告由确定性规则模板生成，未运行任何模型。',
  };

  const summary: SummaryVm = {
    hasResults: report.results.length > 0,
    emptyNote: report.results.length === 0
      ? diagnostics?.insufficientNote ?? '没有候选岗位：请补充候选后再生成报告。'
      : null,
    action: first === null
      ? null
      : {
          jobId: first.jobId,
          title: bundle?.jobs.find((job) => job.jobId === first.jobId)?.title ?? null,
          recommendation: first.recommendation,
          actionLabel: ACTION_LABELS[first.recommendation],
          actionNote: ACTION_NOTES[first.recommendation],
        },
    keyReasons: (first?.reasons ?? []).slice(0, 3).map(toReasonVm),
    moreReasonCount: Math.max(0, (first?.reasons.length ?? 0) - 3),
    primaryQuestion: primaryQuestion === null ? null : { text: primaryQuestion.text, resolves: [...primaryQuestion.resolves] },
    coverage: {
      completenessLabel: meta.completenessLabel,
      keyTopicGaps,
      insufficientNote: diagnostics?.insufficientNote ?? null,
      rows: coverageRows,
    },
  };

  const candidates = report.results.map((result, index) => buildCandidate(result, index, bundle, report.coverageSnapshot));

  return {
    meta,
    summary,
    profile: buildProfileSummary(report, snapshot),
    candidates,
    comparison: buildComparison(report, bundle, focusedKey),
    globalSnapshots: {
      facts: report.factsSnapshot.map((fact) => ({
        factId: fact.factId,
        key: fact.key,
        valueText: fact.value === null ? 'null（未知）' : String(fact.value),
        status: fact.status,
        statusLabel: STATUS_LABELS[fact.status],
        asOf: fact.asOf,
      })),
      evidenceCount: report.evidenceSnapshot.length,
      coverageRows,
    },
    notes: [
      meta.modelNote,
      '报告读取已保存的不可变快照；画像或候选材料变更将产生新版本，本页内容不会随之改变。',
      '状态标签表示命题核验状态，不是好坏分；未知不是安全，没有查到负面不等于没有风险。',
    ],
  };
}
