/**
 * P4 模型输出校验——七层（规格 §11）的确定性可自动化实现。
 *
 * 层映射：
 *  L1 结构与枚举：JSON 解析、仅 dimensions 字段、五维 key 子集、非空、长度上限、
 *     必须保留【证据】【推断】【缺口】三段（维持模板纪律）。
 *  L2 引用与主体：summary 中出现的 fact- 与 evidence- 前缀编号必须存在于 bundle 且
 *     主体属于该岗位/其公司（不跨主体、不发明编号）。
 *  L3 片段支持：在招/固定底薪/主体核验类断言必须与材料状态一致（声明≠核验）。
 *  L4 时间：不得产生"当前在招/实时"类新断言（vacancyStatus 非 open 时禁止在招表述）。
 *  L5 数值：输出中的数字必须逐一出现在材料语料中；百分比表述一律拒绝。
 *  L6 个人：禁止概率/匹配率/录用/能力保证类表述（兴趣与自报经历不作能力证明）。
 *  L7 不变量：在 refine 编排层执行——重建报告后动作/约束/状态/事实引用与
 *     确定性结果逐字段一致（见 application/model/refine.ts）。
 *
 * 校验粒度：L1 整体失败 → 全部拒绝（走一次修复）；L2–L6 按维度失败 → 该维度
 * 回退模板文本，其余维度可被接受（§11"不支持则拒绝/降级"）。
 */
import type { CandidateBundle, DimensionKey, Job } from '../../domain/contract.js';
import { isValidDimensionKey } from './prompts.js';

export const SUMMARY_MAX_LENGTH = 1200;

const REQUIRED_SECTIONS = ['【证据】', '【推断】', '【缺口】'] as const;

export interface RefineContext {
  job: Job;
  bundle: CandidateBundle;
}

export type RefineValidationResult =
  | { kind: 'structural_error'; errors: string[] }
  | {
      kind: 'ok';
      accepted: { key: DimensionKey; summary: string }[];
      /** key 可能为 null（模型给出了非法 key）；错误信息携带完整原因。 */
      rejected: { key: string | null; errors: string[] }[];
    };

interface ParsedDimension {
  key: DimensionKey;
  summary: string;
}

function materialCorpus(ctx: RefineContext): string {
  const { job, bundle } = ctx;
  const company = job.companyId === null ? undefined : bundle.companies.find((c) => c.companyId === job.companyId);
  const facts = bundle.facts.filter((f) => f.jobId === job.jobId || (f.jobId === null && job.companyId !== null && f.companyId === job.companyId));
  const evidence = bundle.evidence.filter((e) => e.jobId === job.jobId || (e.jobId === null && job.companyId !== null && e.companyId === job.companyId));
  return [
    job.jobId,
    job.title,
    job.rawJd,
    job.city ?? '',
    job.sourceUrl ?? '',
    job.salary.currency,
    job.salary.min === null ? '' : String(job.salary.min),
    job.salary.max === null ? '' : String(job.salary.max),
    job.salary.months === null ? '' : String(job.salary.months),
    company?.legalName ?? '',
    company?.brandName ?? '',
    company?.creditCode ?? '',
    ...facts.map((f) => `${f.factId} ${f.key} ${String(f.value)} ${f.asOf ?? ''}`),
    ...evidence.map((e) => `${e.evidenceId} ${e.title} ${e.excerpt} ${e.publishedAt ?? ''} ${e.retrievedAt}`),
  ].join('\n');
}

