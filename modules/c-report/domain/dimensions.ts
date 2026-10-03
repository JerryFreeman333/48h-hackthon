/** 五维逐项解释资料命题；资料有支持不等于符合需求、未来承诺或公司安全。 */
import type { CandidateBundle, DimensionKey, Evidence, Fact, Job, MatchReportResultDimension, Status, UserProfile } from './contract.js';
import type { ConstraintEvaluation, JobFactIndex } from './constraints.js';
import { collectNonHardPreferences } from './preferences.js';

export const DIMENSION_KEYS: readonly DimensionKey[] = ['identity_credit', 'business', 'role_clarity', 'career_value', 'personal_fit'];

interface DimensionBuildInput {
  job: Job;
  company: CandidateBundle['companies'][number] | undefined;
  profile: UserProfile;
  bundle: CandidateBundle;
  factIndex: JobFactIndex;
  constraintEvaluations: ConstraintEvaluation[];
}

export const PREFERENCE_LABELS: Record<string, string> = {
  city: '工作城市', min_fixed_monthly_salary: '固定月薪', accept_sales_kpi: '销售签单考核',
  accept_travel: '出差', accept_outsourcing: '外包安排',
};

interface Material { facts: Fact[]; evidence: Evidence[]; missingReferences: number }

function inScope(item: { companyId: string | null; jobId: string | null }, job: Job): boolean {
  if (item.jobId !== null) return item.jobId === job.jobId && (item.companyId === null || item.companyId === job.companyId);
  return job.companyId !== null && item.companyId === job.companyId;
}

function referencedEvidence(fact: Fact, input: DimensionBuildInput): Evidence[] {
  return fact.evidenceIds.flatMap((id) => {
    const source = input.bundle.evidence.find((e) => e.evidenceId === id);
    if (!source || source.companyId !== fact.companyId || source.jobId !== fact.jobId || !source.excerpt.trim()) return [];
    // 同公司资料中的另一个岗位，以及团队评价，均不能代替当前岗位事实。
    if (fact.jobId !== null && source.scope !== 'job') return [];
    return [source];
  });
}

function collectMaterial(input: DimensionBuildInput, keyMatches: (key: string) => boolean, evidenceMatches: (source: Evidence) => boolean, jobOnly = false): Material {
  const relevant = input.bundle.facts.filter((f) => inScope(f, input.job) && keyMatches(f.key) && (!jobOnly || f.jobId === input.job.jobId));
  const facts = relevant.filter((f) => f.evidenceIds.length > 0 && referencedEvidence(f, input).length === f.evidenceIds.length);
  const referenced = new Set(facts.flatMap((f) => f.evidenceIds));
  const evidence = input.bundle.evidence.filter((e) => inScope(e, input.job) && (!jobOnly || (e.jobId === input.job.jobId && e.scope === 'job')) && e.excerpt.trim() && (referenced.has(e.evidenceId) || evidenceMatches(e)));
  return { facts, evidence, missingReferences: relevant.length - facts.length };
}

function verifiedFact(fact: Fact, input: DimensionBuildInput): boolean {
  const sources = referencedEvidence(fact, input);
  const asOf = fact.asOf === null ? null : Date.parse(fact.asOf);
  // 无日期保留日期缺口；未来或无效日期不能用来证明当前事项。
  const dateUsable = asOf === null || (Number.isFinite(asOf) && asOf <= Date.parse(input.bundle.retrievedAt));
  return fact.value !== null && dateUsable && sources.length === fact.evidenceIds.length && sources.length > 0 && sources.every((e) => e.verification === 'verified');
}

function materialStatus(material: Material, input: DimensionBuildInput): Status {
  if (material.facts.some((f) => f.status === 'conflicting') || material.evidence.some((e) => e.verification === 'disputed')) return 'conflicting';
  // 只自动比较同一布尔命题的正反记载；不同文字描述不等于冲突，不同年份变化也不自动当作冲突。
  const byClaim = new Map<string, Set<string>>();
  for (const fact of material.facts.filter((f) => typeof f.value === 'boolean' && f.status !== 'contradicted')) {
    const key = `${fact.key}\0${fact.jobId ?? ''}\0${fact.asOf ?? ''}`;
    const values = byClaim.get(key) ?? new Set<string>();
    values.add(JSON.stringify(fact.value));
    byClaim.set(key, values);
  }
  if ([...byClaim.values()].some((values) => values.size > 1)) return 'conflicting';
  if (material.facts.some((f) => f.status === 'contradicted' && verifiedFact(f, input))) return 'contradicted';
  if (material.facts.some((f) => f.status === 'supported' && verifiedFact(f, input))) return 'supported';
  return 'unknown';
}

