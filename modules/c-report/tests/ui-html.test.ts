/**
 * P3 HTML 渲染测试（规格 §15）：转义防 XSS、协议白名单、双通道状态、
 * 键盘可用（零脚本 + 原生 details）、移动单列、导出入口。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runMatchPipeline, FIXED_GENERATED_AT, FIXED_REPORT_ID, loadDemoInputs, clone } from './helpers.js';
import { buildReportViewModel } from '../ui/report-view-model.js';
import { renderReportHtml, escapeHtml } from '../ui/render-html.js';
import type { StoredReportSnapshot } from '../application/ports.js';

function run() {
  const inputs = loadDemoInputs();
  return runMatchPipeline({
    profile: clone(inputs.profile),
    intentContext: clone(inputs.intent),
    bundle: clone(inputs.bundle),
    options: { reportId: FIXED_REPORT_ID, generatedAt: FIXED_GENERATED_AT },
  });
}

function storedOf(snapshot: Extract<ReturnType<typeof run>, { ok: true }>['snapshot']): StoredReportSnapshot {
  return {
    report: snapshot.report,
    snapshot,
    ownerId: 'user-demo-1',
    projectId: 'project-demo-1',
    runId: 'run-test',
    createdAt: snapshot.generatedAt,
  };
}

function demoHtml(options?: Parameters<typeof renderReportHtml>[1]): string {
  const result = run();
  if (!result.ok) throw new Error('pipeline failed');
  const vm = buildReportViewModel({ report: result.report, snapshot: storedOf(result.snapshot) });
  return renderReportHtml(vm, options);
}

describe('P3 HTML：双通道状态（色彩+文字）', () => {
  it('unknown 一律灰色 chip-unknown 且带文字标签，绝不与 supported 混用', () => {
    const html = demoHtml();
    const labels = [...html.matchAll(/chip-unknown">([^<]*)</g)].map((m) => m[1] ?? '');
    assert.ok(labels.length >= 8);
    assert.ok(labels.every((label) => label === '未知' || label === '无法判定'));
    assert.ok(!html.includes('chip-supported">未知'));
    assert.ok(!html.includes('chip-unknown">有支持'));
  });

  it('五维/约束/事实/证据/动作各自独立通道，verified 证据不占用 unknown class', () => {
    const html = demoHtml();
    assert.ok(html.includes('chip-ver-verified">已核验'));
    assert.ok(html.includes('chip-vac-unknown">未知'));
    assert.ok(html.includes('chip-act-deprioritize">暂缓'));
    assert.ok(html.includes('chip-fail">冲突'));
  });

  it('contradicted 硬冲突用红色 + 「相矛盾」', () => {
    const html = demoHtml();
    assert.ok(html.includes('chip-contradicted">相矛盾'));
  });
});

describe('P3 HTML：转义与协议白名单', () => {
  it('escapeHtml 覆盖五个敏感字符', () => {
    assert.strictEqual(escapeHtml(`<a href="x">&'</a>`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  });

  it('注入脚本/图片/伪协议 URL 的报告渲染后无活动内容', () => {
    const inputs = loadDemoInputs();
    const bundle = clone(inputs.bundle);
    bundle.jobs[0].title = '<script>alert("xss")</script>产品运营';
    bundle.jobs[0].sourceUrl = 'javascript:alert(1)';
    bundle.evidence[0].excerpt = '<img src=x onerror="alert(1)">负责客户拓展';
    bundle.evidence[0].url = 'javascript:alert(1)';
    const result = runMatchPipeline({
      profile: clone(inputs.profile),
      intentContext: clone(inputs.intent),
      bundle,
      options: { reportId: 'report-p3-xss', generatedAt: FIXED_GENERATED_AT },
    });
    if (!result.ok) throw new Error('pipeline failed');
    const vm = buildReportViewModel({ report: result.report, snapshot: storedOf(result.snapshot) });
    const html = renderReportHtml(vm);
    assert.ok(!/<script[\s>]/i.test(html));
    assert.ok(!/<img/i.test(html));
    assert.ok(html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'));
    assert.ok(html.includes('&lt;script&gt;'));
    assert.ok(!html.includes('href="javascript'));
    assert.ok(html.includes('原值协议不受支持已隐藏'));
    assert.ok(html.includes('原值协议受限已隐藏'));
  });

  it('http(s) 来源正常成链并带 rel 防护', () => {
    const inputs = loadDemoInputs();
    const bundle = clone(inputs.bundle);
    bundle.jobs[0].sourceUrl = 'https://jobs.example.com/1';
    bundle.evidence[0].url = 'http://corp.example.com/report';
    const result = runMatchPipeline({
      profile: clone(inputs.profile),
      intentContext: clone(inputs.intent),
      bundle,
      options: { reportId: 'report-p3-links', generatedAt: FIXED_GENERATED_AT },
    });
    if (!result.ok) throw new Error('pipeline failed');
    const vm = buildReportViewModel({ report: result.report, snapshot: storedOf(result.snapshot) });
    const html = renderReportHtml(vm);
    assert.ok(html.includes('href="https://jobs.example.com/1" rel="noopener noreferrer nofollow"'));
    assert.ok(html.includes('href="http://corp.example.com/report" rel="noopener noreferrer nofollow"'));
  });

  it('无 URL 的证据显示提供方式，不造链接', () => {
    const html = demoHtml();
    assert.ok(html.includes('无链接（提供方式：'));
  });
});

describe('P3 HTML：结构与可用性', () => {
  it('比较视图：表格结构、无排名标记、中性说明与角度导航链接', () => {
    const html = demoHtml({ angleUrlPattern: '/demo/c?angle={key}' });
    assert.ok(html.includes('id="comparison"'));
    assert.ok(html.includes('本表不产生排名、冠军或综合分'));
    assert.ok(!/名次|第[一二三1-3]名|冠军：|综合分：/.test(html));
    assert.ok(html.includes('href="/demo/c?angle=personal_fit"'));
    // 默认中性视图：无聚焦标记（匹配 HTML 属性而非 CSS 选择器）。
    assert.ok(!html.includes('class="row-focused"'));
    assert.ok(!html.includes('▲ 当前查看角度'));
  });

  it('角度聚焦行渲染 row-focused 且标记出现，维度行序受控', () => {
    const result = run();
    if (!result.ok) throw new Error('pipeline failed');
    const vm = buildReportViewModel({ report: result.report, snapshot: storedOf(result.snapshot), comparisonAngle: 'business' });
    const html2 = renderReportHtml(vm, { angleUrlPattern: '/demo/c?angle={key}' });
    assert.ok(html2.includes('class="row-focused"'));
    assert.ok(html2.includes('▲ 当前查看角度'));
    // 在比较表自身区域内核对行序：聚焦行（经营状况）是第一个维度行。
    const tableStart = html2.indexOf('<table class="compare">');
    const tableEnd = html2.indexOf('</table>', tableStart);
    const table = html2.slice(tableStart, tableEnd);
    const firstRowLabel = table.indexOf('经营状况');
    const secondRowLabel = table.indexOf('主体与信用');
    assert.ok(firstRowLabel >= 0 && secondRowLabel > firstRowLabel);
  });

  it('键盘可用：零 <script>、无内联事件、skip link、原生 details 抽屉', () => {
    const html = demoHtml();
    assert.ok(!/<script[\s>]/i.test(html));
    assert.ok(!/on(click|keydown|keyup|mouseover)=/i.test(html));
    assert.ok(html.includes('class="skip-link"'));
    assert.ok(html.includes('<details class="evidence">'));
    assert.ok(html.includes('lang="zh-CN"'));
  });

  it('移动可用：viewport meta、单列媒体查询、比较表滚动容器', () => {
    const html = demoHtml();
    assert.ok(html.includes('name="viewport"'));
    assert.ok(html.includes('@media (max-width: 720px)'));
    assert.ok(html.includes('class="table-wrap"'));
  });

  it('导出入口由 host 注入：提供时渲染，缺省不渲染', () => {
    const withLinks = demoHtml({ exportLinks: { md: '/api/c/reports/r/export?format=md', json: '/api/c/reports/r/export?format=json' } });
    assert.ok(withLinks.includes('href="/api/c/reports/r/export?format=md"'));
    assert.ok(withLinks.includes('href="/api/c/reports/r/export?format=json"'));
    assert.ok(withLinks.includes('导出 Markdown'));
    assert.ok(withLinks.includes('导出私有 JSON 复现包'));
    const without = demoHtml();
    assert.ok(!without.includes('class="export-bar"'));
  });

  it('演示标识与页脚说明可注入且经转义', () => {
    const html = demoHtml({ demoBadge: '演示入口：<b>合成样例</b>', footerNote: 'footer "note"' });
    assert.ok(html.includes('演示入口：&lt;b&gt;合成样例&lt;/b&gt;'));
    assert.ok(html.includes('footer &quot;note&quot;'));
  });

  it('首屏内容（动作/理由/问题/覆盖）与空状态', () => {
    const html = demoHtml();
    assert.ok(html.includes('id="first-screen"'));
    assert.ok(html.includes('最多 3 个关键理由'));
    assert.ok(html.includes('固定底薪和绩效各是多少'));
    assert.ok(html.includes('关键主题未决'));
    const inputs = loadDemoInputs();
    const bundle = clone(inputs.bundle);
    bundle.jobs = [];
    bundle.facts = [];
    bundle.evidence = [];
    bundle.coverage = [];
    const empty = runMatchPipeline({
      profile: clone(inputs.profile),
      intentContext: clone(inputs.intent),
      bundle,
      options: { reportId: 'report-p3-empty', generatedAt: FIXED_GENERATED_AT },
    });
    if (!empty.ok) throw new Error('pipeline failed');
    const emptyVm = buildReportViewModel({ report: empty.report, snapshot: null });
    const emptyHtml = renderReportHtml(emptyVm);
    assert.ok(emptyHtml.includes('没有候选岗位：请补充候选'));
    assert.ok(!emptyHtml.includes('class="card card-primary"'));
  });
});
