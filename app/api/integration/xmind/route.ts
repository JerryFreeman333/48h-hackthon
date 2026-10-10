import {assertLocalRequest,integrationError} from '@/packages/integration/a-host';
import {xmindCapabilities} from '@/modules/research-agent/xmind/execution';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 try{assertLocalRequest(request);return Response.json(xmindCapabilities(),{headers:{'cache-control':'no-store'}});}
 catch(error){return integrationError(error);}
}
