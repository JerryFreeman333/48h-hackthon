# v0.5 选择式输入与本机中文审校

基线：A提交84dfcce39ecdf38173f06a142ef2e1df75c772bc、main合并99161950572d21340ea8af53630247cb7f4c62fc。只修改A，未增加量表题、维度或公共底座。

## 仓库中的原题与算法是什么

30道英文兴趣题来自O*NET 2016官方开发报告Appendix A；20道英文人格题来自IPIP官方Mini-IPIP计分key。两份JSON是完整题本整理，不是从其他GitHub项目随意拼题。SurveyJS直接复用MIT组件；其他项目主要是架构参考，复用边界见THIRD_PARTY_NOTICES.md。

我们自行编写了执行官方规则的服务器代码，并非只存题目：

|层次|实现|来源或限制|
|---|---|---|
|Mini-IP原始分|每题0–4；Unsure=2；按官方维度映射，每维5题求和0–20；无反向题|[2016官方报告](https://www.onetcenter.org/dl_files/Mini-IP.pdf)，印刷13页计分、19–20页题本；不是纸笔1–5编码|
|Mini-IPIP原始分|每题1–5，每维4题；反向6-answer后求和4–20|[官方key](https://ipip.ori.org/MiniIPIPKey.htm)、[官方计分说明](https://ipip.ori.org/newScoringInstructions.htm)|
|结果展示|兴趣raw/20；人格(raw-4)/16；乘100展示量程位置；无常模、百分位或35/65阈值|产品UI转换，未冒称官方百分位|
|缺答与解释|不插补；不完整时解释未知；同分并列|透明产品缺答与展示策略，不冒称已找到官方个体缺答标准|
|职业方向参考|与O*NET职业兴趣向量做Pearson相关，常量向量不排名|现有独立产品策略interest-pearson-complete-1；不是量表官方匹配算法，未证明国内岗位适配或能力|

本轮 `battery.mjs`、`scoring.mjs`、`onet-mini-ip.json`、`mini-ipip.json`与原v0.3四个Git blob保持字节一致。没有“把所有算法扒下来”的宣称，也没有修改正式计分去迁就中文。

## 中文处理

20题人格中文初稿按IPIP公共领域许可保留在公开A目录，未完成独立译审、回译、认知访谈或中文验证。

30题兴趣中文初稿已经存在于本人本机 `.translation-drafts/onet-mini-ip.zh-CN.private-draft.json`，仍不提交Git。原文、译文、题号、维度、0–4锚点、无反向键、来源及翻译版本逐题保留。

`npm start`默认不读取或暴露该私有稿。`npm run start:review`是本人明确开启的私有审校预览：仅监听127.0.0.1，要求本机会话；不允许客户端通过请求字段打开模式；文件路径HTTP访问404。没有私有文件会失败，不静默生成替代内容。两套题可中文查看，原文在折叠区保留；旧未完成的英文答题可保留同样答案转入中文预览，原答案不重写为新题。

许可依据为[CC BY-ND 4.0 §2(a)(1)(B)](https://creativecommons.org/licenses/by-nd/4.0/legalcode.en)：可以制作、复制适配材料，但不能按此授权公开分享它。此模式用于本人本机的翻译核对与工程检查，不属于正式公开中文版。公开修改版仍受[O*NET开发者许可§3(b)(2)](https://www.onetcenter.org/license_toolsdev.html)的发布前验证研究约束；尚未完成验证，不能用本机测试或免责声明替代。

私有审校会话标记privateReviewOnly；关闭模式后，普通接口不列出或读取这些会话。V2快照携带privateReviewOnly及usage=local-translation-review-not-public-release；仍含真实呈现语言与翻译版本。v1不能表达这些信息，因此私有中文审校结果拒绝降级。源state、文件、快照不上传GitHub；接收方不能将审校材料作为已验证正式中文版发布。

## 全选择式价值与现实条件

选项表在src/profile/selections.mjs，版本a-choice-catalog-20261002-1。它是产品需求选项，不是新量表题库，没有科学验证或统一分数的宣称。

- 价值保留原10项及相对优先分组，允许同级与不确定，移除自定义项。
- 取舍由自由句子改为5个可选声明；稳定优先与自主优先这组互斥取舍不能同时提交。
- 目标由7个预设声明多选，阶段为原4项或未知。
- 城市用当前列出的城市多选，不选择为未知；列表不是全国完整城市分类。
- 薪资选择明确的人民币税前最低固定月薪3000/5000/6000/8000/10000/12000/15000/20000/30000；不把区间中点自动当阈值，不要求输入数字。
- 销售KPI、出差、外包为接受/不接受/未知；工作时段为daytime/accept_shifts/未知。保留要求程度及本人确认，移除其他条件名称与文本入口。
- v1同样删除目标/补充说明文字、城市文字和薪资数字入口。测评解释在v2只确认或拒绝，原始分不变。职业目录搜索是查找控件，未变成新的量表题。

服务端在update/confirm/import前校验完整选项，拒绝未知值、任意文字、非法城市或薪资、重复及矛盾选择；失败不保存、不修改状态。不能只通过隐藏textarea制造“选择化完成”。

固定原字段值仍保留，新增A包装中的SelectionSnapshot记录稳定ID、优先组、目标ID、阶段ID及条件原值；是可供后续分析的结构化声明，不是心理测评分或岗位匹配结果。公共ABC契约和B/C代码没有修改。

## 历史与兼容

迁移前将原state逐字节备份并校验SHA256；已有同字节存档可以复用。原始答案、所有不可变历史画像与旧私有上传文件保留。可编辑草稿仅带入确实属于当前选项的值，不通过AI猜测映射。

存在无法表达的旧自由草稿时设置selectionResetRequired。本人必须勾选已知旧材料存档、本次重新选择，才可确认新版本，避免静默删除旧硬条件后直接交接。旧版本继续保留；新的选择版本不替代历史事实。

旧自由材料的JSON不能作为当前选择式输入导入；需本人重新选择。原JSON不销毁。工作时段枚举收紧与包装侧表需B/C核对；未做实际联调。空background/capabilities仍表示未评估能力。

## 实际修改范围

src/profile/{selections,service,scope}.mjs、src/{service,storage,server}.mjs、src/instruments/presentation.mjs、src/ui/{v2-app,app,battery-survey}.mjs与v2.html；启动脚本、样例、测试及文档。原题、原计分、职业参考策略、ABC contract、B/C和公共根工程均未改。