/** 输出文本中引用的 fact-/evidence- 编号必须存在且主体匹配（L2）。 */
function checkReferenceTokens(summary: string, ctx: RefineContext): string[] {
  const errors: string[] = [];
  const { job, bundle } = ctx;
  const tokenPattern = /\b(fact|evidence)-[A-Za-z0-9_-]+\b/g;
  for (const match of summary.matchAll(tokenPattern)) {
    const token = match[0];
    const fact = bundle.facts.find((f) => f.factId === token);
    if (fact !== undefined) {
      const jobMatches = fact.jobId === job.jobId;
      const companyMatches = fact.jobId === null && job.companyId !== null && fact.companyId === job.companyId;
      if (!jobMatches && !companyMatches) {
        errors.push(`引用了不属于本岗位主体的编号 ${token}（跨主体引用禁止）`);
      }
      continue;
    }
    const evidenceItem = bundle.evidence.find((e) => e.evidenceId === token);
    if (evidenceItem !== undefined) {
      const jobMatches = evidenceItem.jobId === job.jobId;
      const companyMatches = evidenceItem.jobId === null && job.companyId !== null && evidenceItem.companyId === job.companyId;
      if (!jobMatches && !companyMatches) {
        errors.push(`引用了不属于本岗位主体的证据编号 ${token}（跨主体引用禁止）`);
      }
      continue;
    }
    errors.push(`引用了材料中不存在的编号 ${token}（不得发明事实/证据编号）`);
  }
  return errors;
}

/** 声明≠核验：在招、固定底薪、主体核验类断言必须与材料状态一致（L3/L4）。 */
function checkClaimSupport(summary: string, ctx: RefineContext): string[] {
  const errors: string[] = [];
  const { job } = ctx;
  if (job.vacancyStatus !== 'open' && /正在招聘|正在招人|在招中|目前开放|急招|当前在招/.test(summary)) {
    errors.push('产生了"当前正在招聘"类断言：岗位在招状态并非 open，未知状态不得写成正在招聘（L3/L4）');
  }
  if (job.salary.basis !== 'fixed' && /固定(月薪|底薪|工资)[^。]{0,12}\d|底薪\s*\d/.test(summary)) {
    errors.push('给非 fixed 口径的岗位写出了固定底薪数字：total/unknown 不能冒充固定底薪（L3）');
  }
  if (/主体(已|完成)?核验|已核验主体|信用良好|资质齐全|正规公司/.test(summary)) {
    errors.push('产生了主体核验/资质类断言：1.0.0 无逐字段 provenance，声明不能当核验结果（L3）');
  }
  if (/实时|最新数据|已核实/.test(summary)) {
    errors.push('产生了"实时/最新/已核实"类断言：本模块不产生实时数据声明（L4）');
  }
  return errors;
}

/**
 * 数值层：输出中的每个数字必须作为完整数字 token 出现在材料语料中（整词比对，
 * 防止 "500" 借 "15000" 的子串混入）；百分比一律拒绝（L5）。
 */
function checkNumbers(summary: string, corpusNumbers: Set<string>): string[] {
  const errors: string[] = [];
  if (/%|％|百分之/.test(summary)) {
    errors.push('出现了百分比表述：本报告不生成占比/概率数字（L5）');
  }
  for (const match of summary.matchAll(/\d+(?:\.\d+)?/g)) {
    const numeral = match[0];
    if (!corpusNumbers.has(numeral)) {
      errors.push(`出现了材料中不存在的数字 ${numeral}（不得编造数值）（L5）`);
    }
  }
  return errors;
}

/** 材料语料中的完整数字 token 集合（2026-10-02 → 2026/10/02；15000 不产生 500）。 */
function corpusNumberSet(corpus: string): Set<string> {
  return new Set([...corpus.matchAll(/\d+(?:\.\d+)?/g)].map((match) => match[0] as string));
}

/** 个人层：禁止概率/能力保证类表述（L6）。 */
function checkPersonalClaims(summary: string): string[] {
  const errors: string[] = [];
  if (/概率|匹配率|成功率|录用率|通过率/.test(summary)) {
    errors.push('出现了概率/比率类表述：模型不预测录用或匹配概率（L6）');
  }
  if (/保证|一定能|必然|稳过|百分百/.test(summary)) {
    errors.push('出现了保证类表述（L6）');
  }
  if (/证明了你(的)?[^。]{0,6}能力|说明你能胜任|你完全适合/.test(summary)) {
    errors.push('把自报材料写成了能力证明：兴趣与确认经历不作能力依据（L6）');
  }
  return errors;
}

