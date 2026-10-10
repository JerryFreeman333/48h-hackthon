# Agent V3 首版实施交接

> 下文保留 09fdf4a 首版历史验收。2026-10-10 后续实现位于 `implement/xmind-structure-20261010`：当前规则 v3-rules/8，真实任务图、文件/OCR、语义候选、时效与更新能力及未完成项以 [架构补齐记录](XMIND_ARCHITECTURE_COMPLETION.md)、[本轮验收](XMIND_ARCHITECTURE_ACCEPTANCE.md) 为准；独立目录见 [验证文件夹](VERIFICATION_FOLDER.md)。不把旧首版限制或旧端口当作当前状态。

完成日期：2026-10-10（开始于2026-10-09）；规则 `v3-rules/5`；sidecar `agent-v3/1`。这是已运行的首版 B→C 闭环，不是全平台或完整语义推理系统。规格原文、原始树和 XMind 保留不变。

## 1. 基线、分支与工作区

远端 `agent-v3` 开始时重新核对为 `a8f23097d141dd2415d1f6b2601b6b787e7c0c54`，与原 checkout 一致。原工作区干净，没有仓库额外 AGENTS.md，按会话规则执行。实际隔离开发路径：

`C:\Users\Sophie\SynologyDrive\大学\学习\比赛+课题\杭州学军黑客松\进一步\repo-agent-v3-impl`

分支：`implement/agent-v3-20261009`。实现提交 `09fdf4a8cb18ac43e243d98748b466bb0fc70197`（44文件、1391新增/27删除），作者明确使用 Codex <codex@localhost>，未改全局 Git 身份；交接补充提交见 Git 历史与最终消息。没有推送、合并 main、部署或修改原始库。原 checkout 最终仍干净、HEAD 未改变，其数据库是原有 134-byte LFS 指针；隔离工作树展开真实库，214609920 bytes，SHA256 `81fb91c41495c7d0f53dc549d79e16eb63c995f003ca0fc1d8371da2e118a0f4`，与指针 oid 和 manifest 一致。最终复核未变化。实际只读查询为 471 公司/95 岗位。

## 2. V3 第 1—22 节对应

