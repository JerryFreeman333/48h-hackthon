/**
 * /reports —— C 模块正式报告页面（C §6.2 根挂载：P3 集成片段，完整实现版）。
 *
 * 与 /demo/c 区别：演示入口 vs 正式入口。
 * - /demo/c：fake runtime + 公共合成 fixtures（演示用，非生产）
 * - /reports：正式报告页（生产前需替换 ctx 为公共 runtime adapter）
 *
 * URL 参数：
 * - reportId=<id>：必需；指定要查看的报告
 * - angle=<dimensionKey>：可选；比较视图查看角度
 *
 * 数据流：HTTP fetch 同进程的 C API 路由
 * 1. GET /api/c/reports/:id —— 公共 MatchReport + diagnostics
 * 2. GET /api/c/reports/:id/snapshot —— C 私有 snapshot（含 bundle）
 * 3. buildReportViewModel → renderReportHtml（纯函数）
 *
 * 边界：
 * - 当前 Next.js self-fetch 在 SSR 阶段走同进程 in-memory fetch，
 *   由 app/api/c/<id>/route.ts（C 路由薄封装）直接调真实 handler（不真实 HTTP）。
 * - 生产部署前：维护人需替换 ctx 为公共 runtime adapter（持久 + 真实鉴权）。
 */
import { buildReportViewModel } from "@/modules/c-report/ui/report-view-model";
import { renderReportHtml } from "@/modules/c-report/ui/render-html";

export const dynamic = "force-dynamic";

interface ReportApiResponse {
  report: Parameters<typeof buildReportViewModel>[0]["report"];
  diagnostics: unknown;
}

interface SnapshotApiResponse {
  snapshot: Parameters<typeof buildReportViewModel>[0]["snapshot"];
}

async function fetchC<T>(path: string): Promise<T> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  const resp = await fetch(`${baseUrl}${path}`, {
    headers: {
      "content-type": "application/json",
      authorization: "Bearer token-user-demo-1",
    },
  });
  if (!resp.ok) {
    throw new Error(`C API ${path} -> ${String(resp.status)} ${await resp.text().catch(() => "")}`);
  }
  return (await resp.json()) as T;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ reportId?: string; angle?: string }>;
}) {
  const { reportId, angle } = await searchParams;
  if (!reportId) {
    return (
      <main className="reports-page">
        <h1>C 报告页面</h1>
        <p>请通过 ?reportId=&lt;id&gt; 指定报告。例如 <code>/reports?reportId=report-demo-1</code>。</p>
        <p>演示入口：<a href="/demo/c">/demo/c</a></p>
      </main>
    );
  }

  try {
    const [reportResp, snapshotResp] = await Promise.all([
      fetchC<ReportApiResponse>(`/api/c/reports/${encodeURIComponent(reportId)}`),
      fetchC<SnapshotApiResponse>(`/api/c/reports/${encodeURIComponent(reportId)}/snapshot`),
    ]);

    const html = renderReportHtml(
      buildReportViewModel({
        report: reportResp.report,
        snapshot: snapshotResp.snapshot,
        comparisonAngle: angle ?? null,
      }),
      {
        title: "求职 X-Ray | C 匹配报告",
        exportLinks: {
          md: `/api/c/reports/${encodeURIComponent(reportId)}/export?format=md`,
          json: `/api/c/reports/${encodeURIComponent(reportId)}/export?format=json`,
        },
        angleUrlPattern: `/reports?reportId=${encodeURIComponent(reportId)}&angle={key}`,
        footerNote: "C 模块正式报告页（demo runtime 接入；生产前需替换 ctx 为公共 runtime adapter）。",
      },
    );
    return <div dangerouslySetInnerHTML={{ __html: html }} />;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return (
      <main className="reports-page">
        <h1>报告读取失败</h1>
        <pre>{msg}</pre>
        <p>演示入口：<a href="/demo/c">/demo/c</a></p>
      </main>
    );
  }
}
