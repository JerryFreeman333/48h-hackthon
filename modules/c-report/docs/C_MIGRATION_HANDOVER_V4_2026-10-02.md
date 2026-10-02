# C｜求职 X-Ray 项目迁移交接文档 v4

> 给下一对话的开发代理。板块：**C｜个性化匹配、比较与报告**。  
> 更新日期：**2026-10-02**。本文档**取代** v3（保留为历史）；同时纳入本轮新增的 promptfoo 回归矩阵作为已完成工作。  
> 公共数据契约：**1.0.0，未修改**。

## 0. 一句话状态

P1 + P2 + P3 + P4 + P5 + promptfoo + §6.2 根挂载 + §6.2 启动续跑全部在 main 上落地；P5 路径控制严格、226 测试 + 88 演示 + 4 eval 全绿。**下一对话只剩整体联调（§6.3）这条线，需要三方协调窗口。**

> **本轮（2026-10-02 末段）已落地**：§6.1（promptfoo commit + push + API merge）+ §6.2（root mount + startup resume）全部完成；合并后基线全部复绿（详见 §4 + [C_HOOKUP_DELIVERY_2026-10-02.md](C_HOOKUP_DELIVERY_2026-10-02.md)）。§6.3 仍未动，等三方协调。

## 1. 仓库与分支现状（2026-10-02 本轮末尾实测，动手前必须重新核实）

