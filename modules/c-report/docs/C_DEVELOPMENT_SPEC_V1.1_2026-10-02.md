# C｜个性化匹配、比较与报告：修订开发规格 v1.1

- 板块：**C**；负责人范围：本模块页面、API、领域逻辑、测试、报告存储适配与导出。
- 文档版本：**1.1**；修订日期：**2026-10-02**。
- 公共契约版本：**schemaVersion = 1.0.0，未修改**。文档版本不是数据版本。
- 实际状态：**文档已修订，业务实现未开始**。本文件中的类名、函数、目录、接口返回示例、测试预期均为待实施规格。
- 原始依据：[C 原始附件](source/C_Matching_Report.original.md)、[可行性审查](C_FEASIBILITY_AND_DELIVERY_PLAN_2026-10-02.md)。
- 本轮授权：修正 C 可控的设计缺陷，生成开发与迁移文档；不实现 A/B，不修改总控、公共 schema 或根工程配置。

## 1. 产品边界与可信结论

整体流程：画像 → 确认画像/经历 → 行业 → 岗位类型 → 候选检索 → 调查 → 个性化比较 → 报告。

A 输出 UserProfile 与 SearchIntent。B 只消费 SearchIntent，输出 CandidateBundle。C 消费已确认画像与候选资料，并用可信意向上下文校验对应关系，输出 MatchReport。

C 回答的是“现有材料对这个用户意味着什么”，不是“公司实际上还有哪些资料”。不查外网、不重新设计问卷、不改 B Fact，不根据类型标签排除职业。模型不预测录用、晋升、倒闭或职业成功概率。

核心可验收价值：确认硬冲突；拆分事实/推断/未知；保持主体与来源；给出具体核验问题；对同一事实解释不同个人影响。

首轮使用明确 demo 或人工真实资料。单次 1–3 个候选是探索验证配置，不修改 A/B 的候选上限契约。不实现支付、招聘服务、人才售卖、自动投递和正式背调。

置信水平：C 的确定性工程可实现＝高；人工真实材料闭环可试运行＝中且有条件；全行业实时数据覆盖＝未验证；付费与盈利＝未知。

## 2. 独立目录与非干扰规则

当前交付目录是 `modules/c-report/`，所有新增文件只在此范围内。

后续拟定目录（尚未创建实现）：

```text
modules/c-report/
  domain/       # 规则、约束、报告投影与不变量
  application/  # 固定阶段编排、C API handler、输入/输出校验
  ports/        # C 依赖公共能力的接口，不复制公共实现
  adapters/     # 公共 runtime 接入；显式 demo/test fake
  ui/           # 报告、比较、证据抽屉
  fixtures/     # 公共合成输入与明确标记的边界样例
  tests/        # 应用实现后再新增真实测试
  demo-host/    # 仅独立宿主；不带另一套生产鉴权/队列
  scripts/      # 本轮只有文档核对工具
  docs/         # 规格、决策、迁移、实际验证记录
```

不得修改 A/B、总控、公共 packages、根 package.json/锁文件/CI、公共路由。需要挂载入口或公共 schema 时提交协调事项，维护人负责集成。不得把 C 私有类型直接升级成公共类型。

提交前限定暂存本目录；提交标题使用 `[C]`。合入 main 检查 changed paths 与非 C tree 对比；禁止强推。工作分支使用 `codex/c-...`。不自动覆盖队友新增文件。

## 3. 输入请求与完整绑定

现有 C 请求是 `{ profile, intentContext, bundle, idempotencyKey }`，不增加新的公共对象。

本修订采用的 C 侧实施策略：`intentContext` 优先接受 A 已有的**完整 SearchIntent 快照**。原文规定“至少”包含 intentId/revision/profileRevision，完整对象属于允许的上下文扩充；无需 A/B 增加字段。总控只需确认怎样传已有快照，本轮不修改总控。

