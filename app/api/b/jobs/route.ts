import { addManualJob, listManualJobs } from "@/modules/b-research/service";
import { jsonError } from "@/modules/b-research/http";

export async function GET() { return Response.json({ jobs: listManualJobs(), mode: "manual" }); }
export async function POST(request: Request) {
  try { return Response.json(addManualJob(await request.json()), { status: 201 }); }
  catch (error) { return jsonError(error); }
}
