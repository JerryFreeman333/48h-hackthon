import {assertLocalRequest,getAHost,readJson,integrationError} from '@/packages/integration/a-host';
import {getDemoFlow} from '@/packages/integration/demo-flow';
export const dynamic='force-dynamic';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
 try{assertLocalRequest(request);const {id}=await context.params;return Response.json(await getDemoFlow().supplementXmind(getAHost().owner(request),id,await readJson(request)),{headers:{'cache-control':'no-store'}});}catch(error){return integrationError(error);}
}
