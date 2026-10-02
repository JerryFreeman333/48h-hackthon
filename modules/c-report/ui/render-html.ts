/**
 * C 报告 HTML 渲染（P3，规格 §15/§16）。
 *
 * 框架无关：输入视图模型，输出独立 HTML 字符串；零客户端脚本（键盘可用性全部
 * 由原生元素承担：<details> 证据抽屉、链接导航、focus-visible 样式）。
 * - 所有动态文本经 escapeHtml（HTML 实体），防 XSS；属性上下文同样转义。
 * - 链接仅 http/https；无 URL 显示提供方式，不造链接（§15）。
 * - 状态 = CSS class + 文字标签双通道；unknown 用灰色，绝不用绿色（C-08）。
 *   动作标签同理：explore 用中性灰（不暗示安全），deprioritize 用红。
 * - 移动端单列（max-width 媒体查询 + 比较表横向滚动容器）。
 * 渲染层不做业务判断：标签、unknown 规则、比较语义全部在视图模型层定死。
 */
import type { DimensionKey } from '../domain/contract.js';
import { DIMENSION_KEYS } from '../domain/dimensions.js';
import {
  DIMENSION_LABELS,
  type CandidateVm,
  type ReportViewModel,
} from './report-view-model.js';

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** http/https 之外返回 null（与 application/markdown.ts、ui/report-view-model.ts 同一白名单）。 */
function safeHref(url: string | null): string | null {
  if (url === null) {
    return null;
  }
  return /^https?:\/\//i.test(url) ? url : null;
}

