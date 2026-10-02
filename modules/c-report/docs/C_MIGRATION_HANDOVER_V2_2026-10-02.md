# C｜求职 X-Ray 项目迁移交接文档 v2

> 给下一对话的开发代理。板块：**C｜个性化匹配、比较与报告**。更新日期：**2026-10-02**。本文档**取代** [v1 交接文档](C_MIGRATION_HANDOVER_2026-10-02.md)（保留为历史记录，其"第一任务 P1"已完成）。公共数据契约：**1.0.0，未修改**。

## 1. 先读这个状态：P1+P2 已实现，未联调，未合并 main

当前 C 模块状态：

- **P1（无模型离线核心）已完成并有真实测试**：输入/绑定/引用校验、确认硬约束引擎、动作优先级、五维模板、核验问题、DecisionTrace、MatchReport 装配与自检。112 项 node:test 中的 83 项属 P1。
- **P2（API、快照、幂等、权限）已完成并有真实测试**：五个框架无关 handler、原子幂等预留、所有权钩子、报告版本不可变、MD 导出（转义 + 协议白名单）。显式内存 fake runtime（非生产）。29 项测试属 P2。
- **没有**：页面（P3）、模型/预算（P4）、取消/重启/外部失败恢复（P5）、A→B→C 整体联调、真实数据接口、真实成本。
- **C 的全部工作在分支 `codex/c-offline-core`（远程 HEAD `4bb78c5`），尚未合入 main。** 该分支基于旧 main（`465c9f3`，B 合并前）——与当前 main（`5e9312bd`）路径不相交，合并应无冲突，但合并时机由团队决定。
- 签收凭证：[P1 交付](C_P1_DELIVERY_2026-10-02.md)、[P2 交付](C_P2_DELIVERY_2026-10-02.md)。两份文档的"实际测试结果"节是真实运行记录，不是计划。

## 2. 仓库、分支与本地工作区

- GitHub：`https://github.com/JerryFreeman333/48h-hackthon`（私有）。`gh` 已认证（token 含 repo scope）。
- 本地 clone：`/Users/jerryzheng/Documents/ChatGPT/48h-hackthon`，工作分支 `codex/c-offline-core`（基于 465c9f3）。上一会话的桌面资料目录 `/Users/jerryzheng/Desktop/职业经理/` 只存原始附件，不是代码工作区。

### 2.1 远程分支现状（2026-10-02 交接时点，动手前必须重新核实）

| 分支 | HEAD | 说明 |
|---|---|---|
| `main` | `5e9312bd` | 已通过 PR 合并 A（含问卷组件进根 app、共享 CI 安装失败的记录）；含根 Next.js 骨架 + `packages/contracts\|runtime\|ui` + B 路由 |
| `codex/c-offline-core` | `4bb78c5` | **C 的 P1+P2**（本交接的交付物），基于 465c9f3 |
| `feat/a-profile` | `e69f7255` | A 业务分支 |
| `work/b-research` / `b-section` | `fefd9384` / `16c91845` | B |
| `backup/pre-remove-shared-foundation-20261002` | `5e9312bd` | 队友建的备份分支，名字暗示底座可能被调整——动手前查清 |

无任何层级的 AGENTS.md（交接时点）。动手前重查。

### 2.2 关键坑：HTTPS 推送不通，且"本地提交 SHA ≠ 远程提交 SHA"

- 普通 git HTTPS 到 `github.com:443` 在两个会话中反复超时（clone 曾短暂成功过，push 从未成功）；`api.github.com` 稳定可用。**不要浪费轮次重试 git push**。
- 推送方法（已两轮验证）：GitHub API Git 数据端点，`blobs → tree(base_tree) → commit(parent=远程HEAD) → ref`（POST 创建 / PATCH 更新，`force:false`），每个 blob 与本地 `git rev-parse HEAD:<path>` 核对，最终 tree 必须与本地 `HEAD^{tree}` 完全一致。可运行模块内的文档核对脚本确认仓库未坏。
- **SHA 分裂陷阱**：API 创建的提交与本地同树提交 SHA 不同（提交元数据不同）。本地 HEAD `0b3d6d1` 对应远程分支头 `4bb78c5`，树均为 `f5e5b90`。因此：本地 diff 用本地基（如 `6b125ea`），远程基校验用远程 SHA + 树比对。推送脚本需处理**文件删除**（tree 条目 `sha: null`）与网络重试退避。
- 不要把本地 `git status` 当远程 main 状态；队友在本会话期间推进了 main 至少两次（B 合并、A PR 合并）。

