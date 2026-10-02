# C｜P2 API、快照、幂等与权限：交付与签收记录

- 板块：**C**；日期：**2026-10-02**；文档版本：**1.0**。
- 对应规格：[C 新开发规格 v1.1](C_DEVELOPMENT_SPEC_V1.1_2026-10-02.md) §16 P2（五个接口、幂等、权限钩子、不可变版本）。
- 公共契约：**schemaVersion = 1.0.0，未修改**。
- 性质声明：**P2 在显式内存 fake runtime 上独立完成并有真实测试**；不是生产部署，不是整体联调签收。

## 1. 实际实现范围（全部在 modules/c-report/ 内）

| 文件 | 内容 |
|---|---|
| `application/ports.ts` | C 私有端口（结构与 `packages/runtime` 的 IdentityProvider/Project/Principal/RunRecord/RunStatus/SnapshotRepository 逐形状等价，公共实现就绪后 adapter 直换）：CRunStore（DurableScheduler 语义 + updateStatus + **原子幂等预留**）、ReportIndexStore、SnapshotRepository 报告版本/私有快照 |
| `adapters/memory/in-memory.ts` | 显式内存 fake runtime（非生产）：InMemoryCStores + FakeIdentityProvider（Bearer token → 用户，项目-所有者映射）。幂等预留是单事件循环同步临界区，对应生产的「INSERT run + INSERT 幂等记录」单事务 + 作用域唯一约束 |
| `application/api/errors.ts` | C 领域错误 + API 层错误 → HTTP 状态映射（401/403/404/409/422/500/503）与公共错误结构 `{error:{code,message,retryable,requestId}}` |
| `application/api/handlers.ts` | 五个框架无关 handler（标准 Request/Response，与 B 模块路由同构）：POST /api/c/matches、GET /api/c/runs/:id、GET /api/c/reports/:id、GET /api/c/reports/:id/export?format=md、POST /api/c/reports/:id/update |
| `application/markdown.ts` | MD 导出：从不可变快照确定性渲染；转义（HTML 实体、行首结构标记、内联强调/链接语法）；URL 协议白名单（仅 http/https，其余隐藏）；无 URL 显示提供方式不伪造链接 |
| `scripts/run-p2-demo.ts` | 端到端演示：创建→run→报告→导出→幂等复用→409→401→越权404/403→更新新版本→422（15 项 PASS/FAIL） |
| `tests/api-*.test.ts`（3 文件 + harness） | P2 真实测试（29 项，见 §3） |

## 2. 关键语义决策

1. **幂等 = 原子预留**：`enqueueWithReservation` 把「幂等记录 + run 插入」放在同一临界区（生产 = 数据库唯一约束 + 冲突读取）。相同键相同输入 → 复用既有 run（202 同 runId）；同键不同输入 → 409 `IDEMPOTENCY_KEY_CONFLICT`。并发三连发测试证明恰好一个 run。
2. **非法输入不落 run**：结构/绑定/引用错误在预留前由管线校验拒绝（422/409），不产生任务记录。
3. **跨用户按 ID 读取 → 404**（不泄露其他用户资源存在性）；**按项目寻址的写路径（update）→ 403**。项目不存在 → 403（对齐 `packages/runtime.requireProjectAccess`）。
4. **run 状态与 completeness 分离**：执行成功且 complete_for_scope → completed；执行成功但关键主题有缺口 → partial（demo 样例即 partial）；管线领域错误 → failed。
5. **报告版本不可变**：版本记录用 insert-only 存储（重复主键抛错）；update 产生 v(n+1) 与新 run；v1 逐字节不变有测试。报告索引（所有者/最新版本指针）是唯一可追加元数据。
6. **输入哈希冻结执行配置**：canonical JSON（键排序、数组保序、拒绝非有限值）覆盖 profile/intentContext/bundle + rule/prompt 版本。
7. **profile.mode 必须等于项目模式**（409）：demo 数据不得混入 live 项目。
8. **导出从快照渲染**：MD 与 JSON/页面读同一快照；导出中不再次模型重写（当前无模型，模板版本明确标注）。

## 3. 实际测试结果（2026-10-02 本轮真实运行）

- `tsc --noEmit`：0 错误。
- `npm test`（tsx --test / node:test）：**10 文件 112 测试全部通过**（P1 83 + P2 29）。P2 覆盖：
  - 基本流：202{runId,status,reportId}→run 查询→报告 schema 自检→deprioritize/fail 不变；空候选 run 完成、results=[]、diagnostics.insufficientNote。
  - 预创建拒绝：INVALID_JSON/MISSING_FIELD/PROFILE_NOT_CONFIRMED/SCHEMA_VERSION_UNSUPPORTED(409)/BINDING_MISMATCH(409)/MODE_CONFLICT(409)，且不产生 run。
  - 鉴权矩阵：无 identity→503 NOT_CONFIGURED；无凭据/无效凭据→401；幽灵项目→403；他人按 ID 读 run/报告/导出→404；他人更新→403。
  - 幂等：同键同输入复用同 runId；同键不同输入 409；不同键独立 run；**Promise.all 三并发同键 → 恰好一个 run**；幂等作用域按用户隔离。
  - 不可变版本：update → v2 新 run；v1 记录逐字节不变；重复同键更新不产生 v3；非法更新 422 后最新版本仍 v1；更新不存在报告 404。
  - 导出：内容/Content-Type/两次逐字节一致；`<script>`、一级标题、代码栅栏、伪协议图片链接（`javascript:` URL 的 Markdown 图片语法）全部被转义/拆解；UNSUPPORTED_FORMAT 422。
- `npm run demo:p2`：**15/15 PASS**（含越权可见拒绝与版本不可变展示）。
- P1 回归：83 项全过；P1 演示输出未受影响。

## 4. 未完成项

- **生产 runtime 接入**（登记 C-16 的生产半边）：持久存储与唯一约束、公共鉴权 adapter、持久任务调度/取消/恢复（P5）、UsagePort/ModelPort（P4）。当前 adapters/memory 是显式 fake：单进程、重启即丢，**不得部署为无鉴权 live**。
- **根目录挂载**：`app/api/c/` 五个路由文件 + context 由维护人提交（或授权 C 提交），见 [C_P2_INTEGRATION_SNIPPETS.md](C_P2_INTEGRATION_SNIPPETS.md)；root `test:c` 脚本与 CI 条件步骤同批。
- **P3**：页面、五维/比较视图、证据抽屉、导出入口与可访问性。
- **P4**：模型接入、七层语义校验、预算（packages/runtime.CallBudget 已有，接入在 P4）。
- **P5**：取消/重启/外部失败、A→B→C 联调。

## 5. 真实接口状态

无任何真实数据供应商/模型/支付调用；未发生成本（costMinor 未产生）；CI 尚未运行 C（协调项）；测试全部基于公共合成样例，不构成语义准确率证明。
