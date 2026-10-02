/**
 * POST /api/c/reports/:id/update —— 增量更新报告（C §6.2 根挂载：P2 集成片段）。
 *
 * body: { profile, intentContext, bundle, idempotencyKey, expectedVersion? }
 * 行为：原子幂等预留 + 不可变版本生成（v2+）。
 */
import { handleUpdateReport } from "@/modules/c-report/application/api/handlers";
import { createCApiContext } from "@/modules/c-report/adapters/memory/context";

export const dynamic = "force-dynamic";

const context = createCApiContext();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleUpdateReport(context, request, id);
}