在 live 或真实人工数据模式中，缺失 profileId/projectId/mode 等绑定信息不得仅凭 revision 生成可信报告。由集成层提供可信完整快照；若未配置，默认拒绝真实请求并给出可定位错误。只有用户/开发者显式选择的本地 demo/test 才使用对应适配，不自动把 live 降为 demo。

必须同时满足：

1. 四对象的 schemaVersion 为已支持版本，不静默迁移。
2. profile、intent、bundle 的 projectId 一致。
3. profile.profileId = intent.profileId。
4. profile.revision = intent.profileRevision。
5. bundle.intentId = intent.intentId。
6. bundle.intentRevision = intent.revision。
7. profile/intent/bundle.mode 一致，evidence.mode 不隐形混用。
8. profile.confirmedAt 非空，assessment.status = confirmed。
9. project 的服务器所有者与当前会话一致；ID 正确不是权限证明。
10. 所有 IDs 在各自集合内唯一；关联目标存在。

真实 API 校验依赖服务器可信快照/所有权，不能把用户上传 JSON 中的 live、verified、confirmed 当现实核验结果。live 只消费经过可信 B/集成链路取得的资料。manual 的提供方式和核验状态必须保留。

任意导入 JSON 只证明“用户提供了这份内容”，不证明来源真实。demo/test 可离线运行，但必须显式配置且不部署成无鉴权 live。

## 4. 错误、空候选和部分资料

复用公共错误结构 `{ error: { code, message, retryable, requestId } }`。

- 422：结构非法、未确认画像、绑定字段缺失、非法/跨主体引用等可定位输入问题。
- 401/403：未登录/无权；导出与任务查询同样校验。
- 409：不支持的版本、旧意向与新画像、相同幂等键不同输入等冲突；具体 code 对齐公共错误目录。
- 429/503：公共限流/外部不可用，复用公共策略。
- 不用 AI 消费来“修复”用户输入或权限错误。

区分三种情况：

1. 非法或未确认输入：拒绝，不能生成 insufficient 报告蒙混通过。
2. 输入合法但部分主题缺失：保留可用结论，报告 partial；不能因为财务未知而抹掉已经确认的硬冲突。
3. jobs=[]：MatchReport.results=[]，不造职位。页面依据空结果显示“insufficient：请补充候选”。公共 MatchReport 没有顶层 recommendation/message，本轮不私加字段；C 的 run diagnostics/UI 投影提供空状态说明，不伪造 jobId。

只有公司没有岗位时，不把相关公司包装成正在招聘的职位。

## 5. Fact、Evidence 与主体范围

结构检查与语义检查分开。Zod 未来用于结构和明确 refine，不证明证据支持结论。

- Fact 的每个 evidenceId 必须存在；输出 factId 必须来自同一输入 bundle。
- 引用关联公司/岗位必须存在，非空 IDs 必须一致，不把 A 法人证据转给 B 法人。
- job 事实须对应同一岗位和主体；company/business 事实不能自动变成某岗位或团队事实。
- team 证据不能代表整个公司，company 证据也不能证明具体岗位职责。
- 1.0.0 没有 teamId、法律主体关系图、完整事件结构；无足够范围协议时保留范围未知，不自行制造关系。
- job.companyId=null 的合法输入允许存在，但主体未定位的结论须受限；不能把 null 自动绑定第一个公司。
- unverified/disputed 和 supported 组合出现时检查一致性；不能仅看一个 supported 字符串放行。
- 匿名讨论只作线索，不计算全体员工比例，不因转发次数提高事实等级。

数值、时间、状态：

- false 是值，不是 contradicted；contradicted/conflicting 是命题核验状态，不是“坏公司”类别。
- retrievedAt 是采集时间，publishedAt 是发布日期，asOf 含义由公共时间协议确定；不得相互冒充。
- 历史异常已移出不得写成当前异常。缺时序语义时不作当前风险断言。
- supported 表示所述命题有支持，可能支持硬冲突；不等于适合、安全或绿色状态。
- null 保留为未知，不用空字符串/0 替代；无负面结果不等于无风险。

