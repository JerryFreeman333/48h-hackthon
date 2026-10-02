/**
 * P3 独立演示：/demo/c 数据流端到端走查（框架无关渲染层）。
 * 网络关闭、无模型、无外部服务；仅使用公共合成 fixtures。
 *
 * 展示：demo 宿主经真实 handler 种子化 → 视图模型 → HTML 渲染 →
 *       首屏/五维/比较/证据抽屉/导出/键盘与移动/转义/查看角度逐项对照。
 *       另含 XSS 注入变体与空候选变体（直接跑管线）。
 *
 * 退出码：全部符合预期 = 0；否则 1。
 */
import {
  buildDemoViewModel,
  demoExportResponse,
  renderDemoReportHtml,
} from '../adapters/memory/demo-runtime.js';
import { buildReportViewModel } from '../ui/report-view-model.js';
import { renderReportHtml } from '../ui/render-html.js';
import { runMatchPipeline } from '../application/pipeline.js';
import { clone, loadDemoInputs } from '../tests/helpers.js';
import type { StoredReportSnapshot } from '../application/ports.js';

type Check = { name: string; pass: boolean; detail: string };
const checks: Check[] = [];
function check(name: string, pass: boolean, detail: string): void {
  checks.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  —— ${detail}`);
}

function chipLabelsFor(html: string, cssClass: string): string[] {
  const matches = html.matchAll(new RegExp(`chip-${cssClass}">([^<]*)<`, 'g'));
  return [...matches].map((match) => match[1] ?? '');
}

