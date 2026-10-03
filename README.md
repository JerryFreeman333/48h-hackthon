# 求职 X-Ray

契约版本 `1.0.0`。main 已包含 A、B、C；本机集成入口串联 A 确认需求、B 候选检索、C 规则报告。

2026-10-03最新状态：按用户新确认，首页直接进入原有求职需求界面，仅保留“开始新的判断”“继续上次的判断”两个主按钮。移除开始模式及导入文件入口；历史页可恢复草稿、已确认需求和报告。下载按钮和HTTP导出接口关闭，内部保存、版本和ABC整合保留；杭州扩展未恢复，数据库未接入。此前回退记录保留为历史，当前范围以[续做记录](docs/PRODUCT_CONTINUATION_2026-10-03.md)末节为准。

最新补充：已增加首页小展示入口与报告顶部资料来源/核验状态标签；展示仅使用有来源和实际资料声明的本会话案例，目前没有实际案例，不填充合成样例。

## 启动和检查

完整项目建议 Node.js 22+（A 的运行要求）。安装根依赖即可启动集成入口：

```powershell
npm ci
npm run dev
npm run typecheck
npm test
npm run test:a
npm run test:b
npm run test:c
npm run test:integration
npm run build
```

默认地址 http://localhost:3000。端口占用时使用 `npm run dev -- --port 3001`。

首页提供两个产品入口：已有JD直接分析（/analyze），未定岗位先整理七主题需求（/profile?new=1）。本人确认的需求进入岗位报告；也可明确确认暂时全部未知，继续分析岗位材料。七主题重点和未知处理意愿进入调查清单与报告，不生成匹配分。

报告支持补充核验回复（保持用户提供、待核验）、修改需求后新版本、更新同一岗位JD材料以及同一需求版本2–3岗位比较。/history可找回所有历史版本，/compare每岗位显示最近生成报告，避免将修订/回复当多个候选。资料和需求更新均另存报告，旧归档与旧导出不覆盖。

/profile与/demo/a在Next内挂载A中文界面；Next需求数据另存.data/integration-a/state.json。报告完整输入、证据、MD/JSON保存在.data/integration-reports，按本地会话隔离，可跨服务重启恢复；清除浏览器会话后不能当作正式账户恢复。B/C运行时仍为内存适配器，文件归档不是生产数据库。

/flow保留ABC合成联调，方便开发检查。演示公司和岗位不代表现实调查；真实人工需求不会转换成合成结果。报告路径/flow/reports/:id沿用原联调命名，人工报告有明确资料标识。核验回复不能自动成为已核实事实；新JD录入时间不证明招聘仍有效。

## 分支与目录

- `main`：公共配置和契约，以及 A/B/C 业务实现与集成入口。
- `work/b-research`：公共基线 + `modules/b-research` 和 B 的路由绑定。
- A/B/C 的历史分支保留；继续开发时从当前 main 建立工作分支。

只通过契约和 API 交换数据；模块不得直接读取其他模块内部数据库。路由绑定放 `app`，业务实现放 `modules`。

## 公共能力

`packages/contracts` 提供四个 schema 和 TypeScript 类型，以及引用/项目/版本/模式边界检查。公共样例在 `packages/contracts/fixtures`。UserProfile、SearchIntent、CandidateBundle 从附件直接提取；MatchReport 是合成期望输出，不是 C 规则实现。

`packages/runtime` 提供错误格式、默认拒绝的项目所有权校验、调用预算代码、成本汇总和统一身份/快照/持久任务接口。`packages/ui` 提供基础页头、状态标签和样式。

## 尚未接入

共享 PostgreSQL、正式账户、持久 worker、真实模型与企业/招聘 provider 尚未接入。A需求和本机集成报告已有文件持久化，B/C运行适配器仍使用内存。七主题事实生产器和独立材料审核器尚未接入。`.env.example` 记录配置占位；公共 runtime 接口不是实际数据库或调度器。真实数据和多人上线仍需落实这些基础能力。

产品结果、你下一步的工作与实际边界见 `docs/PRODUCT_HANDOFF_2026-10-03.md`。当前产品方向和实际进度见 `docs/PRODUCT_PLAN_2026-10-03.md`，演示步骤见 `docs/PRODUCT_ACCEPTANCE_WALKTHROUGH.md`。开工分析、前端逻辑问题与建议顺序见 `docs/PROJECT_ANALYSIS_2026-10-03.md`；简易 HTML 逐项审计见 `docs/frontend-analysis-2026-10-03.md`。

模块独立开发与 A→B→C 整体联调是不同验收等级。接入方式、责任登记和联调清单见 `docs/ARCHITECTURE.md`。合成测试不证明真实公司准确率。


本地数据库接入（2026-10-03）：A确认侧写后/research读取本机.data/company-database/xray-v3-20261003.sqlite，选择候选即可生成C报告。需本机Node 24运行时（本轮已用v24.19.0编译运行）；数据库文件不入Git，下载接口继续关闭。接入范围、证据处理和验收见docs/PRODUCT_CONTINUATION_2026-10-03.md最新记录。
