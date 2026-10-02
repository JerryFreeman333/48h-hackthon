# C｜个性化匹配、比较与报告

> 板块：**C**。本目录仅由 C 负责；不代表 A、B 或总控已实现。文档版本 **1.1**；公共数据契约保持 **1.0.0**。

## 当前交付状态（2026-10-02，P1 已实施并与公共底座对齐）

**P1 无模型离线核心已完成并通过真实测试**：输入/绑定/引用校验、确认硬约束引擎（销售KPI fail、薪资/城市确定性框架 + provenance 守门）、动作优先级、五维模板、核验问题、C 私有 DecisionTrace 与快照。83 项 node:test 测试通过（zod v4，与公共底座同主版本）；公共样例演示产出 `deprioritize` 且 14 项人工预期全部满足；全程无网络、无模型、无外部服务。

对齐说明：公共维护人已向 main 合并 Next.js 应用骨架与 `packages/contracts|runtime|ui`，C 已按 B 模块先例对齐（zod v4、node:test + tsx、本地契约镜像）。root `test:c`/CI 接线属根文件变更，已列入协调项，见 [P1 交付签收 §2.1](docs/C_P1_DELIVERY_2026-10-02.md)。

尚未实现：API/持久化/幂等（P2）、页面/比较/导出（P3）、模型解释与语义校验（P4）、故障恢复与整体联调（P5）。逐项状态见 [P1 交付签收](docs/C_P1_DELIVERY_2026-10-02.md) 与[修订登记的 P1 实施记录](docs/C_REMEDIATION_REGISTER_2026-10-02.md)。

## 模块输入输出

- 输入：已确认 `UserProfile`、`CandidateBundle`，以及用于校验绑定的可信 `SearchIntent` 上下文（优先完整快照；部分上下文仅 demo 显式放行）。
- 输出：公共 `MatchReport`（schemaVersion `1.0.0`）+ C 私有快照/trace/diagnostics。
- C 只解释已有材料，不查外网、不设计问卷、不修改 B Fact。
- 公共维护人提供鉴权、任务、模型客户端与集成；没有公共生产能力时，仅做显式本地 demo/test。

## 独立运行（P1）

在仓库根目录：

```bash
# 文档/固定样例核对（不是应用测试）
python3 modules/c-report/scripts/verify_c_docs.py

# C 模块工程：真实单元/契约测试与独立演示
cd modules/c-report
npm install
npm run typecheck   # tsc --noEmit
npm test            # tsx --test（node:test，83 项）
npm run demo        # 公共样例 → MatchReport + 14 项人工预期对照（无网络、无模型）
```

`npm run demo -- --out <path> --generated-at <ISO时间>` 可写出可复现的演示输出；已提交样例见 `docs/C_P1_DEMO_OUTPUT_2026-10-02.json`。

## 阅读顺序

1. [C 新开发规格 v1.1](docs/C_DEVELOPMENT_SPEC_V1.1_2026-10-02.md)——实现依据。
2. [C P1 交付签收](docs/C_P1_DELIVERY_2026-10-02.md)——本轮实际实现/测试/缺口。
3. [C 缺陷修订与公共待协调登记](docs/C_REMEDIATION_REGISTER_2026-10-02.md)——含 P1 实施记录。
4. [C 迁移交接文档](docs/C_MIGRATION_HANDOVER_2026-10-02.md)——上下文与禁止越界事项。
5. [C 原始附件只读副本](docs/source/C_Matching_Report.original.md)——公共契约与三份公共输入。
6. [前期可行性审查](docs/C_FEASIBILITY_AND_DELIVERY_PLAN_2026-10-02.md)与[历史输入核对记录](docs/contract-audit-2026-10-02.json)——背景，不覆盖新版约束。
7. [C 文档核对结果](docs/C_DOCUMENT_VERIFICATION_2026-10-02.json)与[C 远程交付凭证](docs/C_REMOTE_DELIVERY_RECEIPT_2026-10-02.json)——实际执行记录。

## 代码结构（P1）

```text
domain/       # 契约镜像、Zod schema、校验、约束引擎、五维/问题/动作/报告装配、trace
application/  # 十阶段管线、canonical 哈希、私有 run 诊断
fixtures/     # 公共合成输入与人工预期（未由业务代码生成）
scripts/      # verify_c_docs.py（文档核对，非应用测试）、run-demo.ts（独立演示）
tests/        # node:test 单元/契约测试（83 项，tsx --test 运行）
docs/         # 规格、登记、迁移、交付签收、核对与凭证记录
```

## 协作与 main 隔离

- C 的提交名称使用 `[C]` 或 `C｜` 前缀。
- 工作分支 `codex/c-...`（P1 为 `codex/c-offline-core`）；只暂存本目录，不使用无范围 `git add .`。
- 加入 main 前重新核对文件 diff，禁止删改 A/B、公共 schema、总控及根工程文件。
- 不创建第二套鉴权、模型客户端、支付或公共队列。
- 公共字段/key/枚举变更先协调，不因页面方便私自新增。
- 同一公司/岗位资料对不同用户必须保持不变（有测试约束）。

## 下一步

P2：五个 API 接口、持久化快照、幂等与所有权校验（公共 ports 缺失时用显式本地 fake，不复制生产能力）。模块独立完成与整体联调完成分别签收。
