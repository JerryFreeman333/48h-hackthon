# A独立API

GET `/api/a/bootstrap`建立HttpOnly/SameSite=Strict本地会话并返回当前题本、工具说明、分类和本人记录。旧记录在启动时封存，不返回旧答案。接口只支持同源请求，JSON正文限制256KB。

| 接口 | 行为 |
|---|---|
| GET /api/a/instruments | 工具注册与许可、语言、研究状态、缺口 |
| GET /api/a/instruments/onet-mini-ip/provenance | 30条逐题来源 |
| POST /api/a/assessments | mode=manual/demo；instrumentId=onet-mini-ip或not-administered |
| GET /api/a/assessments/:id | 本人答题记录 |
| PATCH /api/a/assessments/:id/answers | expectedRevision、工具version、answers、draft、step；冲突409 |
| POST /api/a/assessments/:id/score | 服务端计分；未完成时全维未知 |
| PUT /api/a/profiles/:id/confirm | assessmentId、expectedRevision、confirmed=true、经历/目标/确认条件；保存新画像版本 |
| POST /api/a/intents | 确认后的profileRevision、行业和岗位；新意向版本 |
| GET /api/a/export/:projectId | 当前意向所引用的精确UserProfile版本与SearchIntent |
| POST /api/a/import | 当前已启用工具版本的规范JSON；旧48题拒绝。导入没有原始答案，禁止重算 |
| POST /api/a/profiles/extract | 503 NOT_CONNECTED；没有模型或简历调用 |

旧工具创建/导入422；无会话401；非本人403；输入/版本错误422。rubbish与.data不在静态文件白名单，不能通过HTTP下载。node_modules只有三个固定SurveyJS资源路径可访问。

真实密钥未使用。会话是本地项目权限隔离，不是生产身份认证。单进程JSON存储对Windows短暂锁文件有限重试，失败明确返回错误，不宣称远程数据库已接入。
