# Career DNA V2 来源与替换台账

> 此页为v0.3历史记录。当前v0.4已移除经历流程、启用IPIP未验证中文译稿；当前能力、启动及接口以 [SCOPE_TRANSLATION_2026-10-02.md](SCOPE_TRANSLATION_2026-10-02.md) 为准。

目标基线：`JerryFreeman333/48h-hackthon@ef3377fd19ff2cef5a511e31ee2c560b0e03f6cf`。
源固定提交：`thphuc06/agentic-career-recommendation-system@87844ee3e19717875f59f727b5a313b231f5a81e`。

2026-10-02 检查固定提交树，没有 LICENSE/COPYING；仓库元数据 license=null。**本次没有复制或转换其受保护源代码**。下列 `replace/reference` 是明确的替换与流程参考，不称为已移植原函数；未运行 donor 测试，未宣称逐函数行为等价。题目来自官方开放来源，算法来自公开方法。

|sourcePath|targetPath|方法|许可／独立依据|差异与验证|
|---|---|---|---|---|
|data/generated/assessment_riasec_30.yaml|src/instruments/onet-mini-ip.json|replace|2016 O*NET® Mini-IP 官方题本与既有来源记录|保留已核对完整30题，不使用 donor 近义题文；不转换旧题答案|
|data/generated/assessment_big5_20.yaml|src/instruments/mini-ipip.json；scripts/prepare-v2-sources.py|replace|IPIP 官方 MiniIPIPKey.htm / newPermission.htm / newScoringInstructions.htm，公共领域|从官方 HTML 机械提取20题，保留 key 行定位和 donorItemId 对照；没有复制越南文；O维1正3反测试|
|src/career_dna_poc/scoring.py|src/instruments/battery.mjs|replace|官方求和、反向key及公开线性量程转换|逐量表冻结版本；重复/越界/混题拒绝；缺答null；完整合法输入、极值、部分缺答测试|
|src/career_dna_poc/fixtures.py|src/instruments/battery.mjs；src/occupation-fit/index.mjs|reference|自有显式注册表与确定性文件加载|不静默降级短题库或假职业数据；未启用工具明确不可用|
|scripts/generate_onet_artifacts.py|scripts/prepare-v2-sources.py；data/onet-31.0.json|replace|O*NET® 31.0 官方 Excel；数据库CC BY 4.0|OI六维原始值不除9；解析MM/YYYY日期；记录源哈希、元素、日期和Domain Source；排除缺维职业|
|src/career_dna_poc/matching.py|src/occupation-fit/index.mjs|replace|官方 Career Returns 方法报告；公开 Pearson 公式|只排完整兴趣；零/近零方差null；无EQ占位、人格与市场权重；同分明确；数值容差是工程规则|
|src/career_dna_poc/schemas.py|src/profile/schemas.mjs；src/adapters/v1.mjs|reference|自有Zod运行时校验|A内部v2；公共v1文件不变；不能表达的硬条件拒绝降级；导入不重算|
|src/career_dna_poc/pipeline.py|src/profile/service.mjs；src/profile/routes.mjs|reference|自有Node/ESM流程|答题→分数→逐条确认→冻结画像→职业参考→本人方向→意向→模板；B/C与市场检索留给对应模块|
|src/career_dna_poc/rag/context_builder.py|src/report/template.mjs|reference|自有冻结context和证据引用|没有越南招聘样本、RAG市场统计或隐含默认值|
|src/career_dna_poc/rag/narrative_generator.py|src/report/template.mjs|reference|自有中文模板文案|数字从冻结数据注入；记录contextHash；拒绝解释不引用；不声称复用了越南模板代码|
|tests/test_scoring.py；tests/test_matching.py|tests/v2.test.mjs；tests/resume.test.mjs；tests/browser-v2.mjs|replace|自有测试案例|验证实际输入、边界、版本、权限、真实解析和浏览器；不是心理信效度研究|

简历提取、上传隔离、逐条确认和v1适配为本项目新增实现：pdf-parse 2.4.5（Apache-2.0）、mammoth 1.13.0（BSD-2-Clause）、Tesseract.js 7.0.0（Apache-2.0）、Zod 4.6.5（MIT）。第三方程序通过固定npm版本使用，不把未知许可 donor 代码夹带到构建。

正式工具链接：[Mini-IP报告](https://www.onetcenter.org/dl_files/Mini-IP.pdf)、[IPIP题文key](https://ipip.ori.org/MiniIPIPKey.htm)、[IPIP计分](https://ipip.ori.org/newScoringInstructions.htm)、[IPIP许可](https://ipip.ori.org/newPermission.htm)、[O*NET数据库许可](https://www.onetcenter.org/license_db.html)、[Career Returns方法](https://www.onetcenter.org/reports/IP_Career_Returns.html)。工具许可与数据库许可分开；中文量表未生成或发布。
