import { companyCandidates } from "@/modules/b-research/service";
import { jsonError } from "@/modules/b-research/http";
export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    return Response.json(companyCandidates(query.get("name")?.trim() ?? "", query.get("projectId") ?? undefined));
  } catch (error) { return jsonError(error); }
}
