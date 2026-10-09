import {assertLocalRequest,getAHost,integrationError,readJson} from '@/packages/integration/a-host';
import {saveV3Import} from '@/modules/research-agent/v3-sources';
import {agentConfiguration} from '@/modules/research-agent/config';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 try{
  assertLocalRequest(request);
  if(!agentConfiguration().enabled||!agentConfiguration().v3Enabled)throw Object.assign(Error('V3 材料导入尚未开启'),{status:409});
  if(Number(request.headers.get('content-length')??0)>25_100_000)throw Object.assign(Error('材料过大'),{status:413});
  const data=await readJson(request,25_100_000);
  const a=getAHost();return Response.json(saveV3Import(a.owner(request),data),{headers:{'cache-control':'no-store'}});
 }catch(error){return integrationError(error);}
}
