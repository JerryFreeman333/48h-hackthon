import { readFileSync } from "node:fs";
import { join } from "node:path";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  const url=new URL(request.url),returnTo=url.searchParams.get("returnTo")==="/analyze"?"/research":url.searchParams.get("returnTo"),requested=url.searchParams.get("sessionId");
  const destination=returnTo==="/research"&&requested?"/research?sessionId="+encodeURIComponent(requested):returnTo;
  const back=returnTo && (returnTo==="/research" || /^\/revise\/report-[a-zA-Z0-9-]{1,100}$/.test(returnTo)) ? ` · <a href="${destination}">${returnTo==="/research"?"调查公司与岗位":"返回岗位重新分析"}</a>` : "";
  const html = readFileSync(join(process.cwd(), "modules/a-profile/src/ui/needs.html"), "utf8")
    .replace('href="/style.css"', 'href="/a-assets/style.css"')
    .replace('src="/needs-app.mjs"', 'src="/a-assets/needs-app.mjs"')
    .replace("</footer>", ' · <a href="/research">调查公司与岗位</a> · <a href="/history">我的报告</a>' + back + '</footer>');
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
