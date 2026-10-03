import {realShowcaseHtml} from '@/packages/integration/real-showcase';
import {exportsDisabled} from '@/packages/integration/export-policy';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 if(new URL(request.url).searchParams.has('format'))return exportsDisabled();
 return new Response(await realShowcaseHtml(),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
}
