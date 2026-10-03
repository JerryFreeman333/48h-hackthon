import {assertLocalRequest,getAHost,readJson,integrationError} from "@/packages/integration/a-host";
import {getDemoFlow} from "@/packages/integration/demo-flow";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,{params}:Context){try{assertLocalRequest(request);const {id}=await params;return Response.json(getDemoFlow().materialContext(getAHost().owner(request),id),{headers:{"cache-control":"no-store"}});}catch(e){return integrationError(e);}}
export async function POST(request:Request,{params}:Context){try{assertLocalRequest(request);const {id}=await params;const body=await readJson(request);return Response.json(await getDemoFlow().updateMaterial(getAHost().owner(request),id,body),{headers:{"cache-control":"no-store"}});}catch(e){return integrationError(e);}}
