import {parseSourceDeclaration} from '@/packages/integration/data-status';
import { assertLocalRequest, getAHost, readJson, integrationError } from "@/packages/integration/a-host";
import { getDemoFlow } from "@/packages/integration/demo-flow";
import { manualJobSchema } from "@/modules/b-research/inputs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    assertLocalRequest(request);
    const body = await readJson(request);
    const a = getAHost(), owner = a.owner(request);
    // Validate JD before creating a saved needs record; caller cannot set project scope.
    if (!body.job || typeof body.job !== "object" || Array.isArray(body.job)) throw new Error("请提供岗位信息");
    const job = manualJobSchema.parse({ ...body.job, projectId: "validation-only" });
    const declaration=parseSourceDeclaration(body.sourceDeclaration,job.sourceUrl);
    let input; let needsSession:{sessionId:string;revision:number};
    if (body.sessionId) {
      if (typeof body.sessionId !== "string" || typeof body.revision !== "number" || !Number.isInteger(body.revision) || body.revision < 1) throw new Error("请选择已确认需求版本");
      input = a.service.export(owner, body.sessionId, body.revision);
      needsSession={sessionId:body.sessionId,revision:body.revision};
    } else {
      if (body.confirmUnknownNeeds !== true) throw new Error("请确认暂未填写的个人需求保留未知");
      const session = a.service.create(owner, { mode: "manual" });
      input = a.service.confirm(owner, session.id, { expectedRevision: session.revision, confirmed: true }).export;
      needsSession={sessionId:session.id,revision:input.UserProfile.revision};
    }
    return Response.json({...await getDemoFlow().runManual(owner, input, job, declaration),needsSession}, { headers: { "cache-control": "no-store" } });
  } catch (error) { return integrationError(error); }
}
