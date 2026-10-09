import { readFileSync } from "node:fs";
import { join } from "node:path";
export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!["style.css", "needs-app.mjs", "quick-unsure.mjs"].includes(name)) return new Response("Not found", { status: 404 });
  let content=readFileSync(join(process.cwd(), "modules/a-profile/src", "ui", name), "utf8");
  if(name==="needs-app.mjs") content=content.replace("esc(out.JobNeedsSnapshot.handoff.message)", "esc('七主题关注事项将进入岗位调查清单与报告；没有对应核实材料时保持未知。')").replace("七主题侧写已在A内实现，B/C仍需对接这份附表。现有五类现实条件保留公共契约。", "确认后的七主题将进入岗位报告；重点未核实的处理方式以你的选择为准。");
  return new Response(content, { headers: { "content-type": name.endsWith("css") ? "text/css" : "text/javascript" } });
}