## 6. 字段级来源缺口与公共 key 的安全退路

公共初版用户约束 key：city、min_fixed_monthly_salary、accept_sales_kpi、accept_travel、accept_outsourcing。

**已在公共样例出现的 B Fact key 是 job.sales_kpi。** 本轮不激活或增加其他 B Fact key。将来新增 key 的类型、单位、scope、时间和未知行为，必须共同确认并同步契约/样例。

C 的内部事实解析器只消费已协调的 key，不从模型输出反向生成 B Fact。不认识的 key 可以保存/展示材料，但不得用于确定性结论。

针对 job.city/salary/vacancyStatus 和 company.identityStatus 的 provenance 缺口：

1. 页面可显示“B 提供的字段值及其核验缺口”，不把显示等同核验。
2. 规则使用的事实须有适用主体、可用来源和已约定的命题语义。
3. 未建立对应标准 Fact 的字段，不用于确定的收入、在招或主体风险结论，相关约束保留 unknown。
4. 不为满足 factIds 要求引用不相干 Fact。
5. 若需要 fieldProvenance 等新结构，列入公共提案，不在 1.0.0 悄悄加字段。

五种硬约束可以先有处理框架，但除已具备资料与语义的情况外必须 unknown。这个限制不阻塞 C 离线开发；它限制真实上线承诺。

## 7. 硬约束算法

只执行 confirmed=true 且 strength=hard 的用户偏好。soft 和 unknown 不进入硬冲突判定；SearchIntent.filters/cities 不自动新增 UserProfile 的 hard。

重复 hard key、错误类型、非法金额、非有限数字、min>max 等先拒绝或返回明确不可判断诊断，不由模型猜测。用户经历和目标与兴趣分别保留；本人确认不等于外部能力证明。

### 7.1 销售 KPI

已确认不接受且对应已支持 job.sales_kpi=true：fail；材料明确支持无 KPI：pass；缺失、冲突、主体错位或未核验：unknown。

没写销售不等于无销售。用户接受销售不证明能力，只表示这一限制不否定岗位。

### 7.2 最低固定税前月薪

比较前确认：同币种、month、fixed、pre_tax、可靠来源。成本单位整数分与薪资主货币单位分开。

total、after_tax、未知口径或不明月份年薪不得自动转换。缺可靠转换或来源就是 unknown。

固定区间 [L,U] 对阈值 T：L>=T 为 pass（仅表示披露区间达到下限）；U<T 为 fail；L<T<=U 为 unknown。没有已获 offer 时不声称用户能拿到披露待遇。

### 7.3 城市、出差、外包

城市只按已确认 hard 范围和可靠岗位地点判断，使用共同地理规范，不用字符串包含法。出差/外包须消费相应岗位事实；注册地址变化、品牌不同或合同法人不同不能单独推出外包。

### 7.4 约束证据与画像追溯

约束用 B Fact 支持岗位侧条件；用户側用 C 私有 DecisionTrace 的 profilePath/key 追溯。混合结论是 inference，不发明 profile Fact。constraints.factIds 不为追溯个人偏好硬塞无关引用。

## 8. 建议动作与原文歧义

原文第 4 节与第 8 节在“主体未知+硬冲突”时存在歧义。C 的本地实施预案以明确优先级为准，跨模块启用前需确认，未确认时只用于 demo/test 验收。

优先级：insufficient → hold → deprioritize → verify_first → explore，多原因全部保留。

- insufficient：合法输入但无可用岗位/基本可判断内容；不是把任意缺数据都归此类。
- hold：有限、登记的当前核验风险规则；动作是暂停关键操作并核验，不是判骗局。
- deprioritize：有可信 hard fail；软偏好不能抵消。
- verify_first：主体、用户关键条件、命题冲突或关键未知需先解决。
- explore：有正向依据且没有上述阻断；不保证安全、录用或正在招。

