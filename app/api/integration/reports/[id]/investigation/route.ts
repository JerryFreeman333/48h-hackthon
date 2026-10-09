import {assertLocalRequest,getAHost,integrationError} from '@/packages/integration/a-host';
import {getDemoFlow} from '@/packages/integration/demo-flow';
export const dynamic='force-dynamic';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){
 try{assertLocalRequest(request);const {id}=await context.params;return Response.json(getDemoFlow().investigation(getAHost().owner(request),id),{headers:{'cache-control':'no-store'}});}
 catch(error){return integrationError(error);}
}
