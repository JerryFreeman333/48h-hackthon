# A V2 实施与交接

> 此页为v0.3历史记录。当前v0.4已移除经历流程、启用IPIP未验证中文译稿；当前能力、启动及接口以 [SCOPE_TRANSLATION_2026-10-02.md](SCOPE_TRANSLATION_2026-10-02.md) 为准。

指导规格：`求职X-Ray_CareerDNA嫁接与扩展开发规格_V2.md`，原文未改。实现仅在A；不含B/C业务、公司调查或实际岗位匹配。

## 运行

Node.js 22+，在 modules/a-profile：

```sh
npm ci
npm run setup:ocr
npm start
```

打开 http://127.0.0.1:3100/demo/a 。v2也是 `/demo/a/v2`；现有v1入口保留 `/demo/a/v1`。不自动迁移v1确认画像，不删除rubbish或重算旧48题。

OCR模型是可独立安装的真实依赖。`setup:ocr`下载tessdata_fast 4.1.0固定提交，中英文模型须与官方Git blob匹配，SHA256记录到Git忽略的 `.models/manifest.json`。支持超时续传；未安装时明确not_connected，PDF/DOCX文字提取和手填仍可使用。运行解析没有外部网络请求；模型安装需要网络及curl。

服务监听127.0.0.1，Cookie会话与owner归属由服务端决定，实际状态保存 `.data/state.json`。简历原件在 `.data/uploads/<公开ownerId>/<随机任务ID>.private`；HTTP不可直接访问；删除本人项目会删除该项目的私有文件。当前不是生产账户鉴权或多进程数据库；部署需公共身份与存储协调。

## 真实能力与边界

- Quick：正式英文Mini-IP 30题；Standard：加正式英文Mini-IPIP20；None：跳过量表。每套题本固定版本；逐题保存、页码恢复；未完成不提供正式解释。
- 两套量表分别计分。Mini-IP为0–4求和0–20，Unsure=2；Mini-IPIP为1–5，反向6-answer，每维4题，raw4–20，normalized=(raw-4)/16；O维1正3反。N保持神经质方向，不自动称为情绪稳定性。
- 归一化仅量程展示。没有常模百分位、35/65阈值、测评准确率或能力判断。信度数字如官方key上的alpha属于原研究，不属于产品或中文用户。
- 官方key顺序与行位置明确记录；没有声称地方itemId为原论文题号。中文题本未启用，也未由AI生成翻译。正式英文源工具有研究依据，当前界面/产品未做心理测量验证。
- 价值排序是本人声明，可同级、自定义、跳过，不是Work Values Matcher，不生成测评分。
- PDF/DOCX文字真实提取，扫描页/PNG/JPG走本地中英文OCR。10MB、PDF30页、图片像素和DOCX解压大小限制；隔离worker，90秒超时，重启中断任务明确失败。
- 结构化候选采用保守的原句／章节规则，标记pending、页/行或DOCX文本流位置。日期、组织、角色无法可靠解析时保留未知，不进行智能能力评级；这不是LLM语义简历解析。本人可更正类别与文字，原句保留；拒绝项不成为能力依据。
- 自动解释是确定性草稿，可确认/编辑/拒绝；拒绝不删除原分；答题更正会使旧解释失效。新确认生成新revision，旧快照保留。
- O*NET®31.0官方目录实际1016项，923项完整OI六维；93项缺维排除。Scales Reference正式OI范围为1–7，生成脚本逐值核对；原始值不除9，Scale ID、Element ID、Domain Source、日期与三份源文件哈希保留。
- 正式职业探索只有Pearson兴趣形状排序；零方差null，近零数值容差1e-12不是心理阈值；同分显示，并用code保证稳定顺序。展示index不是概率，不混入工作方式/EQ/市场。未测或未区分时仅浏览、不伪造排序。
- 24个中文职业浏览种子有明确美国职业code与原任务说明；国内JD映射仍待人工核对（requires_domestic_jd_review）。不能把浏览别名称为国内标准分类或已验证岗位映射。
- 中文模板报告无需模型，记录contextHash及证据引用。未接模型，不生成市场/公司事实。报告验证器校验冻结context与引用；没有声称已实现通用LLM数字语义QA。

