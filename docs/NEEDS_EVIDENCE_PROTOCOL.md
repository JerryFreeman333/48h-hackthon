> 阶段资料：本文保留对应阶段的原始记录，不能直接作为当前入口或最新产品范围。先看[当前状态](CURRENT_STATE.md)、[文档索引](README.md)及[续做记录](PRODUCT_CONTINUATION_2026-10-03.md)的后续决定。

# 七主题材料回应对接协议（当前产品扩展）

当前版本 product-needs-1，兼容历史归档并增补材料、范围、来源日期和缺口。此协议说明本地整合层如何读取材料；采集器的记录、员工评价和关键词提取均不能自行提升为公司或岗位的已核验事实。

## 数据流与判断

A确认的JobNeedsSnapshot生成调查计划；B提供同一项目、模式及岗位范围的材料；整合层回应每一明细并生成必问清单。C继续判断已有硬条件和基础岗位事实。最终产品动作另存productActions，JSON中的原始report仍是C规则结果。

重点且未知处理为verify_first的未决项阻止“继续了解”；continue_with_unknown不解除未知，但不增加这一门槛。已有核验材料只代表对应问题有材料，不代表用户需求已满足。公司层面的线索仍保留，签约主体或岗位适用性未知不会把它变成“完全没有资料”。

逐项回应有四类：available（对应范围有已核验材料）、lead（有引用完整的待确认线索）、unknown（无可用资料，或内容/引用不足）、conflicting（记录不一致或来源有争议）。只有available能够解除该项用户要求的核验门槛。页面分别使用“已有对应范围核验材料”“已有待确认线索”“暂无可用资料”“资料存在冲突或争议”，不显示内部枚举。

## 28项键与范围

| 主题 | 明细 | fact.key | scope |
| --- | --- | --- | --- |
| 晋升与成长 | 晋升条件、评审流程与评审周期 | needs.growth.promotion | job |
| 晋升与成长 | 带教、培训与学习资源 | needs.growth.learning | job |
| 晋升与成长 | 岗位的发展路径与职责变化 | needs.growth.path | job |
| 晋升与成长 | 调薪条件和规则 | needs.growth.pay_growth | job |
| 薪酬透明 | 固定工资和浮动报酬分别是多少 | needs.pay.fixed | job |
| 薪酬透明 | 奖金、绩效或提成的计算与发放规则 | needs.pay.formula | job |
| 薪酬透明 | 试用期与转正后的报酬差异 | needs.pay.probation | job |
| 薪酬透明 | 发薪时间、税前税后口径及书面约定 | needs.pay.payment | job |
| 工时与休息 | 正常上下班、轮班或值班安排 | needs.hours.schedule | job |
| 工时与休息 | 加班频率、提前告知与补偿安排 | needs.hours.overtime | job |
| 工时与休息 | 每周休息及休假安排 | needs.hours.rest | job |
| 工时与休息 | 下班后响应工作消息的要求 | needs.hours.after_hours | job |
| 五险一金与保障 | 适用的社保与公积金项目 | needs.benefits.coverage | job |
| 五险一金与保障 | 缴纳主体、地点、基数与比例 | needs.benefits.basis | job |
| 五险一金与保障 | 从何时开始缴纳及试用期安排 | needs.benefits.start | job |
| 五险一金与保障 | 如何查询自己的缴纳记录与书面约定 | needs.benefits.verification | job |
| 团队文化与工作方式 | 任务分配、沟通和反馈方式 | needs.culture.communication | job |
| 团队文化与工作方式 | 对不同意见、错误和个人边界的处理 | needs.culture.respect | job |
| 团队文化与工作方式 | 绩效评价标准与申诉渠道 | needs.culture.evaluation | job |
| 团队文化与工作方式 | 协作方式、管理支持与团队氛围 | needs.culture.collaboration | job |
| 企业经营稳定 | 当前主营业务、产品和经营变化 | needs.company.business | company |
| 企业经营稳定 | 可获得的公开财务信息及披露日期 | needs.company.public_finance | company |
| 企业经营稳定 | 业务收缩、扩张或重组的可核查信息 | needs.company.continuity | company |
| 企业经营稳定 | 欠薪等与持续履约有关的可核查记录 | needs.company.payment_record | company |
| 职位与用工稳定 | 新增岗位、替补岗位还是短期项目 | needs.position.hiring_reason | job |
| 职位与用工稳定 | 签约主体、用工形式与合同期限 | needs.position.contract | job |
| 职位与用工稳定 | 职责、工作地点或团队可能如何变化 | needs.position.role_change | job |
| 职位与用工稳定 | 试用期考核及岗位变动的书面规则 | needs.position.probation_rules | job |

