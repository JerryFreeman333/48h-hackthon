# API与联调

前缀/api/a。首次GET /bootstrap创建本地HttpOnly会话并返回题库、分类与当前会话草稿。会话仅用于本地独立演示。

| 方法与路径 | 输入/输出 |
| --- | --- |
| POST /assessments | `{mode:manual或demo}` → 答题记录 |
| GET /assessments/:id | 当前归属草稿（内部恢复接口） |
| PATCH /assessments/:id/answers | `{expectedRevision,version,answers,draft?,step?}`；冲突409 |
| POST /assessments/:id/score | scores、coverage、interpretation |
| PUT /profiles/:id/confirm | `{assessmentId,expectedRevision,confirmed:true,background,goals,preferences,correction?}` → 新画像版本 |
| POST /profiles/extract | 未接入503，不发送简历 |
| GET /taxonomy/industries 或 /taxonomy/roles | `{version,items}` |
| POST /intents | `{assessmentId,profileRevision,industryTags,roleTypes,maxCandidates?}` |
| GET /export/:projectId | `{UserProfile,SearchIntent}` |
| POST /import | 导出封装 → 新项目/ID（内部接口） |

公共错误格式 `{error:{code,message,retryable,requestId}}`。未登录401、越权403、不存在404、输入422、冲突409、未接入503。请求体上限256KB。不记录私人正文到日志。

导出引用最新意向对应的确切画像版本。coverage、用户纠正和taxonomyVersion保存在内部元数据，不添加到公共1.0.0对象。未确认偏好转为unknown/null，已确认硬约束才能进入硬筛选。

B取SearchIntent，C取UserProfile，均不可直接读A数据文件。公共维护者需提供正式所有权、存储、模型客户端、宿主路由，并确认分类ID（保留product_operations）。联调用fixtures中的公共合成样例检查版本、模式和项目关系。C验证销售KPI冲突；A不输出匹配结论。

复审修正：确认成功会递增答题记录revision，后续草稿保存前重新GET记录；重复使用旧expectedRevision返回409。score返回内部portrait，与scores/coverage同源；公共UserProfile字段不变。不能用null声明已知hard/soft；导入筛选不得遗漏或改变确认画像中的偏好。