function parseStructured(
  text: string,
): { ok: false; errors: string[] } | { ok: true; dimensions: ParsedDimension[]; malformed: { key: string | null; errors: string[] }[] } {
  const errors: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['输出不是合法 JSON（可能被截断或夹带了解释文字）'] };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, errors: ['顶层必须是 JSON 对象'] };
  }
  const record = parsed as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key !== 'dimensions') {
      errors.push(`出现了契约之外的字段 ${key}（只允许 dimensions）`);
    }
  }
  if (!Array.isArray(record.dimensions)) {
    errors.push('dimensions 必须是数组');
    return { ok: false, errors };
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  const dimensions: ParsedDimension[] = [];
  const malformed: { key: string | null; errors: string[] }[] = [];
  const seen = new Set<string>();
  for (const item of record.dimensions) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      malformed.push({ key: null, errors: ['dimensions 数组成员必须是对象'] });
      continue;
    }
    const entry = item as Record<string, unknown>;
    const itemErrors: string[] = [];
    for (const key of Object.keys(entry)) {
      if (key !== 'key' && key !== 'summary') {
        itemErrors.push(`维度对象出现了契约之外的字段 ${key}（只允许 key/summary）`);
      }
    }
    const key = entry.key;
    const summary = entry.summary;
    if (typeof key !== 'string' || !isValidDimensionKey(key)) {
      itemErrors.push(`维度 key 非法：${String(key)}（只允许五维 key）`);
      malformed.push({ key: typeof key === 'string' ? key : null, errors: itemErrors });
      continue;
    }
    if (seen.has(key)) {
      itemErrors.push(`维度 key 重复：${key}（每个 key 至多一次）`);
      malformed.push({ key, errors: itemErrors });
      continue;
    }
    seen.add(key);
    if (typeof summary !== 'string' || summary.trim().length === 0) {
      itemErrors.push(`维度 ${key} 的 summary 必须是非空字符串`);
      malformed.push({ key, errors: itemErrors });
      continue;
    }
    if (summary.length > SUMMARY_MAX_LENGTH) {
      itemErrors.push(`维度 ${key} 的 summary 超长（>${String(SUMMARY_MAX_LENGTH)} 字符）`);
      malformed.push({ key, errors: itemErrors });
      continue;
    }
    for (const section of REQUIRED_SECTIONS) {
      if (!summary.includes(section)) {
        itemErrors.push(`维度 ${key} 的 summary 缺少 ${section} 段落标记（必须保留三段结构）`);
      }
    }
    if (itemErrors.length > 0) {
      malformed.push({ key, errors: itemErrors });
      continue;
    }
    dimensions.push({ key, summary });
  }
  return { ok: true, dimensions, malformed };
}

/**
 * 校验一次模型输出。structural_error → 走修复轮；ok → 按维度接受/拒绝
 * （L1 逐项失败与 L2–L6 失败合并进 rejected，均回退模板）。
 */
export function validateRefineOutput(text: string, ctx: RefineContext): RefineValidationResult {
  const parsed = parseStructured(text);
  if (!parsed.ok) {
    return { kind: 'structural_error', errors: parsed.errors };
  }
  const corpusNumbers = corpusNumberSet(materialCorpus(ctx));
  const accepted: { key: DimensionKey; summary: string }[] = [];
  const rejected: { key: string | null; errors: string[] }[] = [];
  for (const malformed of parsed.malformed) {
    rejected.push({ key: malformed.key, errors: malformed.errors });
  }
  for (const dimension of parsed.dimensions) {
    const errors = [
      ...checkReferenceTokens(dimension.summary, ctx),
      ...checkClaimSupport(dimension.summary, ctx),
      ...checkNumbers(dimension.summary, corpusNumbers),
      ...checkPersonalClaims(dimension.summary),
    ];
    if (errors.length === 0) {
      accepted.push(dimension);
    } else {
      rejected.push({ key: dimension.key, errors });
    }
  }
  return { kind: 'ok', accepted, rejected };
}
