/**
 * Markdown 导出（规格 §12）：从不可变快照确定性渲染，不再次模型重写。
 * 用户/材料内容一律转义：HTML 实体防 XSS、行首标记转义防 Markdown 结构破坏、
 * 无 URL 显示提供方式不伪造链接。
 */
import type { MatchReport, MatchReportResult } from '../domain/contract.js';
import type { StoredReportSnapshot } from './ports.js';

/**
 * 转义任何进入报告的动态文本（用户自报、B 材料、事实值）。
 * 顺序：先 HTML 实体（防 XSS），再转义行首结构标记与内联强调/链接语法
 * （防 Markdown 结构破坏与伪链接），最后折叠换行。
 */
export function escapeForMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/(^|\n)(\s*)([#>*+-]|={2,})/g, '$1$2\\$3')
    .replace(/`/g, '\\`')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\*/g, '\\*')
    .replace(/\r?\n/g, ' ⏎ ');
}

/** 链接协议白名单：仅 http/https 可输出为链接；其余一律降级为无链接说明。 */
export function safeUrl(url: string | null): string | null {
  if (url === null) {
    return null;
  }
  return /^https?:\/\//i.test(url) ? url : null;
}

function reasonLine(prefix: string, text: string, factIds: string[]): string {
  const refs = factIds.length > 0 ? `（事实：${factIds.map(escapeForMarkdown).join('、')}）` : '';
  return `- ${prefix} ${escapeForMarkdown(text)}${refs}`;
}

function renderResultSection(result: MatchReportResult, jobTitle: string | null): string {
  const lines: string[] = [];
  const titleText = jobTitle === null ? `jobId=${result.jobId}` : `${jobTitle}（jobId=${result.jobId}）`;
  lines.push(`## 候选：${escapeForMarkdown(titleText)}`);
  lines.push('');
  lines.push(`建议动作：**${result.recommendation}**`);
  lines.push('');

  lines.push('### 关键理由');
  lines.push('');
  const kindLabel = { fact: '[事实]', inference: '[推断]', unknown: '[未知]' } as const;
  for (const reason of result.reasons) {
    lines.push(reasonLine(kindLabel[reason.kind], reason.text, reason.factIds));
  }
  lines.push('');

  lines.push('### 硬约束结果');
  lines.push('');
  for (const constraint of result.constraints) {
    lines.push(`- ${escapeForMarkdown(constraint.key)}：**${constraint.result}**${constraint.factIds.length > 0 ? `（事实：${constraint.factIds.map(escapeForMarkdown).join('、')}）` : ''}`);
  }
  lines.push('');

  lines.push('### 五维结果（状态不是好坏分；未知不是安全）');
  lines.push('');
  for (const dimension of result.dimensions) {
    lines.push(`#### ${dimension.key}（状态：${dimension.status}）`);
    lines.push('');
    lines.push(escapeForMarkdown(dimension.summary));
    lines.push('');
  }

  lines.push('### 核验问题');
  lines.push('');
  for (const question of result.questions) {
    lines.push(`- [${question.priority}] ${escapeForMarkdown(question.text)}（对应：${question.resolves.map(escapeForMarkdown).join('、')}）`);
  }
  lines.push('');
  return lines.join('\n');
}

export function renderReportMarkdown(report: MatchReport, snapshot: StoredReportSnapshot | null): string {
  const lines: string[] = [];
  const bundleJobs = ((snapshot?.snapshot.bundle as { jobs?: { jobId: string; title: string }[] } | undefined)?.jobs ?? []) as {
    jobId: string;
    title: string;
  }[];
  const titleOf = (jobId: string): string | null => bundleJobs.find((job) => job.jobId === jobId)?.title ?? null;
  lines.push('# 求职 X-Ray｜C 匹配报告');
  lines.push('');
  lines.push(`- 报告：${escapeForMarkdown(report.reportId)}（版本 ${String(report.version)}）`);
  lines.push(`- 生成时间：${escapeForMarkdown(report.generatedAt)}｜模式：${report.mode}｜完成度：${report.completeness}`);
  lines.push(`- 规则版本：${escapeForMarkdown(report.ruleVersion)}｜提示模板：${escapeForMarkdown(report.promptVersion)}（未运行模型）`);
  lines.push('');

  lines.push('## 数据覆盖摘要');
  lines.push('');
  const diagnostics = snapshot?.snapshot.diagnostics as { keyTopicGaps?: string[]; insufficientNote?: string | null } | undefined;
  const gaps = diagnostics?.keyTopicGaps ?? [];
  if (gaps.length > 0) {
    for (const gap of gaps) {
      lines.push(`- 关键主题未决：${escapeForMarkdown(gap)}（未知不等于安全）`);
    }
  } else {
    lines.push('- 声明范围内关键主题均有结论。');
  }
  if (diagnostics?.insufficientNote) {
    lines.push(`- ${escapeForMarkdown(diagnostics.insufficientNote)}`);
  }
  lines.push('');

  if (snapshot !== null) {
    const profile = snapshot.snapshot.profile as {
      profileId?: string;
      revision?: number;
      goals?: string[];
      preferences?: { key: string; value: unknown; strength: string; confirmed: boolean }[];
    } | null;
    if (profile) {
      lines.push('## 画像摘要');
      lines.push('');
      lines.push(`- 画像：${escapeForMarkdown(String(profile.profileId))}（revision ${String(profile.revision ?? '?')}）`);
      const hardPrefs = (profile.preferences ?? []).filter((p) => p.strength === 'hard' && p.confirmed === true);
      if (hardPrefs.length > 0) {
        lines.push(`- 已确认硬约束：${hardPrefs.map((p) => `${escapeForMarkdown(p.key)}=${escapeForMarkdown(String(p.value))}`).join('；')}`);
      } else {
        lines.push('- 已确认硬约束：无。');
      }
      const goals = profile.goals ?? [];
      lines.push(`- 目标：${goals.length > 0 ? goals.map(escapeForMarkdown).join('；') : '未填写'}`);
      lines.push('');
    }
  }

  lines.push('## 建议动作（首屏）');
  lines.push('');
  const first = report.results[0];
  if (first === undefined) {
    lines.push('- 无候选岗位：请补充候选后再生成报告（不伪造岗位）。');
    lines.push('');
  } else {
    lines.push(`- ${first.recommendation}（${escapeForMarkdown(first.jobId)}）`);
    lines.push('');
    lines.push('### 关键理由（最多 3 条）');
    lines.push('');
    const kindLabel = { fact: '[事实]', inference: '[推断]', unknown: '[未知]' } as const;
    for (const reason of first.reasons.slice(0, 3)) {
      lines.push(reasonLine(kindLabel[reason.kind], reason.text, reason.factIds));
    }
    lines.push('');
    lines.push('### 最重要的核验问题');
    lines.push('');
    const mustQuestion = first.questions.find((q) => q.priority === 'must') ?? first.questions[0];
    if (mustQuestion) {
      lines.push(`- ${escapeForMarkdown(mustQuestion.text)}（对应：${mustQuestion.resolves.map(escapeForMarkdown).join('、')}）`);
    } else {
      lines.push('- 无。');
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  for (const result of report.results) {
    lines.push(renderResultSection(result, titleOf(result.jobId)));
  }

  lines.push('## 证据快照（只读，来源与核验状态原样保留）');
  lines.push('');
  for (const evidence of report.evidenceSnapshot) {
    lines.push(`- ${escapeForMarkdown(evidence.evidenceId)}｜scope=${evidence.scope}｜sourceType=${escapeForMarkdown(evidence.sourceType)}｜verification=${evidence.verification}｜mode=${evidence.mode}`);
    lines.push(`  - 片段：${escapeForMarkdown(evidence.excerpt)}`);
    const url = safeUrl(evidence.url);
    lines.push(`  - 链接：${url === null ? `无（提供方式：${escapeForMarkdown(evidence.sourceType)}${evidence.url === null ? '' : '；原值协议受限已隐藏'}）` : escapeForMarkdown(url)}`);
  }
  if (report.evidenceSnapshot.length === 0) {
    lines.push('- 无。');
  }
  lines.push('');

  lines.push('## 事实快照（只读，B 原始事实未被本模块改写）');
  lines.push('');
  for (const fact of report.factsSnapshot) {
    lines.push(`- ${escapeForMarkdown(fact.factId)}｜${escapeForMarkdown(fact.key)}=${escapeForMarkdown(String(fact.value))}｜状态：${fact.status}${fact.asOf ? `｜asOf：${escapeForMarkdown(fact.asOf)}` : ''}`);
  }
  if (report.factsSnapshot.length === 0) {
    lines.push('- 无。');
  }
  lines.push('');

  lines.push('## 覆盖快照');
  lines.push('');
  for (const coverage of report.coverageSnapshot) {
    lines.push(`- ${escapeForMarkdown(coverage.topic)}｜状态：${coverage.status}｜${escapeForMarkdown(coverage.reason)}`);
  }
  if (report.coverageSnapshot.length === 0) {
    lines.push('- 无。');
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('本报告由确定性规则模板生成（未运行模型）。报告读取不可变快照；画像或候选材料变更将产生新版本，本文件内容不会随之改变。');
  lines.push('');
  return lines.join('\n');
}