## 材料与范围接受条件

- 沿用CandidateBundle现有fact/evidence结构；facts.key精确匹配上表，value非null。clarify不是事实键，必须先澄清用户关注。
- 每条材料必须有完整的证据引用；全部引用存在，证据mode相同，companyId及jobId与事实准确对应，excerpt非空。无引用的数据库旧事实保留为后台元数据，不能凑成需求材料。其他公司、其他岗位的材料不进入该岗位回应。
- 岗位项的available必须是同jobId、同companyId、job范围、supported且全部引用verified。company/business/team范围、jobId=null的同公司资料可以作为lead，但保持原范围，不能自动套给岗位。岗位绑定的team资料也只作为线索，不能替代岗位书面说明。
- 公司项的available必须jobId=null、同companyId、company范围、已确认对应主体、supported且全部引用verified；主体关系未确认或business/team范围的资料可作为lead，不能作为签约主体的已核验事实。
- fact的conflicting/contradicted、证据disputed，或同一适用范围、同一日期的已核验supported布尔命题正反记载时显示conflicting，不能择一隐藏。文字不同不能自动判为冲突，可能是互补描述或不同日期、团队、安排。无效日期或晚于本次接入的日期不能支持当前安排，保留为待核对线索。
- 资料覆盖available本身不能填充具体需求，关键词只用于定位有引用的原文线索，不能推出满足需求。独立核验必须有真实过程；手工填写或采集器标记不能自行升级verified。
- 原始来源和日期保留。respondToJobNeeds的可选第三参数{sourceDates}接收数据库原始日期；材料sources.collectedAt使用原retrievedAtRaw。来源只有月份或无时区时保留原文，不补日、不补时区；未记录采集时间时显示未记录。本次适配器读入时间retrievedAt不冒充原始采集时间。需求修改、岗位比较和用户补充均不得刷新为“刚调查过”。

每项回应保存materials、explanation、gaps。materials包含事实引用和值、日期、原jobId以及sources；sources包含证据引用、标题、链接、原文摘录、范围、核验状态、发布日期和原始采集日期。HTML展示具体记载及来源、为什么与用户选择相关、它能说明的范围和剩余缺口。旧归档缺少增量字段时继续显示原始回应，不重写历史快照。

## 用户补充回复

/feedback/:reportId让用户选择报告中的问题，提交回复及可选链接。verificationNotes固定为user_provided_unverified，按岗位问题绑定；新报告另存，旧报告不可变。回复不写入C facts/evidence，不解除unknown或硬条件限制。后续可实现人工审核或授权数据核验器，将经核验的材料另行转为事实快照再生成报告。当前没有该审核器。

## 事实生产与核验边界

本地数据库适配器按上述键定位相关原文时必须保留unknown及unverified，不将员工评价转换成岗位承诺。例如“不打卡”只回应考勤线索，不证明排班或休息；“内部带薪培训”可以回应学习资源线索；职位要求承担对外培训不能推成员工培训福利。需要岗位书面材料和真实主体关系后，才能升级对应范围的核验结论。固定薪资必须对应这份岗位且口径明确，不能拿公司平均薪资或其他岗位替代。缺时点的来源不能宣称当前在招或安排仍有效。
