# C｜P3 Next.js 挂载与集成片段（维护人用）

P3 页面层按「**框架无关渲染 + 薄 Next 封装**」实现（与 P2 handler 同模式）：
渲染与展示决策全部在 `modules/c-report/ui/`（纯函数、node:test 已测），
根目录 `app/` 只做薄封装。以下文件属于根目录（非 C 目录），由维护人提交，
或由 C 在获得授权后提交。**C 未单方面写根目录。**

前提（与 P2 片段合并执行）：

1. root `package.json`：`"test:c": "tsx --test modules/c-report/tests/*.test.ts"`
   （C 的 `npm test` 是显式文件列表，根目录用通配符即可覆盖新增测试文件）。
2. CI（`.github/workflows/checks.yml`）：按 B 模式增加 C 条件步骤。
3. C 模块自带依赖（zod/tsx/typescript devDependencies）已在 `modules/c-report/package-lock.json` 锁定；
   根目录 CI 若在 root 依赖下运行 C 测试，zod 主版本一致（^4.1.0），无需新增 root 依赖。

## 1. 演示入口：app/demo/c/page.tsx

```tsx
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
```

说明：

- `renderDemoReportHtml` 返回**完整独立 HTML 文档字符串**。上式将其注入
  Next 布局内（可接受：零脚本、内联样式自包含）；若维护人希望整页接管，
  可改用 route handler `app/demo/c/route.ts` 直接 `new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } })`。
- 该页运行在**显式内存 fake runtime**（`adapters/memory/demo-runtime.ts`）上，
  种子化经真实 `handleCreateMatch` 路径。**非生产，不得部署为无鉴权 live**
  （边界与 P2 相同：单进程、重启即丢、fake Bearer 鉴权）。
- 查看角度经 `?angle=<dimensionKey>` 服务端重渲染（零客户端脚本，键盘可用）。

## 2. demo 导出路由：app/demo/c/export/route.ts

```ts
import { demoExportResponse } from "@/modules/c-report/adapters/memory/demo-runtime";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const reportId = url.searchParams.get("report") ?? "";
  const format = url.searchParams.get("format") ?? "md";
  return demoExportResponse(reportId, format, url.origin);
}
```

说明：`demoExportResponse` 走**真实 `handleExportReport`**（含所有权校验路径），
由 demo 宿主注入 demo Bearer token——这不是无鉴权导出能力，仅限显式 demo 路由。
`format=md`（公共报告）与 `format=json`（私有复现包，artifactType=
`c_private_report_snapshot_v1`，含完整输入快照与 trace，仅所有者可导出）。

## 3. 正式入口：app/reports/page.tsx（生产宿主骨架）

```tsx
export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  // 生产宿主：等待公共 runtime（IdentityProvider + SnapshotRepository）就绪后接入：
  //   report+snapshot → buildReportViewModel → renderReportHtml。
  // 依赖 packages/runtime 的鉴权/存储实现（目前不存在）；接入前 /reports 不上线。
  throw new Error("/reports 等待公共 runtime（鉴权 + 快照存储）；接入前不上线");
}
```

- 生产宿主必须替换 demo runtime：`packages/runtime` 的 IdentityProvider +
  SnapshotRepository；页面从 `GET /api/c/reports/:id` 与（新增协调项）
  **快照读取端点**取数后 `buildReportViewModel` → `renderReportHtml`。
- 快照读取端点：P2 的 `GET /api/c/reports/:id` 已返回 `{report, diagnostics}`；
  页面/比较还需要 bundle 上下文（岗位标题/公司名）。可选方案（维护人定）：
  a) `GET /api/c/reports/:id/snapshot`（C 可按需补充 handler，复用 locateReport 所有权语义）；
  b) 页面服务端直接读 SnapshotRepository adapter。
  在此之前 `/reports` 保持骨架，**不上线**。

## 4. API 路由（与 P2 片段相同，export 已支持 format=json）

`app/api/c/` 五个路由见 [C_P2_INTEGRATION_SNIPPETS.md](C_P2_INTEGRATION_SNIPPETS.md)。
P3 变更仅一处语义：`export` 的 `format` 参数现接受 `md | json`；
不支持格式仍 422 `UNSUPPORTED_FORMAT`。片段无需修改。

## 5. CI 条件步骤示例

```yaml
- name: C module tests
  if: ${{ hashFiles('modules/c-report/**') != '' }}
  run: npm run test:c
```

## 6. 协调事项（新增）

1. 以上根目录文件由维护人提交（或授权 C 提交）；C 不单方面写根目录。
2. `/reports` 上线前提：公共 runtime（鉴权/持久快照）就绪；demo runtime 不得复用为生产。
3. `test:c` 与 CI 条件步骤（同 P2 遗留项）。
4. 生产快照读取方式（§3 方案 a/b）确认后，C 补齐对应 handler 或文档。
