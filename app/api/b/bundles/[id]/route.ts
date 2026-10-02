import { getBundle } from "@/modules/b-research/service";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bundle = getBundle(id);
  return bundle ? Response.json(bundle) : Response.json({ error: { code: "NOT_FOUND", message: "档案不存在", retryable: false, requestId: crypto.randomUUID() } }, { status: 404 });
}