| 节 | 实现状态与代码/边界 |
|---|---|
| 1 版本关系 | 完成首版隔离；公共 CandidateBundle/MatchReport 保持 1.0.0，V2 开关及旧报告保留。 |
| 2 主逻辑 | 实际 A 确认→B shortlist/POST→后台问题调查→C freeze/归档；共享材料可关联多个问题，不以主题覆盖代替回答。 |
| 3 目的 | API 支持 exploration/selection；探索不输出招聘方清单。优先级不自动当底线。A 模糊含义只给澄清，不猜人格或权重。 |
| 4 问题契约 | v3-contract/assessment：稳定 ID、需求引用、命题、范围、回答目标、字段、重要性、条件类型、状态、依据、缺失、停止。当前自动模板主要针对首版问题，全部 answerTarget 默认为来源陈述。 |
| 5 平台路由 | 完成首版本地、公开 HTML/文本 PDF、主动文本/文件、有界 Bing/360。更多中文平台和自动平台价值排序未接入。 |
| 6 接纳 | 复用 V2 固定公网 DNS、重定向再验证、大小/时限和 HTML/PDF 解析。访问/内容/分析三层分开；没有 AV 获取。 |
| 7 证据关系 | 保存原件/解析件/哈希/段落或物理页；明示原文链接及完全同文不同 URL 的疑似共同来源。没有独立证据投票、跨平台完整溯源图或相似度真假判断。 |
| 8 陈述 | 规则保留原句、否定/条件、范围、时期和引用，均 source_claim/unverified；关键工资字段明确抽取。复杂命题、完整行业/财务/法律语义抽取仍未完成。 |
| 9 协同传播 | 明确 disabled：无账号/精确时间/行为历史，不运行协调或机器人分析。重复/转载不是水军或虚假结论。 |
| 10 回答/模型 | answered/partial/conflicting/unknown/not_applicable 的字段/范围/来源规则。可选单次 MiniMax 语义复查通过引用白名单，不晋升为事实；真实 provider 尚未验证，不支持完整自动问题生成/语义冲突裁决。 |
| 11 预算 | 每任务 18 网络请求/180秒，每问题最多两轮、每次至多3请求；可选模型最多1次、2048输出 token。网络与模型调用前持久预留，已知网络次数与结果不明预留分开保存，失败只读恢复，未知调用结果不自动重付。费用未知如实保存。 |
| 12 未知 | 补查、静默未知、偏好澄清、外部事实确认均有出口。报告合计最多3个外部问题；内部失败不变成“请处理解析/访问”的任务；硬条件满足未知计入关键未知。 |
| 13 底线 | 原 C 硬条件失败优先，V3 覆盖不能隐藏；未知不算满足。新增未经认证陈述不能将软偏好或硬条件判为已满足。没有新增排名、适合概率或推测权重。 |
| 14 报告 | C 七板块与具体问题消费冻结 snapshot；追踪引用、范围、时期、缺失、原件回读；历史/所有权/关闭后读取通过。 |
| 15 开源 | OPEN_SOURCE.md：16 官方仓库固定 HEAD、维护 Atom、许可证/成本/中文/接入决策；Playwright 仅验收采用，Trafilatura 仅试验。 |
| 16 验收 | V3 接入 npm test/test:agent；规则、归档、真实材料、HTTP、浏览器分别验证，保留真实失败。完整“每一问题类型四象限金标准库”尚未建立。 |
| 17 交付 | PROGRESS/HANDOFF/OPEN_SOURCE 和隔离本地提交；没有将设计全部标为完成。 |
| 18 四入口 | 本地库真实候选；官网正文成功；直接 PDF 超时记录；完整公开年报通过受控文件导入成功；扫描件 unsupported、错误主体隔离、空搜索/私网拒绝有样本。 |
| 19 判定 | 首版规则充分覆盖工资口径、工时/培训/业务与主体/岗位边界；匹配期/城/团队/角色/条件才作可比冲突。缺字段/摘要不升级。签约关系、当前开放、财务数值和法律阶段的完整判定仍保留未知；not_applicable 要明确理由。 |
| 20 复核 | 硬条件相关与已抽取高影响文本建立 deferred 内部队列，保存引用、问题、触发、规则检查及原因；无人工团队，不认证。未实现完整法律事件阶段抽取及人工处理界面。 |
| 21 接入 | research/config、demo-flow、archive、sector-report、research-jobs 与新增材料/调查/来源 API 均实际接入；显式 sidecar 校验，回退清除残留引用。 |
| 22 首闭环 | 大华/嵌入式真实 record16，实际 A/B/C、官网原件与公开完整 PDF、问题/报告/引用、停止、重开/关闭/中断均有记录。工资、休息、岗位培训未被判达标。 |

## 3. 实际代码与运行

- `modules/research-agent/v3-{contract,assessment,research,model,tool,sources,report}.ts`：契约、抽取/判定、调度、单次语义复查、Python 边界、导入/原件回读、报告。
- `worker_v3.py`：复用 V2 transport/parsers/channels/identity，独立任务与问题检查点。`atomic-file.ts` 和 Python 长路径处理覆盖 Windows 同步盘写入问题。
- `packages/integration/{demo-flow,report-archive,research-jobs,sector-report}.ts`：真实 B→C、显式归档、跨重启幂等、旧硬条件保护、总追问上限。
- `app/api/integration/materials`、`reports/[id]/investigation`、`reports/[id]/sources/[evidenceId]`：受控入口，来源回读不联网；现有公共下载/导出仍关闭。
- B 页面提供最多4个公共 URL、最多3份文本/文本 PDF。单件18MB；导入流式请求25.1MB，合计工具输入有界。不默认宣称用户文件真实，声明来源单独保存。

实际环境：Node24.20.0/npm11.19/Python3.12.10。新环境运行：

```powershell
npm ci
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r modules/research-agent/requirements-v2-lock.txt
# 检查 Git LFS 库已展开且匹配上述哈希。
$env:RESEARCH_AGENT_ENABLED='true'
$env:RESEARCH_AGENT_V3_ENABLED='true'
$env:RESEARCH_AGENT_V3_MODEL_ENABLED='false'
npm run dev -- --hostname 127.0.0.1 --port 3213
```

也已验证 `npm run build` 后 `npm start -- --hostname 127.0.0.1 --port 3213`，这只是本机编译版服务。当前验收服务保留在该端口。默认没有环境变量时 V3 不开启。关闭 V3 只需设 `RESEARCH_AGENT_V3_ENABLED=false` 并重启；原 V2 标志为 true 时走 V2，否则沿用原路线。语义复查需另开启 `RESEARCH_AGENT_V3_MODEL_ENABLED=true` 和既定 MiniMax 凭据；没有凭据不调用，用户导入/个人金额条件不上传。归档重开不调用模型。

