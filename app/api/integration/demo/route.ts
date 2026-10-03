import { assertLocalRequest, getAHost, readJson, integrationError } from "@/packages/integration/a-host";
import { getDemoFlow } from "@/packages/integration/demo-flow";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    assertLocalRequest(request);
    const { sessionId, revision } = await readJson(request);
    if (typeof sessionId !== "string" || revision !== undefined && (!Number.isInteger(revision) || Number(revision) < 1)) throw new Error("请选择 A 已确认记录和有效版本");
    const a = getAHost(), owner = a.owner(request);
    return Response.json(await getDemoFlow().run(owner, a.service.export(owner, sessionId, revision)), { headers: { "cache-control": "no-store" } });
  } catch (error) { return integrationError(error); }
}
