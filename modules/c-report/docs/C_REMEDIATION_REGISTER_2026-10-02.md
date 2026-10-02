# C｜缺陷修订登记与公共待协调事项

- 板块：C；日期：2026-10-02；文档版本：1.3。
- 公共 schemaVersion：1.0.0，未修改。
- “规格已修正”只表示文字规范闭合，**不是业务实现或测试通过**。
- 修改依据：[C 新开发规格](C_DEVELOPMENT_SPEC_V1.1_2026-10-02.md)。

## 1. 状态定义

- `specified_c_only`：C 自有实现策略已写明，待编码与实际测试，不要求 A/B 改输出。
- `specified_with_shared_dependency`：C 有安全退路与接口策略，但生产启用仍依赖共同确认。
- `open_shared`：公共语义/结构/基础能力未确认，不能自行激活。
- `not_validated`：市场、供应商或真实效果缺证据，不能靠文档修订关闭。

## 2. 缺陷与处理

| ID | 原缺点 | 本次修订 | 状态与边界 |
|---|---|---|---|
| C-01 | intentContext 只比较 revision 可能误绑画像 | C 使用已有完整 SearchIntent，校验 ID/项目/模式/版本/服务器所有权；缺绑定拒绝 | specified_with_shared_dependency；总控确认传已有快照，不改 A/B schema |
| C-02 | 兴趣、自报经历、能力混同 | 分开解释；兴趣不作能力证明，自报确认不作外部验证，trace 记录画像路径 | specified_c_only |
| C-03 | 用户侧来源与 B Fact 混同 | B factIds 只追溯岗位/公司，个人条件用私有 profilePath；混合结论 inference | specified_c_only |
| C-04 | ID 存在就认为引用正确 | 验结构、主体、scope、命题、日期、数值；引用不支持拒绝/降级 | specified_c_only；语义仍需真实材料人工评审 |
| C-05 | 城市/薪资/在招/主体字段缺逐字段来源 | 无可用 provenance 保留 unknown；不引用无关 Fact；标准 Fact 协议待协调 | open_shared；不新增字段或 key |
| C-06 | Fact/preference key、值和单位语义不足 | 只消费已协调 key；未登记不触发硬结论；job.sales_kpi 以公共样例为基线 | open_shared；类型/单位/时间注册表由公共维护 |
| C-07 | 历史事实误判当前风险 | 时序不清不作当前断言；采集/发布/事件时间分开 | specified_with_shared_dependency；当前/历史协议未确认 |
| C-08 | supported 被画成安全/适合 | 状态表示命题支持，动作与约束决定影响；unknown 不绿色 | specified_c_only；公共语义需统一 |
| C-09 | total 当 fixed，区间上限保证底薪 | 同币种/月/fixed/pre_tax/来源；跨阈值 unknown；不自动换算 | specified_c_only；没有可靠岗位 Fact 仍 unknown |
| C-10 | 文档第4/8节动作歧义 | 明确优先级预案，多原因保留；主体影响来源可靠时 hard unknown | open_shared；生产前确认优先级 |
| C-11 | 模型自由改动作或新增事实 | 规则/模板先行，模型无工具权限，七层后验检查，一次修复后降级 | specified_c_only |
| C-12 | MatchReport 不足复现，更新覆盖历史 | 私有完整快照、版本、trace；同快照页面/导出；新材料新 run | specified_c_only；不改公共 MatchReport |
| C-13 | 空 jobs 无顶层说明字段 | results=[]，C 页面/run diagnostics 显示 insufficient，不造 jobId/公共字段 | specified_c_only |
| C-14 | completeness 与调用成功混同 | 冻结私有 ReportScope；关键主题/必需阶段缺失 partial | specified_with_shared_dependency；跨模块 scope 语义待确认 |
| C-15 | questions.resolves 任意字符串 | C 私有目标路径字典，模型只能选已存在目标 | specified_c_only；不激活新公共 Fact key |
| C-16 | 内存任务、弱幂等、越权导出 | 公共持久 ports，数据库唯一约束，所有 API/导出所有权校验 | specified_with_shared_dependency；生产 runtime 尚不存在 |
| C-17 | 调用预算/时间不闭合，费用未知当零 | 次数/时间/金额同时约束，unknown=null，不能盲重发外部请求 | specified_c_only；价表/供应商幂等需实际接入 |
| C-18 | 三人重复底座，C 偷接 A/B 数据 | C-only 目录与 adapter；无公共 runtime 仅显式 demo/test | specified_with_shared_dependency；维护人未指定 |
| C-19 | 演示成功被当成真实准确率/产品成立 | 实际文档检查与待应用测试分开；人工真实材料和付款验证另做 | specified_c_only + not_validated |
| C-20 | 数据许可、付费、成本、部署合规未确认 | 明确上线前提与成本分项，不编利润/价格，不新增支付 | not_validated；非 C 文档能单独解决 |