function compact(value: string, max = 130): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > max ? normalized.slice(0, max) + '…' : normalized;
}

function sourceSummary(source: Evidence, pattern?: RegExp): string {
  const scope = source.scope === 'job' ? '当前岗位' : source.scope === 'team' ? '团队评价' : source.scope === 'business' ? '公司或集团业务' : '公司资料';
  const sentences = source.excerpt.split(/(?<=[。；;！!？?\n])/).filter((s) => s.trim());
  const relevant = pattern ? sentences.filter((s) => pattern.test(s)).join(' ') : source.excerpt;
  const date = source.publishedAt ? `来源日期 ${source.publishedAt}` : '来源发布日期未记录';
  const verification = source.verification === 'verified' ? '材料已核验' : source.verification === 'disputed' ? '材料有争议' : '尚未独立核验';
  return `《${compact(source.title, 55)}》记载「${compact(relevant || source.excerpt)}」（${scope}；${date}；${verification}${source.url ? '' : '；未记录来源链接'}）`;
}

function materialSummary(material: Material, pattern?: RegExp): string {
  if (!material.evidence.length) return '没有找到可引用的对应资料。';
  return material.evidence.slice(0, 3).map((e) => sourceSummary(e, pattern)).join('；') + '。';
}

function materialGaps(material: Material, input: DimensionBuildInput): string {
  return (material.missingReferences ? `另有 ${material.missingReferences} 条记录缺少完整引用，未据此判定。` : '') +
    (material.facts.some((f) => f.asOf === null) ? '部分结构化记录的适用日期未记录，不能推定仍然有效。' : '') +
    (material.facts.some((f) => f.asOf !== null && (!Number.isFinite(Date.parse(f.asOf)) || Date.parse(f.asOf) > Date.parse(input.bundle.retrievedAt))) ? '部分适用日期无效或晚于本次资料读取，需先核对日期，未将其用作当前结论。' : '');
}

function claimExplanation(status: Status, hasMaterial = true): string {
  if (status === 'conflicting') return '对应资料存在不同记载或争议，需核对主体、日期和适用范围，不能选择其中一条当作已确认结论。';
  if (status === 'contradicted') return '有可引用材料否定了相关命题；这仅涉及该项记载，不等于否定整个公司。';
  if (status === 'supported') return '可引用资料支持其中的具体记载；这不等于满足个人需求、该岗位承诺或公司安全。';
  return hasMaterial ? '已有摘录可作为调查线索；缺少独立核验或对应范围，相关结论仍待确认。' : '对应资料缺失或引用不完整，尚不能形成有依据的结论。';
}

function buildIdentityCredit(input: DimensionBuildInput): MatchReportResultDimension {
  const material = collectMaterial(input, (key) => /^(?:company\.(?:legal_name|credit_code|established_date|registered_capital|identity|signing_entity)|job\.signing_entity)/.test(key), (e) => /信用代码|公司全称|法人|注册|营业执照/.test(e.title + ' ' + e.excerpt));
  const status = materialStatus(material, input);
  const declared = input.company ? `公司资料中记录名称「${input.company.legalName}」${input.company.creditCode ? `、统一社会信用代码「${input.company.creditCode}」` : ''}，属于主体线索。` : '岗位没有对应的公司主体记录。';
  return {
    key: 'identity_credit', status, factIds: material.facts.map((f) => f.factId),
    summary: `【证据】${declared}${materialSummary(material)}【推断】${claimExplanation(status, material.evidence.length > 0)}【缺口】须确认品牌、集团、法人之间的关系，以及哪家公司与当前岗位签劳动合同、发薪及缴纳社保；公司资料中的名称和信用代码不能自动认定为该岗位签约主体。信用及法律风险还需核对具体主体与可靠公示。${materialGaps(material, input)}`,
  };
}

