> 阶段资料：本文保留对应阶段的原始记录，不能直接作为当前入口或最新产品范围。先看[当前状态](CURRENT_STATE.md)、[文档索引](README.md)及[续做记录](PRODUCT_CONTINUATION_2026-10-03.md)的后续决定。

# ABC 整合验证记录

日期：2026-10-03（Asia/Hong_Kong）。Node v24.19.0；锁文件安装的 Next 15.5.27。基线 main：4613b73；结果对应本次本地工作区改动。

## 自动化检查

| 检查 | 结果 |
|---|---|
| 公共契约与 runtime | 9 通过 |
| A 全套 | 34 通过，2 项私有译稿测试按设计跳过 |
| B 全套 | 16 通过 |
| C 全套 | 232 通过 |
| ABC 集成 | 2 通过 |
| 原 C 报告宿主 | 5 通过 |
| 根 TypeScript | 通过 |
| C 独立 TypeScript | 通过 |
| Next 生产构建 | 通过，13 个静态页面及动态 API/报告路由完成 |
| git diff --check | 通过 |

合计 298 通过，2 跳过，0 失败。A 的旧源码哈希按原 Git blob 行尾规范化后校验；题库、算法、expected 哈希未改。C 的 Node ESM .js 导入通过 Next extensionAlias 解析源文件。

构建有 B 现有 CSS `align-items:start` 的 autoprefixer 兼容提醒，不阻止编译。没有开启忽略类型错误或跳过构建校验。

Windows 限制说明：沙箱中的 tsx 曾在 os.userInfo() 初始化失败（uv_os_get_passwd ENOMEM），所以相应测试及 Next 构建在获准的正常 Windows 环境执行；这不是测试断言失败。根 `npm ci --no-audit --no-fund` 已按锁文件安装依赖。

## 集成断言

- A 创建→保存→本人确认→B 按当前意向检索→C 生成报告。
- 不接受销售 KPI 时，合成 JD 的签单指标产生 deprioritize。
- 改为接受销售 KPI、重新确认后，新画像版本产生新报告，旧报告保持逐字一致。
- A 状态文件重新载入仍保留原确认快照。
- 七主题、完整 A 导出和 checksum 保留在完整交接包中。
- 同会话可读取/导出，其他会话不能读集成报告。
- 本人真实填写 mode=manual 拒绝进入 demo 闭环，未转换成合成数据。
- 城市不匹配导致0候选；结果仍为空，不造岗位。
- A 挂载 API 拒绝跨站、缺会话、非法 JSON 与过期写入版本。
- 原 C 报告读取不依赖端口；宿主导出可下载，公共 C API 仍校验凭据；跨用户及非 demo 被拒绝。

## 浏览器实际验证

生产构建后启动 `next start --hostname 127.0.0.1 --port 3000`：

1. 打开 `/flow`，页面成功建立 A 会话。
2. 点击“一键创建合成需求并联调”，成功生成1个合成候选的规则报告；首屏显示签单指标与拒绝销售的硬冲突，薪资及经营信息保持未知。
3. 内嵌报告和独立 `/flow/reports/:id` 均正常展示。
4. 点击报告的 Markdown 导出，浏览器成功下载对应版本 .md。
5. 打开 `/profile`，A 原页面成功读取刚生成的确认版本、七主题和五类条件，证明静态资源/API挂载均可用。

截图：`test-results/abc-report-2026-10-03.jpg`。

## 仍未验证的能力

真实企业调查、真实模型效果、七主题匹配语义、生产多人鉴权、数据库恢复、并发报告更新与支付均不在此次通过范围内。B/C 内存服务重启后需重新生成；不能将测试数量表述为真实求职匹配准确率。

## 产品闭环增量验证（截至香港时间06:05）

本机/会话原型，未推送远端。新增直接JD、七主题回应、持久化归档、需求修订、候选比较与用户核验回复。

- 最新集成宿主17项通过；本轮连同C版本/取消/恢复共46项通过。C规则未知修正后完整232项通过；根tsc及最新Next生产构建通过。原298/2记录是较早整合基线，不代表此刻全量重新执行。
- 浏览器实际完成本人提交JD、同需求版本两候选比较、A修改确认后重分析、回复保存新报告、Markdown下载。独立进程恢复归档已验证。
- 截图：test-results/candidate-comparison-verified.jpg、verification-feedback-verified.jpg、revision-final-action-verified.jpg、a-confirmed-handoff-verified.jpg。
- Markdown实际下载与HTML最终动作一致；JSON保留原C报告与productActions，便于区分基础规则和产品动作。旧归档和旧导出不可变。
- 用户补充只是待核验记录，不是事实审核器；B七主题事实生产器尚未接入，协议见NEEDS_EVIDENCE_PROTOCOL.md。city/salary/vacancy仍缺逐字段来源证据时保持未知。

## 07:12 最新产品回归

整合与宿主19项全部通过，Next生产构建及类型检查通过。新增硬冲突优先提问、人工来源准确表述、对应问题可保存待核验回复测试；实际浏览器连续人工七主题→两JD→比较→回复→需求版本2已完成。硬冲突回复新报告仍暂缓，实际MD下载同屏问题、回复和原事实一致。截图见test-results/hard-conflict-feedback-verified.jpg及continuous-needs-feedback-revision-verified.jpg。

## 07:40 材料更新回归

整合20/20通过，Next生产构建及类型检查通过。新增同岗位JD更新、旧报告/导出不可变、证据重新生成和历史回复继承回归；实际浏览器更新销售KPI有→无，最终动作暂缓→先核验，主体和其他缺口不被解除，实际MD下载一致。最终截图test-results/material-update-final-action-verified.jpg。

## 08:05 历史与候选选择

整合21/21通过，Next生产构建（含类型检查）通过。真实浏览器选择同一需求版本的每岗位最近报告，两个候选实际比较成功；切换版本清空旧选择和结果；历史模式/名称筛选保留全部旧版本。截图见latest-candidate-selection-verified.jpg、history-provenance-filter-verified.jpg。

## 08:35 阅读呈现

整合21项+C视图/HTML30项合计51项全通过，生产构建和类型检查通过。实际浏览器确认岗位名称、关注导航、关键未知常显及覆盖明细可展开。HTML/新MD标题转义通过安全回归；旧导出不重写。README同步实际产品状态。截图report-concerns-readable-verified.jpg。

## 09:35 最后表单状态

最后UI状态修正生产构建（含类型检查）通过。实际浏览器验证刷新修订清空旧成功、请求时输入锁定、回复编辑新草稿清空旧成功、未知报告显示真实失败且无表单。服务规则未改，既有21项整合与30项C视图/HTML结果仍适用；未把本轮浏览器状态检查冒充新的自动测试数量。
