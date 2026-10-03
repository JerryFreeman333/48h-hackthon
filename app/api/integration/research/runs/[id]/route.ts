import {assertLocalRequest,getAHost,integrationError} from '@/packages/integration/a-host';
import {getResearchJobs} from '@/packages/integration/research-jobs';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 try{assertLocalRequest(request);const owner=getAHost().owner(request),{id}=await params;return Response.json(getResearchJobs().read(owner,id),{headers:{'cache-control':'no-store'}});}catch(error){return integrationError(error);}
}
