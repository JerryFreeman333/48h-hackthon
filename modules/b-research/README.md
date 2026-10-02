# 求职 X-Ray：B 公司与岗位调查（独立分支原型）

工作分支为 `work/b-research`，基于 main 公共架构。B 复用 `packages/contracts` 的 1.0.0 契约，模块仅增加服务端最多 3 个候选的校验。

## 启动

需要 Node.js 20 或更高版本。

```powershell
npm install
npm run dev
```

访问 `http://localhost:3000/demo/b` 查看合成样例，或访问 `http://localhost:3000/research` 使用人工资料模式。主页为公共架构入口。检查：`npm run typecheck`、`npm run test:b`、`npm run build`。

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
- Manual 只使用本次进程内录入的用户 JD 和材料；重启丢失，尚无 PostgreSQL/持久任务表，也没有跨用户鉴权，不能用于多用户部署。
- Live 当前没有企业或招聘服务密钥与许可 provider。不会发起伪造调用或回退到 demo，coverage 为 `not_connected`。
- 手工录入的 JD 原文保存为 `unverified` evidence；薪资按用户所填口径保存，缺失字段为 `null`。
- 没有启用任意 URL 抓取，因而不提供抓取能力；后续如接入必须实现 SSRF、重定向、大小、时间及内容类型保护。
- 调用成本目前为无外部调用/未知；供应商、许可、字段、覆盖和价格登记待获授权数据源后填写。

## 联调状态

B 独立原型可用 fixture 启动、验证和导出。A 的 SearchIntent 与 C 的 CandidateBundle 可按契约 1.0.0 对接；此空仓库没有其他模块、统一身份/项目权限、共享存储/调度器或集成层，因此端到端联调尚未完成。身份选择、任务、职位池目前是进程内状态，需在公共基础设施确定后迁移，并补跨用户隔离和持久化验收。
