# 求职 X-Ray｜Career DNA 嫁接与多源画像扩展开发规格 V2

日期：2026-10-02  
用途：交给开发 AI / A、B、C 模块负责人执行。本文是新开发规格，不代表功能已实现。  
目标：把当前“职业兴趣问卷＋资料表”扩展为“多源画像 → 职业方向探索 → 真实岗位与公司透视 → 有证据的求职决策”。

## 0. 先把这次要做的事情说清楚

用户要求尽可能移植 Career DNA 的题库、计分、职业比较、信息检索和内容生成流程，而不是仅参考目录后从零重造。执行时必须逐文件记录实际复用或等价移植内容。适配集中在中文、国内岗位与市场、多源经历证据、用户确认和现有 A/B/C 边界。

但“成熟架构”不等于“每个实现已被验证”。本次源代码核查发现题库标注、缺失值、工作方式映射与市场计分都有需要修正的地方。应保留其流程和可靠算法，对有问题的实现明确替换；不能为了提高复用比例照搬缺陷。

核心交付：

1. A：兴趣、工作方式、价值偏好、简历经历、现实条件、目标与逐条确认形成可追溯画像。
2. A 内职业探索引擎：用户兴趣与职业画像进行确定性比较，输出多个值得探索的方向。
3. B：根据用户选定方向搜集真实岗位和公司证据，保留来源、时间、主体与未知字段。
4. C：比较“人 × 职业 × 真实岗位 × 公司”，说明适合点、冲突、未知、风险与下一步动作。
5. 输出机器可读 JSON 和人可读报告，所有数字能重算，所有重要结论能找到依据。

本文提出新功能和新契约。旧系统的具体能力以实际代码为准；不得把文档中的计划当成已完成业务。

## 1. 核查范围与真实基线

### 1.1 Career DNA 固定来源

