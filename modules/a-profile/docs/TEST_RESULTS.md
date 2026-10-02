# 本次实际验证（2026-10-02）

本页为v0.2的9项测试历史记录；当前V2实测见 [V2_TEST_RESULTS.md](V2_TEST_RESULTS.md)。以下测试数量及尚未解析简历的说明描述当时版本。

运行环境：Windows、Node.js 24.20.0、SurveyJS Form Library 3.1.2、Playwright 1.58.2 + 本机 Chrome。

`npm test`：9项通过，0失败，0跳过。

- 官方完整30题、每维5题、来源和版本记录。
- 0–4编码、Unsure有效、已知答案原始分、线性展示与同分并列。
- 缺答保持未知、非法答案拒绝、旧题号拒绝。
- 用户画像、内部解释和导出共享同一计分结果；约束需本人确认。
- 会话权限、版本冲突、题库版本不一致与未完成确认拒绝。
- 暂不测评全流程，导入不重算缺少的原始答案。
- 旧48题JSON拒绝且不创建活动项目。
- 旧状态逐字节存档、引用隔离、重启幂等。
- 真实HTTP保存/重启恢复、资源提供、旧存档HTTP不可访问、画像/意向导出。

`node tests/browser.mjs`：通过。真实SurveyJS界面完成30题Unsure、自动保存、刷新恢复、完整A流程、导出、修改到画像版本2、暂不测评路径；390px无横向溢出，页面无JavaScript错误。桌面和手机版面截图保存在Git忽略的test-results，人工查看了手机版面。

测试期间修复：Windows/Synology短暂文件占用导致rename失败，增加有限重试；表单blur自动保存吞掉导航点击，改为保存/导航串行队列且只在导航期间锁按钮。修复后重新执行相关浏览器与全部服务端测试。

存档manifest 23个原文件的SHA256逐项一致。本机原state的5个旧项目已封存到rubbish/private，活动状态移除其引用。个人材料未提交GitHub。

这些测试验证工程行为，不验证量表在中文人群的信效度。未执行B/C联调、生产部署、简历解析或模型调用；不宣称已完成。

## GitHub 公共 CI 的已知限制

合并前检查发现，公共 main 基线 `233b0d858d75172ad63341397a19a9f8401781fe` 已在根目录 `npm ci` 阶段失败，原因是公共 package-lock.json 缺少 sharp 0.35.5 的平台依赖记录；尚未运行到公共类型检查、测试和构建。本次 PR 的公共 CI 出现同一失败。

证据：[main 基线工作流日志](https://github.com/JerryFreeman333/48h-hackthon/actions/runs/36988172062/job/110777888182)、[A PR 公共工作流日志](https://github.com/JerryFreeman333/48h-hackthon/actions/runs/36990628205/job/110785743682)。

本次只改 modules/a-profile，没有更改公共依赖锁文件或 ABC 契约。上述 A 独立测试实际通过，不能将此解释为公共 CI 或整体联调通过。公共锁文件修复需由公共架构维护者协调处理。
