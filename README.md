# 求职 X-Ray

公共底层架构，契约版本 `1.0.0`。A 负责画像/意向，B 负责候选/调查，C 负责匹配/报告。

## 启动和检查

需要 Node.js 20.9+。安装依赖后启动：

```powershell
npm ci
npm run dev
npm run typecheck
npm test
npm run build
```

默认地址 http://localhost:3000。端口占用时使用 `npm run dev -- --port 3001`。

## 分支与目录

- `main`：基础配置、公共 schema、fixtures、runtime 接口、UI 原语、架构文档。没有 A/B/C 业务实现。
- `work/b-research`：公共基线 + `modules/b-research` 和 B 的路由绑定。
- A/C 从 main 建立自己的分支，模块实现位于各自目录。公共修改需共同确认。

只通过契约和 API 交换数据；模块不得直接读取其他模块内部数据库。路由绑定放 `app`，业务实现放 `modules`。

## 公共能力

`packages/contracts` 提供四个 schema 和 TypeScript 类型，以及引用/项目/版本/模式边界检查。公共样例在 `packages/contracts/fixtures`。UserProfile、SearchIntent、CandidateBundle 从附件直接提取；MatchReport 是合成期望输出，不是 C 规则实现。

`packages/runtime` 提供错误格式、默认拒绝的项目所有权校验、调用预算代码、成本汇总和统一身份/快照/持久任务接口。`packages/ui` 提供基础页头、状态标签和样式。

## 尚未接入

PostgreSQL、鉴权、持久 worker、模型客户端、企业/招聘 provider 尚未接入。`.env.example` 仅记录配置占位。公共 runtime 接口不是实际数据库或调度器。所有真实数据调用和跨用户上线前须落实这些基础能力。

模块独立开发与 A→B→C 整体联调是不同验收等级。接入方式、责任登记和联调清单见 `docs/ARCHITECTURE.md`。合成测试不证明真实公司准确率。
