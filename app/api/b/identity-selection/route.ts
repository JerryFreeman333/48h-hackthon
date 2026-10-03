import { selectIdentity } from "@/modules/b-research/service";
import { jsonError } from "@/modules/b-research/http";

export async function PUT(request: Request) {
  try {
  const body = await request.json();
  if (typeof body.companyId !== "string" || typeof body.selectedLegalName !== "string") return Response.json({ error: { code: "VALIDATION_ERROR", message: "companyId 和 selectedLegalName 必填", retryable: false, requestId: crypto.randomUUID() } }, { status: 422 });
  return Response.json(selectIdentity(body.companyId, body.selectedLegalName, body.projectId, body.jobId));
  } catch (error) { return jsonError(error); }
}
