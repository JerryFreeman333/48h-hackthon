# A｜用户画像与意向选择

本目录为求职 X-Ray 的 A 模块独立目录。

范围：48题问卷与计分、画像确认、经历补充、行业与岗位选择、意向确认、UserProfile/SearchIntent JSON导出。

开发分支：`feat/a-profile`。A 的代码、文档、样例和测试统一保存在 `modules/a-profile/`，完成并测试后合并到 `main`，保留独立目录。

当前状态：A独立网页已实现。无第三方依赖，Node.js 22+。

启动：进入本目录执行 `npm start`，打开 http://127.0.0.1:3100/demo/a 或 /profile。测试：`npm test`。可选浏览器测试 `node tests/browser.cjs` 需要Playwright和Chrome；PLAYWRIGHT_MODULE可指定包路径。

已实现48题、计分与覆盖、自动保存、画像与经历、行业岗位、条件确认、不可变版本和JSON导入导出。数据写入本机 `.data/state.json`，已忽略，不上传。仅监听127.0.0.1；会话是本地项目隔离，不替代生产鉴权。只支持单进程。

导出为 `{UserProfile,SearchIntent}`。B取SearchIntent；C取UserProfile。导入创建当前会话新项目，重新分配ID，不覆盖旧数据；不含原始答题记录的导入画像需新建问卷后重算。

尚未接入公共Next.js宿主、Zod、PostgreSQL、正式runtime、模型客户端。独立服务使用Node与手写校验，后续通过适配器接入公共宿主。模型提取接口明确503；行业细类和官方岗位代码待核验。没有心理量表有效性或全系统联调结论。