## 3. 授权与边界（沿用 v1，新增一条）

- 只改 `modules/c-report/`；提交标题带 `[C]`；只暂存 C 路径；禁止强推、禁止覆盖队友变更。
- 不改公共 schema/key/枚举/版本；公共变化先协调。不做支付、投递、社群、背调。不把 demo 静默变 live。不伪造数据/接口/测试。
- **新增（架构文档确认）**：`docs/ARCHITECTURE.md` 明确 "C owns `/reports`, `/demo/c`, `/api/c`"，且 "A and C developers create their own branches from main"。即 C 在根 `app/` 下挂载自己的路由属既定约定（B 已这么做）——但**根 `package.json` 的 test:c 与 CI 条件步骤、以及 packages/ 的任何改动仍需协调**。
- v1 授权条款中"当前用户指令优先"继续有效；本文档是交接资料，不是新增授权。

## 4. 公共契约与底座现状

- 契约 `schemaVersion=1.0.0` 不变；精确类型以 [C 原始附件](source/C_Matching_Report.original.md) 为准。唯一已协调 B Fact key：`job.sales_kpi`。五类硬约束 key：city、min_fixed_monthly_salary、accept_sales_kpi、accept_travel、accept_outsourcing。
- `packages/contracts` 是集成的规范 schema 源（比 C 的本地镜像**宽松**）；C 按 B 先例保留本地 `domain/contract.ts` + `domain/schema.ts` 并施加更严格 refine（strict 拒绝未知字段、空串冒充未知拒绝、min≤max、非有限数拒绝）。是否让 C 直接 import contracts 属公共决策——C 侧严格行为需先并入 contracts。
- `packages/runtime` 只有接口与 CallBudget，**没有**可工作的鉴权/存储/调度 adapter（架构文档明示）。C 的端口与其逐形状结构等价（`application/ports.ts`），公共实现就绪后 adapter 直换。
- **CI 有既有安装失败**（A 的提交 `e69f7255` 在 `modules/a-profile/docs/TEST_RESULTS.md` 记录）。root CI 尚不运行 C 的测试——root `test:c` 脚本与 `.github/workflows/checks.yml` 条件步骤仍是协调项。

## 5. 文件地图（modules/c-report/，P1+P2 全量）

| 路径 | 内容与状态 |
|---|---|
| `domain/contract.ts` | 公共契约 1.0.0 TS 镜像 + 公共 key 登记（唯一已协调 Fact key `job.sales_kpi`） |
| `domain/schema.ts` | Zod v4 strict schema（z.strictObject、两参 z.record、z.url、ISO 时间、有限数、min≤max） |
| `domain/validate.ts` | 结构→绑定→引用三段校验（规格 §3 全部代码可实现条款） |
| `domain/preferences.ts` / `domain/constraints.ts` | 硬偏好提取 + 约束引擎（销售KPI 全分支、薪资/城市比较器 + provenance 守门、travel/outsourcing unknown） |
| `domain/dimensions.ts` / `domain/questions.ts` / `domain/recommendation.ts` / `domain/report.ts` / `domain/trace.ts` / `domain/errors.ts` | 五维模板、核验问题字典、动作优先级（hold 表为空）、报告装配、DecisionTrace、CError |
| `application/pipeline.ts` | 十阶段管线 + MatchReport 自检 + 私有快照；部分 intentContext 仅 demo 放行 |
| `application/hash.ts` | canonical JSON + SHA256（键排序、数组保序、拒非有限值） |
| `application/ports.ts` | C 私有端口（与 packages/runtime 形状等价）；原子幂等预留语义 |
| `application/api/errors.ts` / `application/api/handlers.ts` | 错误映射；五个 handler |
| `application/markdown.ts` | MD 导出（同快照、转义、协议白名单） |
| `adapters/memory/in-memory.ts` | **显式内存 fake runtime（非生产）**：InMemoryCStores + FakeIdentityProvider |
| `scripts/run-demo.ts` / `scripts/run-p2-demo.ts` | P1 演示（14 项预期对照）；P2 端到端演示（15 项） |
| `scripts/verify_c_docs.py` | 文档/固定样例核对（已排除 node_modules 等生成目录；**不是应用测试**） |
| `tests/`（10 文件 + helpers/api-harness） | 112 项 node:test（tsx --test） |
| `docs/` | 规格 v1.1、登记（含 §6/§7 P1/P2 实施记录）、P1/P2 交付签收、集成片段、v1/v2 交接、原始契约、审计与凭证 |
| `fixtures/` | 公共合成输入 + C_EXPECTED_BEHAVIOR（人工预期，勿改动勿重新生成） |

