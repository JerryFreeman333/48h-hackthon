/**
 * GET /api/c/runs/:id —— 读取 run 状态（C §6.2 根挂载：P2 集成片段）。
 * DELETE /api/c/runs/:id —— 取消运行中的 run（C §6.2 根挂载：P5 §6.2 增强）。
 */
import { handleGetRun, handleCancelRun } from "@/modules/c-report/application/api/handlers";
import { createCApiContext } from "@/modules/c-report/adapters/memory/context";

export const dynamic = "force-dynamic";

const context = createCApiContext();

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleGetRun(context, _request, id);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleCancelRun(context, _request, id);
}
