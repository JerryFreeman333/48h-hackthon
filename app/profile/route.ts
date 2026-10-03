import { readFileSync } from "node:fs";
import { join } from "node:path";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  const url=new URL(request.url),returnTo=url.searchParams.get("returnTo"),requested=url.searchParams.get("sessionId");
  const destination=returnTo==="/analyze"&&requested?"/analyze?sessionId="+encodeURIComponent(requested):returnTo;
  const back=returnTo && (returnTo==="/analyze" || /^\/revise\/report-[a-zA-Z0-9-]{1,100}$/.test(returnTo)) ? ` · <a href="${destination}">${returnTo==="/analyze"?"用需求分析一份JD":"返回岗位重新分析"}</a>` : "";
  const html = readFileSync(join(process.cwd(), "modules/a-profile/src/ui/needs.html"), "utf8")
    .replace('href="/style.css"', 'href="/a-assets/style.css"')
    .replace('src="/needs-app.mjs"', 'src="/a-assets/needs-app.mjs"')
    .replace("</footer>", ' · <a href="/analyze">分析岗位JD</a> · <a href="/history">我的报告</a>' + back + '</footer>');
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