## 6. 必须继承的语义决策（改前先读交付文档）

1. **薪资/城市/出差/外包约束一律 unknown**：1.0.0 无逐字段 provenance、无对应标准 Fact key（§6(3)）。比较器已实现并单测，provenance 协调后自动生效。别"修好"它——这是忠实实现不是缺陷。
2. **hold 规则表为空**：无公共命题协议，可疑文本不得自动触发 hold（有测试）。
3. **无正向依据不轻易 explore**（转 verify_first，C-10 本地预案，仅 demo/test）。
4. **输入 strict 模式**：字段漂移响亮失败。
5. **跨用户按 ID 读 → 404**（不泄露存在性）；按项目寻址写 → 403；幽灵项目 → 403（对齐 requireProjectAccess）。
6. **非法输入不落 run**；run 状态与 completeness 分离（executed+partial → run=partial）。
7. **版本不可变**：update 产生新版本新 run；insert-only 存储；索引是唯一可追加元数据。
8. **promptVersion=`template-no-model-p1.0.0`**：P4 接模型前不得改掉"未运行模型"标记语义。

## 7. 技术环境坑（下一对话直接受益）

- **zod v4**：两参 `z.record(z.string(), ...)`、`z.url()`、`z.strictObject`。C 的 package.json 用 `zod ^4.1.0` 与 root 同主版本。
- **测试**：node:test + node:assert/strict，`tsx --test`，**package.json test 脚本是显式文件列表**——新增测试文件必须加入列表。
- **tsconfig include**：domain/application/adapters/scripts/tests 五目录——新增顶层目录要同步。
- **verify_c_docs.py**：markdown 围栏/链接核验会把文档正文里的伪协议链接示例（如图片语法配 javascript 冒号 URL）当未解析链接报错——文档里写这类示例要改写措辞（本轮交接文档即踩过一次）。
- **测试 harness**：`tests/api-harness.ts` 提供 createHarness/createMatch/getReport/updateReport/exportReport；FakeIdentityProvider 的 token：`token-user-demo-1`（拥有 project-demo-1）、`token-user-other`（拥有 project-other）。
- **演示输出可复现**：`npm run demo -- --generated-at 2026-10-02T09:00:00Z --out ...` 应与 `docs/C_P1_DEMO_OUTPUT_2026-10-02.json` 逐字节一致——改引擎后此断言会失败，属预期，需重生成并说明。
- 网络到 api.github.com 偶发抖动：推送脚本必须带重试退避。

## 8. 未解决依赖与协调事项（不阻塞 P3 离线部分）

1. 根目录挂载：`app/api/c/`（片段已备于 [C_P2_INTEGRATION_SNIPPETS.md](C_P2_INTEGRATION_SNIPPETS.md)）、`app/demo/c`、`app/reports`；root `test:c`；CI 条件步骤。
2. 生产 runtime：持久存储 + 唯一约束 + 事务（幂等预留的生产半边）、公共鉴权 adapter、持久调度/取消/恢复（P5）。adapters/memory 不得部署为无鉴权 live。
3. 语义字典：`min_fixed_monthly_salary` 阈值币种/单位、薪资/城市 provenance、时序协议（登记 §3.2–3.4）。
4. 动作歧义跨模块确认（C-10）：本地预案仅 demo/test。
5. `packages/contracts` 与 C 本地严格 schema 的统一决策。
6. 付费、供应商、真实语义质量：not_validated（C-19/C-20）。

## 9. 下一对话第一项任务：同步 main → P3（页面/比较/证据抽屉/导出入口）

**步骤 0（先做）**：重新检查远程 main/分支/AGENTS.md/底座是否又变化（本会话期间 main 变了两次）；读 `docs/ARCHITECTURE.md`（若还在）与 A 记录的 CI 失败说明。