const CSS = `
:root {
  --ink: #1f2430; --muted: #5b6472; --line: #d9dee7; --bg: #f6f7fa; --card: #ffffff;
  --ok: #1a7f37; --ok-bg: #e6f4ea; --bad: #b3261e; --bad-bg: #fce8e6;
  --warn: #8a5a00; --warn-bg: #fff3d6; --grey: #47505e; --grey-bg: #eceff3;
  --conflict: #7a1fa2; --conflict-bg: #f3e8fb;
}
* { box-sizing: border-box; }
body { margin: 0; padding: 0 16px 48px; background: var(--bg); color: var(--ink);
  font: 16px/1.65 "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif; }
.page { max-width: 960px; margin: 0 auto; }
a { color: #0b57d0; }
a:focus-visible, summary:focus-visible { outline: 3px solid #0b57d0; outline-offset: 2px; border-radius: 2px; }
.skip-link { position: absolute; left: -9999px; top: 0; background: var(--card); padding: 8px 14px; border: 2px solid #0b57d0; z-index: 10; }
.skip-link:focus { left: 8px; top: 8px; }
header.masthead { padding: 20px 0 8px; border-bottom: 3px solid var(--ink); margin-bottom: 16px; }
h1 { font-size: 26px; margin: 0 0 6px; }
h2 { font-size: 21px; margin: 32px 0 10px; padding-bottom: 6px; border-bottom: 1px solid var(--line); }
h3 { font-size: 18px; margin: 20px 0 8px; }
h4 { font-size: 16px; margin: 14px 0 6px; }
.meta-list { list-style: none; margin: 8px 0; padding: 0; color: var(--muted); font-size: 14px; }
.meta-list li { margin: 2px 0; }
.badge-demo { display: block; margin: 12px 0; padding: 10px 14px; border: 2px dashed var(--warn);
  background: var(--warn-bg); color: var(--warn); border-radius: 8px; font-weight: 600; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 16px 18px; margin: 12px 0; }
.card-primary { border-left: 6px solid var(--ink); }
.action-line { font-size: 20px; font-weight: 700; margin: 4px 0; }
.action-note { color: var(--muted); font-size: 14px; margin: 4px 0 0; }
.chip { display: inline-block; padding: 1px 10px; border-radius: 999px; font-size: 14px; font-weight: 600;
  border: 1px solid transparent; vertical-align: middle; }
.chip-supported { background: var(--ok-bg); color: var(--ok); border-color: var(--ok); }
.chip-contradicted { background: var(--bad-bg); color: var(--bad); border-color: var(--bad); }
.chip-unknown { background: var(--grey-bg); color: var(--grey); border-color: var(--grey); }
.chip-conflicting { background: var(--conflict-bg); color: var(--conflict); border-color: var(--conflict); }
.chip-pass { background: var(--ok-bg); color: var(--ok); border-color: var(--ok); }
.chip-fail { background: var(--bad-bg); color: var(--bad); border-color: var(--bad); }
.chip-act-explore { background: var(--grey-bg); color: var(--grey); border-color: var(--grey); }
.chip-act-verify_first { background: var(--warn-bg); color: var(--warn); border-color: var(--warn); }
.chip-act-hold { background: var(--conflict-bg); color: var(--conflict); border-color: var(--conflict); }
.chip-act-deprioritize { background: var(--bad-bg); color: var(--bad); border-color: var(--bad); }
.chip-act-insufficient { background: var(--grey-bg); color: var(--grey); border-color: var(--grey); }
.chip-ver-verified { background: var(--ok-bg); color: var(--ok); border-color: var(--ok); }
.chip-ver-unverified { background: var(--grey-bg); color: var(--grey); border-color: var(--grey); }
.chip-ver-disputed { background: var(--bad-bg); color: var(--bad); border-color: var(--bad); }
.chip-vac-open { background: var(--warn-bg); color: var(--warn); border-color: var(--warn); }
.chip-vac-closed { background: var(--grey-bg); color: var(--grey); border-color: var(--grey); }
.chip-vac-unknown { background: var(--grey-bg); color: var(--grey); border-color: var(--grey); }
.reason-list, .q-list, .unknown-list { margin: 8px 0; padding-left: 22px; }
.reason-list li, .q-list li, .unknown-list li { margin: 6px 0; }
.kind-tag { display: inline-block; min-width: 3em; text-align: center; font-size: 13px; font-weight: 700;
  color: var(--muted); border: 1px solid var(--line); border-radius: 4px; padding: 0 6px; margin-right: 6px; background: var(--bg); }
.ref { color: var(--muted); font-size: 13px; }
table.compare { border-collapse: collapse; width: 100%; background: var(--card); font-size: 14px; }
table.compare th, table.compare td { border: 1px solid var(--line); padding: 8px 10px; text-align: left; vertical-align: top; }
table.compare thead th { background: var(--bg); }
table.compare tbody th[scope="row"] { background: var(--bg); white-space: nowrap; }
tr.row-focused { outline: 3px solid #0b57d0; outline-offset: -3px; }
.angle-mark { color: #0b57d0; font-weight: 700; font-size: 13px; }
.table-wrap { overflow-x: auto; border-radius: 10px; border: 1px solid var(--line); }
.compare-note { color: var(--muted); font-size: 14px; margin: 6px 0; }
.angle-nav { margin: 10px 0; font-size: 14px; }
.angle-nav a { margin-right: 10px; white-space: nowrap; }
details.evidence { border: 1px solid var(--line); border-radius: 8px; margin: 10px 0; background: var(--card); }
details.evidence > summary { cursor: pointer; padding: 10px 14px; font-weight: 600; list-style-position: inside; }
details.evidence[open] > summary { border-bottom: 1px solid var(--line); }
.evidence-body { padding: 10px 16px 14px; }
.evidence-item { border-top: 1px dashed var(--line); padding: 10px 0; }
.evidence-item:first-child { border-top: none; }
.ev-attr { color: var(--muted); font-size: 13px; margin: 2px 0; }
.ev-excerpt { margin: 6px 0; padding: 8px 12px; background: var(--bg); border-left: 3px solid var(--line); white-space: pre-wrap; }
.dim-block { border-top: 1px dashed var(--line); padding: 10px 0; }
.dim-summary { white-space: pre-wrap; margin: 6px 0; }
.constraint-table { border-collapse: collapse; width: 100%; background: var(--card); font-size: 14px; }
.constraint-table th, .constraint-table td { border: 1px solid var(--line); padding: 6px 10px; text-align: left; }
.constraint-table thead th { background: var(--bg); }
.export-bar { margin: 10px 0 4px; }
.export-bar a { display: inline-block; margin-right: 12px; padding: 6px 14px; border: 1px solid #0b57d0;
  border-radius: 6px; text-decoration: none; font-weight: 600; background: var(--card); }
.export-bar a:hover { background: #e8f0fe; }
.anchor-nav { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 10px 16px; }
.anchor-nav a { margin-right: 14px; white-space: nowrap; }
.empty-note { padding: 14px 16px; border: 1px solid var(--warn); background: var(--warn-bg); color: var(--warn); border-radius: 8px; font-weight: 600; }
.snapshot-list { font-size: 14px; color: var(--muted); }
footer.page-foot { margin-top: 36px; padding-top: 12px; border-top: 1px solid var(--line); color: var(--muted); font-size: 13px; }
.standing-note { color: var(--muted); font-size: 13px; }
@media (max-width: 720px) {
  body { padding: 0 10px 40px; font-size: 15px; }
  h1 { font-size: 22px; }
  h2 { font-size: 19px; }
  .page { max-width: 100%; }
  .card { padding: 12px 12px; }
  .export-bar a { display: block; margin: 8px 0; text-align: center; }
  .anchor-nav a { display: inline-block; margin: 4px 10px 4px 0; }
}
`.trim();

