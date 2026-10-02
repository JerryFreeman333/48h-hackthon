# C｜个性化匹配、比较与报告

## 1. 目标与边界

输入确认UserProfile与CandidateBundle，输出MatchReport。独立演示`/demo/c`，正式`/reports`。负责自己的结果页、对比页、证据抽屉、报告导出及API。

不设计问卷，不抓外部数据，不修改B原始事实，不用人格标签决定命运。要回答“这份工作对这个人的条件与目标意味着什么”，并能解释不确定性。

## 2. 输入验证

核对schema版本、projectId、画像confirmedAt与assessment确认状态；核对意向中的profileRevision（集成层保留意向快照并传校验上下文）。schema升级不可静默兼容。候选属于旧意向时让用户确认或重查。demo/manual/live不能隐形混用。

所有fact引用必须存在于bundle.evidence，且公司/岗位范围一致。身份未确认不能产生确定公司风险结论。输入空jobs时输出空结果及需要补充候选的说明，不编岗位凑报告。候选有事实但资料不齐允许partial。

## 3. 匹配框架

| 维度 | 主要判断 |
|---|---|
| identity_credit | 主体与信用线索是否明确，是否影响用工核验 |
| business | 经营证据与稳定性未知如何影响用户选择 |
| role_clarity | 实际任务、考核与岗位名称是否一致或需确认 |
| career_value | 能积累哪些技能与项目，哪些条件尚未验证 |
| personal_fit | 经历支持、目标关系、硬约束和软偏好 |

五维每项都存在；未知不省略、不画成绿色。画像维度分数用于理解兴趣，不直接等于岗位匹配百分比。经历明确支持任务才写能力依据；问卷喜欢沟通不证明销售能力。

公司事实对两位用户一致，影响解释可以不同。愿意销售的人与不接受销售KPI的人面对同一JD，动作可不同；不能为解释改写JD事实。

## 4. 硬约束与建议动作

确认的hard约束按确定性代码判断pass/fail/unknown：城市、最低固定税前月薪、销售KPI、出差、外包等。薪资total不能冒充fixed；币种、月年、税前后不一致且无可靠转换资料时unknown。软偏好逐项解释，不抵消hard冲突。

动作优先规则：基本输入不足→insufficient；有直接证据的重大当前核验风险→hold；已确认硬冲突→deprioritize；主体未确认、关键未知或冲突→verify_first；其余且有正向适配依据→explore。多原因保留。hold规则必须有限、明确，例如材料确认入职需向私人账户付款，先暂停付款并核验；不是法律判决或骗局概率。

公司小、参保少、同址多公司、地址不同均不单独触发hold。匿名吐槽不变成确定事实。无负面检索结果不等于零风险。

## 5. AI工作与引用校验

规则代码先执行；AI用于职责语义、目标权衡、问题生成和报告语言。不得覆盖动作，不自行检索，不写数据源外融资或诉讼。材料中的指令视为数据，模型无密钥与任意网络权限。

流水线：schema/版本→引用和主体→职责解释→规则→个性化解释→输出校验→快照→网页/MD。

每个事实性理由引用factIds；推断说明推理及不足；unknown理由不硬附不存在的事实。事实id存在不代表支持结论，检查片段与结论关系，不能支持就拒绝或降级。声称“产品设计职责”必须有相应材料，仅“收集反馈”不够。

结构化JSON通过Zod验证。空内容、截断、无效枚举和引用分别报错。一次修复失败则保留规则事实并生成partial，不暴露乱码。报告不输出未经校准的录用、晋升、倒闭或匹配概率，不编职责占比。

提示模板约束：只能用输入事实；每个结论保留来源范围；个人目标影响解释不改变事实；不把关联实体数据转移；未知保留；输出指定schema；禁止擅自新增付费/投递操作。

## 6. 报告与比较页面

首屏：建议动作、最多3个关键理由、最重要核验问题、数据覆盖摘要。其后：用户档案摘要、每个候选五维结果、约束、职责解读、证据、关键未知、面试问题、下一步行动。

