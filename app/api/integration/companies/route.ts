import {assertLocalRequest,getAHost,readJson,integrationError} from '@/packages/integration/a-host';
import {lookupCompanies,investigateCompany,listCompanyReports} from '@/modules/research-agent/xmind/company';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{assertLocalRequest(request);const p=new URL(request.url).searchParams;return Response.json(p.get('history')==='1'?{reports:listCompanyReports(getAHost().owner(request))}:{candidates:lookupCompanies(p.get('q')??'')},{headers:{'cache-control':'no-store'}});}catch(e){return integrationError(e);}}
export async function POST(request:Request){try{assertLocalRequest(request);return Response.json(await investigateCompany(getAHost().owner(request),await readJson(request)));}catch(e){return integrationError(e);}}
