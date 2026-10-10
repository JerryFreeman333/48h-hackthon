import {assertLocalRequest,getAHost,integrationError} from '@/packages/integration/a-host';
import {companySource} from '@/modules/research-agent/xmind/company';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string;evidenceId:string}>}){try{assertLocalRequest(request);const p=await params;return Response.json(companySource(getAHost().owner(request),p.id,p.evidenceId),{headers:{'cache-control':'no-store'}});}catch(e){return integrationError(e);}}
