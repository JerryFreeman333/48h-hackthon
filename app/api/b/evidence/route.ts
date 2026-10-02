import { addEvidence } from "@/modules/b-research/service";
import { jsonError } from "@/modules/b-research/http";

export async function POST(request: Request) {
  try { return Response.json(addEvidence(await request.json()), { status: 201 }); }
  catch (error) { return jsonError(error); }
}