主体未知若使岗位事实本身不可信，硬约束 unknown；若岗位来源可靠、硬冲突独立成立，可保留 hard fail 与主体未知双重理由。

hold 的规则表只列已协调命题与直接材料。本轮没有为“私人账户付款”等新增公共 Fact key；对应数据协议未确认时，生产 hold 规则不激活。不得由模型凭标题/匿名帖自动触发。

小公司、参保少、共址、地址不同、没搜到负面，不单独影响为 hold 或安全保证。

## 9. 五维、比较、未知与问题

每个有效岗位的 dimensions 恰好有以下五个 key，各一次：identity_credit、business、role_clarity、career_value、personal_fit。

维度 summary 必须说明证据支持、推断与缺口；Status 不是好坏分。没有综合匹配百分比，不用问卷兴趣分推匹配概率，不编职责百分比。

个人经历支持必须有相应已确认材料。喜欢沟通不证明销售能力。“收集反馈”不证明产品设计或产品交付成长。

职责说明、下一步动作在 1.0.0 中先用 dimensions/reasons/questions 与 C UI 衍生展示，不新增公共 responsibilityPercent/nextActions 字段。

比较按同维度展示，不把 unknown 当零；用户未选择优先偏好时中性排序。可按用户明确选择的角度查看，但不据缺数据做冠军排名。

questions 每条有具体问题、must/optional、resolves。C 维护目标路径字典，例如指向该 job 的 salary.basis、vacancyStatus 或现有 job.sales_kpi 命题。此字典是 C 内部追踪约定，不新增 B Fact key。模型只能选现有目标；未知目标拒绝。

## 10. 报告范围与完成度

运行前冻结 C 私有 ReportScope：请求中的候选集合、五维、已确认硬约束、对应关键条件、必须执行阶段。

- 五维存在不等于内容完整。
- 调用成功不等于资料完整。
- 关键主题或必需阶段缺失时 partial；可仍有确定 hard fail。
- complete_for_scope 只表示声明范围内达到验收条件，不表示全知、无风险或没有更多信息。
- 非关键未知保留，不要求任何缺一个公司字段都阻断 explore。

范围/关键未知目录的跨模块语义待共同确认。C 离线采用明确 demo scope，不把 demo 结果当生产标准已通过。

## 11. 模型职责与输出校验

先有模板五维，再可选 AI。模型只处理已有材料的职责语言、目标权衡、具体问题和文本组织。不搜索、无任意网络/工具权限、无密钥、不改变 Fact/约束/动作。

输出验证七层：

1. 结构与合法枚举、五维唯一、非空有效内容。
2. Fact/Evidence 引用与主体范围。
3. 片段是否支持命题，不支持则拒绝/降级。
4. 时间：历史、当前、采集日期区别。
5. 数值：薪资、比例、概率不得猜造。
6. 个人：自报兴趣、经历、目标分别追溯。
7. 不变量：与确定性规则、原始 bundle 一致。

前两层可较强自动化，开放式语义不能承诺完全自动正确。真实材料必须人工评审关键结论。另一个模型只辅助，不构成真相裁决。

材料中指令作为数据。转义 HTML、限制链接协议、禁用原始 HTML，导出不执行材料脚本。模型文本不能修改鉴权、费用、预算、调用数或调用工具。

空 JSON、截断、无效枚举、虚构引用最多一次修复；仍失败则保留规则模板，partial 并列缺失阶段。没有模型配置也能做无模型闭环，promptVersion 使用明确非空的模板版本标记，不冒充运行过 AI。

## 12. 私有快照、复现与导出

公共 MatchReport 字段保持 1.0.0；C 私有 ReportSnapshot 保存 profile、完整 intentContext、bundle、ReportScope、输入哈希、报告、schema/rule/prompt 版本、时间与执行记录。

