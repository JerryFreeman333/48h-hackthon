/**
 * /demo/c 独立演示宿主运行时（P3，规格 §15；非生产）。
 *
 * 显式 demo/test 用途：单进程内存 fake runtime + 公共合成 fixtures，经真实
 * API handler 路径（handleCreateMatch / handleExportReport）生成与导出报告。
 * 边界与 adapters/memory 相同：进程重启即丢、fake Bearer 鉴权，
 * 不得部署为无鉴权 live；生产宿主必须替换为公共 runtime adapter。
 *
 * 根目录 app/demo/c 的薄 Next 封装只调用本文件（见 docs/C_P3_INTEGRATION_SNIPPETS.md）。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { handleCreateMatch, handleExportReport, type CApiContext } from '../../application/api/handlers.js';
import { InMemoryCStores, createDemoIdentity } from './in-memory.js';
import type { MatchReport } from '../../domain/contract.js';
import type { StoredReportSnapshot } from '../../application/ports.js';
import { buildReportViewModel, type ReportViewModel } from '../../ui/report-view-model.js';
import { renderReportHtml } from '../../ui/render-html.js';

const DEMO_PROJECT_ID = 'project-demo-1';
const DEMO_TOKEN = 'Bearer token-user-demo-1';
const SEED_IDEMPOTENCY_KEY = 'demo-c-page-seed-1';

const moduleRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(moduleRoot, 'fixtures', name), 'utf8'));
}

interface DemoState {
  ctx: CApiContext;
  reportId: string | null;
}

const globalStore = globalThis as unknown as { __cDemoRuntime?: DemoState };

function demoState(): DemoState {
  if (globalStore.__cDemoRuntime === undefined) {
    const identity = createDemoIdentity();
    let idCounter = 0;
    globalStore.__cDemoRuntime = {
      ctx: {
        stores: new InMemoryCStores(),
        identity,
        readableProjectIds: async (principal) => identity.projectsOf(principal.userId),
        now: () => new Date().toISOString(),
        newRequestId: () => `demo-req-${String(++idCounter)}`,
        newId: (prefix) => `${prefix}-demo-${String(++idCounter)}`,
      },
      reportId: null,
    };
  }
  return globalStore.__cDemoRuntime;
}

async function readLatestReport(state: DemoState): Promise<{ report: MatchReport; snapshot: StoredReportSnapshot } | null> {
  if (state.reportId === null) {
    return null;
  }
  const index = await state.ctx.stores.reportIndex.get(DEMO_PROJECT_ID, state.reportId);
  if (index === null) {
    return null;
  }
  const key = `${state.reportId}:v${String(index.latestVersion)}`;
  const version = await state.ctx.stores.reportVersions.read(DEMO_PROJECT_ID, key);
  const snapshot = await state.ctx.stores.reportSnapshots.read(DEMO_PROJECT_ID, key);
  if (version === null || snapshot === null) {
    return null;
  }
  return { report: version.report, snapshot };
}

/** 首次调用经真实 handler 种子化 demo 报告（幂等键复用既有 run）；返回报告+私有快照。 */
export async function ensureDemoReport(): Promise<{ report: MatchReport; snapshot: StoredReportSnapshot }> {
  const state = demoState();
  const existing = await readLatestReport(state);
  if (existing !== null) {
    return existing;
  }
  const body = {
    profile: readFixture('user-profile.demo.v1.json'),
    intentContext: readFixture('search-intent.demo.v1.json'),
    bundle: readFixture('candidate-bundle.demo.v1.json'),
    idempotencyKey: SEED_IDEMPOTENCY_KEY,
  };
  const response = await handleCreateMatch(
    state.ctx,
    new Request('http://demo.local/api/c/matches', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: DEMO_TOKEN },
      body: JSON.stringify(body),
    }),
  );
  if (response.status !== 202) {
    throw new Error(`demo 种子化失败：POST /api/c/matches → ${String(response.status)} ${await response.text()}`);
  }
  const created = (await response.json()) as { reportId?: string };
  if (typeof created.reportId !== 'string') {
    throw new Error('demo 种子化失败：响应缺少 reportId');
  }
  state.reportId = created.reportId;
  const report = await readLatestReport(state);
  if (report === null) {
    throw new Error('demo 种子化失败：报告已创建但快照不可读');
  }
  return report;
}

/**
 * demo 导出：走真实 handleExportReport（含所有权校验路径），由 demo 宿主注入
 * demo Bearer token。仅限显式 demo 路由使用；不是无鉴权导出能力。
 */
export async function demoExportResponse(reportId: string, format: string, origin: string): Promise<Response> {
  const state = demoState();
  await ensureDemoReport();
  const url = new URL(`${origin}/api/c/reports/${encodeURIComponent(reportId)}/export?format=${encodeURIComponent(format)}`);
  return handleExportReport(
    state.ctx,
    new Request(url, { headers: { authorization: DEMO_TOKEN } }),
    reportId,
    url,
  );
}

export function buildDemoViewModel(angle?: string | null): Promise<ReportViewModel> {
  return ensureDemoReport().then(({ report, snapshot }) =>
    buildReportViewModel({ report, snapshot, comparisonAngle: angle ?? null }),
  );
}

const DEMO_BADGE =
  '演示入口：本页数据为公共合成样例（fixtures），不代表真实公司与岗位；运行在显式内存 fake runtime 上，非生产。';
const DEMO_FOOTER =
  '独立演示宿主：仅 C 模块自身数据流（公共样例 → C 管线 → 本页），未接入 A/B 真实链路。导出与页面读取同一不可变快照。';

/** 渲染 /demo/c 页面 HTML（零客户端脚本；查看角度经 URL 参数服务端重渲染）。 */
export async function renderDemoReportHtml(options?: { angle?: string | null }): Promise<string> {
  const vm = await buildDemoViewModel(options?.angle);
  const reportId = vm.meta.reportId;
  return renderReportHtml(vm, {
    title: '求职 X-Ray｜C 匹配报告（演示）',
    demoBadge: DEMO_BADGE,
    exportLinks: {
      md: `/demo/c/export?format=md&report=${encodeURIComponent(reportId)}`,
      json: `/demo/c/export?format=json&report=${encodeURIComponent(reportId)}`,
    },
    angleUrlPattern: '/demo/c?angle={key}',
    footerNote: DEMO_FOOTER,
  });
}
