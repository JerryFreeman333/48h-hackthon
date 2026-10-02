# C｜个性化匹配、比较与报告

> 板块：**C**。本目录仅由 C 负责；不代表 A、B 或总控已实现。文档版本 **1.3**；公共数据契约保持 **1.0.0**。

## 当前交付状态（2026-10-02，P1+P2+P3+P4 已实施并与公共底座对齐）

**P1 无模型离线核心已完成**：输入/绑定/引用校验、确认硬约束引擎、动作优先级、五维模板、核验问题、C 私有 DecisionTrace 与快照。

**P2 API/快照/幂等/权限已完成（显式内存 fake runtime 上）**：五个框架无关 handler（创建 202/run 查询/报告/导出/更新新版本）、原子幂等预留（同键复用、同键不同输入 409、并发恰一 run）、所有权钩子（503/401/403/404 语义）、报告版本不可变（更新产生新版本，旧版本逐字节不变）、导出转义与协议白名单。

**P3 页面/比较/导出入口已完成（框架无关渲染层上）**：`ui/report-view-model.ts`（展示决策：首屏动作/≤3 理由/首要问题/覆盖摘要、逐候选约束/五维/关键未知/核验问题/证据、比较视图）+ `ui/render-html.ts`（独立 HTML、零客户端脚本、双通道状态、原生 `<details>` 证据抽屉、单列移动布局）+ `export?format=json` 私有复现包 + 显式 demo 宿主运行时（`adapters/memory/demo-runtime.ts`）。unknown 不画绿/不当 0、比较无冠军排名、页面/MD/JSON 读同一不可变快照（均有测试）。浏览器桌面/移动视觉验收通过。

**P4 可选模型精炼层已完成（脚本化 fake 模型上，零真实调用）**：C 私有 ModelPort/ModelBudget（付费无上界拒绝、次数/金额双门）、固定 prompt（材料作为数据 + 注入声明）、七层输出校验（结构/引用主体/声明支持/时间/整词数字/个人/L7 不变量）、恰好一次修复、按维度降级回退纯模板；动作/约束/事实永不被模型覆盖（逐字段断言）。

**169 项 node:test 测试通过**（P1 83 + P2 29 + P3 35 + P4 22）；P1 演示 14/14 人工预期、P2 演示 15/15、P3 演示 24/24、P4 演示 12/12 通过；全程无网络、无真实模型、无外部服务。fake runtime 与 demo 宿主单进程、重启即丢，**不得部署为无鉴权 live**。

对齐说明：C 的端口结构与 `packages/runtime` 逐形状等价，公共实现就绪后 adapter 直换。根目录挂载（`app/demo/c`、`app/reports`、app/api/c 五个路由 + root test:c/CI 条件步骤）属根文件协调项，片段见 [P2 集成片段](docs/C_P2_INTEGRATION_SNIPPETS.md)与 [P3 集成片段](docs/C_P3_INTEGRATION_SNIPPETS.md)；`/reports` 上线前提为公共 runtime 就绪。

尚未实现：P5 故障恢复与整体联调；生产 ModelClient adapter（公共 runtime 缺位）。**模块独立完成 ≠ 整体联调完成。** 逐项状态见 [P1 交付签收](docs/C_P1_DELIVERY_2026-10-02.md)、[P2 交付签收](docs/C_P2_DELIVERY_2026-10-02.md)、[P3 交付签收](docs/C_P3_DELIVERY_2026-10-02.md) 与[修订登记](docs/C_REMEDIATION_REGISTER_2026-10-02.md)。

## 模块输入输出

- 输入：已确认 `UserProfile`、`CandidateBundle`，以及用于校验绑定的可信 `SearchIntent` 上下文（优先完整快照；部分上下文仅 demo 显式放行）。
- 输出：公共 `MatchReport`（schemaVersion `1.0.0`）+ C 私有快照/trace/diagnostics + 框架无关页面 ViewModel/HTML。
- C 只解释已有材料，不查外网、不设计问卷、不修改 B Fact。
- 公共维护人提供鉴权、任务、模型客户端与集成；没有公共生产能力时，仅做显式本地 demo/test。

## 独立运行

在仓库根目录：

