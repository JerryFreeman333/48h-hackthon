# C｜P1 无模型离线核心：交付与签收记录

- 板块：**C**；日期：**2026-10-02**；文档版本：**1.0**。
- 对应规格：[C 新开发规格 v1.1](C_DEVELOPMENT_SPEC_V1.1_2026-10-02.md) §16 P1。
- 公共契约：**schemaVersion = 1.0.0，未修改**。本模块未新增/修改任何公共对象、key 或枚举。
- 性质声明：这是**模块独立完成的 P1 阶段签收**，不是整体联调签收，不是产品上线。

## 1. 实际实现范围

P1 = 无网络、无模型、无数据库的 C 确定性核心，全部在 `modules/c-report/` 内：

| 文件 | 内容 |
|---|---|
| `domain/contract.ts` | 公共契约 1.0.0 TypeScript 镜像（逐字段复刻原文，含公共 key 登记与唯一已协调 Fact key `job.sales_kpi`） |
| `domain/schema.ts` | 公共对象 Zod 结构校验：strict 模式（字段漂移响亮失败）、schemaVersion 字面量锁定、nullable 字段拒绝空串、非有限数字拒绝、薪资 min≤max |
| `domain/validate.ts` | 三段输入校验：结构 → 绑定（§3 条款 2–8 全部 10 项中的代码可实现部分）→ 引用与主体范围（重复 ID、缺失引用、跨主体引用、事实-岗位主体一致性、覆盖记录引用） |
| `domain/preferences.ts` | 已确认硬偏好提取：仅 `confirmed=true && strength=hard`；重复 hard key 拒绝；逐 key 类型检查（city/min_fixed_monthly_salary/三个布尔 key）；未登记 key 保留 unknown |
| `domain/constraints.ts` | 硬约束引擎：销售KPI（§7.1 全分支）、薪资确定性比较器（§7.2 [L,U] vs T 全分支 + provenance 守门）、城市比较器（§7.3 最严格匹配 + 守门）、travel/outsourcing 无已登记 Fact key → unknown；含 ConstraintTrace |
| `domain/dimensions.ts` | 五维模板：恰好五 key 各一次；summary 区分【证据】【推断】【缺口】；不生成百分比/匹配概率 |
| `domain/questions.ts` | 核验问题 + C 私有目标路径字典（16 个已存在目标，模型/模板均只能选现有目标） |
| `domain/recommendation.ts` | 动作优先级 insufficient→hold→deprioritize→verify_first→explore，多原因保留；hold 规则表为空；无内容岗位→insufficient；无正向依据不轻易 explore |
| `domain/report.ts` | MatchReport 装配：公共字段严格 1.0.0（不私加 nextActions/顶层 recommendation）；三快照逐字段复制；demo scope 关键主题 → completeness |
| `domain/trace.ts` / `domain/errors.ts` | C 私有 DecisionTrace 类型；C 结构化错误码（P2 映射 HTTP） |
| `application/pipeline.ts` | 十阶段固定编排 + MatchReport 输出 Zod 自检 + C 私有 ReportSnapshot（完整输入/范围/哈希/trace/diagnostics）；部分 intentContext 仅 demo 显式放行，live/manual 拒绝 |
| `application/hash.ts` | canonical JSON（键排序、数组顺序保留、拒绝非有限值）+ SHA256 输入哈希 |
| `application/diagnostics.ts` | 私有 run 诊断：阶段记录、空候选 insufficient 说明（C-13）、关键主题缺口 |
| `scripts/run-demo.ts` | 独立演示入口：读公共 fixtures → 出报告 → 逐项对照人工预期（14 项 PASS/FAIL，退出码判失败） |
| `package.json` / `tsconfig.json` / `vitest.config.ts` / `.gitignore` | C 自有工程配置（根目录未动；依赖版本以提交的 package-lock.json 为准） |

## 2. 实际启动与验证命令

在仓库根目录（依赖：Node ≥ 20、Python 3 标准库；首次需 `npm install`）：

```bash
# 1) 文档/固定样例核对（不是应用测试）
python3 modules/c-report/scripts/verify_c_docs.py

# 2) 安装依赖并运行真实单元/契约测试（83 项）
cd modules/c-report
npm install
npm run typecheck   # tsc --noEmit，0 错误
npm test            # vitest run，7 文件 83 测试全过

# 3) 独立演示（网络关闭、无模型）：输出 MatchReport + 私有快照 + 14 项人工预期对照
npm run demo -- --generated-at 2026-10-02T09:00:00Z --out docs/C_P1_DEMO_OUTPUT_2026-10-02.json
```

## 3. 实际测试结果（2026-10-02 本轮真实运行）

- `tsc --noEmit`：0 错误。
- `vitest run`：**7 个测试文件，83 个测试全部通过**。覆盖：
  - 公共样例契约：deprioritize、accept_sales_kpi fail 引用 fact-demo-1、五维各一次、mustStayUnknown 三项、mustNotClaim 五项（无占比数字/无产品设计声称/无匹配概率/主体非绿色）、快照与输入逐值一致、可复现（同输入同输出）。
  - 校验矩阵：schemaVersion 锁定、空串冒充未知、min>max、NaN、未知字段漂移、未确认画像、projectId/profileId/revision/intentId/intentRevision/mode 全部绑定错配、证据 mode 混用、重复 ID、缺失引用、跨主体引用、事实-岗位主体不一致。
  - 约束引擎：薪资比较器 11 分支（pass/fail/跨阈值/单边区间/total/币种/周期/税后/months 歧义/全未知）、城市比较器 3 分支、销售KPI 7 分支（含 conflicting/contradicted/主体错位不可用）。
  - 偏好：重复 hard key、类型错误、soft/unconfirmed 不进硬判定、未登记 key 保留 unknown。
  - 动作：优先级常量、hold 表空且可疑文本不触发、多原因保留、material unknown→verify_first、主体 ambiguous/null→verify_first、正向依据→explore、无正向依据→verify_first（C-10 本地预案）、无内容→insufficient、空候选 results=[] + 私有 diagnostics 说明。
  - 不可变：deepFreeze 输入运行无异常；trace 含 profilePath 且不进公共报告；快照/哈希/阶段完整；intent.filters hard 项不自动升级。
  - intentContext：完整快照 demo/live 运行；部分上下文仅 demo 放行、live/manual 拒绝、缺字段/绑定不一致拒绝。
  - canonical JSON：键排序、数组保序、非有限拒绝、哈希确定性（含 sha256 标准向量）。