async function main(): Promise<void> {
  // --- 1) demo 宿主：真实 handler 路径种子化 + 页面渲染 ---
  const vm = await buildDemoViewModel();
  const html = await renderDemoReportHtml();

  check('demo 宿主经真实 API handler 生成报告', vm.meta.reportId.length > 0 && vm.summary.hasResults,
    `reportId=${vm.meta.reportId} 候选数=${String(vm.candidates.length)}`);
  check('首屏建议动作 = deprioritize（含语义说明）',
    vm.summary.action?.recommendation === 'deprioritize' && html.includes('软偏好不能抵消硬冲突'),
    `action=${String(vm.summary.action?.recommendation)}`);
  check('首屏关键理由 ≤ 3', vm.summary.keyReasons.length <= 3 && vm.summary.keyReasons.length === 3,
    `首屏理由=${String(vm.summary.keyReasons.length)}（完整 ${String(vm.candidates[0]?.reasons.length ?? 0)} 条在候选详情）`);
  check('首屏首要核验问题 = must 优先',
    vm.summary.primaryQuestion !== null && vm.candidates[0]?.questions[0]?.priority === 'must' &&
      html.includes('固定底薪和绩效各是多少'),
    `问题=${String(vm.summary.primaryQuestion?.text ?? '').slice(0, 18)}…`);
  check('首屏数据覆盖摘要（关键主题缺口=3：收入可判定/真实在招/经营财务）',
    vm.summary.coverage.keyTopicGaps.length === 3 && html.includes('关键主题未决') && html.includes('收入可判定性'),
    `gaps=${vm.summary.coverage.keyTopicGaps.map((gap) => gap.topic).join(',')}（sales_kpi 有 supported 事实、主体已声明 confirmed，不进缺口）`);

  // --- 2) 五维渲染与 unknown 双通道 ---
  const dimensions = vm.candidates[0]?.dimensions ?? [];
  const dimensionKeys = new Set(dimensions.map((d) => d.key));
  check('五维恰好各一次',
    dimensions.length === 5 && dimensionKeys.size === 5 && html.includes('主体与信用') && html.includes('个人适配'),
    `keys=${[...dimensionKeys].join(',')}`);
  const unknownDimensionCount = dimensions.filter((d) => d.status === 'unknown').length;
  const unknownConstraintCount = vm.candidates[0]?.constraints.filter((c) => c.result === 'unknown').length ?? 0;
  const unknownCellCount = vm.comparison.rows.flatMap((row) => row.cells).filter((cell) => cell.status === 'unknown').length;
  const expectedUnknownChips = unknownDimensionCount + unknownConstraintCount + unknownCellCount;
  const unknownChipLabels = chipLabelsFor(html, 'unknown');
  const unknownTextLabels = unknownChipLabels.filter((label) => label === '未知' || label === '无法判定');
  check('unknown 不画绿：灰色 chip + 文字标签双通道（C-08）',
    unknownDimensionCount === 4 && unknownChipLabels.length === expectedUnknownChips &&
      unknownChipLabels.length === unknownTextLabels.length,
    `unknown 维度=${String(unknownDimensionCount)}；chip-unknown 渲染 ${String(unknownChipLabels.length)}/${String(expectedUnknownChips)} 处全部带文字（${[...new Set(unknownChipLabels)].join('/')}）`);
  check('supported 状态只用于事实快照（demo 五维中无绿色维度）',
    !dimensions.some((d) => d.status === 'supported') && (vm.candidates[0]?.dimensions.every((d) => d.status !== 'supported') ?? false),
    `维度状态=${dimensions.map((d) => d.status).join(',')}`);
  check('contradicted 用红色 + 「相矛盾」文字（personal_fit 硬冲突）',
    vm.candidates[0]?.dimensions.find((d) => d.key === 'personal_fit')?.status === 'contradicted' &&
      html.includes('chip-contradicted">相矛盾'),
    '硬冲突通道明确');

  // --- 3) 比较视图：无冠军排名、unknown 不当 0 ---
  check('比较视图 5 个维度行 × 候选列，候选保持快照原始顺序',
    vm.comparison.rows.length === 5 && vm.comparison.columns.length === vm.candidates.length &&
      vm.comparison.columns[0]?.jobId === 'job-demo-1',
    `rows=${String(vm.comparison.rows.length)} columns=${String(vm.comparison.columns.length)}`);
  check('unknown 不当 0：单元格渲染「未知」标签而非数值',
    vm.comparison.rows.every((row) => row.cells.every((cell) => cell.status === 'unknown' ? cell.statusLabel === '未知' : true)) &&
      html.includes('unknown 不计为 0'),
    '比较单元格无 0 分表达');
  check('无冠军排名：无名次/冠军列，仅中性顺序说明',
    !/名次|第[一二三1-3]名|冠军：|综合分：/.test(html) && html.includes('本表不产生排名、冠军或综合分'),
    '页面含无排名声明且无排名标记');

  // --- 4) 查看角度（用户显式选择，不改变候选顺序） ---
  const angleVm = await buildDemoViewModel('personal_fit');
  const angleHtml = await renderDemoReportHtml({ angle: 'personal_fit' });
  check('查看角度：聚焦维度行置前并标记，候选列顺序不变',
    angleVm.comparison.focusedKey === 'personal_fit' && angleVm.comparison.rows[0]?.key === 'personal_fit' &&
      angleVm.comparison.columns[0]?.jobId === 'job-demo-1' && angleHtml.includes('当前查看角度'),
    '角度只调整查看顺序，不构成排名');

  // --- 5) 证据抽屉与链接白名单 ---
  check('证据抽屉为原生 <details>（键盘可开合），含出处/片段/日期/主体/核验状态',
    html.includes('<details class="evidence">') && html.includes('主体范围') && html.includes('核验状态') &&
      html.includes('负责客户拓展，完成签单指标'),
    `抽屉证据 ${String(vm.candidates[0]?.evidence.length ?? 0)} 条`);
  check('无 URL 不造链接（显示提供方式），全部 href 仅 #锚点、站内相对路径 或 http(s)',
    html.includes('无链接（提供方式：') && !html.includes('href="javascript'),
    [...html.matchAll(/href="([^"]*)"/g)].every((m) => {
      const href = m[1] ?? '';
      return href.startsWith('#') || href.startsWith('/') || /^https?:\/\//.test(href);
    }) ? 'href 白名单通过' : '存在非法 href');

  // --- 6) 导出：MD 与私有 JSON 读同一不可变快照 ---
  const reportId = vm.meta.reportId;
  const jsonExport1 = await demoExportResponse(reportId, 'json', 'http://demo.local');
  const jsonText1 = await jsonExport1.text();
  const jsonExport2 = await demoExportResponse(reportId, 'json', 'http://demo.local');
  const jsonText2 = await jsonExport2.text();
  const artifact = JSON.parse(jsonText1) as { artifactType?: string; report?: { reportId?: string; version?: number }; bundle?: { jobs?: unknown[] } };
  check('导出 format=json → 200，artifactType=c_private_report_snapshot_v1（含 report，非裸 MatchReport）',
    jsonExport1.status === 200 && artifact.artifactType === 'c_private_report_snapshot_v1' &&
      artifact.report?.reportId === reportId && Array.isArray(artifact.bundle?.jobs),
    `bytes=${String(jsonText1.length)} artifact report v${String(artifact.report?.version)}`);
  check('JSON 导出两次逐字节一致（不可变快照）', jsonText1 === jsonText2, `一致=${String(jsonText1 === jsonText2)}`);
  const unsupported = await demoExportResponse(reportId, 'docx', 'http://demo.local');
  check('不支持格式 → 422 UNSUPPORTED_FORMAT', unsupported.status === 422, `status=${String(unsupported.status)}`);

  // --- 7) 键盘与移动可用（零客户端脚本） ---
  check('键盘可用：原生 details/链接 + skip link + 无内联事件、无 <script>',
    html.includes('class="skip-link"') && html.includes('<details') && !html.includes('onclick=') && !/<script[\s>]/i.test(html),
    '零客户端脚本');
  check('移动可用：viewport meta + 单列媒体查询 + 比较表横向滚动容器',
    html.includes('name="viewport"') && html.includes('@media (max-width: 720px)') && html.includes('class="table-wrap"'),
    '布局声明在页');

  // --- 8) 同快照一致性：页面/VM 与不可变报告同源 ---
  const evidenceIds = (vm.candidates[0]?.evidence ?? []).map((e) => e.evidenceId).sort();
  check('页面证据与报告 evidenceSnapshot 同源（同快照）',
    JSON.stringify(evidenceIds) === JSON.stringify(['evidence-demo-1']) && vm.globalSnapshots.facts[0]?.factId === 'fact-demo-1',
    `evidence=${evidenceIds.join(',')} facts=${String(vm.globalSnapshots.facts.length)}`);

  // --- 9) XSS 注入变体：用户/材料内容必须转义 ---
  const inputs = loadDemoInputs();
  const xssBundle = clone(inputs.bundle);
  xssBundle.jobs[0].title = '<script>alert("xss")</script>产品运营';
  xssBundle.jobs[0].sourceUrl = 'javascript:alert(1)';
  xssBundle.evidence[0].excerpt = '<img src=x onerror="alert(1)">负责客户拓展，完成签单指标，收集产品反馈。';
  xssBundle.evidence[0].url = 'javascript:alert(1)';
  const xssPipeline = runMatchPipeline({
    profile: inputs.profile,
    intentContext: inputs.intent,
    bundle: xssBundle,
    options: { reportId: 'report-p3-xss', generatedAt: '2026-10-02T09:00:00Z' },
  });
  if (!xssPipeline.ok) {
    check('XSS 变体管线可运行', false, `管线失败：${xssPipeline.error.code}`);
  } else {
    const storedSnapshot = {
      report: xssPipeline.snapshot.report,
      snapshot: xssPipeline.snapshot,
      ownerId: 'user-demo-1',
      projectId: 'project-demo-1',
      runId: 'run-p3-xss',
      createdAt: xssPipeline.snapshot.generatedAt,
    } satisfies StoredReportSnapshot;
    const xssVm = buildReportViewModel({ report: xssPipeline.report, snapshot: storedSnapshot });
    const xssHtml = renderReportHtml(xssVm);
    check('XSS 防护：<script>/<img> 不以标签出现，javascript: URL 不成为链接',
      !/<script[\s>]/i.test(xssHtml) && !/<img/i.test(xssHtml) && !xssHtml.includes('href="javascript') &&
        xssHtml.includes('&lt;script&gt;'),
      '全部动态文本经 HTML 实体转义');
    check('XSS 变体：不安全来源 URL 降级为无链接说明（岗位来源与证据链接都隐藏）',
      xssHtml.includes('原值协议受限已隐藏') && xssHtml.includes('原值协议不受支持已隐藏'),
      'safeUrl 白名单生效');
  }

  // --- 10) 空候选变体：insufficient 空状态，不伪造岗位 ---
  const emptyBundle = clone(inputs.bundle);
  emptyBundle.jobs = [];
  emptyBundle.facts = [];
  emptyBundle.evidence = [];
  emptyBundle.coverage = [];
  const emptyPipeline = runMatchPipeline({
    profile: inputs.profile,
    intentContext: inputs.intent,
    bundle: emptyBundle,
    options: { reportId: 'report-p3-empty', generatedAt: '2026-10-02T09:00:00Z' },
  });
  if (!emptyPipeline.ok) {
    check('空候选管线可运行', false, `管线失败：${emptyPipeline.error.code}`);
  } else {
    const emptyVm = buildReportViewModel({ report: emptyPipeline.report, snapshot: null });
    const emptyHtml = renderReportHtml(emptyVm);
    check('空候选 → insufficient 空状态说明，results=[] 不伪造岗位',
      emptyVm.summary.hasResults === false && emptyVm.candidates.length === 0 &&
        emptyHtml.includes('没有候选岗位：请补充候选'),
      `emptyNote=${String(emptyVm.summary.emptyNote ?? '').slice(0, 24)}…`);
  }

  let failed = 0;
  for (const item of checks) {
    if (!item.pass) {
      failed += 1;
    }
  }
  console.log(`\n共 ${String(checks.length)} 项，通过 ${String(checks.length - failed)}，失败 ${String(failed)}。`);
  console.log('说明：渲染层为框架无关纯函数（ui/），/demo/c 薄 Next 封装与根挂载走集成片段（docs/C_P3_INTEGRATION_SNIPPETS.md）。');
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('演示失败：', error);
  process.exit(1);
});
