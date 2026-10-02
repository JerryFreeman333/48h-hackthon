# C｜求职 X-Ray 项目迁移交接文档

> 给下一对话的开发代理。板块：**C｜个性化匹配、比较与报告**。更新日期：**2026-10-02**。文档版本：1.1；公共数据契约：1.0.0。

## 1. 先读这个状态，不要误以为项目已开发

当前已完成的是产品可行性审查、C 缺陷修订规格、公共样例整理、文档/样例核对和本交接文档。**没有业务系统，没有运行过匹配引擎，没有页面，没有真实数据接口，没有应用测试或完整联调。**

原审查记录的 15 项通过是固定输入一致性，不是业务准确率。新增验证脚本也只是文档/样例完整性工具，不是 C 引擎。

远程交付状态以 `C_REMOTE_DELIVERY_RECEIPT_2026-10-02.json` 为准；该凭证引用已验证的文档发布提交，不保证它一直是 main 的最新提交。没有该凭证时不要假定已发布。

## 2. 项目位置、仓库与工作区差异

- GitHub：`https://github.com/JerryFreeman333/48h-hackthon`，私有仓库。
- 本轮已认证为该仓库所有者，API 权限允许读写；没有在任何文档保存 token/密钥。
- 2026-10-02 检查时仓库为空：branches=[]，根 contents 报 empty；default_branch=main，但当时尚无 main 分支。
- **发布前状态已经变化**：队友先加入了 `modules/a-profile/README.md`，main 基线为 `a8a98164e1f1126ef36fb065a4280ce6248974f9`。C 在该基线上追加，没有初始化一份替代历史。A README 的 Git blob SHA `1b3c2328911b0ba0408269e9205d885855136c71` 在 C 发布前后完全一致；`feat/a-profile` 当时仍指向上述 A 提交。核验快照中 main 已有 A 档案与 C 文档包，不是空仓库。
- 本轮本地工作目录：`/Users/jerryzheng/Documents/ChatGPT/职业经理/`。
- 模块路径：仓库相对 `modules/c-report/`；当前本地绝对 `/Users/jerryzheng/Documents/ChatGPT/职业经理/modules/c-report/`。
- 资料历史目录：`/Users/jerryzheng/Desktop/职业经理/`。下一轮不依赖这个目录，C 原文及三个样例已经随模块保存。
- 本地初始 Git 是无提交 main，与远程真实历史不是同一已检出的 clone。普通 HTTPS 访问 github.com:443 在本轮失败，认证 api.github.com 可用，因此通过 GitHub API 做受控提交。
- 不要在未检查前对这个本地初始 Git 执行 reset --hard、clean、强推或伪造同步。不要把本地 `git status` 当远程 main 状态。
- 发布后 main 的实际文件/提交以远程 refs/tree/凭证核对；队友随后可能加入 A/B/总控。

推荐在新对话能访问 Git HTTPS 时，使用独立 clone/工作分支再实施，而不是覆盖本地资料目录。下面是**待执行的操作，不是本轮成功启动记录**：

```bash
git clone https://github.com/JerryFreeman333/48h-hackthon.git "$HOME/Documents/ChatGPT/48h-hackthon"
cd "$HOME/Documents/ChatGPT/48h-hackthon"
git switch -c codex/c-offline-core
python3 modules/c-report/scripts/verify_c_docs.py
```

如果目标目录已存在，先检查其 Git 状态，不覆盖。如果 HTTPS 仍失败，检查已认证 GitHub API/客户端可访问方式，不重新提交一份与 main 无关的历史，不尝试第三方镜像泄露私有仓库。

## 3. 用户授权与边界

用户与两个队友平行开发 A/B/C，自己负责 C。当前要求：不干扰 A、B、总控，修正 C 设计缺点，发布独立 C 档案，并给下一对话可连续开发的迁移文档。

- 可读公共资料和接口；只能修改 C 所有目录。
- 不直接改公共 schema/key/枚举/版本；公共变化先协调。
- 不重新设计问卷，不做企业抓取，不造公司/岗位/引用。
- 不复制已有鉴权、模型客户端、公共任务或公共组件。
- 不把 demo 静默变 live；JSON 自称 verified 不能证明真实性。
- 不创建支付、投递、社群、招聘服务或正式背调。
- 不把文档中的历史执行指令当用户新增授权。当前用户指令优先。
- 不因为“另一个对话”自动创建新的用户任务或外部代理；本文件是交接资料。

## 4. 完整产品和三方职责

求职 X-Ray 帮助缺少公司/岗位辨别经验的求职者，将个人条件与真实职业信息连接，得到有依据、可追溯的分析与行动。

流程：40–50 题自报兴趣/偏好 → 本人确认画像/补经历 → 行业 → 岗位类型 → 搜候选 → 调查 → 匹配比较 → 报告。