interface RenderOptions {
  /** 页面标题（host 可覆盖）；默认「求职 X-Ray｜C 匹配报告」。 */
  title?: string;
  /** 导出链接（host 提供）；不提供则不渲染导出区。 */
  exportLinks?: { md?: string; json?: string } | null;
  /** 查看角度切换链接模板，如 "/demo/c?angle={key}"；不提供则不渲染角度切换。 */
  angleUrlPattern?: string | null;
  /** 演示入口显式标识（§15：/demo/c 为明确合成/人工演示入口）。 */
  demoBadge?: string | null;
  /** host 页脚说明。 */
  footerNote?: string | null;
}

function chip(statusClass: string, label: string): string {
  return `<span class="chip chip-${statusClass}">${escapeHtml(label)}</span>`;
}

const STATUS_CLASS: Record<string, string> = {
  supported: 'supported',
  contradicted: 'contradicted',
  unknown: 'unknown',
  conflicting: 'conflicting',
  pass: 'pass',
  fail: 'fail',
};

function statusChip(status: string, label: string): string {
  return chip(STATUS_CLASS[status] ?? 'unknown', label);
}

function actionChip(recommendation: string, label: string): string {
  return chip(`act-${recommendation}`, label);
}

/**
 * 核验状态是独立通道（verified/unverified/disputed），不与命题状态共用配色：
 * verified=绿（核验流程完成）、unverified=灰、disputed=红；文字标签始终同时出现。
 */
function verificationChip(verification: string, label: string): string {
  return chip(`ver-${verification}`, label);
}

/** 在招状态同理：open 是"B 声明在招"而非核验事实，用琥珀色+文字，不用绿色。 */
function vacancyChip(vacancyStatus: string, label: string): string {
  return chip(`vac-${vacancyStatus}`, label);
}

function evidenceHref(url: string | null, hiddenReason: string | null, sourceType: string): string {
  const href = safeHref(url);
  if (href !== null) {
    return `<p class="ev-attr">链接：<a href="${escapeHtml(href)}" rel="noopener noreferrer nofollow">${escapeHtml(href)}</a></p>`;
  }
  const reason = hiddenReason ?? `无链接（提供方式：${sourceType}）`;
  return `<p class="ev-attr">链接：${escapeHtml(reason)}</p>`;
}

