/**
 * GET /demo/c/export?format=md|json —— C 模块演示导出（C §6.2 根挂载：P3 集成片段）。
 *
 * 走真实 handleExportReport（含所有权校验路径），由 demo runtime 注入 demo Bearer token。
 * 仅限显式 demo 路由使用；不是无鉴权导出能力。
 */
import { demoExportResponse } from "@/modules/c-report/adapters/memory/demo-runtime";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const reportId = url.searchParams.get("report") ?? "";
  const format = url.searchParams.get("format") ?? "md";
  return demoExportResponse(reportId, format, url.origin);
}