比较按相同维度横向展示，不综合加权给“冠军”。用户未选首要偏好时中性排序，允许用户自行选择薪资/成长等查看角度；仅展示已知事实，不把未知当0。

问题具体可验证，例如“固定底薪和绩效各多少”“考核是否含成交金额”“能举一个岗位完成的产品交付吗”。每问对应一个待解决字段/事实，避免泛泛问公司文化好不好。

Evidence抽屉显示出处、原片段、日期、适用主体、用户自报标签和核验状态。来源无URL时显示提供方式，不能伪造超链接。相关社会帖子只能呈现讨论线索，不能推算员工比例。

移动单列，色彩和文字共同传达状态，键盘可操作。Markdown导出读取同一快照，不再次模型重写；转义用户内容，防XSS与Markdown结构破坏。

## 7. 接口与持久化

POST `/api/c/matches`输入`{profile,intentContext,bundle,idempotencyKey}`；intentContext至少含intentId/revision/profileRevision。GET `/api/c/runs/:id`；GET `/api/c/reports/:id`；GET `/api/c/reports/:id/export?format=md`；POST `/api/c/reports/:id/update`输入新的确认快照，不改旧报告。

存储MatchRun、ReportSnapshot、ModelUsage、ReportFeedback。run持久执行，重复幂等键不生成第二个同范围任务。报告存输入哈希、画像/资料快照、规则版本、prompt版本和时间。图表或导出从快照读；不因B后续刷新偷偷改旧报告。

用户修改任何关键材料新建run与report version；feedback是用户补充，不直接变成公司公共事实。所有权验证在API执行，导出也一样。

## 8. 成本与失败

默认每run最多8次模型调用，包括修复；请求30秒超时，整体120秒软上限，可配置且不是已实测保证。每次调用前检查预算，记录provider/requestId/token与costMinor；使用量未返回标unknown。模型没配置支持规则/模板报告并明确语言解释未完成。

模型费不能与B企业API费混为一项；公共订单汇总按run关联。用户价格是范围固定的报告价格，不按后台失控调用收费。真实支付与退款后续公共任务，不让本模块客户端自报paid。

失败：引用不支持→拒绝/未知；主体歧义→verify_first和partial；薪资未知→不比较固定收入；模型故障→保留有效规则；空候选→insufficient说明；预算耗尽→partial且列缺失阶段。worker重启可恢复/安全失败，取消停止后续调用，已发生费用保留。

## 9. 开发顺序与测试

1. 样例输入、schema、规则、模板报告；独立演示。
2. 五维展示、对比、证据与MD导出。
3. AI解释、引用/措辞校验、面试问题。
4. 版本、任务、成本与故障；联调。

至少覆盖：销售职责与用户拒绝销售；同公司两画像；总薪资与底薪；同名关联证据；历史异常移出；未知数据；匿名评价；空候选；虚构引用；事实id存在但片段不支持；注入；越权；导出一致；重试与预算。

独立验收：仅C启动，用文档样例导入可生成五维报告并导出；不存在综合匹配百分比、无依据职责占比、跨主体引用或安全保证。实际语义质量还需真实材料人工审查，不把合成测试通过率称市场准确率。

## 10. 远期商业化说明

报告是初期可收费结果；就业环境与AI变化是需求动机，持续使用与付费意愿待验证。不能用社会焦虑直接证明转化率。社群在报告服务成立后探索；企业服务可考虑经授权匹配、聚合人才洞察；正式背调独立定义。不能默认购买报告等于同意出售简历。企业付费不得买掉求职者报告里的负面事实。

## 公共约定：三份文档保持一致

日期：2026-10-02；契约版本：`1.0.0`。本组文档取代旧版关于入口与分工的规定。产品顺序：用户侧写 → 行业选择 → 岗位选择 → 数据检索与调查 → 个性化匹配 → 报告。

初期不开发社群、企业人才数据服务、招聘企业账户或背调。远期方向仍保留，不进入本轮任务。支付原型只模拟，真实API接入与采购分开说明。