```bash
# 文档/固定样例核对（不是应用测试）
python3 modules/c-report/scripts/verify_c_docs.py

# C 模块工程：真实单元/契约测试与独立演示
cd modules/c-report
npm install
npm run typecheck   # tsc --noEmit
npm test            # tsx --test（node:test，169 项）
npm run demo        # P1：公共样例 → MatchReport + 14 项人工预期对照（无网络、无模型）
npm run demo:p2     # P2：五个 API + 幂等/越权/版本不可变端到端走查（fake runtime）
npm run demo:p3     # P3：视图模型 → HTML 渲染 → 导出/转义/角度/空候选逐项对照
npm run demo:p4     # P4：模型精炼 → 七层校验 → 一次修复降级 → 注入/预算/不变量对照
```

`npm run demo -- --out <path> --generated-at <ISO时间>` 可写出可复现的演示输出；已提交样例见 `docs/C_P1_DEMO_OUTPUT_2026-10-02.json`。

## 阅读顺序

1. [C 迁移交接文档 v2](docs/C_MIGRATION_HANDOVER_V2_2026-10-02.md)——新对话从这份开始（P1+P2 状态、仓库/分支现状、技术坑、任务与启动指令）。
2. [C 新开发规格 v1.1](docs/C_DEVELOPMENT_SPEC_V1.1_2026-10-02.md)——实现依据。
3. [C P1 交付签收](docs/C_P1_DELIVERY_2026-10-02.md)、[P2 交付签收](docs/C_P2_DELIVERY_2026-10-02.md)、[P3 交付签收](docs/C_P3_DELIVERY_2026-10-02.md)与[P4 交付签收](docs/C_P4_DELIVERY_2026-10-02.md)——实际实现/测试/缺口。
4. [C 缺陷修订与公共待协调登记](docs/C_REMEDIATION_REGISTER_2026-10-02.md)——含 P1–P4 实施记录。
5. [C 原始附件只读副本](docs/source/C_Matching_Report.original.md)——公共契约与三份公共输入。
6. [P2 Next.js 集成片段](docs/C_P2_INTEGRATION_SNIPPETS.md)与 [P3 集成片段](docs/C_P3_INTEGRATION_SNIPPETS.md)——根目录挂载协调用。
7. [v1 迁移交接文档](docs/C_MIGRATION_HANDOVER_2026-10-02.md)——历史记录，其任务已完成。
8. [前期可行性审查](docs/C_FEASIBILITY_AND_DELIVERY_PLAN_2026-10-02.md)、[历史输入核对记录](docs/contract-audit-2026-10-02.json)、[文档核对结果](docs/C_DOCUMENT_VERIFICATION_2026-10-02.json)、[远程交付凭证](docs/C_REMOTE_DELIVERY_RECEIPT_2026-10-02.json)——背景与执行记录。

## 代码结构（P1+P2+P3）

```text
domain/       # 契约镜像、Zod schema、校验、约束引擎、五维/问题/动作/报告装配、trace
application/  # 十阶段管线、canonical 哈希、私有 run 诊断、五 API handler（含 json 导出）、MD 序列化、ports、model/（P4 模型精炼层）
ui/           # P3 框架无关渲染：report-view-model.ts（展示决策）+ render-html.ts（独立 HTML、零脚本）
adapters/     # 显式内存 fake runtime + demo 宿主运行时（非生产）；公共 runtime 就绪后 adapter 直换
fixtures/     # 公共合成输入与人工预期（未由业务代码生成）
scripts/      # verify_c_docs.py（文档核对，非应用测试）、run-demo / run-p2-demo / run-p3-demo（独立演示）
tests/        # node:test 单元/契约测试（147 项，tsx --test 运行）
docs/         # 规格、登记、迁移、交付签收、集成片段、核对与凭证记录
```

## 协作与 main 隔离

- C 的提交名称使用 `[C]` 或 `C｜` 前缀。
- 工作分支 `codex/c-...`（当前 `codex/c-offline-core`）；只暂存本目录，不使用无范围 `git add .`。
- 加入 main 前重新核对文件 diff，禁止删改 A/B、公共 schema、总控及根工程文件。
- 不创建第二套鉴权、模型客户端、支付或公共队列。
- 公共字段/key/枚举变更先协调，不因页面方便私自新增。
- 同一公司/岗位资料对不同用户必须保持不变（有测试约束）。

## 下一步

P5：取消/重启/外部失败恢复与 A→B→C 整体联调（独立完成与整体联调分别签收）；生产 ModelClient adapter 与 /reports 上线前提（公共 runtime）由维护人确认。根目录路由挂载与 test:c/CI 接线待维护人协调（片段已备）。