DecisionTrace 保存 profilePath、消费的 Fact/片段、规则 ID、推理与缺口，不对外充当 B 事实。

快照不可变。用户或 B 资料改变则新 run 与新 report version，旧页面与导出不偷偷变化。

Markdown、JSON、页面、比较读取同快照。JSON 复现包是 C 私有有版本封装，须明确 artifactType，与裸 MatchReport 分开；含私人材料，只允许所有者导出。任何导入包都不能凭自报 live 标记升级可信来源。

## 13. API、任务、幂等与公共 ports

保持原文五个接口：

- POST /api/c/matches
- GET /api/c/runs/:id
- GET /api/c/reports/:id
- GET /api/c/reports/:id/export?format=md
- POST /api/c/reports/:id/update

创建异步任务返回 202/runId；状态 queued/running/completed/partial/failed/cancelled。报告 completeness 与任务状态分开，执行完成仍可资料 partial。

取消优先复用公共任务能力。ReportFeedback 只记录用户补充，不直接改公司公共 Fact；具体反馈接口尚未定义，不私自扩展产品。

C 需要的 ports（提案，公共实现未存在）：

- OwnershipPort：服务器所有权/可信上下文。
- PersistentTaskPort：执行、租约、恢复、取消、阶段产物。
- ModelPort：公共客户端、固定 provider 调用与使用量。
- ReportSnapshotPort：快照保存/读版本。
- UsagePort：费用、失败、unknown outcome。

这些名称是 C 私有接口建议，不要求总控照名重构。接入时写 adapter；没有公共实现就用显式本地 fake，不新增第二套生产能力。

幂等作用域：所有者+项目+C 操作+幂等键。canonical 输入哈希冻结对象与执行配置，键排序、数组顺序保留、拒绝非有限值。相同键相同输入复用任务；同键不同输入 409。并发靠持久存储唯一约束/事务，不只查内存。

Next.js after/响应后 Promise 不是本规格需要的持久任务保证。阶段落盘；重启从可恢复点开始。

外部付费调用发出但响应丢失：执行与费用 outcome=unknown；供应商无幂等/查询能力时不盲重发。任务幂等不等于费用 exactly-once。取消只停后续调用，已有费用与 unknown 保留。

## 14. 预算与实际成本

保留原文默认：最多 8 次模型调用（修复/重试计入），单请求 30 秒，整体 120 秒软上限。未实测，不是 SLA。

8×30=240，因此每次调用前检查剩余时间/调用数/金额，并按实际 deadline 限制请求。使用固定阶段计划，不运行自由循环 agent。

每次调用预估并预留可合理给出的费用上界。使用量/价表/换算不明时费用 unknown；无法形成有意义上界时禁自动付费调用。costMinor 为人民币整数分；null 不是零。B 数据费与 C 模型费分项。

失败、修复、取消和重做费用纳入试验成本；固定套餐按真实订单摊销。没有真实价格/订单/人工分钟数，不给利润预测。支付/退款属于公共后续任务，不消费客户端 paid=true 作为授权。

## 15. 页面与材料最小化

/demo/c 为明确合成/人工演示入口；/reports 为正式入口，公共宿主负责挂载，本轮不修改根路由。

首屏：动作、最多 3 个关键理由、首要核验问题、覆盖摘要。后续：画像摘要、五维、约束、职责解释、证据、未知、面试问题和下一步。

Evidence 抽屉显示原片段、提供方式/URL、日期、主体范围、核验状态。无 URL 不造链接。颜色与文字共同传达状态，键盘操作、移动单列可用。

不把简历/画像全文写普通日志；日志用 runId、阶段、错误码及必要脱敏信息。字段最小化、存储保留期、删除链路、模型托管地区/跨境路径由公共维护人确认。未经这些能力确认，不宣布 live 可上线。

