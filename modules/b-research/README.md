> 当前集成说明（2026-10-03）：下文是 B 的独立原型与开发 API 说明；真实产品使用 /research，本地数据库与 Agent 经集成层接入。旧工作台的 JD / JSON / 导出能力不作为真实需求入口。集成运行要求 Node.js 24；请先看[根 README](../../README.md)与[当前状态](../../docs/CURRENT_STATE.md)。

# 求职 X-Ray：B 公司与岗位调查（独立分支原型）

基于 main 公共架构，升级分支为 `codex/b-research-upgrade`。B 复用 `packages/contracts` 的 1.0.0 契约，模块仅增加服务端最多 3 个候选的校验，不修改 A、C 或公共契约。

## 启动

需要 Node.js 20 或更高版本。

```powershell
npm install
npm run dev
```

访问 `http://localhost:3000/demo/b` 查看合成样例，或访问 `http://localhost:3000/research` 使用人工资料模式。主页为公共架构入口。检查：`npm run typecheck`、`npm run test:b`、`npm run build`。

人工资料模式默认关闭。仅在本地开发时显式开启，并让导入的 SearchIntent 使用同一个 projectId：

```powershell
$env:XRAY_B_LOCAL_MODE = "1"
$env:XRAY_B_LOCAL_PROJECT = "project-demo-1"
npm run dev
```

旧 Next 路由在生产模式下禁止人工数据操作。`api.ts` 的 `createResearchApi` 可由集成方注入公共 IdentityProvider，复用项目权限检查；没有鉴权适配器时返回 503。该适配器尚未绑定到公共 Next 路由，不能声称已完成生产鉴权联调。

## 独立演示与输入输出

固定输入位于 `modules/b-research/fixtures/search-intent.json`，固定输出为 `modules/b-research/fixtures/candidate-bundle.json`。工作台支持编辑/导入 SearchIntent JSON、切换 `demo/manual/live`、提交 JD 和导出 CandidateBundle JSON。Demo 公司和职位是合成数据，不能用于真实公司评价。

搜索接口返回 202 和 runId：

```powershell
$intent = Get-Content .\modules\b-research\fixtures\search-intent.json -Raw
$run = Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/b/search -ContentType application/json -Body $intent
Invoke-RestMethod -Uri "http://localhost:3000/api/b/runs/$($run.runId)"
Invoke-RestMethod -Uri "http://localhost:3000/api/b/bundles/$($run.bundleId)/export"
```

## API

- `POST /api/b/search`：校验 SearchIntent 并生成任务/快照
- `GET /api/b/runs/:id`：读取当前进程内任务状态
- `POST|GET /api/b/jobs`：提交或列出人工 JD
- `GET /api/b/company-candidates?name=...`：未接工商 provider 时返回 unresolved 线索，不声称确认主体
- `PUT /api/b/identity-selection`：记录用户选择，但状态仍为 `user_selected_unverified`
- `POST /api/b/evidence`：录入人工材料，默认为 unverified
- `GET /api/b/bundles/:id`、`GET /api/b/bundles/:id/export`：读取或导出 CandidateBundle
- `GET /api/b/demo`：获取契约固定样例

错误体遵循 `{error:{code,message,retryable,requestId}}`。SearchIntent `maxCandidates` 服务端限制为 1 到 3。`closed` 职位不会进入结果；`unknown` 保留且提示待确认。

## 数据源、存储与安全边界

- Demo 使用显式标记的固定合成数据。
- Manual 只使用本次进程内录入的用户 JD 和材料；按项目隔离，材料关联检查、主体选择、来源日期和冲突证据随快照保留。重启丢失，尚无 PostgreSQL/持久任务表，旧路由只允许一个配置的本地项目，不能用于多用户部署。
- Live 当前没有企业或招聘服务密钥与许可 provider。不会发起伪造调用或回退到 demo，coverage 为 `not_connected`。
- 手工录入的 JD 原文保存为 `unverified` evidence；薪资按用户所填口径保存，缺失字段为 `null`。
- 没有启用任意 URL 抓取，因而不提供抓取能力；后续如接入必须实现 SSRF、重定向、大小、时间及内容类型保护。
- 调用成本目前为无外部调用/未知；供应商、许可、字段、覆盖和价格登记待获授权数据源后填写。
- 快照以副本保存，后续材料和主体选择不改写旧结果；相同输入去重，已关闭职位不进入结果，超过 30 天、日期未知或未来的开放职位降为在招未知。
- 当前事实抽取仅支持明确陈述的岗位销售指标，并保留证据引用和冲突；不推测职责百分比，不把匿名讨论或公司材料转为岗位事实。

## 联调状态

B 独立原型可用 fixture 启动、验证和导出。接收 A 的 SearchIntent，向 C 提供 CandidateBundle，均遵循契约 1.0.0。模块 API 适配器已有项目权限回归测试，但共享存储、调度器和公共路由鉴权接入尚未完成；模块测试通过不代表 A→B→C 端到端联调完成。