function renderEvidenceBody(candidate: CandidateVm): string {
  if (candidate.evidence.length === 0) {
    return '<div class="evidence-body"><p>本候选没有关联证据记录。</p></div>';
  }
  const items = candidate.evidence.map((item) => {
    const published = item.publishedAt === null ? '未提供' : escapeHtml(item.publishedAt);
    return `<div class="evidence-item">
  <p><strong>${escapeHtml(item.title)}</strong>（${escapeHtml(item.evidenceId)}）</p>
  <p class="ev-attr">主体范围：${escapeHtml(item.scopeLabel)}（${escapeHtml(item.subject)}）｜核验状态：${verificationChip(item.verification, item.verificationLabel)}｜数据模式：${escapeHtml(item.modeLabel)}</p>
  <p class="ev-attr">出处类型：${escapeHtml(item.sourceType)}｜发布：${published}｜采集：${escapeHtml(item.retrievedAt)}</p>
  <blockquote class="ev-excerpt">${escapeHtml(item.excerpt)}</blockquote>
  ${evidenceHref(item.url, item.urlHiddenReason, item.sourceType)}
</div>`;
  });
  return `<div class="evidence-body">${items.join('\n')}</div>`;
}

function renderComparison(vm: ReportViewModel, options: RenderOptions): string {
  const comparison = vm.comparison;
  const anglePattern = options.angleUrlPattern ?? null;
  const angleLinks = anglePattern
    ? `<p class="angle-nav">查看角度：${
        [
          `<a href="${escapeHtml(anglePattern.replace('{key}', ''))}"${comparison.focusedKey === null ? ' aria-current="true"' : ''}>中性（默认顺序）</a>`,
          ...(DIMENSION_KEYS as readonly DimensionKey[]).map(
            (key) =>
              `<a href="${escapeHtml(anglePattern.replace('{key}', key))}"${comparison.focusedKey === key ? ' aria-current="true"' : ''}>${escapeHtml(DIMENSION_LABELS[key])}</a>`,
          ),
        ].join('\n')
      }</p>`
    : '';
  const head = comparison.columns
    .map((column) => `<th scope="col">${escapeHtml(column.title ?? '')}<br><span class="ref">${escapeHtml(column.jobId)}</span></th>`)
    .join('\n');
  const rows = comparison.rows
    .map(
      (row) => `<tr${row.focused ? ' class="row-focused"' : ''}>
      <th scope="row">${escapeHtml(row.label)}${row.focused ? '<br><span class="angle-mark">▲ 当前查看角度</span>' : ''}</th>
      ${row.cells
        .map(
          (cell) => `<td>${statusChip(cell.status, cell.statusLabel)}${
            cell.factIds.length > 0 ? `<br><span class="ref">事实：${escapeHtml(cell.factIds.join('、'))}</span>` : ''
          }<br><a href="#${escapeHtml(cell.slug)}">详情</a></td>`,
        )
        .join('\n')}
    </tr>`,
    )
    .join('\n');
  return `<h2 id="comparison">比较视图（同维度横向）</h2>
${angleLinks}
<p class="compare-note">${escapeHtml(comparison.note)}</p>
<div class="table-wrap" role="region" aria-label="五维比较表" tabindex="0">
<table class="compare">
<caption class="standing-note">五维状态比较；无综合分、无排名列。</caption>
<thead><tr><th scope="col">维度</th>${head}</tr></thead>
<tbody>
${rows}
</tbody>
</table>
</div>`;
}

