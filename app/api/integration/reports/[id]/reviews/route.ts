import {assertLocalRequest,getAHost,integrationError,readJson} from '@/packages/integration/a-host';
import {getDemoFlow} from '@/packages/integration/demo-flow';
export const dynamic='force-dynamic';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{assertLocalRequest(request);return Response.json(await getDemoFlow().addXmindReview(getAHost().owner(request),(await params).id,await readJson(request)),{headers:{'cache-control':'no-store'}});}catch(e){return integrationError(e);}}