function buildBusiness(input: DimensionBuildInput): MatchReportResultDimension {
  const pattern = /营收|收入|利润|亏损|业务|经营|上市|财报|融资|裁员|现金流|客户/;
  const material = collectMaterial(input, (key) => /^(?:company\.(?:industry|listing|business|revenue|profit|financial|cash_flow)|business\.)/.test(key), (e) => e.sourceType !== 'local_database_field_comparison' && (e.scope === 'business' || (e.scope !== 'job' && pattern.test(e.title + ' ' + e.excerpt))));
  const status = materialStatus(material, input);
  return {
    key: 'business', status, factIds: material.facts.map((f) => f.factId),
    summary: `【证据】${materialSummary(material, pattern)}【推断】${claimExplanation(status, material.evidence.length > 0)}【缺口】公司或上市集团的报道不能直接证明当前岗位的签约公司、团队预算和经营稳定性；历史经营记载不代表当前财务状况。${material.evidence.length ? '需核对报道涉及的主体、期间及原始来源。' : '当前缺少可引用的经营或财务资料。'}未知不等于安全，没有查到负面信息不等于没有风险。${materialGaps(material, input)}`,
  };
}

function buildRoleClarity(input: DimensionBuildInput): MatchReportResultDimension {
  const material = collectMaterial(input, (key) => /^job\.(?:description|responsibilities|tasks|sales_kpi|assessment|requirements)$/.test(key), (e) => e.scope === 'job', true);
  const status = materialStatus(material, input);
  const salesValues = [...new Set(material.facts.filter((f) => f.key === 'job.sales_kpi' && f.status !== 'contradicted' && typeof f.value === 'boolean').map((f) => f.value))];
  const salesText = salesValues.length === 1
    ? `资料${salesValues[0] ? '声明存在销售签单考核' : '声明无销售KPI'}；这仅是来源记载，实际执行及其他考核仍待确认。`
    : salesValues.length > 1 ? '销售考核存在相反记载，需先核对，不能选择其中一条判定。' : '';
  return {
    key: 'role_clarity', status, factIds: material.facts.map((f) => f.factId),
    summary: `【证据】岗位名称「${input.job.title}」。${materialSummary(material)}${salesText}【推断】${claimExplanation(status, material.evidence.length > 0)}岗位名称和简短方向说明只能帮助定位要调查的工作，不能证明职责完整。` +
      `【缺口】需向招聘方核对具体日常任务、交付要求、考核方式、工作时段及是否还有未列出的任务；资料未写职责占比时，本报告不生成占比。${materialGaps(material, input)}`,
  };
}

function buildCareerValue(input: DimensionBuildInput): MatchReportResultDimension {
  const pattern = /培训|带教|导师|学习|晋升|成长|技能|轮岗|项目经历/;
  const material = collectMaterial(input, (key) => /^needs\.growth\.|^job\.(?:training|mentorship|promotion|skills|career)/.test(key), (e) => /内部培训|员工培训|岗前培训|岗位培训|入职培训|带教|导师|系统学习|晋升机会|晋升机制|轮岗/.test(e.title + ' ' + e.excerpt));
  // 公司或其他团队有培训线索，仍不证明这个岗位具备同样机会。
  const jobMaterial: Material = { ...material, facts: material.facts.filter((f) => f.jobId === input.job.jobId), evidence: material.evidence.filter((e) => e.jobId === input.job.jobId && e.scope === 'job') };
  const status = materialStatus(jobMaterial, input);
  const experiences = input.profile.background.experiences.filter((e) => e.confirmed).map((e) => `「${e.text}」（本人确认的自报经历）`);
  const experienceText = input.profile.background.experiences.length === 0 ? '本流程未采集经历，不能据此判断本人没有经验。' : experiences.length ? `已确认经历：${experiences.join('、')}。` : '已有经历记录，但本人尚未确认。';
  return {
    key: 'career_value', status, factIds: material.facts.map((f) => f.factId),
    summary: `【证据】${input.profile.goals.length ? `本人目标：${input.profile.goals.join('；')}。` : '本人未填写目标。'}${experienceText}${materialSummary(material, pattern)}` +
      `【推断】本人目标与岗位「${input.job.title}」具体任务及成长机会的关系尚未核验。${claimExplanation(status, material.evidence.length > 0)}` +
      `【缺口】${material.evidence.some((e) => e.jobId === null) ? '公司或团队评价提到的培训、成长不能代替该岗位承诺。' : ''}需确认该岗位可积累的具体技能、带教安排、培训频率和晋升条件；自报经历或兴趣不证明能力，培训的存在也不保证成长结果。${materialGaps(material, input)}`,
  };
}