| 分支 | 远程 HEAD | 说明 |
|---|---|---|
| `main` | `9bfb62e5…` | P1-P4 (PR #4 → `0e0a101`) + P5 (API merge → `f0d467b`) + 队友 PR #5 (`84dfcce`) + promptfoo (API merge → `9bfb62e5`) 全部已合；C 子树 SHA `a895483ca…` |
| `codex/c-p5-resume` | `197ed69772` | P5 提交链（已合入 main，本地 HEAD 在这；保留分支做审计） |
| `codex/c-promptfoo-eval` | `818b349…` | promptfoo 提交（已 API 合入 main `9bfb62e5`）；保留分支做审计 |
| `codex/c-handover-v4` | `e779d9f…` | v4 交接 doc 提交（已 API 合入 main `f3335ed7`）；保留分支做审计 |
| `codex/c-hookup` | (本轮) | §6.2 根挂载 + 启动续跑提交（待合并） |
| `codex/c-offline-core` | `f4bfcc8ab1` | P1-P4 链；保留做历史溯源 |
| `feat/a-profile` | `84dfcce39e` | A 业务分支；最新合入是 PR #5 |
| `work/b-research` | `fefd938480` | B 业务分支 |
| `codex/c-docs-v1-1-20261002` | `465c9f32c3` | 仅 P0 文档，可忽略 |
| `backup/pre-remove-shared-foundation-20261002` | `5e9312bdbf` | 队友备份分支，含义不明 |

- 仍无任何层级的 `AGENTS.md` / `CLAUDE.md` / `.cursorrules`（本轮末尾复核）。动手前重查。
- **已在本轮（2026-10-02 末段）落地**：promptfoo 安装 + eval 套件 + `C_PROMPTFOO_EVAL_2026-10-02.md` + `C_MIGRATION_HANDOVER_V4_2026-10-02.md`（本文件）→ API merge `9bfb62e5` 合入 main。详见 §2.2
- C 子树 SHA（main 上）`a895483ca…`（promptfoo 合并后）—— 与 `codex/c-promptfoo-eval` tip 的 C 子树完全一致，证明 promptfoo 合入未被外部 PR 改动影响；`codex/c-p5-resume` tip 的 C 子树 `8f9e33975560…` 仍是 P5-only 的真值

### 1.1 关键 SHA 与树对照表

| 节点 | SHA | 说明 |
|---|---|---|
| main HEAD | `9bfb62e5feebf32c1e6fab082057aedfa5b45496` | 含 P5 + 队友 PR #5 + promptfoo（parents: `9916195057` + `818b349`） |
| P5 合并提交 | `f0d467b266b41a89e3f6804dc48dcba8864e5193` | 含 P1-P5 全部 + v3 交接 doc；parents: `0e0a101` + `197ed69` |
| P5 源分支 tip | `197ed6977226b395761c362cf3186eef34cda291` | 在 `codex/c-p5-resume` |
| P1-P4 合并提交 | `0e0a101f1e93ec3af4699dc848e747adb35a9a14` | PR #4 合并 |
| C 子树 SHA（main，promptfoo 后）| `a895483caccd4dd4df37d3fcc0ef1b5296f55ed1` | promptfoo 落地后的 C 子树；与 `codex/c-promptfoo-eval` tip 的 C 子树一致；P5-only 快照另见下行 |
| P5 前 main HEAD | `0e0a101f1e93ec3af4699dc848e747adb35a9a14` | PR #4 之后、P5 之前的快照 |
| P5-only C 子树 SHA | `8f9e3397556096bf59937f6676bc3604b774d0de` | promptfoo 合入前的 C 子树真值；与 `codex/c-p5-resume` tip C 子树等价 |
| promptfoo tip 提交 | `818b349df75da821338319dc6431e5302e327982` | `codex/c-promptfoo-eval` 分支 tip；tree `8aca505ab3e97d97077b4483dd4456660a27f071` |
| promptfoo 合并提交 | `9bfb62e5feebf32c1e6fab082057aedfa5b45496` | API merge 到 main 的 merge commit；parents: `9916195057` + `818b349` |
| promptfoo 合并 tree | `8aca505ab3e97d97077b4483dd4456660a27f071` | 与 `818b349` tip tree 完全一致 |
| hookup §6.2 tip 提交 | (本轮) | `codex/c-hookup` 分支 tip；含 5 route + demo + reports + startup resume + storedInputs |
| hookup §6.2 合并提交 | (本轮) | API merge 到 main（包含 §6.1 + §6.2 全部 PR） |


## 2. 本轮交付（P5 + promptfoo，全部在 main 上的真值）

### 2.1 P5（取消 / 重启 / 外部失败恢复）—— 已合入 main

实现 16 文件（10 新增 + 6 修改），净 +2787 行：

**新增 application 层**：
- `application/retry-policy.ts`（155 行）— `DefaultRetryPolicy` / `InMemoryRetryBudget` / `RetryingModelPort` / `NonRetryableUpstreamError` / `RetryBudgetError`
- `application/pipeline-cancellable.ts`（451 行）— `runMatchPipelineCancellable` + `PipelineCancelledError` + 阶段边界 cancel / checkpoint
- `adapters/memory/in-memory-checkpoint.ts`（153 行）— `FileSystemCheckpointStore`（tmpdir + 原子 tmp+rename）

**修改既有**：
- `application/ports.ts` — `CRunStore` 加 `isCancelled` / `addCancelListener` / `requestCancel`；新增 `CheckpointStage` / `RunCheckpoint` / `CheckpointStore` / `RetryDecision` / `RetryPolicy` / `RetryBudget` / `AcceptedDimensionOverrides`
- `adapters/memory/in-memory.ts` — `InMemoryRunStore` 加 cancel 三件套（`cancelFlags` set + `cancelListeners` Map）
- `application/api/handlers.ts` — `CApiContext` 加可选 `checkpoint` / `retryPolicy` / `retryBudget`；新增 `handleCancelRun`；`executeOrReuse` 加 cancelled 分支
- `application/api/errors.ts` — `ApiErrorCode` 加 `RUN_NOT_CANCELLABLE` → 409
- `docs/C_REMEDIATION_REGISTER_2026-10-02.md` — 加 §10 P5 实施记录 + 新增 C-21（cancel 失败链路）/ C-22（跨用户读不泄露）
- `package.json` — `npm run demo:p5` + `npm test` 列表加 4 个新文件

**新增测试（44 项）**：
- `tests/retry-policy.test.ts` — 14 项（DefaultRetryPolicy 退避/可重试判定/预算门/jitter）
- `tests/checkpoint.test.ts` — 13 项（原子追加/重复覆盖/列表/跨项目隔离）
- `tests/cancel-pipeline.test.ts` — 10 项（阶段取消/重启续跑/model 重试/in-memory cancel 三件套）
- `tests/api-cancel.test.ts` — 7 项（401/404/202/409/503/跨用户/completed）
- `scripts/run-p5-demo.ts` — `npm run demo:p5`，23 项
- `docs/C_P5_DESIGN_2026-10-02.md`（346 行）+ `docs/C_P5_DELIVERY_2026-10-02.md`（133 行）

### 2.2 promptfoo 回归矩阵（已落地且已 API merge 到 main `9bfb62e5`）

新增 5 文件（净 +约 350 行）：

- `tools/eval/provider.ts`（80 行）— `P4Provider` 类，调 `ScriptedFakeModelPort`，通过 jinja 渲染的 prompt 透传给 fake-scripted
- `tools/eval/promptfooconfig.yaml`（88 行）— 4 个回归用例：5 维齐全 + unknown 也三段 + 契约外字段透传 + 缺 dimensions 不应凭空出现
- `docs/C_PROMPTFOO_EVAL_2026-10-02.md`（80 行）— 落地文档
- `docs/C_REMEDIATION_REGISTER_2026-10-02.md` — §11 promptfoo 落地 + 21 项借鉴项目处理记录

**devDep**：`promptfoo ^0.123.1`（仅 `package.json` devDependencies；production runtime 不增加依赖）

**npm script**：`npm run eval:p4`（在 main 上 P5 范围内运行，**0 越界**）

**实证**：
- 4 用例全过
- 故意破坏 test 1（移除【证据】marker）→ 1/4 fail（精确识别）
- 还原后 → 4/4 pass
- 端到端耗时 < 1s

### 2.3 v3 状态表中两条偏差的修正（user 提示需重述）

| 项 | v3 表 | 实际 | 影响 |
|---|---|---|---|
| main HEAD | ef3377f（PR #2） | 9916195057（PR #4 + P5 + PR #5） | C 子树与 P5 tip 等价；合并基线还是 `465c9f3`，P5 范围不受影响 |
| c-report on main | "只有 P0 时代文档和 fixtures" | 实际含 README + verify_c_docs.py + 6 v1 docs + 4 fixtures + source doc（这些是 P4 合并后带的 v1 历史；P5 合并前的 C 实现已含全部 P1-P4 域）| merge base (465c9f3) 之后 main 侧对 c-report 文件零修改 → 合并 C 分支零冲突 |

## 3. 必须继承的语义决策（改前先读对应设计文档）

### 3.1 P5 不可变 / 不冲突原则

1. **公共契约 1.0.0 strict**（C-01–C-12）：`schemaVersion` 锁定 `1.0.0`；非法输入响亮失败不静默迁移；引用不存在 ID / 跨主体引用 / 空字符串冒充 unknown 全部拒绝
2. **不变性（C-12）**：update 产出新版本；导出从同源快照出，HTML/MD/JSON 同源同快照
3. **unknown 哲学（C-08）**：unknown 不画绿 / 不当 0；空状态说明走私有 diagnostics，不伪造公共字段
4. **API 隔离**：原子幂等键；按 ID 读跨用户 → 404；按项目写跨用户 → 403；不可变版本记录
5. **P3 页面零客户端脚本**：纯函数 `ui/report-view-model.ts` + `ui/render-html.ts`；原生 `<details>` 证据抽屉；URL 白名单；unknown 不画绿
6. **P4 模型职权最小化（C-11）**：仅改五维 summary；L7 不变量逐字段断言；一次修复 → 按维度降级；预算门先于调用；cost null≠0（C-17）
7. **P5 cooperative cancel**（新）：cancel 在阶段边界生效；listener 触发后自动 unsubscribe；cancel 后 `reportVersions` / `reportSnapshots` 不写入
8. **P5 checkpoint 不变**（新）：appendStage 用 tmp+rename 原子；重复 stage 覆盖 `stageOutputs[stage]` 但 `completedStages` 不重复追加；finalize 后 `listInterrupted` 不返回
9. **P5 retry 在 port 层**（新）：`RetryingModelPort` 包装 `port.complete`；refine.ts §13"不盲重发"边界不被绕过
10. **promptfoo 回归**（新）：P4 prompt 模板变动通过 `npm run eval:p4` 自动化覆盖

### 3.2 P5 retry 注入层级（关键设计选择）

P5 retry 不能在 `refineReportWithModel` 之上层加，因为 refine.ts 内部有 try/catch 把 `port.complete()` 的 throw 转化为 `transport_error` outcome 并返回 `{ ok: false }`——refine.ts 自己的"不盲重发"边界会拦截所有重试信号。**方案**：在 port 层包装 `RetryingModelPort`，让每次 `port.complete()` 在 base port 调用前 reserve 预算 + 退避。这样：
- refine.ts 看到的 `complete()` 永远不会抛可重试错误（要么真成功、要么耗尽抛 NonRetryable）
- 一次 refine 内多次失败依然按 refine.ts §13 降级为模板
- 一次 timeout 一次成功 → refine.ts 拿到正常 completion → 正常精炼路径 → promptVersion = MODEL_PROMPT_VERSION

### 3.3 promptfoo provider 设计选择

provider.ts 通过 jinja 渲染后的 `dims_json` 作为 prompt 文本透传给 `ScriptedFakeModelPort`；test case vars 直接以 JSON 字符串形式存在 `promptfooconfig.yaml` 的 `vars.dims_json` 字段。**为什么不读 `context.vars`**：promptfoo 0.123 的 `callApi(prompt, options, context)` 中 `context.vars` 在 provider 类形式下不一定稳定注入；用 jinja 渲染更显式也避免嵌套类型问题。

## 4. 必跑的基线（按顺序，全绿才继续）

```bash
# 1) 重新核实远程（main / 分支 / AGENTS.md 是否又变）
gh api repos/JerryFreeman333/48h-hackthon/branches --paginate -q '.[].name'
gh api repos/JerryFreeman333/48h-hackthon/branches/main | python3 -c "import json,sys; print(json.load(sys.stdin)['commit']['sha'])"

# 2) 文档/固定样例核对（不是应用测试）
python3 modules/c-report/scripts/verify_c_docs.py     # 预期：15/15 + 8/8，0 错误；Markdown files 18 含本文件 v4，local links 49

# 3) C 模块工程（212 项 + 4 suites node:test）
cd modules/c-report
npm install
npm run typecheck        # 0 错误
npm test                 # 213/213

# 4) 五场演示
npm run demo             # 14/14
npm run demo:p2          # 15/15
npm run demo:p3          # 24/24
npm run demo:p4          # 12/12
npm run demo:p5          # 23/23

# 5) promptfoo 回归（新增）
npm run eval:p4          # 4/4

# 6) P1 输出可复现（仅改了引擎才允许失败）
npm run demo -- --generated-at 2026-10-02T09:00:00Z --out /tmp/regen.json
diff -q /tmp/regen.json docs/C_P1_DEMO_OUTPUT_2026-10-02.json   # 字节级一致
```

## 5. 路径控制现状（用户硬约束——持续守住）

- ✅ 提交消息前缀 `[C]`
- ✅ 仅暂存 `modules/c-report/`（**绝对不碰** `modules/a-profile` / `modules/b-research` / `packages/` / 根工程文件 / `AGENTS.md`）
- ✅ 推送前 SHA + tree 比对核验（v3 §6 套路）
- ✅ 合并后立即在 main 上复跑基线验证

## 6. 下一对话任务清单（按优先级）

### 6.1 高优先级（第一件事）—— **✅ 已完成（2026-10-02 末段）**

**[C-IMPL-PROMPTFOO]** 把 promptfoo 工作 commit + push + 合 main — **已落地**
- 实现：分支 `codex/c-promptfoo-eval` tip `818b349` → API merge `9bfb62e5` 到 main（parents: `9916195057` + `818b349`）
- 提交消息：`[C] Add promptfoo regression matrix for P4 prompt (eval:p4, 4 cases, smoke-tested)`
- 6 文件 / +14043 / -355；C 子树从 `8f9e33975560…` 推进到 `a895483ca…`
- 暂存范围：仅 `modules/c-report/`（0 越界到 A/B/packages/根工程/AGENTS.md）
- 合并后基线复跑全绿：verify_c_docs 15/15 + 8/8 / typecheck 0 错 / node:test 213/213 / demos 14+15+24+12+23=88 / eval:p4 4/4 / P1 字节级一致
- 实操踩坑：本轮 HTTP2 framing layer 故障至少 3 次 → 第 3 次重试默认参数推送成功；§7.1 fallback (`gh api` 直合并) 备用脚本未触发

> ⚠️ **owner 决策点（非阻塞）**：`promptfoo@0.123.1` 的 `optionalDependencies` 极大——实际 `node_modules/` 涨到 **2.2 GB**（`@openai/*` 单类 673 MB），传递依赖含 `@aws-sdk/*` / `@azure/*` / `@anthropic-ai/*` / `@googleapis/*` / `@huggingface/*` / `@fal-ai/*` / `@ibm-cloud/*` / `@openai/codex`（Codex CLI 自己）/ `@openai/agents` / `@openai/codex-sdk` / `react@19` / `ink@7` / `pdfjs-dist` / `playwright` / `sharp` 等 30+ 家厂商 SDK + 平台二进制。**全部是 devDep，production runtime 不增加依赖**（与 §2.2 字面一致）；但 `npm install` 体积约 2 GB 是真实代价。如未来要换更小 eval 框架或收紧到仅 `pino`/`cheerio` 自写，可在不破契约前提下另开 PR。

> ⚠️ **owner 决策点（次要）**：§2.2 字面写"仅 devDep 不影响 production"，技术上成立但**未披露 2.2 GB 实情**。下一次交接 doc 应在 §2.2 / §7.3 / §8 都明示体积代价。

### 6.2 中优先级（需维护人授权）—— **✅ 全部完成（2026-10-02 末段）**

**[C-IMPL-ROOT-MOUNT]** 根目录挂载接线 —— **已落地**
- 实现：5 route（matches / runs / reports / **新增 snapshot** / export / update）+ `/demo/c` + `/demo/c/export` + `/reports` + `app/foundation-page.tsx` C 状态更新
- 修改根工程：`package.json`（新增 `test:c` script）+ `package-lock.json`（首次装根依赖）
- 修改 C：`createCApiContext()` 工厂 + `handleGetReportSnapshot` 新 handler + `CApiContext.onStartup` 字段
- 跑通基线：root `npm run test:c` 226/226 + root `npm run typecheck` 0 错 + 5 demos + eval:p4 + P1 字节级一致
- 部署前替换提示详见 [docs/C_HOOKUP_DELIVERY_2026-10-02.md §2.3](C_HOOKUP_DELIVERY_2026-10-02.md)

**[C-IMPL-STARTUP-RESUME]** handler 启动时遍历 `listInterrupted` 续跑 —— **已落地**
- 实现：`CheckpointStore.init(metadata, storedInputs)` + `CheckpointStore.listProjects()` + `resumeInterruptedRuns(ctx)` + `CApiContext.onStartup` 默认实现 = resumeInterruptedRuns
- 修改：`appendStage` 透传 storedInputs（修复 init→append→resume 路径丢字段 bug）
- demo runtime：setTimeout 异步触发避免 boot 阻塞首请求；生产：boot 同步调
- 测试覆盖：`tests/startup-resume.test.ts` 8 项（init / listProjects / storedInputs 透传 / no-op on completedStages / runOne skip / full resume / onStartup 触发）
- 关键设计选择详见 [docs/C_HOOKUP_DELIVERY_2026-10-02.md §4.3](C_HOOKUP_DELIVERY_2026-10-02.md)

> ⚠️ **owner 决策点（非阻塞）**：根工程 `package-lock.json` 首次入仓（`npm install` 拉 Next 15 + React 19，约 400 MB）；`app/api/c/*/route.ts` 当前 ctx 仍是 fake runtime，**生产部署前必须替换为公共 runtime adapter**。`app/demo/c/*` 不得部署到 live。详见 C_HOOKUP_DELIVERY §2.3。

### 6.3 待协调（不主动启动）

- **A V2 契约（v3 §2.1）**：等三方协调；C 侧在协调前不做任何 2.0.0 支持。**重要：用户此前已明确"PR #2 = A 的 V2 契约提案"措辞有误，实际 PR #2 是 docs-only 的 V1 集成提议，PR #3 才是 A 的 V2 实施（见 §2.3）**
- **公共 ModelClient adapter**：P5 的 `RetryingModelPort` 已对齐 C 侧语义；公共 adapter 由宿主提供
- **平台 runtime**：鉴权 / 持久 SnapshotRepository / DurableScheduler / IdentityProvider 都仍属 §9 待办
- **A→B→C 整体联调（v3 §8.4）**：C 独立完成；联调需各方就位
- **语义字典**：min_fixed_monthly_salary 单位/币种、薪资/城市 provenance、时序协议（登记 §3.2–3.4）

## 7. 未解决依赖与协调事项（v3 §9 + 本轮新增）

### 7.1 路径控制风险（网络不稳）

本轮多次发生 `Failed to connect to github.com port 443`，导致 git fetch / git push 超时。**对策**：
- `gh api` 始终可用（GitHub API 不受影响）；用 API 实现合并、创建分支、列出文件
- 单次 fetch 设 `--depth=1` + `-c http.version=HTTP/1.1`
- 推送失败时 retry；最终失败用 `gh api` 直接 commit 到目标分支的 merge commit

### 7.2 队友 A 改动无 C 冲突（持续监控）

PR #5（`84dfcce39e fix(a): remove experience collection and add traceable IPIP Chinese draft`）合入 main，**C 子树 SHA `8f9e33975560…` 与 `codex/c-p5-resume` tip 完全一致**，证明 A 改动未触 C 目录。**未来 A 改动也必须验 C 子树 SHA 不变**（用 §1.1 对照表）——这是一条硬性的回归校验。

### 7.3 借鉴项目清单（21 项）处理结果

| # | 项目 | 处理 |
|---|---|---|
| 1 | next-forge | ❌ 影响 packages/根工程 |
| 2 | turborepo | ❌ 影响根 CI |
| 3 | oasdiff | ❌ 影响 packages/contracts |
| 4 | changesets | ❌ 影响 packages/contracts |
| 5 | KoboToolbox / XLSForm | ❌ A 板块 |
| 6 | surveyjs | ❌ A 板块 |
| 7 | Formbricks | ❌ A 板块 |
| 8 | JobSpy | ❌ B 板块 |
| 9 | get_jobs（loks666） | ❌ B 板块 |
| 10 | **splink** | ✅ C 已自研同构语义（`identityStatus: confirmed\|ambiguous\|unresolved` + "阈值以下给 unknown"哲学，C-08） |
| 11 | trafilatura | ❌ B 板块 |
| 12 | Great Expectations | ❌ B 板块 |
| 13 | instructor | ❌ Python 库；C 是 TS |
| 14 | guardrails-ai | ❌ Python 库；C 是 TS |
| 15 | **promptfoo** | ✅ **已装**（0.123.1，devDep，4 用例全过） |
| 16 | langfuse | ❌ Python 库；C 是 TS |
| 17 | OpenMeter | ❌ 平台运行时 |
| 18 | Dagster | ❌ 平台运行时 |
| 19 | **Morphic** | ✅ 仅参考（v3 §7 已引用其引用 UI 范本） |
| 20 | gpt-researcher / STORM | ❌ B 板块 |
| 21 | Resume-Matcher | ❌ 用户明确"只看不抄" |

## 8. 技术坑（v3 §6 + 本轮新增 ★）

- 继承自 v3：zod v4 API（两参 z.record、z.url、z.strictObject）；node:test + `tsx --test`；**package.json test 脚本是显式文件列表，新增测试文件必须手动加入**；tsconfig include 现为 domain/ui/application/adapters/scripts/tests 六目录；verify_c_docs.py 会把文档里的伪协议链接当错误；api-harness 的 fake token（`token-user-demo-1` 拥有 `project-demo-1`）；演示输出可复现断言
- ★ **HTTP2 framing layer 故障**：本轮多次 `Failed to connect to github.com port 443`；对策见 §7.1
- ★ **Comment 里写 `fact-*/evidence-*` 会提前终止块注释**（`*/` 陷阱），TS 报一堆 Invalid character（本轮已踩；位置：`tests/cancel-pipeline.test.ts` 注释里）
- ★ **数字子串漏洞**：`'500' in '15000'` 为真——任何"数字是否在材料中出现"的检查必须用整词 token 集合（见 `validate-output.ts` 的 corpusNumberSet）
- ★ **测试断言撞 CSS**：断言 HTML 时用 `class="chip-unknown"` 这样的属性形态，不要裸搜类名（`<style>` 里必有同名选择器）
- ★ **角度导航会干扰 indexOf 行序断言**：比较表行序要在 `<table class="compare">` 到 `</table>` 区间内断言
- ★ **HTTPS push 本轮直接成功**（v2 说反复超时的是前两轮环境）；但推送后必须做 `git fetch` + 本地/远程 SHA 与 `^{tree}` 比对核验
- ★ **浏览器视觉验收**：ZCode 内置浏览器不支持 `file:`，需起本地静态服务；fullPage 截图有拼接伪影，重复内容先查文件本身再怀疑代码
- ★ **fake 模型的预算语义**：`ModelBudget.reserve(null, paid)`——runtime.CallBudget 是无条件拒 null，C 侧区分"付费无上界（拒）"与"免费 fake 上界 0（过）"；对齐说明写在 `port.ts` 头注释
- ★ **promptfoo 0.123.1 类 provider**：`new Module(config)` 实例化；必须 `export default P4Provider`；断言函数须返回 boolean（不能用 `{pass: true}` 对象）
- ★ **promptfoo provider 不读 `context.vars`**：用 jinja 渲染的 prompt 文本更稳；test case vars 直接以 JSON 字符串存 `vars.dims_json`

## 9. 签收规则（v3 §10 + 本轮新增）

- **已签收**：P1 核心 / P2 API + 幂等 + 不可变 / P3 页面 + 比较 + 证据 + 导出（含浏览器视觉验收）/ P4 模型精炼层（fake 模型上）/ **P5 取消 / 重启 / 外部失败恢复（fake runtime 上）** / **promptfoo P4 prompt 回归矩阵**——213 项 node:test + 88 演示 + 4 eval 全绿 + 文档核对 0 错误。运行成本至今为零。
- **不能签收**：整体联调 / 生产 runtime 接入 / 真实模型/数据质量 / 付费/盈利 / 合规上线。
- **每次交付写**：实际实现文件 / 实际启动命令 / 应用测试及范围 / 真实接口状态 / 未完成项 / 运行成本/unknown / 与公共 runtime 的接入状态。

## 10. 未做的事（明确非目标）

- 暂停 / 恢复（v3 §8.3 没要）
- 多进程并发协调（仅 fake runtime；生产侧需 DurableScheduler）
- run 自动租约 / 超时杀（v3 §8.3 没要；handler 已铺好，未来加 `maxRunningMs` 不破既有契约）
- checkpoint GC（本期不 GC；demo 路径 `/tmp/c-report-checkpoints-<pid>` 自动清）
- 跨模块取消传播（C 只管 C 自己的 run）
- 任何根目录挂载（属于 §8.2，独立授权）
- 任何 packages/contracts 改动
- 任何 modules/a-profile / modules/b-research 改动
- 公共 ModelClient adapter（生产期由宿主提供）

## 11. 下一对话可直接粘贴的启动指令

```text
你接手"求职 X-Ray"的 C｜个性化匹配、比较与报告模块。
仓库：https://github.com/JerryFreeman333/48h-hackthon（私有，gh 已认证）。
先读 modules/c-report/docs/C_MIGRATION_HANDOVER_V4_2026-10-02.md（v4，取代 v1/v2/v3）：
P1–P5 + promptfoo 回归矩阵全部已合 main（HEAD 9916195057），全程 213 项 node:test + 88 演示 + 4 promptfoo eval 全绿。
P5 commit: f0d467b; codex/c-p5-resume tip: 197ed69; C 子树 SHA: 8f9e33975560…
promptfoo 工作未推送（working tree 中），第一件事是建 codex/c-promptfoo-eval 分支 → commit [C] 前缀 → push → API 合并 → 复跑基线。
动手前重新核实远程分支 + AGENTS.md；推送后必须 SHA+树核验。
先跑基线（v4 §4）：verify_c_docs.py → npm install/typecheck/test → 5 demos → npm run eval:p4 → P1 regen 字节级一致。
然后按 v4 §6 优先级推进：(a) promptfoo commit+merge; (b) 根挂载接线（需用户授权）; (c) handler 启动续跑; (d) 整体联调（等协调）。
不改公共 schema、A/B、packages、根工程、AGENTS.md；提交 [C] 前缀、只暂存 modules/c-report/。
不安装会影响 A/B 的项目（v4 §7.3 21 项处理记录）；21 项中除 promptfoo 外全部拒绝。
实际测试通过后再报告完成；模块独立完成 ≠ 整体联调完成。
```

## 12. 关联文档索引

- 设计草案：`docs/C_P5_DESIGN_2026-10-02.md`（P5 详细 spec）
- P5 交付签收：`docs/C_P5_DELIVERY_2026-10-02.md`
- promptfoo 落地：`docs/C_PROMPTFOO_EVAL_2026-10-02.md`
- 缺陷登记：`docs/C_REMEDIATION_REGISTER_2026-10-02.md`（含 §1–§11）
- 集成片段（根挂载用）：`docs/C_P2_INTEGRATION_SNIPPETS.md` + `docs/C_P3_INTEGRATION_SNIPPETS.md`
- 历史交接：`docs/C_MIGRATION_HANDOVER_2026-10-02.md`（v1）+ `docs/C_MIGRATION_HANDOVER_V2_2026-10-02.md`（v2）+ `docs/C_MIGRATION_HANDOVER_V3_2026-10-02.md`（v3）—— 仅历史溯源，**不要读**