## 3. 最小公共协调清单（本轮不实施）

1. **绑定传递**：总控将 A 已有 SearchIntent 快照传给 C；确认所有权能力。
2. **语义字典**：已有 preference/Fact key 的值、单位、scope、时效、false 与状态；先不要新增 key。
3. **字段来源**：B 元数据与 Fact 的对应；无来源 unknown 的共同约定。
4. **时序与范围**：历史/当前、team/company、complete_for_scope。
5. **动作歧义**：优先级与主体未知+硬冲突的可靠性条件。
6. **公共 ports 维护人**：鉴权、持久任务、模型客户端、日志/费用、存储、路由挂载。
7. **新增结构若有必要**：fieldProvenance/entity/event 等另提公共变更，同步版本与三方样例。

这些项目不阻塞 C 的无网络合成核心。生产缺口用 unknown、partial 或拒绝不可信输入处理；不得伪造接口/能力来“消除依赖”。

## 4. 非干扰范围

本次只提交 `modules/c-report/`。无 A/B 文件，无总控文件，无公共 schema，无根工程配置变更。

C 名称在目录、README、所有新增规格和迁移标题中明确。远程集成使用 scoped tree、普通提交、force=false；遇队友并发提交重新检查，不覆盖其内容。实际集成凭证另存。

## 5. 下一步与签收

下一对话先做 P1 代码和实际测试。只有实际实现后才能将条目标记 implemented/tested；不能因本登记存在就宣称缺陷已在运行系统修复。

模块独立签收与端到端签收分别记录。真实来源、付费效果、供应商覆盖与真实语义质量保持未验证，直到存在相应证据。

## 6. P1 实施记录（2026-10-02，代码落地后追加）

依据：[P1 交付签收](C_P1_DELIVERY_2026-10-02.md)。范围仅限本轮实际编码与测试（vitest 83 项通过、演示 14 项预期通过）；"implemented_in_p1" 不等于生产验证，也不改变 open_shared 条目的公共依赖。

| ID | P1 状态 | 说明 |
|---|---|---|
| C-01 | implemented_in_p1（C 侧策略） | 完整 SearchIntent 快照校验已实现；部分上下文仅 demo 显式放行，live/manual 拒绝。总控传快照方式仍待确认 |
| C-02 | partially_implemented | 模板文案已区分兴趣/自报经历/能力；语义级分离需 P4 模型与真实材料 |
| C-03 | implemented_in_p1 | DecisionTrace.profilePath 已实现；trace 为 C 私有，不进公共 MatchReport（有测试） |
| C-04 | partially_implemented | 结构/主体/scope 层已实现并有测试；片段-命题语义检查属 P4，语义仍需人工评审 |
| C-05 | partially_implemented | 无 provenance → unknown 的守门已实现（薪资/城市/identity）；fieldProvenance 公共结构未提出 |
| C-06 | implemented_in_p1 | 仅消费 `job.sales_kpi`；未登记 key 不触发确定性结论（有测试） |
| C-07 | partially_implemented | P1 不作任何当前/历史断言；时间协议未确认前不启用相关规则 |
| C-08 | implemented_in_p1 | 模板层 supported≠适合：identity/salary 等声明字段不产生绿色/安全结论（有测试） |
| C-09 | implemented_in_p1（框架） | 比较器全分支实现并单测；管线按 §6(3) 守门为 unknown，provenance 协调后自动生效 |
| C-10 | partially_implemented | 本地优先级预案已实现（insufficient→hold→deprioritize→verify_first→explore，多原因保留）；跨模块确认仍是 open_shared |
| C-11 | not_applicable_p1 | P1 无模型；promptVersion 明确标记 no-model；七层校验在 P4 |
| C-12 | partially_implemented | 私有快照/trace/输入哈希已实现（内存对象）；持久化、不可变版本存储属 P2 |
| C-13 | implemented_in_p1 | 空 jobs → results=[]，私有 diagnostics 携带说明，不伪造公共字段（有测试） |
| C-14 | partially_implemented | demo scope 已冻结并产出 partial；complete_for_scope 跨模块语义待确认 |
| C-15 | implemented_in_p1 | C 私有目标路径字典（16 个现有目标）；resolves 越界在装配与测试中双重拒绝 |
| C-16 | partially_implemented | P2 已实现：端口结构与公共 runtime 等价、原子幂等预留（fake 层）、越权 401/403/404 校验（有测试）；生产持久存储/唯一约束/事务仍 open_shared |
| C-17 | not_implemented | P4 范围：预算/费用；P1 无付费调用，无成本发生 |
| C-18 | implemented_in_p1（范围） | 本轮仅提交 `modules/c-report/`；未复制/绕接公共底座或 A/B 数据 |
| C-19 | partially_implemented | 应用测试与文档核对已分离且均为真实运行；语义质量仍需真实材料人工评审 |
| C-20 | not_validated | 不变 |

