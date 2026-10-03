import { assertLocalRequest, getAHost, integrationError } from "@/packages/integration/a-host";
import { getDemoFlow } from "@/packages/integration/demo-flow";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
 try { assertLocalRequest(request); return Response.json({reports:getDemoFlow().list(getAHost().owner(request))},{headers:{"cache-control":"no-store"}}); }
 catch(error) { return integrationError(error); }
}