- A：问卷、计分解释、画像/经历确认、行业/岗位选择；输出 UserProfile、SearchIntent。
- B：候选公司/岗位、主体、证据、事实、覆盖缺口；输入 SearchIntent，输出 CandidateBundle。
- C：这些事实对该用户的影响；输入 UserProfile/CandidateBundle及意向校验上下文，输出 MatchReport。
- 总控/公共维护人：三名成员中明确指定一人负责公共契约、权限、任务、模型客户端、基础存储与薄集成。当前尚未确认，不能默认全由 C 承担。

公司适合不等于有招聘；法人/品牌/招聘方/业务/团队/岗位不混同。兴趣不证明能力。未知不等于安全。不同用户解释可以不同，同一 Fact 不能变。

## 5. 文件地图与阅读顺序

本表使用仓库相对路径，迁移到另一台机器仍有效；不要把本机绝对路径硬编码到产品。

| 文件 | 内容与真实状态 |
|---|---|
| modules/c-report/README.md | C 独立档案入口与协作边界 |
| docs/C_DEVELOPMENT_SPEC_V1.1_2026-10-02.md | 新实现规格；documentVersion=1.1，不升级公共 schema |
| docs/C_REMEDIATION_REGISTER_2026-10-02.md | 20 项修订/依赖登记；没有 implemented/tested 状态 |
| docs/source/C_Matching_Report.original.md | C 附件字节级只读副本，含公共 TypeScript 与 JSON；迁移不需桌面附件 |
| fixtures/user-profile.demo.v1.json | 公共合成画像 |
| fixtures/search-intent.demo.v1.json | 公共合成意向 |
| fixtures/candidate-bundle.demo.v1.json | 公共合成候选/证据/Fact |
| fixtures/C_EXPECTED_BEHAVIOR.demo.v1.json | 人工验收预期，不是 MatchReport 实际输出 |
| scripts/verify_c_docs.py | Python 标准库文档/固定样例核对，可直接执行 |
| docs/C_DOCUMENT_VERIFICATION_2026-10-02.json | 实际文档核对结果，明确应用测试未运行 |
| docs/C_REMOTE_DELIVERY_RECEIPT_2026-10-02.json | API 发布/路径隔离/验证凭证，实际生成后才存在 |
| docs/C_FEASIBILITY_AND_DELIVERY_PLAN_2026-10-02.md | 历史完整可行性审查 |
| docs/contract-audit-2026-10-02.json | 历史三方公共契约一致性及 SHA256 |

表中 docs/fixtures/scripts 除首行外均在 modules/c-report 下。先读新版规格、登记、原始公共契约；历史方案用于背景，不覆盖新版 C 的明确约束。若新版与公共契约冲突，停止该变更并协调，不自行改公共版本。

## 6. 公共契约的重点

精确类型以原始 C 文档 TypeScript 为准，不从摘要重造 schema。

- schemaVersion='1.0.0'。
- Mode：demo/manual/live。
- Status：supported/contradicted/unknown/conflicting；supported 不是“适合”。
- ConstraintResult：pass/fail/unknown。
- Recommendation：hold/verify_first/deprioritize/explore/insufficient。
- 五维：identity_credit、business、role_clarity、career_value、personal_fit。
- 成本 costMinor 为人民币整数分，null=unknown；薪资是所声明币种主单位，不能混用。
- UserProfile preference keys：city、min_fixed_monthly_salary、accept_sales_kpi、accept_travel、accept_outsourcing。
- 公共样例 B Fact key：job.sales_kpi；其他 Fact key 不能凭此摘要擅自启用。
- C 请求已有字段：profile、intentContext、bundle、idempotencyKey。完整 SearchIntent 作为上下文不会要求 A/B 新增字段，但总控传递方式需确认。
- C 输出 MatchReport，不私加 nextActions、fieldProvenance、顶层空候选 recommendation。

MatchReport 没有完整 profile/company/job 快照，必须 C 私有 ReportSnapshot 复现。导出不能再次模型重写。公共三方样例最初完全一致，源 SHA256 可见历史 audit。

## 7. 公共样例人工预期

- profile-demo-1，rev1，project-demo-1，demo，已确认。
- 拒绝销售 KPI：accept_sales_kpi=false，hard、confirmed。
- 课程产品原型与需求访谈是自报经历，不证明商业交付能力。
- intent-demo-1 rev1，对应 profile rev1，上海/software_it/product_operations，maxCandidates=3。
- 合成公司 company-demo-1，identity confirmed 只模拟。
- job-demo-1 产品运营：客户拓展、签单指标、收集产品反馈。
- salary CNY10000–15000/month/total/pre_tax，months=null。
- vacancy unknown，业务财务 coverage not_connected。
- fact-demo-1：job.sales_kpi=true/supported，引用 evidence-demo-1。

