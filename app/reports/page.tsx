/**
 * C 报告演示宿主：同进程共享内存，不依赖 HTTP self-fetch 或监听端口。
 * 当前只读固定 demo 用户的 demo 报告；生产需实际账户与持久化。
 */
import React from "react";
import { handleGetReport, handleGetReportSnapshot } from "@/modules/c-report/application/api/handlers";
import { createSharedCApiContext } from "@/modules/c-report/adapters/memory/context";
import type { MatchReport } from "@/modules/c-report/domain/contract";
import type { StoredReportSnapshot } from "@/modules/c-report/application/ports";
import { buildReportViewModel } from "@/modules/c-report/ui/report-view-model";
import { renderReportHtml } from "@/modules/c-report/ui/render-html";

export const dynamic = "force-dynamic";

const DEMO_TOKEN = "Bearer token-user-demo-1";

async function readResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`C 报告读取失败：${String(response.status)} ${await response.text()}`);
  }
  return await response.json() as T;
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
        <h1>C 报告演示页面</h1>
        <p>请通过 ?reportId=&lt;id&gt; 指定在当前演示进程创建的报告。</p>
        <p>当前使用本地内存和固定演示用户，服务重启后报告会丢失。</p>
        <p>独立演示入口：<a href="/demo/c">/demo/c</a></p>
      </main>
    );
  }

  try {
    const context = createSharedCApiContext();
    // Request 仅供框架无关 handler 鉴权；不会发起网络请求。
    const request = new Request(`http://c-demo.invalid/api/c/reports/${encodeURIComponent(reportId)}`, {
      headers: { authorization: DEMO_TOKEN },
    });
    const [reportResp, snapshotResp] = await Promise.all([
      handleGetReport(context, request, reportId).then(readResponse<{ report: MatchReport }>),
      handleGetReportSnapshot(context, request, reportId).then(readResponse<{ snapshot: StoredReportSnapshot["snapshot"] }>),
    ]);
    if (reportResp.report.mode !== "demo" || snapshotResp.snapshot.report.mode !== "demo") {
      throw new Error("当前演示宿主只支持 mode=demo 的报告。");
    }
    // snapshot API 返回内层 artifact；ViewModel 需要外层 StoredReportSnapshot。
    // handler 已完成归属检查，读取该不可变版本，避免误用 artifact 形状。
    const report = snapshotResp.snapshot.report;
    const snapshot = await context.stores.reportSnapshots.read(report.projectId, `${report.reportId}:v${report.version}`);
    if (snapshot === null) {
      throw new Error("报告的不可变快照已不可用，请重新生成演示报告。");
    }

    const html = renderReportHtml(
      buildReportViewModel({
        report,
        snapshot,
        comparisonAngle: angle ?? null,
      }),
      {
        title: "求职 X-Ray | C 匹配报告（演示）",
        demoBadge: "当前是演示报告宿主：固定演示用户、本地内存；不代表真实鉴权或生产服务。",
        angleUrlPattern: `/reports?reportId=${encodeURIComponent(reportId)}&angle={key}`,
        footerNote: "报告使用同一进程中的演示存储和不可变快照；服务重启后需要重新生成。",
      },
    );
    return <div dangerouslySetInnerHTML={{ __html: html }} />;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return (
      <main className="reports-page">
        <h1>演示报告读取失败</h1>
        <pre>{msg}</pre>
        <p>独立演示入口：<a href="/demo/c">/demo/c</a></p>
      </main>
    );
  }
}