- `npm run demo`：**14/14 人工预期 PASS，退出码 0**。已提交样例输出 `docs/C_P1_DEMO_OUTPUT_2026-10-02.json`（固定 generatedAt，可复现）。
- 网络封闭性：domain/application/scripts/tests 无任何 `fetch`/`node:http`/`node:https`/`node:net`/第三方 HTTP 依赖（grep 验证）；演示与测试仅读本地文件。

## 4. 关键实施决策（均写入代码注释与 trace，供联调复核）

1. **薪资/城市/出差/外包在管线层一律 unknown**：1.0.0 中 `job.salary`/`job.city` 无逐字段 provenance，且除 `job.sales_kpi` 外无已协调 Fact key。按规格 §6(3)，未建立标准 Fact 的字段不用于确定的收入/在招/主体结论。§7.2/§7.3 比较器作为确定性框架完整实现并单测，公共 provenance 协调后自动生效。demo 的 `mustStayUnknown: fixed_monthly_salary` 由 total 口径与 provenance 守门双重保证。
2. **阈值币种假定人民币主单位**：公共字典未定义 `min_fixed_monthly_salary` 单位；比较器显式要求 CNY，语义登记为待协调（登记 §3.2）。
3. **输入 Zod 用 strict 模式**：三团队并行开发下，字段漂移（改名/新增未协调字段）必须响亮失败，而不是静默当 unknown。新增公共字段本属契约变更，需三方同步。
4. **hold 规则表为空**：无已协调命题协议（如"私人账户付款"），不激活任何 hold 规则；测试证明可疑 JD 文本不会自动触发 hold。激活需公共命题协议 + 逐条登记。
5. **explore 需要正向依据**：P1 模板的正向依据 = 事实支持的 pass 约束或 supported 维度。无正向依据、无阻断的岗位给 verify_first 并说明缺口（C-10 本地预案，跨模块确认前仅用于 demo/test）。
6. **explore 阈值下的 verify_first 不含结构性 unknown**：仅 material unknown（如用户拒绝销售但 `job.sales_kpi` 缺失/未核验）触发；provenance 类结构性缺口不阻断，避免"缺一个字段就阻断 explore"。
7. **部分 intentContext 仅 demo 放行**：live/manual 缺完整绑定直接拒绝（规格 §3），等待总控确认传快照方式。

## 5. 未完成项与真实接口状态

- **P2（未实现）**：五个 API 接口、持久化（MatchRun/ReportSnapshot/ModelUsage/ReportFeedback）、幂等与 409、所有权校验、HTTP 错误映射。ports（OwnershipPort/PersistentTaskPort/ModelPort/ReportSnapshotPort/UsagePort）尚未定义代码。
- **P3（未实现）**：/demo/c 页面、五维展示、比较视图、证据抽屉、MD 导出、可访问性。
- **P4（未实现）**：模型接入、七层语义校验（本 P1 只实现结构/引用两层）、预算控制、一次修复降级。
- **P5（未实现）**：取消/重启/外部失败恢复、A→B→C 联调。
- **真实数据接口状态**：无任何企业数据/模型/供应商接入；未调用任何外部 API；无成本发生（costMinor 未产生）。
- **语义质量**：全部测试基于公共合成样例；不构成语义准确率或市场有效性证明（登记 C-19/C-20 保持 not_validated）。

## 6. 与其他模块的联调说明

- **A → C**：C 消费已确认 `UserProfile` + 完整 `SearchIntent` 快照（C-01 策略）。集成层（总控）需确认：传完整快照的方式、项目所有权校验点。`intent.filters` 的 hard 项不会自动升级为用户硬约束——若产品语义要求升级，属公共行为变更，需协调。
- **B → C**：C 只消费 `CandidateBundle`，不改写 facts/evidence/coverage；快照逐值复制。当前唯一可用于确定性判定的 Fact key 是 `job.sales_kpi`；B 若产出更多 key，需公共协调登记后 C 才会消费（未登记 key 只展示，不判定）。
- **对接清单**：三对象 schemaVersion 1.0.0 逐字段一致；C 请求 `{profile, intentContext, bundle, idempotencyKey}`（P1 由调用方注入 reportId/generatedAt，P2 接管）；demo/manual/live 三态一致且证据 mode 不得混用。
- **联调前必须确认的公共事项**（登记 §3）：绑定传递、语义字典（含阈值单位/币种）、字段 provenance、时序协议、动作优先级歧义（C-10）、公共 ports 维护人。

## 7. 登记条目状态映射

见 [C 修订登记](C_REMEDIATION_REGISTER_2026-10-02.md) 新增的"P1 实施记录"一节：哪些条目已在 P1 实现、哪些部分实现、哪些维持 open/not_validated，逐项列出，未混淆"规格修正/代码实现/测试通过"三种状态。
