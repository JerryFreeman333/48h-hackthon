# 仓库地图与提交范围

## 代码职责

| 位置 | 职责与入口 |
| --- | --- |
| app/ | Next.js 页面和 HTTP 挂载；profile/route.ts、research/page.tsx、api/integration/ |
| modules/a-profile/ | A 选择、确认和侧写版本；src/needs/、src/ui/ |
| modules/b-research/ | B 调查界面与服务；profile-workspace.tsx、research-service.ts |
| modules/c-report/ | C 约束判断、引用、快照及旧报告兼容；domain/、application/、ui/ |
| modules/research-agent/ | MiniMax 调度及受限工具；research.ts、python-tool.ts、worker.py |
| packages/integration/ | 真实 ABC 衔接；local-database.ts、database-investigation.ts、demo-flow.ts、sector-report.ts、report-archive.ts、research-jobs.ts |
| packages/contracts/ | 公共数据及项目、范围、版本、引用校验 |
| packages/runtime/ | 公共运行接口、预算和错误约定；接口不代表生产能力全部部署 |
| packages/ui/ | 公共基础 UI 与样式 |
| docs/ | 当前说明、索引和阶段资料 |

demo-flow.ts 和 /flow/reports 的名称来自早期集成，现在也承载真实数据库流程，不能只凭命名认定演示资料。

## 前端统一时看哪里

| 范围 | 文件 |
| --- | --- |
| 根布局与公共样式 | app/layout.tsx、app/styles.css、packages/ui/styles.css |
| 首页 | app/foundation-page.tsx |
| A | modules/a-profile/src/ui/style.css，经 app/profile/route.ts 挂载 |
| B | modules/b-research/profile-workspace.tsx、workspace.css |
| 真实新 C 七板块页面 | packages/integration/sector-report.ts |
| C 原渲染和旧报告兼容 | modules/c-report/ui/render-html.ts |
| 历史、比较、修改及回复 | app/history/、app/compare/、app/revise/、app/feedback/ |

样式目前分布在多个位置。后续统一要覆盖真实 ABC，不只改演示页；保留 A 的题目顺序、答案键和归档结构。本次仅整理定位，未实施美化。

## 数据与上传

| 内容 | 位置 | Git 范围 |
| --- | --- | --- |
| 企业 SQLite 副本 | .data/company-database/xray-v3-20261003.sqlite | 已授权，LFS 跟踪 |
| 导入清单 | .data/company-database/manifest.json | 已授权，普通 Git |
| 原始企业数据库 | 项目外队友维护的采集目录 | 不纳入本仓库，不改写 |
| 个人侧写与会话 | .data/integration-a/ | 忽略，仅本地 |
| 历史报告与冻结快照 | .data/integration-reports/ | 忽略，仅本地 |
| Agent 工作库、缓存和任务 | .data/research-agent/ | 忽略，仅本地 |
| 密钥和 Python 环境 | .env.local、.venv/ | 忽略，仅本地 |
| 本机截图、日志和验收输出 | .data/ 其他目录、docs/test-results/ | 忽略，仅本地，保留文件 |
| 代码、配置示例、测试样例和文档 | app/、modules/、packages/、docs/ 等 | 核对实际改动后提交 |

克隆 GitHub 不会带回个人记录。企业数据库、测试样例和个人运行历史是不同资产。

## 原工具与历史代码

modules/research-agent/vendor/ 保存用户工具来源，实际产品只调用上层适配器。不要用原 lookup_company.py、CLI、全库分析或 selftest 启动产品；部分旧入口会写库、猜主体或升级核验，详见[Agent 说明](../modules/research-agent/README.md)。

modules/a-profile/rubbish/ 和模块阶段文档保留旧实现及撤回记录，不导回真实入口，不自行删除。

## 协作步骤

1. 看当前状态、续做记录及 git status，核对未提交工作。
2. 从当前 main 建工作分支，不把旧模块分支当作最新集成状态。
3. 按改动检查；业务修复还要验实际 ABC，不能只凭构建成功认定完成。
4. 明确路径暂存，检查 git diff --cached，排除私人数据与密钥。
5. 保留旧报告、历史和队友文件，不做整仓 reset；推送按用户授权范围执行。