## 4. 分开的验收结果

| 类别 | 实际结果 |
|---|---|
| 规则/正式入口 | npm test 29；test:agent 37（V3 20）；integration 57；B 16；C 240；A 37通过/既有2私稿跳过。V3 新测试确实进入正式入口。最后工资/未知/中断预算修复复测了 Agent/默认入口，其他集最后结果见进度。 |
| Python | V2 26、V3 7 均通过；V3 是独立规则/适配器回归，不冒充真人资料成功。 |
| 类型/构建 | typecheck、优化构建、git diff --check 通过。最初既有 CSS autoprefixer start 警告，后续缓存构建无新增错误；未宣称已修该 CSS。 |
| 真实来源 | 官网正文已获取原件；完整 265页年报通过文本 PDF 导入解析、引用、问题与 C，成功哈希见下。直接获取器的 PDF 超时仍是失败。 |
| HTTP 黑箱 | A确认、候选16、进度、C、具体问题、原件回读、历史、重复同runId、旧报告重开、所有权404、导入关闭409、V3关闭回退、真正中断服务后的失败/无自动调用通过。 |
| 浏览器 | 真实 Chrome 独立无头上下文，无个人浏览器资料。B、C、历史与1360px/390px布局无页面错误/溢出；A捷径→确认→B HTTP→C通过；详细截图由本次代理视觉复核。 |
| 模型/人工 | 实际模型0次。受控模型成功、超时、坏引用、未发送用户文件、持久预留与不重复调用的规则回归通过；不等于官方模型线上成功。没有人类独立材料核验，所有对应内部队列 deferred。 |

已有 npm audit：1 high/1 moderate，来自当前 Next 依赖的 PostCSS；baseline 就存在。审计建议涉及 Next 大版本，本轮未作无关升级。后续依赖升级需要单独评估，不是 V3 引入的问题。

实际修复：漏识别业务关键词、年报表头误识别业务、资本公积误认福利、主体/岗位绑定、partial_text被错误升级、归档虚假answered、回退残留sidecar、Windows同步文件锁与长临时路径、恢复重复本地记录、保守请求预算、跨重启请求去重、旧硬条件被V3摘要遮住、报告总追问上限、软偏好未经认证达标、单边/约数薪资精确化、已回答但硬条件仍未知的计数。

复跑脚本在 `scripts/validate-v3-{http,import,lifecycle,browser}.mjs` 和 `validate-a-v3-browser.mjs`。HTTP脚本首次创建合成需求、选真实候选，后续从 .data receipt 续做。浏览器脚本可用 `npm install --prefix .data/browser --no-save playwright@1.64.0`，使用已有 Chrome 或 `V3_BROWSER_EXECUTABLE`；不是运行依赖。import脚本需要本轮保存的完整公开 PDF（或重新从下面官方URL准备同一原件），不会拿fixture替代。生命周期 prepare后只中断核对归属于隔离工作树的测试服务，再以V3关闭状态运行check-off。不要停止其他窗口服务。

最后预算修复后，编译版的 HTTP、完整PDF导入、Chrome B/C/历史及手机、强制中断恢复/关闭回退再次通过。A关闭回退可在对应环境下运行 `node scripts/validate-a-v3-browser.mjs --check-off`；实际结果保存 a-rollback.json，原下一步按钮正常，未依赖内部状态注入。

## 5. 真实样例与证据位置

合成验收需求：固定税前月薪≥15000、杭州、休息/培训重点；不是用户真实侧写。真实候选：company271 `浙江大华技术股份有限公司`／record16 `嵌入式软件工程师`，库中原JD `15-30K·14薪`；这不是已确认当前开放或固定月薪。