function softPreferenceExplanation(input: DimensionBuildInput): { text: string; factIds: string[] } {
  const details: string[] = [];
  const factIds: string[] = [];
  for (const preference of collectNonHardPreferences(input.profile)) {
    const label = PREFERENCE_LABELS[preference.key] ?? '其他个人偏好';
    const qualifier = preference.strength === 'soft' ? '软偏好' : '尚未确认为硬条件的偏好';
    if (preference.key === 'city') {
      const cities = typeof preference.value === 'string' ? [preference.value] : Array.isArray(preference.value) ? preference.value : [];
      details.push(`${label}：${qualifier}为${cities.length ? cities.join('、') : '暂未确定'}；${input.job.city ? `岗位城市线索是${input.job.city}，${cities.includes(input.job.city) ? '位于意向范围内，可继续核对办公地点' : '与意向范围不同，需本人权衡'}，实际工作地点及来源仍待确认` : '岗位实际城市缺少资料'}。`);
    } else if (preference.key === 'min_fixed_monthly_salary') {
      details.push(`${label}：${qualifier}期望为 ${String(preference.value)} 元；该岗位是否达到期望须有与当前岗位对齐的固定月薪、发放周期及税前税后资料，公司平均或其他岗位薪资不能代替。`);
    } else if (['accept_sales_kpi', 'accept_travel', 'accept_outsourcing'].includes(preference.key)) {
      const key = preference.key === 'accept_sales_kpi' ? 'job.sales_kpi' : preference.key === 'accept_travel' ? 'job.travel' : 'job.outsourcing';
      const material = collectMaterial(input, (k) => k === key, () => false, true);
      factIds.push(...material.facts.map((f) => f.factId));
      const intent = preference.value === false ? '倾向不接受' : preference.value === true ? '可以接受' : '尚未确定';
      const status = materialStatus(material, input);
      const values = [...new Set(material.facts.map((f) => f.value).filter((v) => typeof v === 'boolean'))];
      const statement = status === 'conflicting' ? '对应资料存在冲突，需先核对' : values.length === 1 ? `岗位资料${values[0] ? '提到存在' : '明确声明没有'}此项，${status === 'supported' ? '有资料支持这项记载' : '尚未独立核验'}；${preference.value === false && values[0] ? '与软偏好有偏离，需本人权衡' : '可作为继续了解的线索'}` : '缺少同岗位明确资料，不能把没有提到理解成不存在';
      details.push(`${label}：${qualifier}${intent}；${statement}。`);
    } else details.push(`${label}：已保留${qualifier}，缺少对应岗位资料时需继续核实。`);
  }
  return { text: details.length ? `软偏好逐项回应：${details.join('')}这些偏好用于解释和权衡，不会自动排除候选或替代硬条件。` : '本人未提供其他偏好。', factIds: [...new Set(factIds)] };
}

function buildPersonalFit(input: DimensionBuildInput): MatchReportResultDimension {
  const fails = input.constraintEvaluations.filter((c) => c.result === 'fail');
  const passes = input.constraintEvaluations.filter((c) => c.result === 'pass');
  const unknowns = input.constraintEvaluations.filter((c) => c.result === 'unknown');
  const soft = softPreferenceExplanation(input);
  const names = (items: ConstraintEvaluation[]) => items.map((c) => PREFERENCE_LABELS[c.key] ?? '其他硬条件').join('、');
  const status: Status = fails.length ? 'contradicted' : passes.length && !unknowns.length && passes.some((c) => c.trace.basis === 'fact') ? 'supported' : 'unknown';
  const hardText = fails.length ? `已确认硬条件与岗位资料存在直接冲突：${names(fails)}。软偏好不能抵消硬冲突。` : passes.length ? `可判定的已确认硬条件通过：${names(passes)}；${unknowns.length ? `另有 ${unknowns.length} 项硬条件尚无法判定。` : '通过仅涉及这些条件。'}` : input.constraintEvaluations.length ? `${unknowns.length} 项已确认硬条件尚无法判定。` : '没有已确认硬条件；这是本人保存的需求选择，仍可按软偏好与关注事项分析。';
  return {
    key: 'personal_fit', status, factIds: [...new Set([...fails, ...passes].flatMap((c) => c.factIds).concat(soft.factIds))],
    summary: `【证据】${hardText}${soft.text}【推断】资料与偏好的关系可用于决定继续调查什么；不等于整体适合、具备能力或公司安全。` +
      '【缺口】实际工作条件、主体与未核验事项仍需确认；本流程未采集的经历不能被当作没有经历。',
  };
}

export function buildDimensionsForJob(input: DimensionBuildInput): MatchReportResultDimension[] {
  return [buildIdentityCredit(input), buildBusiness(input), buildRoleClarity(input), buildCareerValue(input), buildPersonalFit(input)];
}

export type DimensionStatusCheck = { key: DimensionKey; status: Status };
