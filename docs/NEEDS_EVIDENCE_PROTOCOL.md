# 七主题材料回应对接协议（当前产品扩展）

当前版本 product-needs-1。这是本地整合层读取约定；不是已经完成的B生产器，也不自动宣称公司真实事实。现行B仍可输出原始JD和已有事实，七主题生产器未接入时保持未知。

## 数据流与判断

A确认的JobNeedsSnapshot生成调查计划；B提供同一项目、模式及岗位范围的材料；整合层回应每一明细并生成必问清单。C继续判断已有硬条件和基础岗位事实。最终产品动作另存productActions，JSON中的原始report仍是C规则结果。

重点且未知处理为verify_first的未决项阻止“继续了解”；continue_with_unknown不解除未知，但不增加这一门槛。已有核验材料只代表对应问题有材料，不代表用户需求已满足。

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

## 接受条件

- 沿用CandidateBundle现有fact/evidence结构；facts.key精确匹配上表，value非null，status为supported。clarify不是事实键，必须先澄清用户关注。
- 岗位项必须匹配jobId与companyId；公司项jobId=null，companyId对应该岗位的已确认主体。其他公司/其他岗位/团队材料不提升这一项。
- 每条事实必须有证据引用；全部引用存在，证据mode相同，scope、companyId、jobId准确对应，verification=verified，excerpt非空。provider负责真实核验过程；手工填写不能自行升为verified。
- 相互矛盾状态或同项不同supported值显示conflicting，不能择一隐藏。未核验、缺少来源、主体未确认、覆盖available以及JD关键词均不构成已回应。
- 原始来源和日期保留；需求修改、岗位比较和用户补充均不得刷新为“刚调查过”。

## 用户补充回复

/feedback/:reportId让用户选择报告中的问题，提交回复及可选链接。verificationNotes固定为user_provided_unverified，按岗位问题绑定；新报告另存，旧报告不可变。回复不写入C facts/evidence，不解除unknown或硬条件限制。后续可实现人工审核或授权数据核验器，将经核验的材料另行转为事实快照再生成报告。当前没有该审核器。

## 下一步实现边界

先对照现有CandidateBundle验证接口制作一个七主题材料适配器，分别测试主体不明、团队材料、岗位材料、资料过期与矛盾；不要靠关键词把公司信息变成个人适合结论。尚缺逐字段city/salary/vacancy来源协议，现行字段仅为声明，仍不能直接解除硬条件未知。
