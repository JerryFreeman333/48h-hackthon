import {assertLocalRequest,getAHost,integrationError} from '@/packages/integration/a-host';
import {getDemoFlow} from '@/packages/integration/demo-flow';
export const dynamic='force-dynamic';
export async function GET(request:Request,context:{params:Promise<{id:string;evidenceId:string}>}){
 try{assertLocalRequest(request);const {id,evidenceId}=await context.params;
  return Response.json(getDemoFlow().source(getAHost().owner(request),id,evidenceId),{headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
 }catch(error){return integrationError(error);}
}
