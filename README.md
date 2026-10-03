# 求职 X-Ray

根据真实求职需求，筛选并调查公司与岗位，再解释资料与用户需求之间的关系。

**当前 main 已包含可运行的 ABC、本地数据库和可选 MiniMax + Franklin 补充调查。** A 确认侧写 → B 勾选候选与调查 → C 七板块报告，无需重填公司、岗位或 JD。前端使用 Next.js / React 及挂载的 A 页面，服务端负责数据库读取、调查和报告归档。

## 先看哪里

| 目的 | 文档 |
| --- | --- |
| 当前功能、保留决定及限制 | [当前状态](docs/CURRENT_STATE.md) |
| 找代码、改前端、确认上传范围 | [仓库地图](docs/REPOSITORY_GUIDE.md) |
| 找专题文档和历史记录 | [文档索引](docs/README.md) |
| 接手修改、核对撤回与最新决定 | [续做记录](docs/PRODUCT_CONTINUATION_2026-10-03.md)，按后续章节核对 |
| 配置 MiniMax 与 Agent | [Agent 接入说明](modules/research-agent/README.md) |

## 本地启动

需要 **Node.js 24、npm、Git LFS**。普通 ABC 使用本地 SQLite；Python 和模型密钥仅在启用 Agent 时需要。

在仓库根目录执行：

```powershell
git lfs install --local
git lfs pull --include=".data/company-database/xray-v3-20261003.sqlite"
npm ci
npm run dev -- --hostname 127.0.0.1 --port 3000
```

打开 [首页](http://127.0.0.1:3000)。首次使用从首页确认需求；已有侧写可进入 [B 调查](http://127.0.0.1:3000/research) 或 [历史](http://127.0.0.1:3000/history)。保持相同浏览器和主机地址，避免 localhost 与 127.0.0.1 的会话隔离。端口占用时先检查已有服务，或将端口改为 3001。

生产构建运行：

```powershell
npm run build
npm start -- --hostname 127.0.0.1 --port 3000
```

数据库应为 **142,249,984 字节**，不是几行 LFS 指针；SHA256 应与 [导入清单](.data/company-database/manifest.json) 一致。清单记录原导入信息，不代表新调查已核验。

Agent 默认关闭。需要时在忽略的 .env.local 配置，安装独立 Python 依赖并重启服务；详见 Agent 说明。实际密钥不能写进 .env.example。

## 主要页面

| 页面 | 用途 |
| --- | --- |
| / | 开始新判断、继续上次判断、展示案例入口 |
| /profile | A：需求选择与侧写确认 |
| /research | B：候选选择、资料调查与进度 |
| /flow/reports/:id | C：七板块报告；沿用旧集成路径，可承载真实资料 |
| /history | 找回侧写和历史报告 |
| /revise/:id | 修改需求后另存报告 |
| /compare | 同一侧写版本的岗位比较，不生成排名 |

/flow 和 /demo/* 是开发演示入口。真实需求流程不使用合成公司；用户下载、导出与整库数据包保持关闭。展示入口等待指定的真实记录。

## 检查

按改动选择检查；文档整理无需重跑全部业务测试。

```powershell
npm run typecheck
npm test
npm run test:a
npm run test:b
npm run test:c
npm run test:integration
npm run build
```

Agent 专项检查见接入说明。开发样例及测试通过不证明真实企业资料准确或岗位仍在招。

## 数据与协作

Git 跟踪代码、文档、测试样例，以及指定企业数据库 LFS 副本和清单。**密钥、个人侧写、历史报告、采集工作库、截图和日志留在本地。** Agent 新资料写入独立工作库，已上传数据库保持只读。

保留会话、原侧写和旧报告，修改产生新快照。开发前检查 git status；明确路径暂存并检查提交内容，保留队友未提交文件，不用整仓 reset 整理。

当前用于本机持续运行的服务；正式账户、多人生产隔离及持久队列仍未完成。公开摘要、员工评价和集团资料按原范围解释，不能直接认定符合岗位需求。
