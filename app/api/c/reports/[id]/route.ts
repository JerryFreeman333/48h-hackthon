/**
 * GET /api/c/reports/:id —— 返回公共 MatchReport + diagnostics（C §6.2 根挂载：P2 集成片段）。
 */
import { handleGetReport } from "@/modules/c-report/application/api/handlers";
import { createCApiContext } from "@/modules/c-report/adapters/memory/context";

export const dynamic = "force-dynamic";

const context = createCApiContext();

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleGetReport(context, _request, id);
}
