import {exportsDisabled} from '@/packages/integration/export-policy';
import { assertLocalRequest, getAHost, integrationError } from "@/packages/integration/a-host";
import { getDemoFlow } from "@/packages/integration/demo-flow";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertLocalRequest(request);
    const { id } = await params, url = new URL(request.url), format = url.searchParams.get("format") ?? "html";
    if(format!=="html")return exportsDisabled();
    return getDemoFlow().read(getAHost().owner(request), id, format, url.searchParams.get("angle"));
  } catch (error) { return integrationError(error); }
}
