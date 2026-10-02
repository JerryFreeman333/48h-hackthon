/**
 * GET /api/c/reports/:id/snapshot —— 返回 C 私有报告快照（含 bundle 上下文；
 * 用于 /reports 页面渲染候选岗位标题、公司名、证据 URL 等）（§6.2 新增 endpoint）。
 *
 * 与 GET /api/c/reports/:id 互补：
 * - /reports/:id 返回公共 MatchReport + diagnostics（演示骨架用）
 * - /reports/:id/snapshot 返回私有 snapshot（页面渲染需要 bundle）
 *
 * 路径：401 无凭据 / 404 跨用户读不泄露 / 404 报告快照缺失 / 200 完整 snapshot。
 */
import { handleGetReportSnapshot } from "@/modules/c-report/application/api/handlers";
import { createSharedCApiContext } from "@/modules/c-report/adapters/memory/context";

export const dynamic = "force-dynamic";

const context = createSharedCApiContext();

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleGetReportSnapshot(context, _request, id);
}
