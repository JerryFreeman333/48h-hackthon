# XMind 架构补齐：本轮验收与交接

2026-10-10。实际开发目录 `repo-agent-v3-impl`，分支 `implement/xmind-structure-20261010`；起点 `3f45b4790c71d1085d7299841085e7ba40be40e5`。开发前重新核对 agent-v3 为 `a8f23097d141dd2415d1f6b2601b6b787e7c0c54`，原 checkout 干净。运行代码提交 [78ba90f](https://github.com/JerryFreeman333/48h-hackthon/commit/78ba90f17779e91e6cdccc5334f0d9af3ae146ea) 已推送并核对远端SHA一致；后续提交只追加公开交付记录。未合并 main、部署或修改原企业库。

已交付可执行的 **B 调查＋C 判断解释＋共享证据/归档架构**。11个专职 Agent 有独立处理器、输入输出校验、依赖、白名单工具、反馈消息、轮次预算和持久调用结果；原 A→B→C 与公司探索入口均可运行。模型只共用一批结构化抽取/比较/解释，默认关闭；这不是11个独立大模型进程。原441节点/306叶/13关系完整保留，未把节点登记冒称每个叶节点已用真实材料验收。

本机独立入口：[A→B→C](http://127.0.0.1:3322/profile)、[公司查询台](http://127.0.0.1:3322/xmind)。独立文件夹为工作区旁的 `xray-xmind-verification-20261010-102102-0ae94d`；启动、依赖复用和数据隔离详见 [验证文件夹](VERIFICATION_FOLDER.md)。运行副本使用自己的会话/材料/报告，公开企业库副本只读；快速启动复用本机依赖，不能称为其他机器免安装可移植包。

## V3 第1—22节对应

| 节 | 本轮实际实现与仍有的边界 |
|---|---|
| 1 依据/版本 | 原树和XMind未改；公共1.0.0、V2及旧报告兼容。sidecar agent-v3/1可选新增runtime/semantic/lifecycle契约，规则8。 |
| 2 主逻辑 | 实际11职责任务图：规划→路由→采集→主体/来源→抽取/传播→复核→解释→追问→归档；反馈能产生下一轮实际取源。 |
| 3 目的/需求 | exploration不造个人底线/岗位、不出招聘方追问清单；selection只按已确认A需求，模糊偏好给澄清。 |
| 4 问题契约 | 具体命题、所需字段、来源目标、主体/岗位范围、优先级、回答程度、需求结论、预算和停止原因分别记录。 |
| 5 来源路由 | 来源类别和字段路由接实际有界查询；本地库、HTTP/文件入口已实现；逐平台适配按用户先架构后爬虫要求延期。 |
| 6 接纳 | 原文/定位/哈希、正文/摘要、获取/解析失败、主体冲突分别记录；DOCX/XLSX/CSV/PNG/JPEG/扫描PDF已接公开上传和报告。 |
| 7 共享/来源 | 公司材料共用且不跨法人/岗位继承；同文档、显式转载、近似分组保留原件和非独立支持关系。 |
| 8 陈述/真假 | 规则命题＋结构化模型候选均保留quote/条件/否定/口径/时期；统一source_claim，不能变成已认证事实。 |
| 9 传播 | 只有经过门槛的账号＋含时区时间才能输出可解释信号；无字段禁用，不判水军/机器人/真假。真实群网络未验。 |
| 10 回答/模型 | 本机判字段/范围/可比性；模型候选有引用/数值支持/条件/句完整性校验。模型在线代码具备但本轮无真实凭据，只有受控provider测试。 |
| 11 预算/补查 | 问题最多2次、任务18请求/180秒，最多20反馈轮；工具先持久预留。模型一次、8×1600字符/最多2048输出token，未扩大旧付费上限。 |
| 12 未知出口 | 明确规则仍可运行；关键外部追问最多3项，软偏好可静默未知，未知不自动变风险或满足。 |
| 13 硬约束 | 继承原C失败不被其他优点抵消；硬约束未知不算通过，来源声明和满足分别判断。 |
| 14 报告/追溯 | 实际C三层中文解释、11职责/工具状态、关键问题、定位回读、原件哈希、历史重开；同正文导入可复用原引用。 |
| 15 开源 | 实际采用python-docx/openpyxl/RapidOCR/ONNX Runtime；锁与许可文件齐全，其余候选参考/试验/延期有出处。 |
| 16 实施/验收 | 基线→任务框架→材料闭环→黑箱修复→开源补短板→独立交付；回归纳入正式test/test:agent/test:v3入口。 |
| 17 仓库交付 | 隔离分支、本机独立副本、公开交接及持续PROGRESS；原checkout干净，未混入他人工作。 |
| 18 首版来源 | 原只读候选库、公开正文/文本PDF、受控文件和有界发现可运行。真实大华HTML与完整年报复用；专用爬虫延期。 |
| 19 状态规则 | answered/partial/unknown/not_applicable与source verification/fulfilment分离；工资年包不换固定月薪、转载不算独立支持、失败不算企业负面。 |
| 20 高影响复核 | OCR/工资等进入复核；无维护人deferred；内容＋问题范围指纹去重，原human/deferred决定保留，新证据/规则变化重开。自动测试不算独立人工认证。 |
| 21 现有接线 | enrichWithV3→真实B→原C freeze；sources-update/reviews生成不可变新报告，保留原公共契约、归档和开关回退。 |
| 22 真实闭环 | 大华/嵌入式 record16，真实定位正文和265页年报进入问题和C；旧报告、重启、回退和未知出口通过。仍没有岗位工资/培训/休息的独立证实。 |

具体文件/原图分支关系见 [架构对照](XMIND_ARCHITECTURE_COMPLETION.md)。主要新增代码为 xmind/runtime、collaboration、semantic、lifecycle、document-schema/file-import，以及 v3_documents.py；接线修改 v3-contract/research/assessment/report/sources/tool、demo-flow、原B页面；新增 /evidence/:id 与 sources-update API。原XMind及企业库未改。

## 验证分别记录

| 类别 | 实际结果 |
|---|---|
| 正式规则/契约 | 最终npm test **88/88**，其中V3/XMind **79**；test:agent **96/96**，包含原17项Agent/V2。 |
| 集成/原C | test:integration **57/57**；test:c **240/240**。原A/B未重新制造改动；既有A37通过/2跳过、B16的历史结果见首版HANDOFF，不冒充本轮新跑。 |
| Python原件/OCR | 项目.venv下正式test_v3*.py **19/19**，含中文OCR/办公文件、混合PDF、原件/定位、硬超时及不重复解析。 |
| 类型/构建 | 最终typecheck及优化build成功，包含实际新页面和API。 |
| 真实材料 | 当前优化服务A→B→C：官网正文＋完整2025年报，31问题/28需求细项/57陈述；1已回答来源问题、11部分、19未知；31个满足判断全部未知，3关键追问。网络0/模型0，使用已保存真实原件，不算新爬虫成功。 |
| HTTP材料/更新 | 优化服务六个明确synthetic_fixture文件：DOCX、XLSX、CSV、PNG、JPEG、扫描PDF均有正文/定位/回读；OCR需复核。并发/重复更新去重、seed代际隔离、旧原件保留、旧报告不变、错误主体隔离、年包含奖金不换月薪、所有权通过。无时效目标返回422，避免全问题重扫。 |
| HTTP恢复/回退 | 实际服务重启后C/sidecar逐字等价、历史和已完成任务恢复，重复请求复用原run；V3关闭新报告走原路径、旧XMind报告可读，公司新调查409。 |
| 进程失败回归 | 真子进程kill后采集只读恢复；controlled模型结果已缓存/结果未知两类kill恢复均0追加取源/provider调用，未知模型不阻断本机规则复核。模型提供方替身，不算真实模型在线。 |
| 页面/视觉 | 独立Chrome上下文，A→B、公司候选/历史、实际C/11职责、复核新版本、file input真实官网TXT→更新C通过；1360×920和390×844无横向溢出/pageerror，代表截图已实际查看。 |
| 独立目录 | 新会话真实HTTP A/B/C＋公司探索＋重开/去重和Chrome/390通过；使用明确合成测试文本，网络/模型0。不是该目录真实公司材料新采集。 |
| 人工认证 | 未进行真实独立人工认证；表单状态由自动化验证，始终保留source_claim和未知。 |

中途失败没有抹掉：一次并行Python19前的18项中1失败，原临时记录已消失，不能确证其原因；未加预算，隔离复跑、诊断和正式19项通过。HTTP暴露10MB base64校验栈溢出已用线性canonical校验修复；OCR内部confidence/engine与sidecar字段不同已显式映射，旧解析结果兼容。开发服务有字段错误/热更新期间的pending和预算退出，未当成功；重启优化服务后六类文件通过。验收客户端偶发ECONNRESET保留记录，GET只读重取，变更请求不自动重发。页面曾对相同正文要求新rawRef的过严断言，已按真实去重复用语义改为验证新操作已完成＋原文哈希相同，不改写真实材料制造新源。

## 真实样例和本机证据

最终真实岗位报告：`report-6b9628aa-3978-4322-9ec0-cc0264ddc41e`；公司探索 `company-report-a2d00da913723ed4e06ae77d93c61f19446b17092dbb4c3693cba7c624c339cf`。合成文件/边界新版本：`report-8b021202-8b3b-46e7-824b-c6d2d98660fa`；页面真实官网TXT更新：`report-e7c81fbc-11ed-47fa-9a53-bcc9c7e9792a`。报告网页按会话所有权读取，静态HTML可在本机阅读；不复制或公开验收Cookie。

- `.data/v3-acceptance/source.json`：真实官网正文及取得记录。原HTML SHA256 `88a2dace34ff490e92fde8326df3d863051dfae14a71dad91ade22086fa104bb`。
- `.data/v3-acceptance/public-import.pdf`：真实年报265物理页，SHA256 `5542bde681d9562640d00def533b101bd0aefd19b81a63fa973c30f2ed98398c`；本次采样引文最高物理页180，180不是原件总页数。
- `.data/xmind-acceptance/{summary,investigation}.json`、report.html、fallback.json：真实闭环、问题前后记录和关闭回退；session/http-checkpoint含私有Cookie不提交。
- `.data/xmind-structure-acceptance/architecture-http.json`、architecture-checkpoint.json、restart-http.json：六格式、更新和实际服务恢复；document-fixtures为明确合成原件。
- `.data/xmind-structure-acceptance/browser/`：真实TXT文件上传、源回读、旧报告保持、截图及失败/成功检查点。
- 独立目录 `.data/verification-acceptance/`：独立HTTP/视觉、原库/副本哈希、合成材料和失败记录；未复制原项目数据。

主要停止原因 `completed_with_unknowns`；受控来源已穷尽，缺岗位/团队范围、现行条件或独立证实；继续扫库不能把公司年报升级为岗位承诺。5个高影响复核项当前deferred；真实无账号/精确时间时传播禁用，模型disabled。费用字段保持未知，不把未知总成本填成0。

## 开源、A与剩余

采用代码、固定版本、许可证出处、17项新间接依赖/47份许可及模型哈希见 [OPEN_SOURCE](OPEN_SOURCE.md) 和 [本地许可清单](../../modules/research-agent/v3/licenses/README.md)。中文OCR合成样本验证不等于中文平台准确率；任务运行器/消息/解释是本项目实现，未搬入整套多Agent框架。

A保留首版 `a-needs-quick-unsure/1`：未填主题可用既有unsure，已填金额/城市/强度保留，仍需用户确认；1.0.0兼容映射没有偷偷改含义。设 `A_NEEDS_QUICK_UNSURE_ENABLED=false` 并重启可回退，原逐页流程保留。本轮没有增添人格分/适合概率；原A需求经当前HTTP与页面继续传到B的问题和C解释。

仍未完成：逐平台专用爬虫/动态登录/授权API与自动群聊（用户安排后补）；真实模型服务与中文金标准（缺既定凭据）；真实协同样本与独立人工认证；复杂Word布局/手写/OCR表格网格/旧DOC-XLS-PPT；306叶节点分别真实验收；独立副本cold install、其他机器迁移。时效模块保留历史来源回答并给定向更新建议，不认证过期安排，硬约束满足仍未知。下轮优先按真实缺字段和公开可访问性接一个平台连接器，随后在既定预算下验模型；不因新模块改原库或放弃当前可运行闭环。