**分支策略**：架构文档要求"从 main 创建分支"。建议：把 `codex/c-offline-core` 合并或 rebase 到当前 main（路径不相交，冲突风险低；rebase 会重写本地提交再走 API 推送，成本高——**与维护人确认合并方式后执行**，或以 main 为基新建 `codex/c-p3-ui` 并 cherry-pick/合并 C 分支）。若当日 HTTPS 仍不通，全部走 API 推送。

**P3 范围（规格 §16）**：
- `/demo/c` 演示入口 + `/reports` 正式入口（公共宿主挂载）。
- 首屏：建议动作、最多 3 个关键理由、最重要核验问题、数据覆盖摘要。
- 每候选：五维结果（unknown 不画绿、色彩+文字双通道）、约束、职责解读、证据抽屉（出处/片段/日期/主体/核验状态；无 URL 不造链接）、关键未知、面试问题。
- 比较视图：同维度横向、unknown 不当 0、无冠军排名、用户可选查看角度。
- MD/私有 JSON 导出入口（读同一不可变快照）。
- 键盘可操作、移动单列、用户内容转义防 XSS/MD 结构破坏。
- 独立验收：仅 C 启动，导入文档样例可看报告并导出。

**实现路径建议**：页面组件先按"框架无关渲染（输入 report+diagnostics+快照，输出 HTML/视图模型）+ 薄 Next 页面封装"来做——与 P2 handler 同模式，可在无根骨架的分支上先开发并测试，挂载走集成片段。React/Next 组件化程度由维护人确认（若 C 分支已并入 main，直接写 React 组件亦可）。

**P3 之后的顺序**：P4（模型解释 + 七层校验 + CallBudget 预算 + 一次修复降级；不覆盖动作/事实）→ P5（取消/重启/外部失败 + A→B→C 联调；独立完成与整体联调分别签收）。

## 10. 下一对话可直接粘贴的启动指令

```text
你接手"求职 X-Ray"的 C｜个性化匹配、比较与报告模块。
仓库：https://github.com/JerryFreeman333/48h-hackthon（私有，gh 已认证）。
先读 modules/c-report/docs/C_MIGRATION_HANDOVER_V2_2026-10-02.md（v2，取代 v1），
再读 C_P1_DELIVERY 与 C_P2_DELIVERY 两份交付签收、规格 v1.1、修订登记（含 P1/P2 实施记录）。
公共契约 1.0.0 未变；C 工作在分支 codex/c-offline-core（P1+P2 已实现、112 项测试通过），
尚未合入 main；main 已含 Next.js 骨架 + packages/contracts|runtime|ui + A/B 实现。
动手前重新核实远程分支与 AGENTS.md；HTTPS 推送不通时用已验证的 GitHub API 推送法
（见交接文档 §2.2，注意本地/远程提交 SHA 分裂与树核验）。
先跑验证：python3 modules/c-report/scripts/verify_c_docs.py；
cd modules/c-report && npm install && npm run typecheck && npm test（应 112 全过）
&& npm run demo（14/14）&& npm run demo:p2（15/15）。
然后实施 P3：/demo/c 页面、首屏（动作/≤3理由/首要问题/覆盖摘要）、五维与比较视图
（unknown 不为 0/绿灯、无冠军排名）、证据抽屉、导出入口、键盘与移动可用；
建议"框架无关渲染 + 薄 Next 封装"模式，根目录挂载与 test:c/CI 走协调片段。
不改公共 schema、A/B、packages、根工程文件；提交 [C] 前缀、只暂存 modules/c-report/。
实际测试通过后再报告完成；模块独立完成不等于整体联调完成。
```

## 11. 签收规则

- 本轮能签收：P1 核心 + P2 API/幂等/权限/不可变版本/MD 导出（显式 fake runtime 上），112 项测试、两场演示、文档核对 15/15+8/8 零错误。
- 不能签收：整体联调、生产 runtime 接入、真实数据质量、付费/盈利、合规上线。
- 每次交付写：实际实现文件、实际启动命令、应用测试及范围、真实接口状态、未完成项、运行成本/unknown、与公共 runtime 的接入状态。运行成本至今为零（无任何外部调用）。