function renderCandidate(candidate: CandidateVm): string {
  const dimensions = candidate.dimensions
    .map(
      (dimension) => `<div class="dim-block">
  <h4>${escapeHtml(dimension.label)}（${escapeHtml(dimension.key)}）${statusChip(dimension.status, dimension.statusLabel)}</h4>
  <p class="dim-summary">${escapeHtml(dimension.summary)}</p>
  ${dimension.factIds.length > 0 ? `<p class="ref">引用事实：${escapeHtml(dimension.factIds.join('、'))}</p>` : ''}
</div>`,
    )
    .join('\n');
  const constraints =
    candidate.constraints.length === 0
      ? '<p>本报告范围没有已确认硬约束。</p>'
      : `<table class="constraint-table">
<thead><tr><th scope="col">硬约束</th><th scope="col">结果</th><th scope="col">岗位侧事实</th></tr></thead>
<tbody>
${candidate.constraints
  .map(
    (constraint) => `<tr><td>${escapeHtml(constraint.keyLabel)}<br><span class="ref">${escapeHtml(constraint.key)}</span></td>
<td>${statusChip(constraint.result, constraint.resultLabel)}</td>
<td>${constraint.factIds.length > 0 ? escapeHtml(constraint.factIds.join('、')) : '无（保持 unknown，不硬塞引用）'}</td></tr>`,
  )
  .join('\n')}
</tbody>
</table>`;
  const unknowns =
    candidate.unknowns.length === 0
      ? '<p>本候选没有已登记的关键未知。</p>'
      : `<ul class="unknown-list">
${candidate.unknowns
  .map((item) => `<li><strong>${escapeHtml(item.label)}</strong><span class="ref">（${escapeHtml(item.source)}：${escapeHtml(item.key)}）</span>—— ${escapeHtml(item.detail)}</li>`)
  .join('\n')}
</ul>`;
  const questions = `<ul class="q-list">
${candidate.questions
  .map(
    (question) =>
      `<li><span class="kind-tag">${escapeHtml(question.priorityLabel)}</span>${escapeHtml(question.text)}<br><span class="ref">对应目标：${escapeHtml(question.resolves.join('、'))}</span></li>`,
  )
  .join('\n')}
</ul>`;
  const reasons = `<ul class="reason-list">
${candidate.reasons
  .map(
    (reason) =>
      `<li><span class="kind-tag">${escapeHtml(reason.kindLabel)}</span>${escapeHtml(reason.text)}${
        reason.factIds.length > 0 ? ` <span class="ref">（事实：${escapeHtml(reason.factIds.join('、'))}）</span>` : ''
      }</li>`,
  )
  .join('\n')}
</ul>`;
  const companyLine = candidate.company
    ? `<p class="ev-attr">招聘主体：${escapeHtml(candidate.company.legalName)}${
        candidate.company.brandName ? `（品牌：${escapeHtml(candidate.company.brandName)}）` : ''
      }｜主体状态：${escapeHtml(candidate.company.identityStatusLabel)}</p>`
    : '<p class="ev-attr">招聘主体：未关联（job.companyId=null）——主体未定位，结论受限。</p>';
  const jobLine = `<p class="ev-attr">城市：${candidate.city === null ? '未披露' : escapeHtml(candidate.city)}｜在招状态：${vacancyChip(candidate.vacancyStatus, candidate.vacancyStatusLabel)}｜声明薪资：${escapeHtml(candidate.salaryText)}</p>`;
  const sourceLine =
    candidate.sourceUrl !== null
      ? `<p class="ev-attr">岗位来源：<a href="${escapeHtml(candidate.sourceUrl)}" rel="noopener noreferrer nofollow">${escapeHtml(candidate.sourceUrl)}</a></p>`
      : candidate.sourceUrlRaw !== null
        ? '<p class="ev-attr">岗位来源：无链接（原值协议受限已隐藏，仅允许 http/https）</p>'
        : '';
  return `<section class="card" id="${escapeHtml(candidate.slug)}" aria-labelledby="${escapeHtml(candidate.slug)}-h">
<h2 id="${escapeHtml(candidate.slug)}-h">${escapeHtml(candidate.title ?? '未命名岗位')}<span class="ref">（${escapeHtml(candidate.jobId)}）</span></h2>
<p class="action-line">建议动作：${actionChip(candidate.recommendation, candidate.actionLabel)}</p>
<p class="action-note">${escapeHtml(candidate.actionNote)}</p>
${companyLine}
${jobLine}
${sourceLine}
<h3>关键理由（全部保留，含次级原因）</h3>
${reasons}
<h3>硬约束结果</h3>
${constraints}
<h3>五维结果（状态不是好坏分；未知不画绿）</h3>
${dimensions}
<h3>关键未知</h3>
${unknowns}
<h3>核验问题（面试/调查提纲）</h3>
${questions}
<details class="evidence">
<summary>证据抽屉（${String(candidate.evidence.length)} 条；原片段、出处、日期、主体、核验状态）</summary>
${renderEvidenceBody(candidate)}
</details>
</section>`;
}

