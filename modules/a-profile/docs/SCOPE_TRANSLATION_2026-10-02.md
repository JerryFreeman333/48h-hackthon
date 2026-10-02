# v0.4 范围收缩与中文译稿交付

基线：A v0.3提交 `675970b1497133ca3d66c45bcbc211302322fbc9`；本次以最新main为基础，仅改A。原V2指导文件未修改，当前用户要求覆盖其经历/能力部分。

## 当前活动范围

新版7步：开始(0)、兴趣(1)、结果与人格倾向(2)、价值偏好(3)、现实条件(4)、审阅确认(5)、原有方向与导出(6)。旧新版流程的经历(4)映射到现实条件(4)，旧5/6/7映射到4/5/6；写入flowVersion=personality-needs-1。Quick/Standard/None与原职业参考不重设。

v1保留原步骤编号，原“画像与经历”改为“画像与目标”，删除学历、专业、技能、经历及摘要对应内容。新旧UI均无上传、提取或经历确认。测评解释仍可确认/拒绝，不改变分数；测评来源证据不是个人经历证据。

删除活动 `src/resume/`、OCR安装脚本及解析测试，移入 `rubbish/experience-flow-v0.3-20261002/`。不再加载worker、写上传文件或启动OCR；package/lock中删除mammoth、pdf-parse、tesseract.js。已有模型和上传文件留在本机私有目录，不提交、不访问。

停用接口在解析请求正文之前返回410 feature_removed：`/api/a/v2/resume-imports`及任务子路径、`/api/a/v2/sessions/:id/statements`、`/api/a/v2/claims/:id`、`/api/a/profiles/extract`。新版测评解释审核改为 `PATCH /api/a/v2/insights/:id`；这是测评解释，不接收经历类别、简历或技能字段。

新版draft严格拒绝statementBuffer等旧字段；v1拒绝education/major/skills/experiences等草稿及非空background。v2导入要求capabilities为空、证据不含resume；v1非空background导入拒绝，防止通过兼容接口继续采集。

## 保存、版本与历史

`loadState`在范围迁移前将完整原state按SHA256逐字节备份至Git忽略的 `rubbish/private/scope-state-<hash>.json`，校验失败则停止迁移。旧48题原备份机制保留。迁移幂等；旧上传文件不删除。

活动草稿移除经历字段与关联证据，旧解析任务不再恢复。原不可变画像仍保留在私有state中，原分、原答案、计分版本和测评来源不覆盖。历史GET/报告/JSON通过scope投影过滤个人经历引用，revision仍是原画像版本；这不是重新测评。对外投影与原始历史快照的区别记录在state.scopeMigration，原完整快照从本机备份审计。

新确认生成新画像revision，旧版本原文不变。JSON不包含原始答案，答案继续保存在本人私有attempts/metadata；导入仍不重算没有答案的分数。本人“删除活动项目”仍可用，历史存档与此前私有上传文件保留，按钮提示明确。

## 题库、中文化与许可

两套原始题本及 `battery.mjs`、`scoring.mjs`保持原v0.3 Git blob字节一致，测试锁定四个哈希。题数30/20、题号、维度、答值0–4/1–5、反向6-answer、求和与展示归一化完全不变。语言与translationVersion在计分外附加，答案哈希不因语言改变。

|工具|中文处理|许可依据|活动状态|验证状态|
|---|---|---|---|---|
|Mini-IPIP20|忠实中文初稿；题干、选项、说明与英文原文逐条保存；可切回英文|[IPIP官方许可](https://ipip.ori.org/newPermission.htm)：公共领域允许翻译|新Standard默认中文译稿，旧英语答题记录保持原呈现|AI初稿；未独立复核、回译、认知访谈或人群验证；不是正式中文版|
|O*NET Mini-IP30|本机私有审校初稿，题干/选项/说明与原文及版本逐条保存|[CC BY-ND 4.0 §2(a)(1)(B)](https://creativecommons.org/licenses/by-nd/4.0/legalcode.en)：可制作不分发的适配材料；公开修改版需[O*NET开发者许可](https://www.onetcenter.org/license_toolsdev.html)|中文不提交Git，不从HTTP提供，不启用；英语原题继续使用原许可|开发者许可§3(b)(2)要求推出内容修改产品前开展Validation Study，当前未完成|

开发者登记为可选，不能代替验证。未来发布O*NET中文需要按目标求职人群与用途完成符合相应标准的验证研究，并履行署名、改动说明、开发者许可链接及显著通知要求；加“未验证”字样不能单独满足条件。本次只完成允许的译稿准备，没有声称发布门槛满足。

Mini-IPIP译稿记录译者Codex AI、原文来源、翻译版本、审校状态。18题保持“理解抽象概念有困难”，19题保持“对抽象概念不感兴趣”；不互换认知困难与兴趣。3题保留说话频率，不改成不喜欢说话；16题译“情绪低落”，不当作抑郁诊断；N维方向不改。12题things的范围、17题vivid imagination的通顺度等仍需独立复核与认知访谈，不宣称AI自查等于回译。

20题可分发译稿见 `src/instruments/mini-ipip.zh-CN.draft.json`。30题本机文件为 `.translation-drafts/onet-mini-ip.zh-CN.private-draft.json`（Git忽略），releaseStatus=blocked-pending-validation-study。公开逐题台账仅给30题原文和未发布状态，不夹带其中文稿。

## B/C兼容

没有修改公共ABC契约、B/C代码、职业参考算法或新建底座。v1结构要求background，所以保留null/空数组占位；v2结构保留capabilities空数组。没有能力低/能力缺口的自动判断或测评分。

v1导出警告说明“未评估”，兴趣与现实条件照常交接。原有v2→v1硬条件降级保护继续有效；职业代码没有公共roleTypes映射时仍明确警告。B/C应将空能力字段解释为此信息不在A范围，不能据此降低分数；实际B/C联调尚未完成。

内部v2版本仍2.0.0，字段保留但收紧为不接受能力材料。这一语义变化需接收方核对；不宣称旧含经历文件可以无损导入。旧材料继续保存在原状态和备份，当前服务不重新采集。

## 实际文件

核心：src/profile/{service,routes,schemas,scope}.mjs，src/{service,server,storage}.mjs，src/adapters/v1.mjs，src/report/template.mjs。

呈现：src/instruments/{presentation.mjs,mini-ipip.zh-CN.draft.json}，src/ui/{v2-app.mjs,battery-survey.mjs,app.mjs,v2.html,index.html}。原style.css不变；仅补充原SurveyJS字体无关CSS所导入的survey-core.min.css静态路由，修复300×150巨大SVG选项图标。

交付：package/lock、README、逐题台账与生成脚本、合成v2样例、本轮测试、历史存档清单。未做简历、语音、市场或匹配扩展。