仓库：[thphuc06/agentic-career-recommendation-system](https://github.com/thphuc06/agentic-career-recommendation-system)。

核查固定提交：`87844ee3e19717875f59f727b5a313b231f5a81e`。后续开发先固定此提交；若升级，重新审查差异，不直接跟随 main。

已阅读 README、题库 YAML、scoring.py、matching.py、schemas.py、fixtures.py、pipeline.py、agents.py、generate_onet_artifacts.py，以及 RAG enhancer 和 narrative_generator。以下结论来自代码检查，尚未在本轮运行原项目。

### 1.2 当前项目核查

仓库：[JerryFreeman333/48h-hackthon](https://github.com/JerryFreeman333/48h-hackthon)。本轮读取 main 的 A 题库、README、contracts、service、INTEGRATION，以及 B/C README；未运行整个项目，未修改仓库。main 后续可能变化，实施前重新锁定项目提交并核对。

| 模块 | 当前可见能力 | 本次扩展 |
|---|---|---|
| A | SurveyJS；固定2016英文 Mini-IP 30题；确定性计分；经历和条件；确认与 JSON 导出；本地状态 | 加工作方式、中文题本审查、价值偏好、简历解析、证据融合、职业匹配与可读报告 |
| B | demo/manual 资料；人工 JD；公司主体线索；证据与 CandidateBundle；live 未连接 | 国内职位映射、持久化、数据 provider、主体消歧、证据覆盖与市场摘要 |
| C | 开发规格、样例与核对脚本；README 明确尚无业务应用 | 实现输入校验、硬条件比较、匹配解释、风险动作、比较和导出 |

当前 A 使用 SurveyJS 3.1.2。riasec-co 与 psyche-public 当前主要是组织思想参考，没有已移植的 CAT、多量表融合或 AI 画像能力。当前 A 的简历/模型提取尚未接通。不要在新版本说明中把这些写成既有功能。

### 1.3 原项目必须修正的发现

| 编号 | 代码证据与问题 | 新版要求 |
|---|---|---|
| D01 | `assessment_riasec_30.yaml` 自称官方 Mini-IP；与当前 A 从2016官方报告提取的30条英文文本比较，只有3条精确相同。差异既包含近义改写，也包含不同活动，不能一概视为同一原题 | 不直接使用此 YAML 的题文。保留其题库结构，使用已核对官方来源的题本；逐题比较并记录来源 |
| D02 | `assessment_big5_20.yaml` 的20条英文内容和正反向布局与 IPIP 官方 Mini-IPIP key 相符；越南文不是中文效度证据 | 可取正式 IPIP 题文和 key；中文版另外建立版本及验证状态 |
| D03 | `fixtures.py` 有 generated 题库时直接返回生成题库；EQ 位于 fallback fixture，默认 generated 路径未加载 EQ | 不按 README 假定“30＋20＋EQ”默认全启用；显式模块注册与 enabled 列表 |
| D04 | `scoring.py` 对未知 item 静默跳过；未在此函数拒绝重复答案、越界值；未回答维度记为0 | 在入口和计分层双重校验；未知、重复、非法值返回错误；缺失分数为 null |
| D05 | `matching.py` 将缺失用户维度默认成0；职业侧缺 work/market 则默认0.5 | 缺失值不得产生隐含正面或负面证据；只比较可用数据，并显示覆盖情况 |
| D06 | Pearson 零方差时返回0.5；两组全常数且相等时返回1 | 零方差为不可区分，返回 null 和 `undifferentiated_profile`，不输出完美匹配 |
| D07 | O*NET Work Styles 先跨职业 min-max，再按自定义表聚合成 Big Five；该职业要求向量不是实测“职业从业者人格平均值” | 保留原始 Work Styles；该映射标为实验，不得宣称职业理想人格或官方算法 |
| D08 | 映射把 Stress Tolerance 等正向要求聚合到 N，但用户 Mini-IPIP 的 N 高分表示更高神经质；距离比较有方向风险 | 正式兴趣排序不启用此组件；实验模式先明确方向并单独测试，不仅改字段名 |
| D09 | 生成的职业 EQ 四维全部是0.5占位；work_fit 仍组合 Big Five 80%与EQ 20% | 删除占位 EQ 对正式分数的贡献。情境回答只作探索材料，除非取得可核对量表、题目选项和评分依据 |
| D10 | market_fit 来自本地 `occupation_market_evidence.yaml` 的 demand/salary/freshness 均值；pipeline 中 RAG 在初次排序之后补市场说明 | 48K招聘检索数据不等于已进入排名的真实市场计分；中国版本明确统计与排序的数据链路 |
| D11 | `narrative_generator.py` 主要调用越南文模板；另有 supervisor/Bedrock 路径 | 中文报告先移植模板流程，再可选 LLM润色，不假定每段都是LLM生成 |
| D12 | 固定提交树未发现 LICENSE/COPYING，GitHub repo 元数据 license=null | 不默认该仓库代码可以按 MIT 复制。文档与接口设计继续推进；直接复制代码前核实授权。无法取得授权时，用正式开放题库与公开算法实现同等能力，保留迁移对照表 |

精确文本对比是来源核查信号，不是本轮心理测量效度实验。D01 的结论是该文件不能被无审查地称为官方原题本。

## 2. 嫁接清单：哪些文件负责什么、如何搬

“等价移植”指保留源模块的输入、输出和算法行为，做语言/运行时适配后用同一测试向量比对；不是读完后凭感觉写另一套逻辑。对原项目缺陷，修正版与原版结果允许不同，但必须说明差异原因。

| 来源文件/目录 | 原作用 | 对应位置 | 移植方式 |
|---|---|---|---|
| `data/generated/assessment_riasec_30.yaml` | 题库配置 | A instruments | 结构移植；题文替换为核实的官方版本，不搬有争议题文 |
| `data/generated/assessment_big5_20.yaml` | Mini-IPIP 20与反向键 | A instruments | 从 IPIP 正式来源取题文/key，保留 donor ID 对照；新增 zh-CN审校版本 |
| `src/career_dna_poc/scoring.py` | 维度求和、反向、归一化 | A scoring | 移植合法完整回答的算法；补严格校验和 null 缺失处理 |
| `schemas.py` | 版本化快照与候选 | A 本地 schema | 移植字段思想与可用结构；加入证据、语言、来源、确认状态；不覆盖现有 ABC 契约 |
| `fixtures.py` | 配置加载、generated优先 | A instrument/data loaders | 移植加载机制；改成显式 manifest，每套量表单独加载，禁止静默降级到短假题库 |
| `scripts/generate_onet_artifacts.py` | O*NET Excel到YAML | A 离线数据脚本 | 移植 catalog/interests 转换；按官方字段和数据版本修正日期/缺失/量纲；原 Work Styles→Big Five 保留实验隔离 |
| `matching.py` | Pearson、距离、职业排序 | A occupation-fit | 移植非退化兴趣相似度；修正零方差与缺失；60/20/20只保留为 donor 对照策略 |
| `pipeline.py` | 计分→排序→检索→报告 | A orchestration | 大部分流程平移；增加简历确认、多源画像、方向选择；真实公司调查继续归B |
| `rag/retriever.py`、`context_builder.py`、`aggregator.py`、`enhancer.py` | 检索与结构化上下文 | B检索、A职业说明接口 | 复用分层流程；更换越南语模型、数据与职业映射；逐文件审阅后决定直接复制或等价移植 |
| `rag/narrative_generator.py`、`templates_vi.py` | 模板说明 | A职业报告 / C最终报告 | 复用上下文→模板结构；中文重写文案；数字由代码注入 |
| `agents.py` | 市场摘要、路线、QA、supervisor | A/C独立流程 | 保留职责分层；把升学/家庭决策模板改成求职验证动作；加强数值和证据QA |
| `tests/test_scoring.py`、`tests/test_matching.py` 等 | 基础回归 | A测试 | 在授权允许时搬入；否则建立等效案例，补缺失、零方差、方向和中文版本场景 |
| HTML/CSS | 原测评与结果页面 | A现有SurveyJS页面 | 保留现有组件，不引入第二套问卷渲染器；借结果卡片信息结构 |

每一个迁移 PR 提供 `PORT_MAP.md`：sourceCommit、sourcePath、targetPath、方法（copy/port/replace/reference）、许可依据、差异、测试。不得只把 README 写成“已整合 Career DNA”。

## 3. 产品范围与 A/B/C 分工

### 3.1 独立模块先做成，再通过 JSON 联调

实现放在各自 `modules/a-profile`、`modules/b-research`、`modules/c-report`。每块有独立启动入口、样例输入、导出输出和测试；新功能优先写在所属模块。此规格不要求先建新的共享 packages、总控队列或统一应用底座。

| 功能 | A | B | C |
|---|---|---|---|
| 量表题库、计分、用户画像 | 主责 | 不计算 | 只读 |
| 简历提取、用户确认、技能经历证据 | 主责 | 不推断用户 | 只读 |
| O*NET职业画像、兴趣方向排名 | 主责 | 使用方向映射 | 使用背景，不重算心理分 |
| 国内职业/岗位名称映射 | 提供种子与方向 | 主责真实JD映射 | 使用映射依据 |
| 招聘与公司资料搜集 | 不搜真实公司 | 主责 | 不另行抓取 |
| 市场摘要 | 显示B输出 | 主责来源与统计 | 引用 |
| 人与实际岗位比较、公司风险报告 | 不替代C | 提供证据 | 主责 |

不要在 A 中实现一套完整公司调查，也不要让 C 重新设计问卷或修改 B 的事实。A 职业探索和 C 岗位判断是两个不同层次。

### 3.2 版本与开发优先级

| 模式 | 内容 | 位置 |
|---|---|---|
| Quick | RIASEC 30；可跳过简历；城市和当前目标；兴趣方向 | 快速入口 |
| Standard | RIASEC 30＋Mini-IPIP 20＋价值偏好排序＋简历/经历＋条件＋逐条确认 | 本次主版本 |
| Deep | 可选择经核实的 RIASEC 60及更完整工具；结构化经历访谈 | 后续扩展 |
| Adaptive | 独立 CAT 试验；题参数、停止条件与固定题本对照 | 研究功能，不纳入本次正式计分 |

Standard 是50道量表题加若干偏好操作和经历确认，不承诺所有人固定5分钟完成。Quick/Standard用独立版本，不把答完30题解释为完成60题，不把自适应测试输出冒充官方固定题本成绩。

## 4. 用户流程与页面要求

### 4.1 主流程

进入 → 选择 Quick/Standard → 兴趣测评 → 立即看到兴趣结果 → 可继续工作方式 → 价值偏好 → 上传简历或写一句经历 → 补少量现实条件与目标 → 审阅画像 → 选择探索方向 → 导出SearchIntent → B调查 → C比较报告。

用户每完成一层都能看到新增信息。测评可暂不做；跳过后显示“未测”，不能给默认人格。未完整答完的量表不产生正式分数；已完成的其他层仍可保存和使用。

### 4.2 页面信息结构

| 页面 | 必要元素 | 完成行为 |
|---|---|---|
| 开始 | 两档内容、预计题数、可暂停、数据用途 | 创建session和版本化attempt |
| 兴趣 | 活动原意、喜欢程度、进度、返回、保存 | 完整后计算六维分，保留同分 |
| 工作方式 | 独立说明“平时的自己”；20题；无需表现优秀 | 保存五维，展示行为倾向而非能力标签 |
| 价值偏好 | 卡片排序、同样重要、不确定、自定义 | 保存明确表达的顺序与权衡 |
| 经历 | PDF/DOCX/图片上传；手填替代；提取原句 | 逐条接受/编辑/拒绝，保留来源 |
| 现实条件 | 城市、薪资口径、求职阶段；出差/KPI/用工类型等按需补问 | 每条支持硬/软/未知，明确确认 |
| 画像审阅 | 来源标签；缺失；测评数字；解释草稿 | 每条确认/修改/拒绝，生成不可变revision |
| 职业探索 | 5–10个方向；排序依据；未覆盖信息；“不感兴趣” | 用户选1–3个方向用于本次搜索 |
| 最终报告 | 职业/岗位/公司分层；冲突；未知；证据；动作 | 比较、保存、JSON/可读格式导出 |

题目按来源推荐顺序编排，不为缩短路径任意删题。保存答案与页码，刷新和重启可恢复。手机单列，操作区固定且不遮挡题文，键盘可用。

### 4.3 减少填表

先收最低必要信息；简历尽量复用教育、技能、经历，确认后自动回填。用户没有简历时可用“我做过什么”自由文本，再提取待确认条目。语音输入作为后续可选输入方式，不列为首期必做。

现实约束是动态补问：例如只有用户提出销售相关方向时，优先问是否接受销售KPI。任何未回答问题必须保持 unknown。用户想搜索未完成问卷也可以继续，B/C明确说明画像信息有限。

## 5. 题库、科学依据与中文适配

### 5.1 量表注册表

每个 instrument 固定以下字段：

```ts
type InstrumentManifest = {
  instrumentId: string;
  instrumentVersion: string;
  scoringVersion: string;
  locale: string;
  sourceUrl: string;
  sourceHash: string;
  licenseRoute: string;
  itemCount: number;
  dimensions: string[];
  translationVersion: string | null;
  validationStatus: 'source_supported' | 'translation_draft' | 'locally_studied';
  enabled: boolean;
};
```

source_supported只说明源工具有研究支持，不代表本产品、中文版或岗位映射已验证。验证状态必须分层，不用一个validated布尔值盖住所有环节。

每题记录 itemId、originalItemId、原文、中文、维度、正反向、选项量纲、来源定位、审校记录。量表修改题文、选项、维度或计分规则都要升版本。

### 5.2 RIASEC 30

先沿用当前 A 已核查的2016 computerized Mini-IP英文题本及来源记录，再与官方报告核对哈希、题号、文本、六维归属。不要改用 donor 同名 YAML，也不要无说明地换为最新官方版本。

中文是产品的重点交付，但必须分阶段：原文逐条翻译 → 独立双语复核/回译 → 认知访谈找误解 → 冻结中文版本 → 收集适用人群研究数据。工程首期可交付中文测试题本及审校台账；公开发布范围必须满足 O*NET Tools Developer License 的实际要求。不能仅写一句“未验证”就视为履行许可。

兴趣问的是“喜欢这个活动吗”，不是“会不会、做过没、能否胜任”。陌生但能理解活动含义不等于缺答；理解不了则保存待补答，不能默认为中性选项。中文说明要分清“不确定喜欢程度”和“看不懂题目”。

### 5.3 Mini-IPIP 20

从 IPIP 官方 scoring key 获得20条题文及正反向键；donor YAML用于ID对照。每维4题；O维正反向数量与其他维不完全相同，不能用“每维2正2反”自动生成。

保存 N 为神经质方向；若界面选择展示情绪稳定性，明确 `stability = 1 - N_normalized` 并保留原分。工作方式用非评判语言，不把低外向性称为沟通能力差，不把高 N 直接判为不能胜任。

IPIP题目开放使用与某个第三方中文译本授权是不同事情。先查同版本中文题本、适用样本、来源和评分；拿不到合适译本时采用审校翻译，标清 translation_draft，不声称中国常模百分位。

### 5.4 价值偏好首期方案

不先自造“科学认证20题量表”。首期做明确的产品偏好排序，内容包括收入、稳定、成长、自主、创造、帮助他人、团队支持、认可、生活平衡、地点灵活性；允许自定义、同级、跳过。这些是本人声明，不是心理测量分数，也不冒称官方 Work Values Matcher。

输出 top priorities、可接受的妥协和不可接受条件。若以后接正式20卡片工具，完整取得题本、操作规则、计分、中文许可与效度证据后作为另一instrument。首期不把偏好强行转换成“价值观得分85”。

### 5.5 EQ与自适应处理

donor 的EQ fixture并非完整已核实工具，职业EQ还有占位值，本次不开启正式EQ测分。可增加可选“过去如何处理冲突”的经历访谈，记录本人回答与例子，不输出EQ分。

CAT放研究区：需要真实题参数、重复题控制、维度覆盖、停止规则以及与固定题本对照。借算法架构不等于得到经过验证的自适应量表。

## 6. 确定性计分与职业方向比较

### 6.1 合法输入

服务端拒绝未知item、重复item、版本不符、非法范围、非整数、NaN、混用量表答案。每个attempt只引用冻结题库版本。未知/跳过不是0分；输入错误不默默忽略。旧48题答案不得按新题本重算。

### 6.2 RIASEC计分

按当前A已核对电子版：每题0–4，每维5题求和0–20；完整30题后正式计分。`normalized = rawSum / 20`；展示分可乘100，但叫“量程展示分”，不叫百分位或匹配概率。

donor 用1–5求和再归一化；在相同题本和合法完整回答条件下，映射为 `donorAnswer = currentAnswer + 1` 后归一化等价。必须先检查题目对应，不能只因题数相同就转换旧答案。

不设置未经验证的35/65高低线，不强制唯一前三型；同分显示并列。分数解释关注相对偏好，不推断技能。

### 6.3 Big Five计分

1–5答案；反向题 `6 - answer`。每维4题完整时求和4–20；`normalized = (sum - 4) / 16`。任一维缺答，该维正式分为null，整套未完成时仅显示已答进度；不提供插补后的正式结果。

测评置信度不得由题数完成度或模型自信生成。分别保存 completeness、来源支持、翻译状态；无统计估计时 confidence=null，不伪造“92%准确”。

### 6.4 职业兴趣排序：保留Career DNA核心

用户六维向量与职业六维兴趣向量计算Pearson相关：

```text
r = sum((u - mean(u)) * (o - mean(o)))
    / sqrt(sum((u - mean(u))^2) * sum((o - mean(o))^2))
interestIndex = (clamp(r, -1, 1) + 1) / 2
```

保存r原值和展示index。比较形状而非分数总量；index不是录用概率。六维固定顺序R,I,A,S,E,C，两侧必须完整且有限。

若用户或职业向量零方差，相关系数未定义，返回null。用户六维全相同时显示“目前兴趣偏好尚未区分”；提供职业浏览、目标和经历探索，不推荐一千个职业都100%。近零方差用版本化数值容差处理并提示，不把数值稳定性规则当心理诊断阈值。

结果按r降序，同分用固定职业code排序，显示并列事实。首期展示5–10个方向，允许用户拒绝/收藏/自选方向。B当前接口最多3候选，方向数量和实际岗位数量分别管理，不直接把10个方向塞入旧接口。

### 6.5 O*NET职业数据

保留 catalog/interests 离线生成流程，从可追溯的官方版本重建。存数据发布版本、源文件哈希、Scale ID、元素ID、原始值、转换规则、职业code、更新时间。不能只存脚本执行日作为数据新鲜度。

原脚本有 `divide_by_9`，实施时必须核对固定源版本的正式量程；不把所有O*NET数据统一除9。相同比例缩放不改变Pearson，但其他距离和展示会受影响。缺失六维职业排除并记录，禁止补0。日期按明确格式解析，避免字符串比较选错最新数据。

1016是donor目录声称的规模，不是产品固定常量。页面显示实际加载数和完整兴趣画像数；任何小fixture只能demo使用。

### 6.6 工作方式和市场不盲目混入主排名

原项目60%兴趣＋20%工作＋20%市场是产品权重；80%Big Five＋20%EQ也是自定义权重。本次保留公式为可重现的 donor baseline 实验，不作为正式主排序。

首期正式职业方向按可用兴趣相关排序；工作方式提供独立解释；经历显示入门条件和证据；价值与硬约束在真实岗位比较中使用；市场数据显示为有来源的补充。这仍然复用了职业画像比较的核心，而且避免未验证部分掩盖主结果。

实验 Work Fit 如启用：明确O*NET要求强度不是人格理想值；N/稳定性方向统一；记录映射覆盖、公式和版本；无EQ即不计EQ；用户缺测即null；在正式排序旁单独显示，不参与淘汰。简单地把N取反也不能证明整个跨构念映射有效。

## 7. 简历解析、技能证据与画像融合

### 7.1 简历解析流程

上传 → 类型/大小校验 → PDF文字或DOCX文字提取 → 扫描图片OCR → 结构化候选 → 引用原句和位置 → 用户逐条确认 → 纳入正式画像。

首期支持PDF/DOCX/PNG/JPG，产品默认单文件10MB、最多30页，可配置；超限明确告知。失败时保留上传状态并给手填替代；文件解析/OCR未连接时明确not_connected，不能假装成功。原始文件保存在用户隔离空间，可删除，不上传公开Git。

提取字段：教育、专业、经历时间、组织/项目、角色、行动、成果、技能词与证据原句。缺失时间保留null；“参与”不升级为“主导”；“了解Python”不升级为“精通”；软件名称不自动变成已掌握技能。

所有提取结果初始是pending。本人确认代表认可该记录，不等于证书真实性验证。用户编辑后标记source=user_edit，并保留原候选用于审计；拒绝条目不进入正式画像。

### 7.2 分层融合，不生成神秘总人格

```text
Profile
  Interests       ← 确定性RIASEC
  WorkStyle       ← 确定性Mini-IPIP
  WorkValues      ← 本人偏好表达
  Capabilities    ← 已确认简历/经历/技能证据
  Constraints     ← 已确认硬/软/未知条件
  Goals           ← 本人声明
  Insights        ← 可核对解释＋本人确认
  Uncertainties   ← 缺失、矛盾、待验证
```

不得把经历合并进兴趣分，或用LLM改测评分数。合并是建立关系和保留来源，非把不同来源均值化。

### 7.3 证据和确认结构

```ts
type ProfileEvidence = {
  evidenceId: string;
  kind: 'assessment' | 'resume' | 'user_statement' | 'user_edit';
  sourceRef: string;
  locator: string | null;
  instrumentId: string | null;
  instrumentVersion: string | null;
  locale: string;
  collectedAt: string;
  text: string | null;
  status: 'pending' | 'confirmed' | 'rejected' | 'superseded';
};
type Insight = {
  insightId: string;
  text: string;
  evidenceIds: string[];
  status: 'pending' | 'confirmed' | 'rejected';
  userEditedText: string | null;
  limitations: string[];
};
```

事实、量表成绩和解释有不同的确认语义：用户可以更正错误答案并新建结果版本；不能直接编辑成绩而保持同一计分证据。用户拒绝某条解释不删除原始测评分数；拒绝说明保留在审计，不再用该解释生成报告。

### 7.4 冲突规则

“E兴趣高”与“拒绝销售KPI”可以同时成立，不是错误；保留推动/组织倾向，避免自动推荐销售。简历显示做过某事但用户不想继续，经历仍为事实，目标单独表达。不同时间的硬条件冲突时让用户明确当前版本；不采用“LLM认为更合理”的条件。

所有重要解释必须附evidenceIds。没有证据只能列为“待验证问题”，不得成为已确认结论。

## 8. 国内职业映射、真实岗位与公司透视

### 8.1 O*NET是职业参考，国内JD决定实际岗位

保留英文code与原始职业标题，增加zh title、role family、task tags以及国内别名。一个国内岗位可对应多个职业；不得假设“AI产品经理”是单一官方O*NET职业，或编一套官方兴趣数值给它。

初期选择20–30个方向，人工核对任务、技能和映射理由。映射表保存onetCodes、中文岗位别名、任务证据、reviewStatus和version。利用真实JD扩展映射；模型仅提候选，人工/规则确认，不凭标题直接赋全部职业特征。

### 8.2 B的数据与市场链路

首期继续支持用户粘贴JD、上传岗位资料和显式demo；live只有真实provider连接成功才可用。越南职位数据不用于中国薪资/需求推断，越南embedding按中文语料检索验证后替换。无需为了“RAG”强制使用原FAISS部署方案，先实现小数据集检索和证据结构。

职位字段至少包括职位ID、职位原文、来源URL/文件、发布与采集时间、城市、薪资币种和周期、固定/浮动、经验、学历、任务、技能、出差/KPI、用工关系、雇主主体。未知保持null，带evidenceRef；不是单凭招聘文案就算核实。

市场统计保存观察窗口、覆盖平台、去重规则、样本数、城市、职业映射版本与更新时间。采样岗位数不称为全国需求量。薪资比较统一人民币、税前固定月薪口径；奖金、年终、销售佣金单列，无法转换则不比较。过期或小样本提示，不凭网页更新时间判断行情新鲜。

### 8.3 公司X-Ray

B解析品牌、工商主体、签约主体与实际用工主体的关系。重名公司先消歧，保留未确认主体。公司证据区分登记、司法、招聘承诺、公开新闻和员工评价；负面评论与诉讼存在不是同等强度证据。

风险输出是“线索＋具体影响＋验证动作”，不是无依据地判某公司一定倒闭。不同用户看到同一公司资料必须一致，个性化发生在用户受影响方式上。

### 8.4 C的比较顺序

1. 验证profile revision、intent revision和bundle绑定。
2. 对已确认硬条件逐条比较，输出 pass / conflict / unknown。
3. 确定冲突可影响动作；unknown只要求核实，不能当通过。
4. 比较具体任务、已确认技能证据、环境偏好和发展目标。
5. 显示公司风险与证据覆盖，分别说明“喜欢程度”“目前准备度”“现实条件”“公司风险”。
6. 生成建议：可以继续了解、先问清楚、暂不符合硬条件、信息不足等；每个动作包含原因和依据。

公司风险不能被兴趣高分抵消。人格不作为自动拒绝岗位或评判人的依据。现阶段不合成一个所谓“科学适配率”，若以后加入综合排名必须有版本化规则和用户可见分项。

## 9. 内容生成与报告

### 9.1 中文模板先实现

移植 Career DNA 的“结构化context → 模板报告”路径。计分、排名、城市、薪资与样本数由代码插入；缺失字段有专门模板。没有LLM仍能生成完整基础报告。

A报告包含：兴趣分项及含义、工作方式、明确价值偏好、经历证据、现实边界、目标、值得探索的方向、尚未了解的问题。C报告包含：目标岗位、匹配依据、硬冲突、未知、公司证据、风险影响、提问清单和下一步动作。

### 9.2 LLM可选职责

输入仅含用户同意使用且与报告相关的已确认材料、冻结分数、候选列表和证据。输出结构化sections，每条claim附evidenceIds或明确标为question。模型可组织语言、解释冲突、提出验证问题；不得重算心理分、改排名、编造市场事实或把测评标签当确定职业命运。

模型响应校验：schema合法；引用存在；数字与冻结输入相同；不使用被拒绝insight；结论未超出证据。失败就用模板，不回退假数据。报告写入 model/provider/promptVersion/contextHash；关闭模型后核心流程可用。

### 9.3 输出可读性

首页先给本次求职需要看的结果：哪些方向值得探索、哪些岗位条件冲突、哪些地方先问清楚。测评雷达图可作为辅助，必须有数字表和来源说明；不让五张图替代结论。点击每个理由能看证据原句或量表维度及局限。

## 10. 数据契约与兼容方案

### 10.1 先建立A内部v2，不偷偷改公共v1

当前公共UserProfile.assessment是单个测评，无法完整承载多量表和逐条证据。新结构先作为 A 内部 `ProfileBundleV2`，通过独立JSON导出与样例交接。B/C升级明确版本后再启用跨模块v2；不要把Big Five字段塞进旧RIASEC scores，或把JSON大串藏在interpretation中。

```ts
type ProfileBundleV2 = {
  schemaVersion: '2.0.0';
  profileId: string;
  revision: number;
  ownerId: string;
  mode: 'demo' | 'manual' | 'live';
  createdAt: string;
  confirmedAt: string | null;
  assessments: AssessmentSnapshot[];
  values: { priorityIds: string[]; tradeoffs: string[]; evidenceIds: string[] };
  capabilities: CapabilityClaim[];
  constraints: Constraint[];
  goals: { text: string; evidenceIds: string[] }[];
  insights: Insight[];
  uncertainties: { code: string; message: string; evidenceIds: string[] }[];
  evidence: ProfileEvidence[];
};
type AssessmentSnapshot = {
  instrumentId: string;
  instrumentVersion: string;
  scoringVersion: string;
  locale: string;
  validationStatus: string;
  complete: boolean;
  completeness: number;
  scores: { dimension: string; raw: number | null; normalized: number | null;
            answeredItems: number; totalItems: number }[];
  answersHash: string;
  evidenceId: string;
};
type CapabilityClaim = {
  claimId: string; skill: string; description: string;
  evidenceIds: string[]; status: 'pending' | 'confirmed' | 'rejected';
};
type Constraint = {
  key: string; value: unknown; strength: 'hard' | 'soft' | 'unknown';
  confirmed: boolean; evidenceIds: string[];
};
```

这些是设计类型；实施时完善运行时validator，禁止只写TS而不验证导入JSON。原始答案单独存attempt，不把简历全文和原始问卷都默认发给B。

### 10.2 SearchIntentV2与OccupationFitSnapshot

```ts
type SearchIntentV2 = {
  schemaVersion: '2.0.0'; intentId: string; revision: number;
  profileId: string; profileRevision: number; mode: 'demo' | 'manual' | 'live';
  selectedDirections: { roleFamily: string; aliases: string[];
    onetCodes: string[]; selectedByUser: boolean; mappingVersion: string }[];
  filters: Constraint[]; maxCandidates: number;
};
type OccupationFitSnapshot = {
  schemaVersion: '2.0.0'; profileId: string; profileRevision: number;
  catalogVersion: string; strategyVersion: string;
  candidates: { onetCode: string; title: string;
    pearsonR: number | null; interestIndex: number | null;
    workFitExperimental: number | null; missingDataFlags: string[];
    evidenceIds: string[] }[];
};
```

maxCandidates在联调前沿用B当前最多3的能力；扩大需B接口与测试同步。B只接收搜索必要条件，不接收人格原始题答。

### 10.3 兼容导出

保留明确命名的 `export-v1`：仅投影可被旧契约表达且经过确认的兴趣、经历、目标与现有五种条件；返回compatibilityWarnings，告知未传递多量表/证据。不能把具有额外硬条件的完整意图静默裁掉再称为等价导出；遇到不能表达的硬条件，拒绝完整模式导出并要求使用v2或用户明确降级搜索范围。

v1和v2文件名称、schemaVersion及读取入口明确区分。不修改已确认历史快照；每次更正生成新revision，旧报告保留其引用，最新报告提示更新。

## 11. A独立实现目录与接口

沿用现有Node/ESM和SurveyJS；不要为了原项目Python就替换整个A。纯函数算法可等价移植为JS，离线O*NET数据脚本保留Python。首期无需运行时Python服务；如以后确需独立服务，再通过JSON契约接入。

```text
modules/a-profile/
  src/instruments/        注册表、冻结题本、翻译和计分
  src/occupation-fit/     catalog loader、Pearson、排序
  src/profile/            证据、insight、确认与版本
  src/resume/             文件提取、OCR/provider适配
  src/report/             context、中文模板、可选LLM、QA
  src/adapters/           v1兼容导出与v2导出
  scripts/                O*NET生成与来源核查
  data/                   版本化职业目录和映射
  fixtures/               纯合成v1/v2输入输出
  docs/PORT_MAP.md         真正复用清单
```

接口为建议v2命名，实施前与当前server路由核对：

| 方法/路由 | 行为 |
|---|---|
| `GET /api/a/v2/instruments` | enabled工具、题数、语言、版本和说明 |
| `POST /api/a/v2/sessions` | 新建session，固定battery和工具版本 |
| `PATCH /api/a/v2/attempts/:id` | 增量答案/页码保存，expectedRevision防覆盖 |
| `POST /api/a/v2/attempts/:id/score` | 校验后生成不可变评分快照 |
| `POST /api/a/v2/resume-imports` | 提交文件，返回解析任务与明确状态 |
| `GET /api/a/v2/resume-imports/:id` | 解析候选与来源定位 |
| `PATCH /api/a/v2/claims/:id` | 确认/编辑/拒绝经历或解释 |
| `POST /api/a/v2/profiles/:id/confirm` | 检查待确认内容，冻结revision |
| `POST /api/a/v2/profiles/:id/occupation-fit` | 基于指定revision确定性生成方向 |
| `POST /api/a/v2/search-intents` | 本人选方向后冻结SearchIntent |
| `GET /api/a/v2/profiles/:id/export` | 指定revision和格式导出 |
| `DELETE /api/a/v2/profiles/:id` | 删除本人数据及关联私有文件 |

统一错误区分validation_error、version_mismatch、revision_conflict、not_connected、parse_failed、insufficient_data。鉴权从owner/session服务端解析，不信任请求body的ownerId。多用户上线前必须有真实身份与访问隔离；本地demo明确范围。

## 12. 分阶段执行与完成定义

### 阶段0：来源和迁移准备

锁定源与目标提交；核对仓库授权、IPIP题文key、O*NET工具/数据库不同许可；产出PORT_MAP、题库manifest、差异清单和全合成测试输入。保留旧分支、历史快照与原始数据，不重算旧48题。

完成条件：每个启用题目有来源和维度；每个移植模块有具体文件；未知许可代码不进入分发构建；不能只写“参考了GitHub”。

### 阶段1：A核心嫁接

完成50题量表引擎、保存恢复、严格计分、正式兴趣职业排序、零方差处理、中文模板报告、可读量表状态。中文草稿和正式英文版本清楚区分。

完成条件：无LLM情况下从答题到职业方向全流程可跑；同输入/版本同输出；题文不能被LLM动态替换。

### 阶段2：A多源画像

接通真实简历提取与OCR适配，完成逐条确认、价值偏好、条件、目标、insight、revision、v2导出。允许无简历/跳过量表路径。

完成条件：用户不用手填所有简历字段；任何正式claim能回到原句或本人陈述；更正产生新版本；拒绝条目不被报告再次引用。

### 阶段3：B/C各自扩展

B以人工JD先实现国内岗位映射和证据结构，再接真实provider与市场统计。C以固定合成v2样例完成硬条件、理由、风险与动作，先模板后可选LLM。

完成条件：各模块独立运行及导入导出；manual/live/demo不串数据；C未知条件不会判通过。

### 阶段4：联调与产品验证

按指定v2快照串联三模块；做手机流程、简历失败、provider断连、旧报告与新画像、版本冲突和无模型回退。中文工具正式发布前完成适用许可和验证要求。用户测试用于发现流程误解，不宣称小样本就证明心理效度。

比赛展示可使用明确标注合成数据的完整闭环；真实公司和市场结论必须有真实证据。大扩展按上述阶段完成，不因首期可演示就宣布全部实现。

## 13. 验收案例与质量门槛

| 测试 | 必须出现的行为 |
|---|---|
| RIASEC全最低/全中间/全最高 | 正确原始分；零方差不排名为完美适配 |
| 相同形状、不同整体水平 | 非退化Pearson相同，说明比较形状 |
| 某维缺答/完全未测 | null与缺失状态，不补0或0.5 |
| 重复item、未知item、答案6、版本混用 | 拒绝提交，错误明确 |
| Mini-IPIP正反向极值 | 按官方key；O维特殊布局正确 |
| N与稳定性展示 | 显示方向和转换，来源原值不变 |
| 一套generated题库缺文件 | 仅该工具不可用；不悄悄切换PoC题库 |
| 用户E高但拒销售KPI | 保留兴趣；实际岗位KPI冲突明确，不篡改用户 |
| 简历“参与项目” | 不提取成“项目负责人”；原句可查看 |
| 用户拒绝某insight | 后续正式报告不引用该结论，原始评分保留 |
| 上传扫描简历、解析失败 | 正常OCR路径或明确失败与手填，不出虚假经历 |
| 低覆盖O*NET映射 | 提示参考局限，不编AI产品经理官方分数 |
| 岗位薪资浮动/币种未知 | 不当固定月薪通过硬条件 |
| 岗位出差未提 | unknown，给核实问题，不判无出差 |
| RAG找到招聘样本 | 样本来源、窗口与计分使用路径可追溯 |
| 模型篡改数值或引不存在证据 | QA拒绝，回退中文模板 |
| B数据源未接/断连 | not_connected/failed，不自动给demo结果 |
| v2硬条件不能进入v1 | 明确拒绝完整降级，不能静默丢约束 |
| 用户A访问用户B画像/简历 | 服务端拒绝 |
| 画像更新后打开旧报告 | 使用原revision，可提示生成新报告 |

需交付计分、来源、契约、模块与关键浏览器流程测试。迁移兼容性使用相同合法输入分别跑原函数与新函数；修正缺陷的案例单独标“预期差异”，不能为让测试一致重新引入bug。

对标准量表科学验证，必须另有适用样本与研究设计；单元测试证明的是程序执行规则正确，不证明人格测量或就业预测准确。

## 14. 开发 AI 可直接执行的任务说明

> 按本规格在当前求职X-Ray项目中扩展A，并准备B/C v2独立交接。先固定Career DNA提交87844ee3e19717875f59f727b5a313b231f5a81e与当前目标提交，阅读实际文件。优先复用题库配置、确定性计分、职业兴趣画像、Pearson排序、离线数据生成、结构化上下文和模板报告流程，逐项产出PORT_MAP。不要把“架构参考”写成完成移植。
>
> 使用已核查的正式Mini-IP题本，不搬Career DNA中标注官方但未对齐的30条题文。Mini-IPIP20从IPIP正式key接入，完整保留正反向规则。中文题本建立独立翻译/审校/验证版本。价值偏好先按本人声明实现，不包装为自造科学量表。EQ占位、神经质方向错误、缺失值补默认分和零方差完美匹配必须修正。
>
> 保留现有SurveyJS与Node/ESM入口；在A模块内实现并独立运行。接入简历解析和逐条确认，构建可追溯多源ProfileBundleV2、OccupationFitSnapshot与SearchIntentV2。不要改写历史快照或用新题库重算旧答案。不要先建设新共享公共底座。
>
> B/C仍按各自职责独立开发，通过显式版本JSON联调。O*NET用于职业参考；中国招聘、真实岗位和公司风险使用对应真实证据。先实现无模型模板报告，再可选模型解释，模型不能改分、改排名或编来源。
>
> 本轮授权范围以具体开发任务为准。本文件本身是规格，不是仓库提交或上线指令。每阶段报告实际改动、来源复用、测试结果和剩余问题，别把未接通的接口或文档当已完成功能。

## 15. 来源索引与证据使用方式

### 15.1 本轮核查的项目代码

- [Career DNA固定提交目录](https://github.com/thphuc06/agentic-career-recommendation-system/tree/87844ee3e19717875f59f727b5a313b231f5a81e)
- [题库RIASEC30](https://github.com/thphuc06/agentic-career-recommendation-system/blob/87844ee3e19717875f59f727b5a313b231f5a81e/data/generated/assessment_riasec_30.yaml)
- [题库Mini-IPIP20](https://github.com/thphuc06/agentic-career-recommendation-system/blob/87844ee3e19717875f59f727b5a313b231f5a81e/data/generated/assessment_big5_20.yaml)
- [计分代码](https://github.com/thphuc06/agentic-career-recommendation-system/blob/87844ee3e19717875f59f727b5a313b231f5a81e/src/career_dna_poc/scoring.py)
- [匹配代码](https://github.com/thphuc06/agentic-career-recommendation-system/blob/87844ee3e19717875f59f727b5a313b231f5a81e/src/career_dna_poc/matching.py)
- [加载逻辑](https://github.com/thphuc06/agentic-career-recommendation-system/blob/87844ee3e19717875f59f727b5a313b231f5a81e/src/career_dna_poc/fixtures.py)
- [数据生成脚本](https://github.com/thphuc06/agentic-career-recommendation-system/blob/87844ee3e19717875f59f727b5a313b231f5a81e/scripts/generate_onet_artifacts.py)
- [报告生成](https://github.com/thphuc06/agentic-career-recommendation-system/blob/87844ee3e19717875f59f727b5a313b231f5a81e/src/career_dna_poc/rag/narrative_generator.py)
- [当前A来源记录](https://github.com/JerryFreeman333/48h-hackthon/blob/main/modules/a-profile/docs/INTEGRATION.md)；[A README](https://github.com/JerryFreeman333/48h-hackthon/blob/main/modules/a-profile/README.md)

### 15.2 正式工具与方法来源

- [Mini-IP开发与心理测量报告（2016）](https://www.onetcenter.org/dl_files/Mini-IP.pdf)：当前固定30题题本的核对来源；原工具研究不等于中文产品已验证。
- [O*NET Interest Profiler手册](https://www.onetcenter.org/reports/IP_Manual.html)：工具结构、计分和使用背景。
- [Career Returns方法说明（2025）](https://www.onetcenter.org/reports/IP_Career_Returns.html)：支持以相关系数比较兴趣profile形状；不自动支持本产品全部排名策略和权重。
- [Mini-IPIP正式key](https://ipip.ori.org/MiniIPIPKey.htm)：20题维度与反向规则；该页面亦提示构念命名细节，不能笼统称任何五因素量表相同。
- [IPIP计分说明](https://ipip.ori.org/newScoringInstructions.htm)；[IPIP使用条款](https://ipip.ori.org/termsOfUse.htm)。
- [O*NET工具许可](https://www.onetcenter.org/license_tools.html)：原样复制与修改/扩展是不同路径，中文翻译需按适用路径处理。
- [O*NET许可入口](https://www.onetcenter.org/license_agreements.html)：数据库许可与测评工具许可分别核查。

仓库声明、研究支持、中文本地适用性与代码授权分别记录，互不替代。本规格没有重新编写全部题目，也没有把未经核实项目宣传语当作心理学结论；它把实际可复用流程、需要修正的代码和产品扩展转成开发任务。