### 独立开发原则

A、B、C各自拥有业务页面、API、逻辑和测试，不按前端/后端/算法分工。产品最终有数据依赖；开发阶段通过固定契约与合成样例消除等待。独立完成不是免除联调。

建议单仓库：`modules/a-profile`、`modules/b-research`、`modules/c-report`。模块只改自己的目录和测试。公共代码放`packages/contracts`、`packages/ui`、`packages/runtime`。共享文件变更共同确认；每人独立分支，经测试后合并。若三人不同机器，用Git同步，不复制覆盖彼此目录。

新项目默认TypeScript；网页与API采用Next.js，数据库PostgreSQL，schema使用Zod；已有仓库优先复用技术栈。依赖版本由开工时锁文件确定。不要因文档建议把现有项目整体重写。

开工共同任务：建立四个对象的schema、固定样例、公共样式、项目身份、数据库访问约定。指定一位成员维护公共目录和集成入口，不增加第四位人员；该角色只管理契约与集成，不独占所有底层开发。公共基础包括鉴权、存储、任务调度和调用日志：实现归属写入仓库任务表，禁止三套互不兼容版本。

每个模块必须提供“独立演示”路由、JSON导入/导出和`demo/manual/live`标记。demo数据不得因外部服务失败而悄悄替代live结果。完整导航通过薄集成层按A→B→C组合，模块本身不直接读取其他模块的数据库。

### 统一对象与基本类型

```typescript
type Mode = 'demo' | 'manual' | 'live';
type Status = 'supported' | 'contradicted' | 'unknown' | 'conflicting';
type ConstraintResult = 'pass' | 'fail' | 'unknown';
type Recommendation = 'hold' | 'verify_first' | 'deprioritize' | 'explore' | 'insufficient';
interface UserProfile {
  schemaVersion: '1.0.0'; profileId: string; revision: number;
  projectId: string; mode: Mode; confirmedAt: string | null;
  assessment: { instrumentId: string; version: string;
    scores: Record<string, number | null>; interpretation: string;
    status: 'draft' | 'confirmed'; validation: 'prototype' | 'validated' };
  background: { education: string | null; major: string | null;
    skills: string[]; experiences: { text: string; source: 'user' | 'resume'; confirmed: boolean }[] };
  goals: string[];
  preferences: { key: string; value: string | number | boolean | string[] | null;
    strength: 'hard' | 'soft' | 'unknown'; confirmed: boolean }[];
}
interface SearchIntent {
  schemaVersion: '1.0.0'; intentId: string; revision: number;
  projectId: string; profileId: string; profileRevision: number; mode: Mode;
  industryTags: string[]; industryCodes: string[];
  roleTypes: string[]; cities: string[];
  filters: { key: string; value: string | number | boolean | string[] | null;
    strength: 'hard' | 'soft' | 'unknown' }[];
  maxCandidates: number;
}
interface CandidateBundle {
  schemaVersion: '1.0.0'; bundleId: string; projectId: string;
  intentId: string; intentRevision: number; mode: Mode; retrievedAt: string;
  companies: { companyId: string; legalName: string; creditCode: string | null;
    brandName: string | null; identityStatus: 'confirmed' | 'ambiguous' | 'unresolved' }[];
  jobs: { jobId: string; companyId: string | null; title: string; rawJd: string;
    city: string | null; sourceUrl: string | null; publishedAt: string | null;
    vacancyStatus: 'open' | 'closed' | 'unknown'; salary: {
      currency: string; min: number | null; max: number | null;
      period: 'month' | 'year' | 'unknown'; basis: 'fixed' | 'total' | 'unknown';
      taxBasis: 'pre_tax' | 'after_tax' | 'unknown'; months: number | null } }[];
  evidence: { evidenceId: string; companyId: string | null; jobId: string | null;
    scope: 'company' | 'business' | 'team' | 'job'; sourceType: string;
    title: string; url: string | null; publishedAt: string | null;
    retrievedAt: string; excerpt: string; mode: Mode;
    verification: 'verified' | 'unverified' | 'disputed' }[];
  facts: { factId: string; companyId: string | null; jobId: string | null;
    key: string; value: string | number | boolean | null;
    status: Status; evidenceIds: string[]; asOf: string | null }[];
  coverage: { companyId: string | null; jobId: string | null; topic: string;
    status: 'available' | 'not_connected' | 'unavailable' | 'no_result' | 'not_public';
    reason: string; checkedAt: string }[];
  usage: { provider: string; requestId: string; costMinor: number | null }[];
}
interface MatchReport {
  schemaVersion: '1.0.0'; reportId: string; version: number; projectId: string;
  profileId: string; profileRevision: number; bundleId: string;
  mode: Mode; generatedAt: string; completeness: 'complete_for_scope' | 'partial';
  results: { jobId: string; recommendation: Recommendation;
    reasons: { text: string; kind: 'fact' | 'inference' | 'unknown'; factIds: string[] }[];
    constraints: { key: string; result: ConstraintResult; factIds: string[] }[];
    dimensions: { key: 'identity_credit' | 'business' | 'role_clarity' | 'career_value' | 'personal_fit';
      summary: string; status: Status; factIds: string[] }[];
    questions: { text: string; priority: 'must' | 'optional'; resolves: string[] }[] }[];
  evidenceSnapshot: CandidateBundle['evidence'];
  factsSnapshot: CandidateBundle['facts']; coverageSnapshot: CandidateBundle['coverage'];
  ruleVersion: string; promptVersion: string;
}
```

