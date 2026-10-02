# A｜用户画像与意向选择

独立目录 `modules/a-profile/`；开发分支 `feat/a-profile`，整合后合并 main。只负责职业问卷、可读兴趣画像、经历、行业、岗位、现实条件与 UserProfile/SearchIntent。

## 启动

Node.js 22+，进入本目录：

```sh
npm ci
npm start
```

打开 http://127.0.0.1:3100/demo/a 。可用 PORT 更换端口。所有问卷静态资源从本机 node_modules 提供，无运行时 CDN。

## 整合结果

- 直接使用 SurveyJS Form Library 3.1.2（MIT）：分页、必答校验、进度、返回修改；自有后端保存答案与页码。
- 借鉴 riasec-co 的题库 / 答题状态 / 计分分离，实际评分使用官方 Mini-IP 规则；未移植贝叶斯、自适应删题或职业匹配。
- 借鉴 psyche-public 的工具注册与许可台账。题目原文从官方 PDF 提取，逐题记录题号、来源页码、维度和许可；未复制其 RIASEC 题库或 AI 画像融合。
- 保留原 A 的经历、行业岗位、条件确认、不可变画像版本、服务器权限隔离与 JSON 导入导出。

默认允许“暂不测评”，兴趣保持未知。另可选择官方英文完整 30 题 O*NET Mini-IP（固定2016电子版，不称为最新版本）。没有上线 AI 翻译；没有正式工作价值观问卷。英文工具有原始研究支持，不表示中文用户、此界面或本产品已验证。

## 存档

旧48题、规则、代码、样例、文档与测试保存在 `rubbish/legacy-20261002/`，只供历史查阅。活动服务不导入这里的代码、不重新评分、不接受旧48题 JSON。真实本机历史状态保存在 Git 忽略的 `rubbish/private/`，禁止上传。启动迁移先校验完整备份，再隔离相关旧项目。

## 计分与契约

原始维度分为5题0–4分求和（0–20）；Unsure=2。缺答不出分，完整题本才能确认测评。无缺失插补、35/65阈值、百分位或能力推断。同分并列显示，不强行打破同分。

公共 ABC JSON schemaVersion仍是1.0.0，未修改字段/枚举。现有scores字段0–100存储的是原始分乘5的界面展示分，interpretation明确原始分；原始分、语言、依据、覆盖、答案快照保存在 A 内部 metadata。assessment.validation保守保留prototype，不能宣称本产品已经验证。下游须按instrumentId/version解释，不能套旧48题阈值。

## 验证与限制

`npm test`：计分、来源、版本、权限、存档、恢复与HTTP交接。`node tests/browser.mjs`：需要安装 Chrome，验证真实 SurveyJS 全流程与手机版面。

仍为单进程、仅监听127.0.0.1的本地后端；持久化 `.data/state.json`，不是PostgreSQL或生产账户鉴权。简历/模型提取明确503，未接入公共runtime或B/C服务；当前只是A独立验证。详情见 docs/INTEGRATION.md 与 docs/SCORING.md。