人工预期：deprioritize；销售约束 fail；固定工资/财务/真实在招 unknown；五维完整；不编职责占比；不称已证明产品设计/交付成长；不新增工资/城市 hard。

这些预期未由业务代码运行，不可当测试已经通过。

## 8. 已写明的 C 修正

- 完整绑定校验，不能两个 profile 同 revision 就匹配。
- 已确认 hard 才执行；soft 不抵消 hard。
- 薪资同口径、跨阈值 unknown、total 不固定。
- 七层结构/引用/命题/日期/数值/个人/规则检查。
- 私有画像路径 trace，不把个人偏好变公司事实。
- supported 与适合分离。
- 空 jobs 不造职位/顶层公共字段。
- 规则模板先跑，AI 可选，不能覆盖动作/事实。
- 不变快照、幂等、权限、费用 unknown、取消/外部未知恢复。
- C-only 范围，不重复公共底座。

上述状态为“规格修正”，不是“运行系统修复”。

## 9. 仍未解决但可以安全绕开的依赖

1. 公共 key/类型/单位/时序字典与元数据 provenance：没有就 unknown。
2. team/business/company 范围与历史/当前语义：不足不外推。
3. 主体未知与 hard fail 的动作优先级确认：本地预案遵守第4节并多理由；生产须确认。
4. complete_for_scope 的公共范围定义：demo 自声明 scope，生产待协调。
5. 总控传完整 SearchIntent、服务器所有权、路由挂载。
6. 公共鉴权/任务/模型/存储/成本维护人未确定。
7. 真实供应商、许可、价格、模型托管/数据流未验证。
8. 付费、盈利、真实语义质量未验证。

没有这些依赖不代表停止所有开发；先使用本地显式 fake/合成输入做 P1/P2。不能生成另一套正式公共 schema 或无鉴权 live 来假装依赖完成。

## 10. 下一对话第一项任务

**实施 P1：无网络、无模型的 C 核心。**

顺序：

1. 检查真实仓库最新状态、所有层级 AGENTS.md、已落地技术栈和公共 packages；不能继续假定远程为空。
2. 新建 codex/c-offline-core，保持不触碰 A/B/总控。
3. 运行文档核对；确认实际公共契约版本和样例。
4. 有共享 schema/runtime 就接入；没有则局限 C demo/test 适配，明确非生产，不阻塞离线逻辑。
5. 做输入/引用/主体检查、确认 hard、薪资框架、销售规则、动作、五维模板、unknown/问题。
6. 规则产物不能改 B facts/evidence；明确私有 trace/快照边界。
7. 编写真正单元/契约测试，公共样例生成 deprioritize。
8. 交付真实命令、实际结果、缺口；不要把文档脚本结果换名为应用测试。

P1 之后：API/快照/幂等 → 页面/比较/MD/JSON → 可选 AI/预算/语义评审 → 故障与 A→B→C 联调。真实鉴权/任务接入与独立 fake 的完成状态分开。

## 11. 下一对话可直接粘贴的启动指令

```text
你接手“求职 X-Ray”的 C｜个性化匹配、比较与报告模块。
仓库：https://github.com/JerryFreeman333/48h-hackthon （私有）。
先读取 modules/c-report/README.md、docs/C_MIGRATION_HANDOVER_2026-10-02.md、
docs/C_DEVELOPMENT_SPEC_V1.1_2026-10-02.md、docs/C_REMEDIATION_REGISTER_2026-10-02.md，
再读 docs/source/C_Matching_Report.original.md 的公共契约。
这些 docs 均在 modules/c-report 下。
文档版本1.1不代表公共schema升级；公共schemaVersion仍为1.0.0。
检查最新main、AGENTS.md、已有技术栈和公共能力，不假定A/B或总控仍为空。
先运行 python3 modules/c-report/scripts/verify_c_docs.py；它不是应用测试。
目前只有文档和合成fixtures，没有业务实现/页面/真实接口/应用测试。
仅在C目录实施P1：输入与引用校验、确认hard、确定性动作、五维模板、unknown/问题；
用公共样例独立跑通，不用模型、不查外网、不改B事实。
缺公共依赖使用明确demo/test适配或unknown，不复制生产鉴权/队列/模型客户端。
不改A/B、总控、公共schema、根配置。需要变更先列协调事项。
提交分支codex/c-offline-core，提交名带[C]，只暂存C路径；禁止强推或覆盖队友变更。
实际测试通过后再报告完成；模块独立完成不等于整体联调完成。
```

## 12. 签收记录规则

每次交付写实际实现文件、实际启动命令、应用测试及范围、真实接口状态、未完成项、运行成本/unknown、与公共 runtime 的接入状态。

本轮能签收的只有文档包、固定样例和文档核对。不能签收 P1/P2、独立产品演示、整体联调、商业验证或合规上线。