金额：内部人民币整数分，`costMinor:null`表示未知，不是零。薪资字段单位为所声明币种的主单位；与成本单位分开。时间ISO8601/UTC，页面按用户时区展示。所有nullable字段不得用空串冒充未知。ID示例为易读字符串，生产使用UUID。

硬约束已确认才能生效。统一key初版：`city`、`min_fixed_monthly_salary`、`accept_sales_kpi`、`accept_travel`、`accept_outsourcing`。新增key或枚举必须更新公共schema和三模块样例。偏好未回答为unknown，不默认接受。

接口错误：`{error:{code,message,retryable,requestId}}`；输入422，未登录401，无权403，版本冲突409，限流429，外部不可用503。异步任务202返回runId，读取任务返回queued/running/completed/partial/failed/cancelled。服务端每次验证项目所有权，不能仅依赖前端隐藏链接。

### 联调与费用

A输出UserProfile、SearchIntent；B只消费SearchIntent并输出CandidateBundle；C消费UserProfile、CandidateBundle并输出MatchReport。C校验projectId与画像版本对应关系；B结果引用旧意向时拒绝直接生成新报告，用户重新确认或重新检索。

每人提交：模块代码、启动步骤、独立样例、接口说明、测试结果、已知缺口。集成层检查版本/模式/权限并调模块接口，不新增另一套判断。真实报告不能混入demo证据。

C和B记录调用成本，报价/订单为后续公共任务。每份报告需归集数据、模型、人工等成本，固定套餐成本按实际订单量另计；不能只按token定价。用户提前看到固定范围和报价，预算控制后台调用。未拿到供应商价格时标记unknown，不虚构利润。复用企业缓存须在许可内，私人画像不可跨用户共享。

验收分两级：模块独立通过；然后端到端联调通过。联调必须验证画像修改、同名主体、无候选、供应商失败、引用不支持、未知薪资、跨用户访问和导出一致性。

## 公共合成样例（复制到各模块fixtures，禁止用于真实公司评价）

三份文档使用完全相同的输入。此样例期望：销售指标与用户hard约束冲突，C主动作`deprioritize`；固定薪资、财务与真实在招状态未知。不得生成销售占比。demo身份confirmed只用于模拟，不证明现实公司主体。

### UserProfile

