/**
 * POST /api/c/matches —— 创建报告（C §6.2 根挂载：P2 集成片段）。
 *
 * 薄封装：调用 C 框架无关 handler；ctx 来自 createCApiContext（demo runtime）；
 * 生产宿主替换为公共 runtime adapter（持久快照 + IdentityProvider + DurableScheduler）。
 */
import { handleCreateMatch } from "@/modules/c-report/application/api/handlers";
import { createSharedCApiContext } from "@/modules/c-report/adapters/memory/context";

export const dynamic = "force-dynamic";

const context = createSharedCApiContext();

export async function POST(request: Request) {
  return handleCreateMatch(context, request);
}
