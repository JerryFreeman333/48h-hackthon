import {assertLocalRequest,getAHost,readJson,integrationError} from "@/packages/integration/a-host";
import {getDemoFlow} from "@/packages/integration/demo-flow";
export const dynamic="force-dynamic";
export async function POST(request:Request){try{assertLocalRequest(request);const body=await readJson(request);if(!Array.isArray(body.reportIds)||body.reportIds.length<2||body.reportIds.length>3||body.reportIds.some(id=>typeof id!=="string"))throw Error("请选择两至三份报告");return Response.json(await getDemoFlow().compare(getAHost().owner(request),body.reportIds),{headers:{"cache-control":"no-store"}});}catch(error){return integrationError(error);}}
