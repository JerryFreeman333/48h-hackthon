# Franklin + MiniMax 接入

> 本分支新增可选 Agent v2：四类公开渠道、独立证据库、HTML/PDF 原文、可定位财务记录、检查点与五段报告解释。设置 `RESEARCH_AGENT_ENABLED=true`、`RESEARCH_AGENT_V2_ENABLED=true` 后启用，无需模型密钥；默认关闭以保留下述 v1 路线。安装和验收见 [v2 运行说明](../../Trash/docs/agent-v2/RUNBOOK.md) 与 [审查包](../../Trash/docs/agent-v2/REVIEW_PACKET.md)。v2 不是完整直连所有平台，实际能力见 [来源矩阵](../../Trash/docs/agent-v2/SOURCE_CAPABILITIES.md)。

这是现有 B 调查的服务端补充，不改变 A 填写流程或 C 七板块结构。先从本地数据库寻找候选；用户勾选后，MiniMax 调用受限的 Franklin 工具补查关注主题，C 将可引用资料与冻结的 A 需求对照。模型生成的总结与推理不作为事实。

## 本地启用

1. 按项目 README 下载 Git LFS 数据库，安装项目 Node 依赖。
2. `python -m venv .venv`，然后 `.venv/Scripts/python.exe -m pip install -r modules/research-agent/requirements.txt`（Windows）。其他系统使用 `.venv/bin/python`。
3. 在忽略的 `.env.local` 设置 `RESEARCH_AGENT_ENABLED=true`、`MINIMAX_API_KEY`、`MINIMAX_BASE_URL=https://api.minimax.cn/v1`、`MINIMAX_MODEL=MiniMax-M2.7`。国际账户可用官方 `https://api.minimax.io/v1`；密钥与地区、模型权限需匹配。`RESEARCH_AGENT_PYTHON` 可选，留空时使用项目虚拟环境。
4. `npm run build`，`npm start -- --hostname 127.0.0.1 --port 3000`，打开 `/research`。

关闭开关时仍使用已有本地数据库生成报告。未配置密钥、接口限额、资料来源失败或超时会明确说明，并保留已有资料。此后台任务实现用于持续运行的本地 Node 服务；无服务器短请求部署需另接持久队列。

## 实际边界

- 模型只收到已选公司的 ID、名称、关注主题及少量现有公司摘录；不发送用户身份、完整侧写、个人金额条件、历史报告或整库。A→C 的个人需求对照在本机完成。
- 只允许读取材料与调查主题两种工具，参数必须属于已选公司和主题。执行补查时在同一次工具请求内覆盖 A 的全部关注主题，避免模型随意遗漏。每公司最多三次模型请求、两次工具调用，每次最大 4096 输出 token；整次调查最多四分钟，工具单次最多 65 秒。记录 token 与请求 ID，不虚构费用。订阅限额仍以 MiniMax 官方账户为准。
- 新建 `.data/research-agent/work.sqlite`，只读备份上传的数据库后写独立 `agent_*` 表。原库与已上传快照不写入、不调用原工具的主体猜测、全库分析、注册公司或 selftest。
- 来源以公开搜索摘要为主；保留 URL、原日期、实际采集时间和范围。无可引用链接、解析失败摘要、其他公司内容不纳入。来源声称官方也保持未独立核验；公司或集团资料不冒充当前岗位承诺，不覆盖固定月薪。
- 工作库材料及成功调查缓存有效期 24 小时，空结果不缓存，再次分析会重新尝试。解析修复版本变更隔离旧缓存。后台任务只允许一个同时进行，防止重复扣用量和工作库初次复制冲突；刷新 B 能恢复进度。重启后的未完成任务提示重试，不自动重复付费调用。
- Agent 证据保留检索主题，按原文关联一个或多个报告板块及具体关注项，无需先生成旧版 `needs.*` 事实。七板块与关注项使用相同原文关联；检索主题本身不证明资料内容，原文线索不自动成为已核验事实。相同公司、链接及正文的材料合并检索主题，归档记录接收、接纳、复用、拒绝及报告使用数量。
- `.env.local`、`.venv`、工作库、缓存、任务、个人侧写、报告、日志与截图均不提交。

## 工具来源与改动

`vendor/` 来自用户提供的 `Agent安装.zip` 中 Python 源码与交接文档；排除了 Mac 元数据、缓存、软链接和数据库。原文档中的历史验证数量不是本项目验收结果。原采集器 360 搜索解析向后扫描摘要可能越过下一条标题，本项目已限制在当前结果内；其余原入口仅保留作来源参考，项目只经 `worker.py` 调用受限函数。

运行关键检查：`node --import tsx --test modules/research-agent/research.test.ts packages/integration/research-jobs.test.ts`；`.venv/Scripts/python.exe modules/research-agent/test_worker.py`；`npm run test:integration`；`npm run build`。

MiniMax 官方接口说明：[OpenAI 兼容调用](https://platform.minimax.io/docs/api-reference/text-openai-api)。工具调用期间保留完整 assistant 消息供模型续接，归档不保存模型推理。

## V3 首版

V3 已接入真实 B→C，独立开关默认关闭，正文/文本PDF与用户导入在本机保存，问题级判断冻结进入报告。请先读 [V3 交接](../../docs/agent-v3/HANDOFF.md) 的逐项状态、实际验证与限制；上述旧版来源/缓存策略仍适用于关闭V3后的原路线，不能拿它们描述V3。

开关：`RESEARCH_AGENT_ENABLED=true` 和 `RESEARCH_AGENT_V3_ENABLED=true`；安装既有 `requirements-v2-lock.txt` 即可运行。V3 规则不需要模型凭据。`RESEARCH_AGENT_V3_MODEL_ENABLED` 默认false，另开启时至多一次MiniMax语义复查、2048输出token，不上传用户导入/个人金额条件，结果不认证来源。

正式检查：`npm test`、`npm run test:agent`、`npm run test:integration`、`npm run typecheck`、`npm run build`；Python在本轮的 `.venv/Scripts/python.exe -X utf8 -m unittest discover -s modules/research-agent -p test_v3*.py -v` 验证。`npm run test:v3:python` 使用PATH上的python，请确保它安装相同依赖。
