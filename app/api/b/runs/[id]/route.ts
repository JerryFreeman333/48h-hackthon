import { getRun } from "@/modules/b-research/service";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = getRun(id);
  return run ? Response.json(run) : Response.json({ error: { code: "NOT_FOUND", message: "任务不存在", retryable: false, requestId: crypto.randomUUID() } }, { status: 404 });
}