- 官网：[公司简介](https://www.dahuatech.com/about/company.html)。本轮新原件 SHA256 `88a2dace34ff490e92fde8326df3d863051dfae14a71dad91ade22086fa104bb`。旧次 `7ad9413e...` 也保留，页面动态内容不能混算同一原件。
- 公开完整PDF：[大华2025年度报告，深交所文件](https://disc.static.szse.cn/disc/disk03/finalpage/2026-04-18/1f278850-7180-46c1-ac48-317879a843cd.PDF)，9981189 bytes、265物理页；SHA256 `5542bde681d9562640d00def533b101bd0aefd19b81a63fa973c30f2ed98398c`。本机公开资料准备后经真实导入入口，不是获取器超时被改成成功。
- 首次官网闭环 `report-72bebfad-3e19-42b2-8831-7bc3c2deb263`：18请求、75193ms、模型0、费用未知；工资partial、培训/休息unknown、业务partial；最终规则再判使用冻结材料，停止 `reused_frozen_sources`，未重新联网。
- 文件闭环 `report-a931c047-0232-481a-a282-a0533e5932d7`：18请求、27580ms、模型0；业务answered/source_statement，培训partial，工资/休息满足unknown。PDF选中段落最大物理页180，不是全文件只有180页。
- A 改进样例 `report-069f6813-42b4-439a-ad2c-4f4ff0a9d0f7`：仅工资、培训、企业背景问题；其余主题未被补成需求。
- 最终规则5复判报告：主报告 `report-b8816d3a-a764-4212-a37d-9e76914a7f73`；完整PDF报告 `report-1db1e607-3321-40d9-a2e9-ebe20b65bd3c`。前述原始获取运行和原件不变，仅使用冻结来源重判，未重新联网或付费。

本机证据在 `.data/v3-acceptance/{report.html,source.json,investigation.json,http-session.json,import-receipt.json,import-investigation.json,lifecycle.json,a-acceptance.json,browser.json}`；最终复测 reportId 以 http-session.json 的当前值为准。原件和完整解析在 `.data/research-agent/v3/task-*/q-*-r*/<SHA256>.{html.gz,pdf,txt,parsed.json}`；问题状态、每次取得/失败、引用位置、判定前后记录、时间和规则在 snapshot/receipt。截图同目录。HTTP源回读校验原件哈希、解析正文包含引用、报告所有权。

验收浏览器cookie与用户已有浏览器隔离；可直接打开本机 report.html（官网闭环）、import-report.html（完整PDF闭环）或 source.json 查看样例。网页源回读需验收会话所有权，静态HTML仅供阅读；不要将cookie复制到其他人的浏览器。http-session.json 含本机测试会话 cookie，不打印、不提交、不公开。原始企业库、全部材料/测试日志/截图均未提交。

## 6. A 与回退

小改进版本 `a-needs-quick-unsure/1`：当前及后续未填项变现有 unsure，已有答案、城市排序、金额、条件强度全保留；机会/行业/岗位仍需明确选择与用户确认。复用既有 `a-job-needs-1` 与1.0.0映射，没有偷偷改语义，没有人格分或适合概率。

`A_NEEDS_QUICK_UNSURE_ENABLED=false` 重启即可隐藏快捷按钮，原逐页流程继续可用。旧侧写和报告不被改写。实际 A 浏览器验证没有重复填写 JD，未知主题在 B/C 保持未知。

## 7. 剩余、阻碍与下一步

1. 真实 MiniMax 语义调用未验收；目前只有可运行的默认关闭适配器和受控失败/引用回归。没有扩付费、购买服务或盲目重试。完整语义命题生成/条件支持、复杂可比冲突和逐类型金标准仍需建设。
2. 直接 PDF 获取器在本机网络下多次超时；原安全获取器不借代理绕过公网/DNS边界。受控文件导入已经解决本轮真实材料闭环；以后应研究安全可配置网络路径及更小公告，不冒充所有官网可达。
3. 所有新增陈述均未经独立认证；工资底线、当前在招/签约关系、目标团队安排等未取得可判达标材料。没有人类审核团队，不能用无人复核当确定负面/满足。
4. 财务表格数值/签约关系/法律事件阶段的完整V3模板、扫描件OCR、更多中文平台、协调行为分析、人工复核操作界面未完成。已有V2解析能力不等于这些V3判断已完整投影。
5. 当前指定URL/导入优先首个目标，多个不同企业的附件建议分别发起调查；尚未实现跨任务原件全局内容寻址库、分布式队列、生产级多用户服务。保持本机原型定位。
6. 依赖审计已有风险与大版本升级另评估。下一阶段先完善类型级金标准/语义支持，再在默认关闭路径验证模型及扫描件；没有中文标注数据时保持协同 disabled。

开源采用与许可的固定出处见 OPEN_SOURCE.md，六轮检查点见 PROGRESS.md。下一次从这些文件与 git status 续做，不重复已经保存的真实调查。本轮没有使用小说/文章编辑 Skills。
