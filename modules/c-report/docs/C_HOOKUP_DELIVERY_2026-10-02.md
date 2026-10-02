# C｜§6.2 挂载交付（root mount + startup resume）

> 日期：2026-10-02。配套 [v4 §6.2 任务清单](C_MIGRATION_HANDOVER_V4_2026-10-02.md)。
> 本文档取代 [v3 §8.2 集成片段](C_MIGRATION_HANDOVER_V3_2026-10-02.md) 的"待维护人挂载"前提——本轮 owner 授权后由 C 自行落地。

## 0. 一句话

C 完成 §6.2 两条线：[C-IMPL-ROOT-MOUNT] 根目录挂载接线 + [C-IMPL-STARTUP-RESUME] handler 启动续跑。C 现可独立停止开发，226 项 node:test + 88 项 demo + 4 项 promptfoo eval 全绿，C 子树 SHA `15ef2e9620…`（v4 提交 `f3335ed7` 之后追加）。

## 1. 实操链路

| 项 | SHA / 文件 |
|---|---|
| 起始 main HEAD | `f3335ed724c5bf323bc20c7d0ed5758942617404`（v4 提交 / §6.1 + 文档刷新） |
| 本轮 §6.2 合并提交 | (待) `git rev-parse` |
| C 子树 SHA 演变 | `8f9e33…` → `a895483…`(promptfoo) → `a895483…`(PR#6 A 不触) → `15ef2e96…`(v4) → (本轮：resume + 接口增强，预期非空 diff) |

## 2. [C-IMPL-ROOT-MOUNT] 实现

### 2.1 新增根工程文件

| 路径 | 行为 |
|---|---|
| `app/api/c/matches/route.ts` | POST 创建报告 |
| `app/api/c/runs/[id]/route.ts` | GET 读 run / DELETE 取消 run |
| `app/api/c/reports/[id]/route.ts` | GET 公共 MatchReport + diagnostics |
| `app/api/c/reports/[id]/snapshot/route.ts` | **新增** 返回私有 snapshot（含 bundle 上下文）/reports 用 |
| `app/api/c/reports/[id]/export/route.ts` | GET `format=md\|json` 公共 MD / 私有复现包 |
| `app/api/c/reports/[id]/update/route.ts` | POST 增量更新（产出新版本） |
| `app/demo/c/page.tsx` | 演示入口（fake runtime + 公共 fixtures） |
| `app/demo/c/export/route.ts` | 演示导出（走真实 handleExportReport） |
| `app/reports/page.tsx` | 正式报告页：fetch `/api/c/reports/:id` + `:id/snapshot` → buildReportViewModel → renderReportHtml |

### 2.2 修改根工程文件

- `app/foundation-page.tsx` —— C 状态 `<StateBadge>` 由"待模块接入"更新为 "独立就绪 ✓（P1-P5 + promptfoo + 根挂载 + 启动续跑，221 tests / 88 demos / 4 eval 全绿）"
- `package.json` —— 新增 `test:c` script：root 入口跑 C 全部 21 个 test 文件（`npx tsx --test modules/c-report/tests/*.test.ts`）

### 2.3 部署前必改项（生产宿主）

- `app/api/c/*/route.ts` 当前的 `createCApiContext()` 返回 fake runtime（InMemoryCStores + demoIdentity）；生产必须替换：
  - `stores` → 持久 SnapshotRepository（DB 唯一约束 + 幂等）
  - `identity` → `packages/runtime.IdentityProvider`（真实 IAM）
  - `checkpoint` → 持久 CheckpointStore（数据库表 / 文件系统）
  - `model` → `packages/runtime.ModelClient`（真实 ModelPort）
  - `retryPolicy` + `retryBudget` → 公共配置
- `app/reports/page.tsx` 的 self-fetch 在 SSR 阶段走同进程 in-memory fetch；生产部署到多节点时改为公共 API base URL。
- `app/demo/c/*` 与 `app/demo/c/export/route.ts` **不得**部署到 live——fake runtime + fake Bearer，无鉴权能力。

## 4. [C-IMPL-STARTUP-RESUME] 实现

### 4.1 C 侧新增 / 修改

| 文件 | 变更 |
|---|---|
| `application/ports.ts` | `CheckpointStore` 加 `init(metadata)` + `listProjects()` 方法；新增 `CheckpointMetadata` 接口（reportId / version / ruleVersion / promptVersion / inputHashes / **storedInputs**） |
| `adapters/memory/in-memory-checkpoint.ts` | `FileSystemCheckpointStore.init` 实现（tmp+rename 原子，no-op on existing completedStages）+ `listProjects` + **`appendStage` 透传 storedInputs**（之前会丢，本轮修复） |
| `application/pipeline-cancellable.ts` | `appendCheckpoint` 在首次 `appendStage` 前调 `init(metadata, storedInputs)`，落 inputs 到 checkpoint 供续跑读取 |
| `application/api/handlers.ts` | `CApiContext` 新增可选 `onStartup?: (ctx: CApiContext) => Promise<unknown>` 字段 |
| `application/api/startup-resume.ts`（新） | `resumeInterruptedRuns(ctx, options?)` 主入口 + `runOne(ctx, ckpt)` 单按原子路径 + `onStartup(ctx)` 默认实现 |
| `adapters/memory/context.ts`（新） | `createCApiContext()` 工厂：默认注入 `onStartup = resumeInterruptedRuns`；`createCApiContextWithCheckpoint()` 工厂：默认 FileSystemCheckpointStore |
| `tests/startup-resume.test.ts`（新） | 8 项测试（详见 §5） |

### 4.2 续跑流程

```
boot
  └─ ctx.onStartup(ctx)             // demo: setTimeout(0); 生产: 同步
       └─ resumeInterruptedRuns(ctx)
            ├─ store.listProjects()  // 全部 project
            └─ for each project: store.listInterrupted(projectId)
                 └─ for each ckpt: runOne(ctx, ckpt)
                      ├─ skip if !storedInputs（旧 ckpt 文件）
                      ├─ skip if requestCancel 已标记
                      ├─ runMatchPipelineCancellable(input, ctx)   // 自动跳过已完成阶段
                      ├─ ctx.stores.reportVersions.insert / reportSnapshots.insert / reportIndex.appendVersion
                      ├─ ctx.stores.runs.updateStatus('completed'|'partial')
                      └─ ctx.checkpoint.finalize
```

### 4.3 关键设计选择

- **storedInputs 存 checkpoint**：resume 需要 `profile + intentContext + bundle` 才能重跑 `runMatchPipelineCancellable`，但原 checkpoint 数据只有 partialOutputHash。本轮在 `init(metadata)` 时把完整 inputs 写入 checkpoint（向后兼容：旧 ckpt 文件无 `storedInputs` 字段，graceful skip）。
- **appendStage 透传 storedInputs**：实现里 `appendStage` 必须保留 init 写入的 storedInputs——本轮修了 bug（之前的实现从 existing 重建 RunCheckpoint 时没透传 storedInputs，导致 resume 失败）。
- **不绕过既有 runMatchPipelineCancellable**：resume 仍走 cancellable pipeline，自动利用缓存跳过已完成阶段，与新 run 走完全相同代码路径（一致性优先于优化）。
- **failures finish future update**：resume 失败 / 完成都调 `checkpoint.finalize(finalStatus)`，避免下次启动再尝试；resume 失败计入 `failed` 计数。
- **Cancel listener 兼容**：`runOne` 在 resume 前调 `ctx.stores.runs.isCancelled(...)`，已标记 cancel 的 run 走 `skip_cancelled` 不浪费重跑。

## 5. 测试覆盖

### 5.1 新增测试

- `tests/startup-resume.test.ts`（8 项）：
  - `createCApiContext` 默认 `onStartup = resumeInterruptedRuns`
  - `resumeInterruptedRuns` 无 `ctx.checkpoint` → 空 report
  - `CheckpointStore.init` 写入 storedInputs + reportId/version + 可读取
  - `CheckpointStore.init` 已存在 + completedStages 时 no-op 保留
  - `CheckpointStore.listProjects` 列出所有有 ckpt 数据的 project
  - `runOne` 老 ckpt 无 storedInputs → `skipped_no_inputs`
  - `resumeInterruptedRuns` demo inputs 完整管线：appendStage init→硬_prefs→per_job_eval 三段；finalize completed/partial
  - demo runtime onStartup 触发 resume

- `tests/api-snapshot.test.ts`（5 项）：
  - GET snapshot 返回 `{ snapshot: artifact }` 含 bundle
  - GET snapshot 无凭据 → 401 UNAUTHENTICATED
  - GET snapshot 不存在的 reportId → 404
  - GET snapshot 与 `/reports/:id` 互补：snapshot 含 bundle，`/reports/:id` 仅 diagnostics
  - GET snapshot 跨用户读不泄露存在性 → 404

### 5.2 总数变化

| 项 | 之前 | 本轮后 |
|---|---|---|
| node:test | 213 | **226**（+13） |
| demo 套数 | 88 | 88 |
| promptfoo eval | 4 | 4 |
| suites | 40 | **42** |

## 6. 与公共 runtime 接入状态（更新）

| 接入点 | C 侧状态 | 宿主侧需求 |
|---|---|---|
| `application/ports.ts:ModelPort` | 接口 + ScriptedFakeModelPort + RetryingModelPort | 实现 `ModelPort` 接口的真实 adapter，注入到 `CApiContext.model` |
| 鉴权 (`token-user-demo-1` / `project-demo-1`) | fake Bearer token + CApiContext.userResolver | 真实 IAM 注入适配 |
| `SnapshotRepository` | InMemorySnapshotRepository（demo runtime） | 持久实现 |
| `DurableScheduler` | 不需要（fake runtime 同步） | 生产用 |
| `CheckpointStore` | FileSystemCheckpointStore（demo runtime） | 持久实现 |
| **启动续跑 `onStartup`** | **本轮实现**：demo runtime 默认 + 生产 boot 同步触发 | **生产侧 boot hook** |
| **根工程挂载 `/api/c/*` + `/demo/c` + `/reports`** | **本轮实现**：5 route + demo + reports + root test:c | 拉真实 runtime adapter 替换 `createCApiContext()` |

## 7. Owner 决策点

- **§6.2 体积代价**：本轮 C 侧新增 ~530 行（context.ts 61 + startup-resume.ts 161 + handlers ~+30 + tests 248 + v4 hookup doc）；新增 0 个 mount。root 侧新增 9 文件 + 修改 2 文件 + package-lock.json（npm install 拉 ~400MB Next.js + React）。与 §6.1 的 2.2 GB promptfoo 比，本轮代价小。
- **§6.2 风险点**：
  - `app/api/c/*/route.ts` 当前 ctx 仍是 fake，生产部署前必须替换
  - `app/demo/c/*` 不得部署到生产
  - `app/reports/page.tsx` 的 self-fetch 在多节点部署时改为公共 endpoint
- **§6.3 协调项**（未动）：A V2 公约 / 公共 ModelClient adapter / 平台 runtime / A↔B↔C 整体联调 / 语义字典

## 8. 与 v4 §6.2 对照

| v4 §6.2 | 本轮状态 |
|---|---|
| `[C-IMPL-ROOT-MOUNT]` | ✅ 已完成（5 route + demo + reports + foundation-page） |
| `[C-IMPL-STARTUP-RESUME]` | ✅ 已完成（onStartup + resumeInterruptedRuns + CheckpointStore 增强 + storedInputs 透传 + 8 项测试） |
| 维护人授权 / 协调窗口 | ✅ 本轮由 owner 显式授权："我们目前的开发目标是板块C作为一个单独的板块可以停止开发" |
