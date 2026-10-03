import { getAHost } from "@/packages/integration/a-host";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const GET = (request: Request) => getAHost().handle(request);
export const POST = GET;
export const PATCH = GET;
