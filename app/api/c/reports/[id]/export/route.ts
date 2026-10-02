/**
 * GET /api/c/reports/:id/export?format=md|json —— 公共 MD / 私有复现包导出。
 * md：公共报告（application/markdown.ts）。
 * json：C 私有 snapshot（artifactType=c_private_report_snapshot_v1，含完整输入与 trace）。
 *
 * 422 不支持格式 / 404 跨用户读不泄露 / 200 导出。
 */
import { handleExportReport } from "@/modules/c-report/application/api/handlers";
import { createSharedCApiContext } from "@/modules/c-report/adapters/memory/context";

export const dynamic = "force-dynamic";

const context = createSharedCApiContext();

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleExportReport(context, request, id, new URL(request.url));
}
