# C｜个性化匹配、比较与报告

> 板块：**C**。本目录仅由 C 负责；不代表 A、B 或总控已实现。文档版本 **1.1**；公共数据契约保持 **1.0.0**。

## 当前交付状态（2026-10-02）

本次交付是**缺陷修订后的开发规格、公共合成样例、文档/样例核对脚本和迁移资料**，不是已完成的业务系统。没有应用启动命令、页面、真实数据接口或应用测试结果。

所有文件放在 `modules/c-report/`。没有根目录工程配置、共享 schema、A/B 文件或总控代码变更。

## 阅读顺序

1. [C 新开发规格 v1.1](docs/C_DEVELOPMENT_SPEC_V1.1_2026-10-02.md)——下一轮实现依据。
2. [C 缺陷修订与公共待协调登记](docs/C_REMEDIATION_REGISTER_2026-10-02.md)——哪些已在规格修正、哪些仍需共同决策。
3. [C 迁移交接文档](docs/C_MIGRATION_HANDOVER_2026-10-02.md)——新对话上下文、实际状态、首个任务和禁止越界事项。
4. [C 原始附件只读副本](docs/source/C_Matching_Report.original.md)——包含公共契约与三份公共输入。
5. [前期可行性审查](docs/C_FEASIBILITY_AND_DELIVERY_PLAN_2026-10-02.md)与[历史输入核对记录](docs/contract-audit-2026-10-02.json)——保留原始判断，不等同实现完成。
6. [C 文档核对结果](docs/C_DOCUMENT_VERIFICATION_2026-10-02.json)——实际执行结果，明确测试范围。
7. [C 远程交付凭证](docs/C_REMOTE_DELIVERY_RECEIPT_2026-10-02.json)——实际发布后生成；记录已集成文档提交，不假定它永远是 main HEAD。

## 模块输入输出

- 输入：已确认 `UserProfile`、`CandidateBundle`，以及用于校验绑定的可信 `SearchIntent` 上下文。
- 输出：公共 `MatchReport`（schemaVersion `1.0.0`）。
- C 只解释已有材料，不查外网、不设计问卷、不修改 B Fact。
- 公共维护人提供鉴权、任务、模型客户端与集成；没有公共生产能力时，仅做显式本地 demo/test。

## 可独立执行的文档/样例核对

在仓库根目录运行：

```bash
python3 modules/c-report/scripts/verify_c_docs.py
```

依赖：Python 3 标准库。这个命令只核对文档和固定样例，**不运行匹配引擎，不生成 MatchReport，不是完整运行时 schema 或端到端测试**。

合成输入见 `fixtures/`。`C_EXPECTED_BEHAVIOR.demo.v1.json` 是人工定义的验收预期，明确不是模型或业务代码实际输出。

## 协作与 main 隔离

- C 的提交名称使用 `[C]` 或 `C｜` 前缀。
- 后续工作分支使用 `codex/c-...`；只暂存本目录，不使用无范围 `git add .`。
- 加入 main 前重新核对文件 diff，禁止删改 A/B、公共 schema、总控及根工程文件。
- 不创建第二套鉴权、模型客户端、支付或公共队列。
- 公共字段/key/枚举变更先协调，不因页面方便私自新增。
- 同一公司/岗位资料对不同用户必须保持不变。

## 下一步

先做“输入验证 → 硬约束 → 动作 → 五维模板 → 同快照导出”的无模型核心。完成实际单元/契约测试后再做页面和可选 AI。模块独立完成与整体联调完成分别签收。