## v2交接与v1兼容

v2运行时类型在 `src/profile/schemas.mjs`，新增类型在A内独立管理，没有修改公共ABC文件。完整导出包含ProfileBundleV2、SearchIntentV2、OccupationFitSnapshot、Report；仅SearchIntentV2按钮供B取最小信息。不包含原始问卷答案或原始简历文件，包含本人确认的经历原句。

SearchIntent最多3个方向与3个候选；用户选方向后才生成。职业code可来自目录或用户自填未映射方向。硬/软/未知及确认状态明确；未确认条件在意向中降为unknown，不能当通过。

`format=v1`投影已确认兴趣、经历、目标、现有五种条件，返回compatibilityWarnings；无法表达的已确认额外硬条件拒绝导出。职业方向没有公共roleTypes对应时留空并警告，不把v1说成完整等价交接。

v2导入校验结构、引用、版本、维度、量程与覆盖，重新绑定本地owner与ID。无原始答案，不能重算或继续编辑测评；新增 imported_score_unverified 提示，不独立证明导入分数真实。B/C尚未接入v2，须用明确版本JSON各自升级。

## 主要接口

所有 `/api/a/v2` 接口需先 GET bootstrap 建立本地会话；不信任请求body的ownerId。

|方法/路径|行为|
|---|---|
|GET /bootstrap|工具、本人会话、OCR状态、目录覆盖|
|POST /sessions|Quick/Standard/None，manual/demo|
|GET/PATCH /sessions/:id|本人草稿、步骤和expectedRevision|
|PATCH /attempts/:id|数组responses；重复题号可被发现；冻结题库/计分版本|
|POST /attempts/:id/score|严格计分；不完整状态明确；生成解释草稿|
|POST /resume-imports|sessionId、expectedRevision、filename、base64；实际异步解析|
|GET /resume-imports/:id|processing/completed/failed/not_connected及错误|
|POST /sessions/:id/statements|本人自由文本转待确认原句候选|
|PATCH /claims/:id|确认、编辑、拒绝经历或解释|
|POST /profiles/:id/confirm|未处理pending条目拒绝；冻结新revision|
|GET /profiles/:id?revision=N|指定历史画像|
|POST /profiles/:id/occupation-fit|指定profileRevision确定性方向|
|GET /catalog?q=|英文/中文种子/代码浏览，缺维职业不入排名|
|POST /search-intents|本人选方向；profileRevision与最多3约束|
|GET /profiles/:id/export?revision=N&format=v2或v1|规范交接或明确兼容警告|
|GET /profiles/:id/report?revision=N&format=markdown|中文模板JSON或Markdown文本|
|POST /import|校验v2并重新绑定归属，不重算|
|DELETE /profiles/:id|删除本人v2项目及关联私有文件，保留rubbish|

## 数据重建与验证

将官方 MiniIPIPKey.htm 存到 `.sources/mini-ipip-key.html`，O*NET31.0 Occupation Data.xlsx / Career Interest Types.xlsx / Scales Reference.xlsx 分别存到 `.sources/OccupationData-31.0.xlsx`、`.sources/CareerInterestTypes-31.0.xlsx`、`.sources/ScalesReference-31.0.xlsx`。运行 `python scripts/prepare-v2-sources.py`（需要openpyxl），随后 `node scripts/create-v2-provenance.mjs`。可选固定donor20 YAML存 `.sources/donor-mini-ipip.yaml` 仅核对ID，对不上就失败，不猜对应。源文件均不参与运行时加载或分发；题本／目录JSON有哈希记录。

`npm test`、`npm run test:browser`验证实际程序，不等于心理测量验证。`npm run fixtures:v2`生成纯合成demo交接样例。最新实测结果另见 V2_TEST_RESULTS.md。

后续依赖：合适同版本中文题本及适用人群研究/许可、人工国内JD映射、真实身份与数据库、B/C v2联调。CAT、EQ、市场权重、真实公司分析没有启用。