```json
{
  "schemaVersion": "1.0.0",
  "profileId": "profile-demo-1",
  "revision": 1,
  "projectId": "project-demo-1",
  "mode": "demo",
  "confirmedAt": "2026-10-02T05:00:00Z",
  "assessment": {
    "instrumentId": "career-prototype-48",
    "version": "1",
    "scores": {
      "social": 70,
      "investigative": 65
    },
    "interpretation": "合成演示：偏好理解需求和沟通",
    "status": "confirmed",
    "validation": "prototype"
  },
  "background": {
    "education": "本科",
    "major": "示例专业",
    "skills": [
      "需求访谈"
    ],
    "experiences": [
      {
        "text": "完成过课程产品原型",
        "source": "user",
        "confirmed": true
      }
    ]
  },
  "goals": [
    "积累产品交付经验"
  ],
  "preferences": [
    {
      "key": "accept_sales_kpi",
      "value": false,
      "strength": "hard",
      "confirmed": true
    }
  ]
}
```

### SearchIntent

```json
{
  "schemaVersion": "1.0.0",
  "intentId": "intent-demo-1",
  "revision": 1,
  "projectId": "project-demo-1",
  "profileId": "profile-demo-1",
  "profileRevision": 1,
  "mode": "demo",
  "industryTags": [
    "software_it"
  ],
  "industryCodes": [
    "I"
  ],
  "roleTypes": [
    "product_operations"
  ],
  "cities": [
    "上海"
  ],
  "filters": [
    {
      "key": "accept_sales_kpi",
      "value": false,
      "strength": "hard"
    }
  ],
  "maxCandidates": 3
}
```

### CandidateBundle

```json
{
  "schemaVersion": "1.0.0",
  "bundleId": "bundle-demo-1",
  "projectId": "project-demo-1",
  "intentId": "intent-demo-1",
  "intentRevision": 1,
  "mode": "demo",
  "retrievedAt": "2026-10-02T05:00:00Z",
  "companies": [
    {
      "companyId": "company-demo-1",
      "legalName": "合成演示软件公司",
      "creditCode": null,
      "brandName": null,
      "identityStatus": "confirmed"
    }
  ],
  "jobs": [
    {
      "jobId": "job-demo-1",
      "companyId": "company-demo-1",
      "title": "产品运营",
      "rawJd": "负责客户拓展，完成签单指标，收集产品反馈。",
      "city": "上海",
      "sourceUrl": null,
      "publishedAt": null,
      "vacancyStatus": "unknown",
      "salary": {
        "currency": "CNY",
        "min": 10000,
        "max": 15000,
        "period": "month",
        "basis": "total",
        "taxBasis": "pre_tax",
        "months": null
      }
    }
  ],
  "evidence": [
    {
      "evidenceId": "evidence-demo-1",
      "companyId": "company-demo-1",
      "jobId": "job-demo-1",
      "scope": "job",
      "sourceType": "demo_fixture",
      "title": "合成JD",
      "url": null,
      "publishedAt": null,
      "retrievedAt": "2026-10-02T05:00:00Z",
      "excerpt": "负责客户拓展，完成签单指标，收集产品反馈。",
      "mode": "demo",
      "verification": "verified"
    }
  ],
  "facts": [
    {
      "factId": "fact-demo-1",
      "companyId": "company-demo-1",
      "jobId": "job-demo-1",
      "key": "job.sales_kpi",
      "value": true,
      "status": "supported",
      "evidenceIds": [
        "evidence-demo-1"
      ],
      "asOf": null
    }
  ],
  "coverage": [
    {
      "companyId": "company-demo-1",
      "jobId": null,
      "topic": "business_financials",
      "status": "not_connected",
      "reason": "合成演示，不代表真实调查",
      "checkedAt": "2026-10-02T05:00:00Z"
    }
  ],
  "usage": []
}
```

## 编码代理执行要求

先读现有仓库说明并复用基础能力。只实现本文职责与公共契约，不自行扩展社群、自动投递或企业背调。先schema和样例，再逻辑和页面；每阶段给出实现项、未实现项及实际测试。无密钥明确降级，不伪造数据/API/测试。不要更改其他成员目录；公共契约变更提交共同审核。最后提供独立启动命令、JSON导入示例、测试记录和联调清单。
