# C｜P2 Next.js 挂载片段（维护人用）

这些文件属于根目录 `app/api/c/`（非 C 目录）。C 按 B 模块先例提供与
`packages/runtime` 同构的框架无关 handler；维护人确认后按以下内容挂载，
或由 C 在获得授权后提交。所有 handler 的语义与测试见
[交付文档](C_P2_DELIVERY_2026-10-02.md)。

前提：root `package.json` 增加 `"test:c": "tsx --test modules/c-report/tests/*.test.ts"`，
CI 增加 C 条件步骤（同 B 模式）。

## app/api/c/matches/route.ts

```ts
import { handleCreateMatch } from "@/modules/c-report/application/api/handlers";
import { createCApiContext } from "@/modules/c-report/adapters/memory/context";

const context = createCApiContext(); // 部署方替换为公共 runtime adapter

export async function POST(request: Request) {
  return handleCreateMatch(context, request);
}
```

## app/api/c/runs/[id]/route.ts

```ts
import { handleGetRun } from "@/modules/c-report/application/api/handlers";
import { createCApiContext } from "@/modules/c-report/adapters/memory/context";

const context = createCApiContext();

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleGetRun(context, request, id);
}
```

## app/api/c/reports/[id]/route.ts

```ts
import { handleGetReport } from "@/modules/c-report/application/api/handlers";
import { createCApiContext } from "@/modules/c-report/adapters/memory/context";

const context = createCApiContext();

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleGetReport(context, request, id);
}
```

## app/api/c/reports/[id]/export/route.ts

```ts
import { handleExportReport } from "@/modules/c-report/application/api/handlers";
import { createCApiContext } from "@/modules/c-report/adapters/memory/context";

const context = createCApiContext();

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleExportReport(context, request, id, new URL(request.url));
}
```

## app/api/c/reports/[id]/update/route.ts

```ts
import { handleUpdateReport } from "@/modules/c-report/application/api/handlers";
import { createCApiContext } from "@/modules/c-report/adapters/memory/context";

const context = createCApiContext();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleUpdateReport(context, request, id);
}
```

## adapters/memory/context.ts（如维护人不自建 context）

```ts
import type { CApiContext } from "../../application/api/handlers";
import { InMemoryCStores, createDemoIdentity } from "./in-memory";

/** 显式 demo/test context：内存存储 + fake 鉴权；非生产。 */
export function createCApiContext(): CApiContext {
  const stores = new InMemoryCStores();
  const identity = createDemoIdentity();
  return {
    stores,
    identity,
    readableProjectIds: async (principal) => identity.projectsOf(principal.userId),
    now: () => new Date().toISOString(),
    newRequestId: () => crypto.randomUUID(),
    newId: (prefix) => `${prefix}-${crypto.randomUUID()}`,
  };
}
```

## 协调事项

1. 以上路由与 context 文件由维护人提交（或授权 C 提交）；C 不单方面写根目录。
2. 生产环境必须替换 `adapters/memory`：持久存储 + 数据库唯一约束（幂等预留）、
   公共鉴权（packages/runtime.IdentityProvider）、持久任务调度（DurableScheduler）。
3. 内存 fake 不跨进程、不持久；重启即丢——不得部署为无鉴权 live。
