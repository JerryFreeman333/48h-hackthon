import {assertLocalRequest,getAHost,integrationError} from '@/packages/integration/a-host';
import {companyReportResponse} from '@/modules/research-agent/xmind/company';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{assertLocalRequest(request);return companyReportResponse(getAHost().owner(request),(await params).id,new URL(request.url).searchParams.get('format'));}catch(e){return integrationError(e);}}