## 7. P2 实施记录（2026-10-02，代码落地后追加）

依据：[P2 交付签收](C_P2_DELIVERY_2026-10-02.md)。范围：五个框架无关 API handler、原子幂等预留、所有权钩子、不可变报告版本、MD 导出（转义 + 协议白名单）、显式内存 fake runtime。112 项 node:test 通过；端到端演示 15 项通过。

- C-13 补充：空候选说明经 `GET /api/c/reports/:id` 的私有 diagnostics 投影返回（不伪造公共字段）。
- C-14 补充：run 状态与 completeness 分离（executed+partial → run=partial）。
- C-16：fake 层已覆盖原子幂等与越权测试；生产持久化仍 open_shared。
- 协调项新增：根目录 `app/api/c/` 挂载片段、root `test:c`、CI 条件步骤（见 P2 集成片段）；内存 fake 不得部署为无鉴权 live。

## 8. P3 实施记录（2026-10-02，代码落地后追加）

依据：[P3 交付签收](C_P3_DELIVERY_2026-10-02.md)。范围：框架无关视图模型与 HTML 渲染（`ui/`）、`export?format=json` 私有复现包、显式 demo 宿主运行时、P3 端到端演示。147 项 node:test（新增 35 项）通过；P3 演示 24 项通过；P1/P2 演示与输出无回归。

- C-08 补充（implemented_in_p3）：页面层 unknown 不画绿/不当 0 有实现与测试——灰色 chip + 文字标签双通道；比较单元格渲染「未知」；动作 `explore` 中性灰不暗示安全；核验/在招状态独立配色通道。
- C-13 补充（implemented_in_p3）：空候选页面的 insufficient 空状态展示（VM + HTML + 演示覆盖）。
- C-12 补充（implemented_in_p3）：页面/比较/MD/JSON 读同一不可变快照（v1 工件逐字节不变、两次导出逐字节一致有测试）；`StoredReportSnapshot` 工件补 `report` 字段使复现包自洽。
- C-02/C-03 补充：页面画像摘要区分「自报且本人确认 ≠ 外部能力证明」；混合结论仍走 trace，页面只展示结构化数据。
- 协调项新增：`app/demo/c/` 与 `app/reports/` 挂载片段（见 [P3 集成片段](C_P3_INTEGRATION_SNIPPETS.md)）；`/reports` 上线前提为公共 runtime；生产快照读取方式待确认。root `test:c` 与 CI 条件步骤维持待协调。

## 9. P4 实施记录（2026-10-02，代码落地后追加）

依据：[P4 交付签收](C_P4_DELIVERY_2026-10-02.md)。范围：C 私有 ModelPort/ModelBudget、固定 prompt、七层输出校验（确定性层）、一次修复降级编排、脚本化 fake 模型。169 项 node:test（新增 22 项）通过；P4 演示 12 项通过；P1/P2/P3 无回归。

- C-11 补充（implemented_in_p4）：模型无工具权限、只能改五维 summary 文本；L7 不变量逐字段断言（动作/约束/状态/事实引用被改即抛错）；注入端到端用例（JD 夹带指令 + 模型服从）被七层校验拦截。
- C-17 补充（partially_implemented）：预算门在调用前拒绝「付费无上界」（MODEL_COST_UNKNOWN）与超次（MODEL_BUDGET_EXHAUSTED）；usage 记录含 unknown（null≠0）。生产价表/供应商幂等仍 open_shared。
- C-04 补充：L3 断言-状态一致性检查落地（在招/固定底薪/主体核验/实时类断言与材料状态矛盾即拒绝）；开放式语义支持判断仍需真实材料人工评审。
- 协调项：生产 ModelClient adapter 由宿主提供（packages/runtime 尚无模型接口）；C 的 ModelPort 是私有接口建议，公共接口成型后对齐。
