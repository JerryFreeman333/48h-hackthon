import { createResearchRun } from "@/modules/b-research/service";
import { jsonError } from "@/modules/b-research/http";

export async function POST(request: Request) {
  try {
    const { run, bundle } = createResearchRun(await request.json());
    return Response.json({ runId: run.runId, status: run.status, bundleId: bundle.bundleId }, { status: 202 });
  } catch (error) { return jsonError(error); }
}