demo/manual/live 是数据模式，不替代适用的 AI 内容标识；页面与导出预留来源/标识。运营地区/主体/公开服务分类须按实际部署核对，不一概宣称所有产品需要相同备案。

## 16. 开发关卡与独立验收

| 阶段 | C 产物 | 独立方式与门槛 |
|---|---|---|
| P0 基线 | 只读契约接入、公共 ports 对接说明、协调登记 | 不改 A/B；缺公共实现只允许 demo/test |
| P1 无模型核心 | 输入/引用/约束/动作/五维模板/问题与 trace | 网络关闭；公共样例 deprioritize；不变事实 |
| P2 API/快照 | 五个接口、幂等、权限钩子、不可变版本 | fake runtime 可独立测；越权拒绝；更新不覆盖 |
| P3 页面/导出 | /demo/c、五维/比较/证据、MD 与私有 JSON | 同快照；unknown 不为 0/绿灯；键盘移动可用 |
| P4 可选 AI | 固定 prompt、语义校验、预算、一次修复 | AI 不覆盖动作；失败保规则；真材料人工审查 |
| P5 故障/联调 | 取消/重启/外部失败与 A→B→C 测试 | 独立完成与整体联调分别签收 |

没有公共维护人/供应商实测/开发工时，不能可靠给日历上线承诺。完成 P1 后按实际吞吐估后续。

## 17. 公共样例的预期与真实测试范围

fixtures 三份输入逐值来自原文，schemaVersion=1.0.0。人工预期文件 C_EXPECTED_BEHAVIOR.demo.v1.json 明确不是业务输出。

样例主动作 deprioritize；accept_sales_kpi fail，fact-demo-1；固定底薪/真实在招/财务未知；不编销售占比、不称产品设计、不新增未确认城市/薪资硬约束。

待应用实现后至少覆盖：

- 未确认画像、同 revision 不同 profileId、旧意向、混合 mode、重复 IDs。
- 缺引用、跨主体、null 主体、team/company 范围错置、无 provenance。
- total 与 fixed、区间跨阈值、非有限数/错误单位。
- 同 bundle 两画像、历史已移出、匿名转载、无岗位。
- 模型非法 JSON/截断/无支持语义/改变动作/注入。
- 并发幂等、同键不同输入、取消、重启、费用未知、预算耗尽。
- 跨用户 API/导出、旧报告不变、页面/比较/MD/JSON 一致。

本轮只执行 Python 文档/固定样例核对。没有业务单元测试、Zod 全量验证、浏览器测试、端到端测试、真实 provider 调用或实际 MatchReport。后续记录不能混淆这几种测试。

## 18. 未关闭的公共事项与移交

详见 [C 修订登记](C_REMEDIATION_REGISTER_2026-10-02.md)。公共 key/来源/时间字典、动作歧义确认、scope 语义、生产 ports、路由挂载和部署仍需协调；本轮不改变共享数据结构。

下一对话必须先读 [C 迁移文档](C_MIGRATION_HANDOVER_2026-10-02.md)，核对远程 main 与当前文件，运行文档核对，再从 P1 无模型核心实施。遇公共缺口保持 unknown 或 fake 继续开发，不绕过权限、预算或真实性。

## 19. 官方参考边界

下列资料用于核查技术边界，不代表安装或接入：

- Zod 基础用法：`https://zod.dev/basics`。
- Next.js after：`https://nextjs.org/docs/app/api-reference/functions/after`。
- OWASP Prompt Injection：`https://genai.owasp.org/llmrisk/llm01-prompt-injection/`。
- GitHub 创建文件内容与 Git references：`https://docs.github.com/en/rest/repos/contents`、`https://docs.github.com/en/rest/git/refs`。

法规与兴趣工具来源沿用历史审查的 S3/S6/S7/S8；部署前按实际地区和当时有效规则核对，不把当前文档当完成合规或问卷验证的证明。