export function renderReportHtml(vm: ReportViewModel, options: RenderOptions = {}): string {
  const title = options.title ?? '求职 X-Ray｜C 匹配报告';
  const exportBar = options.exportLinks
    ? `<div class="export-bar" aria-label="导出">
  ${options.exportLinks.md ? `<a href="${escapeHtml(options.exportLinks.md)}">导出 Markdown（.md）</a>` : ''}
  ${options.exportLinks.json ? `<a href="${escapeHtml(options.exportLinks.json)}">导出私有 JSON 复现包</a>` : ''}
</div>`
    : '';

  const summary = vm.summary;
  const firstScreen = summary.hasResults && summary.action !== null
    ? `<div class="card card-primary">
  <h2 id="first-screen" style="border-bottom:none;margin-top:0">首屏结论</h2>
  <p class="action-line">建议动作：${actionChip(summary.action.recommendation, summary.action.actionLabel)}<span class="ref">（${escapeHtml(summary.action.title ?? '')} ${escapeHtml(summary.action.jobId)}）</span></p>
  <p class="action-note">${escapeHtml(summary.action.actionNote)}</p>
  <h3>最多 3 个关键理由</h3>
  <ul class="reason-list">
  ${summary.keyReasons
    .map(
      (reason) =>
        `<li><span class="kind-tag">${escapeHtml(reason.kindLabel)}</span>${escapeHtml(reason.text)}${
          reason.factIds.length > 0 ? ` <span class="ref">（事实：${escapeHtml(reason.factIds.join('、'))}）</span>` : ''
        }</li>`,
    )
    .join('\n')}
  </ul>
  ${summary.moreReasonCount > 0 ? `<p class="ref">另有 ${String(summary.moreReasonCount)} 条次级原因见该候选详情。</p>` : ''}
  <h3>最重要的核验问题</h3>
  ${summary.primaryQuestion === null ? '<p>无（本候选没有登记核验问题）。</p>' : `<p><strong>${escapeHtml(summary.primaryQuestion.text)}</strong><br><span class="ref">对应目标：${escapeHtml(summary.primaryQuestion.resolves.join('、'))}</span></p>`}
</div>`
    : `<div class="empty-note" role="status">${escapeHtml(summary.emptyNote ?? '没有候选岗位。')}</div>`;

  const coverage = `<ul class="meta-list">
<li>完成度：${escapeHtml(summary.coverage.completenessLabel)}</li>
${summary.coverage.keyTopicGaps
  .map((gap) => `<li>关键主题未决：<strong>${escapeHtml(gap.topicLabel)}</strong><span class="ref">（${escapeHtml(gap.topic)}）</span>——未知不等于安全</li>`)
  .join('\n')}
${summary.coverage.insufficientNote ? `<li>${escapeHtml(summary.coverage.insufficientNote)}</li>` : ''}
</ul>
<table class="constraint-table">
<thead><tr><th scope="col">覆盖主题</th><th scope="col">状态</th><th scope="col">说明</th></tr></thead>
<tbody>
${summary.coverage.rows
  .map((row) => `<tr><td>${escapeHtml(row.topicLabel)}<br><span class="ref">${escapeHtml(row.topic)}</span></td><td>${escapeHtml(row.statusLabel)}</td><td>${escapeHtml(row.reason)}</td></tr>`)
  .join('\n')}
</tbody>
</table>`;

  const profile = vm.profile === null
    ? ''
    : `<section class="card" aria-labelledby="profile-h">
<h2 id="profile-h" style="margin-top:0">画像摘要</h2>
<p>画像 ${escapeHtml(vm.profile.profileId)}（revision ${String(vm.profile.revision)}）</p>
<p>目标：${vm.profile.goals.length > 0 ? escapeHtml(vm.profile.goals.join('；')) : '未填写'}</p>
<p>已确认硬约束：${
      vm.profile.hardPrefs.length > 0
        ? vm.profile.hardPrefs.map((p) => `${escapeHtml(p.keyLabel)} = ${escapeHtml(p.valueText)}`).join('；')
        : '无'
    }</p>
<p>已确认经历：${
      vm.profile.confirmedExperiences.length > 0
        ? vm.profile.confirmedExperiences.map((e) => escapeHtml(`「${e.text}」`)).join('、')
        : '无'
    }（自报且本人确认，不等于外部能力证明）</p>
</section>`;

  const candidateSections = vm.candidates.map(renderCandidate).join('\n');

  const globalFacts = `<h2 id="facts">事实快照（只读，B 原始事实未被本模块改写）</h2>
<ul class="snapshot-list">
${vm.globalSnapshots.facts
  .map(
    (fact) =>
      `<li>${escapeHtml(fact.factId)}｜${escapeHtml(fact.key)}=${escapeHtml(fact.valueText)}｜${statusChip(fact.status, fact.statusLabel)}${fact.asOf ? `｜asOf：${escapeHtml(fact.asOf)}` : ''}</li>`,
  )
  .join('\n')}
</ul>`;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
${CSS}
</style>
</head>
<body>
<a class="skip-link" href="#main">跳到主要内容</a>
<div class="page">
${options.demoBadge ? `<p class="badge-demo" role="note">${escapeHtml(options.demoBadge)}</p>` : ''}
<header class="masthead">
<h1>${escapeHtml(title)}</h1>
<ul class="meta-list">
<li>报告 ${escapeHtml(vm.meta.reportId)}（版本 ${String(vm.meta.version)}）｜生成时间 ${escapeHtml(vm.meta.generatedAt)}</li>
<li>数据模式：${escapeHtml(vm.meta.modeLabel)}｜完成度：${escapeHtml(vm.meta.completenessLabel)}</li>
<li>规则 ${escapeHtml(vm.meta.ruleVersion)}｜模板 ${escapeHtml(vm.meta.promptVersion)}——${escapeHtml(vm.meta.modelNote)}</li>
</ul>
${exportBar}
</header>
<nav class="anchor-nav" aria-label="页面目录">
<a href="#first-screen">首屏</a>
<a href="#comparison">比较视图</a>
${vm.candidates.map((candidate) => `<a href="#${escapeHtml(candidate.slug)}">${escapeHtml(candidate.title ?? candidate.jobId)}</a>`).join('\n')}
<a href="#facts">事实快照</a>
</nav>
<main id="main">
${firstScreen}
<h2 id="coverage">数据覆盖摘要</h2>
${coverage}
${renderComparison(vm, options)}
${candidateSections}
${globalFacts}
</main>
<footer class="page-foot">
${vm.notes.map((note) => `<p class="standing-note">${escapeHtml(note)}</p>`).join('\n')}
${options.footerNote ? `<p>${escapeHtml(options.footerNote)}</p>` : ''}
</footer>
</div>
</body>
</html>
`;
}
