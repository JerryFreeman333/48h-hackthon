import { selectIdentity } from "@/modules/b-research/service";

export async function PUT(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (typeof body.companyId !== "string" || typeof body.selectedLegalName !== "string") return Response.json({ error: { code: "VALIDATION_ERROR", message: "companyId 和 selectedLegalName 必填", retryable: false, requestId: crypto.randomUUID() } }, { status: 422 });
  return Response.json(selectIdentity(body.companyId, body.selectedLegalName));
}
