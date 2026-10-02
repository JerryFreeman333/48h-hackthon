/**
 * /demo/c —— C 模块演示入口（§6.2 [C-IMPL-ROOT-MOUNT]：P3 集成片段）。
 *
 * 显式 demo 用途（adapters/memory/demo-runtime.ts 内置 fake runtime + 公共合成 fixtures）：
 * - 单进程内存 fake runtime；重启即丢；fake Bearer 鉴权
 * - 不得部署为无鉴权 live；生产宿主必须替换为公共 runtime adapter
 *
 * URL 参数：
 * - angle=<dimensionKey>：比较视图查看角度（identity_credit / role_clarity 等）
 * - 若非法 angle，回退 null（中性视图）
 */
import { renderDemoReportHtml } from "@/modules/c-report/adapters/memory/demo-runtime";

export const dynamic = "force-dynamic";

export default async function DemoCPage({
  searchParams,
}: {
  searchParams: Promise<{ angle?: string }>;
}) {
  const { angle } = await searchParams;
  const html = await renderDemoReportHtml({ angle: angle ?? null });
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
