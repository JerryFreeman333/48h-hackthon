import { getBundle } from "@/modules/b-research/service";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bundle = getBundle(id);
  if (!bundle) return Response.json({ error: { code: "NOT_FOUND", message: "档案不存在", retryable: false, requestId: crypto.randomUUID() } }, { status: 404 });
  return new Response(JSON.stringify(bundle, null, 2), { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="candidate-bundle-${id}.json"` } });
}
