# A v0.7 求职需求API

本地Node服务器，持久化到`.data/state.json`。先GET bootstrap建立`a_session` HttpOnly、SameSite=Strict Cookie；后续检查会话归属和同源Origin。默认只监听127.0.0.1，不是正式账户鉴权。

| 方法与路径 | 输入／输出 |
| --- | --- |
| GET `/api/a/needs/bootstrap` | 当前21题、选项、研究来源、现实条件、分类与本会话可恢复记录 |
| POST `/api/a/needs/sessions` | `{mode:"manual"}`或明确`demo`；创建空答案，无默认假测评分 |
| GET `/api/a/needs/sessions/:id` | 会话草稿、revision、step、data，不导出owner |
| PATCH `/api/a/needs/sessions/:id` | `{expectedRevision,questionnaireVersion,step,data}`；data完整选择结构，拒绝选项外值与未知字段 |
| GET `/api/a/needs/sessions/:id/preview` | 同一草稿的结构化侧写与人读说明，尚未确认 |
| POST `/api/a/needs/sessions/:id/confirm` | `{expectedRevision,confirmed:true}`；确认选择并冻结新的画像版本 |
| GET `/api/a/needs/sessions/:id/export?revision=1` | 完整七主题交接包；未传revision时返回最新已确认版本 |
| GET `/api/a/needs/sessions/:id/report?revision=1` | 相同已确认快照的Markdown；无模型重新生成 |
| POST `/api/a/needs/import` | 完整`a-job-needs-export-1`文件；校验答案、画像、意向、来源、报告及checksum，归属重建 |

`questionnaireVersion=job-needs-20261002-1`。step0–6为七主题，7为现实条件与方向，8为确认，9为导出。新需求状态在`state.needs`中，旧state对象及答案不自动转换。JSON导入上限6MB，其他请求体上限256KB。

完整输出见[演示文件](../fixtures/AJobNeedsExport.demo.json)。现实条件只有五个既有公共key；七主题记录在`JobNeedsSnapshot`，不混进旧filters。新流不接受经历、简历、技能字段或任意自由文字。

错误结构为`{error:{code,message,retryable,requestId}}`。未建立会话401、越权／跨站403、无记录404、版本冲突409、旧功能410、非法选择／格式422。checksum不等于签名或身份真实性证明。

## 历史接口

`/demo/a/v1`、`/app.mjs`、`/survey-adapter.mjs`、`/v2-app.mjs`、`/battery-survey.mjs`为410。`/demo/a/v2`显示当前中文需求入口，不再显示旧问卷。

`/api/a/v2/*`的非GET请求全部410，旧经历采集接口明确`feature_removed`；旧测评写入／计分／删除为`assessment_flow_retired`。已有v2归属记录仍可GET查看或导出历史快照，遵守已有隐私过滤和私有译稿限制，不保证任意私有历史导出可通过公开服务读取。原始数据仍在只供本机保管的字节存档中。

旧版本文档封存于`rubbish/interest-personality-v0.6-20261002/docs/API.md`，不作为当前活动API说明。
