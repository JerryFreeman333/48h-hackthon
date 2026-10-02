# C｜求职 X-Ray 项目迁移交接文档 v3

> 给下一对话的开发代理。板块：**C｜个性化匹配、比较与报告**。更新日期：**2026-10-02**。本文档**取代** v2（保留为历史记录；v2 的"第一任务 P3"已完成，P4 也已完成）。公共数据契约：**1.0.0，未修改**。

## 1. 一句话状态

**P1+P2+P3+P4 全部完成并有真实测试（169 项 node:test、四场演示全过、浏览器视觉验收通过），全部在分支 `codex/c-offline-core`（远程 HEAD `6c9698e`），已推送 GitHub，尚未合入 main**；P5（取消/重启/外部失败恢复 + A→B→C 整体联调）未开始，生产 runtime/ModelClient/根目录挂载仍是协调项。

## 2. 仓库与分支现状（2026-10-02 本轮末尾实测，动手前必须重新核实）

| 分支 | 远程 HEAD | 说明 |
|---|---|---|
| `main` | `ef3377f` | PR #2 合并了 A 的《CareerDNA 嫁接与扩展开发规格 V2》（575 行文档，见 §3 警报）；**main 没有碰过 modules/c-report**（自分叉点起零提交），因此合并 C 分支预期无冲突 |
| `codex/c-offline-core` | `6c9698e` | **C 的 P1+P2+P3+P4 全量**（见 §4 提交链），基于旧 main `465c9f3` |
| `feat/a-profile` | `6d92e44` | A 业务分支（已并入 main 一次） |
| `work/b-research` / `b-section` | `fefd938` / `16c9184` | B |
| `backup/pre-remove-shared-foundation-20261002` | — | 队友备份分支，含义不明，动手前查 |

- 仍无任何层级的 AGENTS.md（本轮末尾复核过）。动手前重查。
- **main 上的 `modules/c-report` 只有 P0 时代的 docs/fixtures/scripts**（无 domain/application/ui 代码），不要误当实现。

### 2.1 本轮新增警报：A 的 V2 契约提案（必须跟踪）

A 在 main 上新增 `modules/a-profile/docs/求职X-Ray_CareerDNA嫁接与扩展开发规格_V2.md`，定义了 `ProfileBundleV2` / `SearchIntentV2`（schemaVersion '2.0.0'，多量表 assessments/能力声明/约束/证据）与 `export-v1` 兼容投影（带 compatibilityWarnings；不能表达的硬条件会拒绝静默裁剪）。**A 明确这是 A 内部 v2，不偷偷改公共 v1；B/C 升级版本后才启用跨模块 v2。** 对 C 的含义：现阶段 C 继续锁定 1.0.0 strict 不变；当跨模块 v2 启动被提上日程时，C 需要（a）决定消费 v2 还是继续收 v1 投影，（b）v2 的 constraints 数组带 evidenceIds——比 1.0.0 的 provenance 缺口前进了一步，可能改变 §6(1) 的"一律 unknown"决策。**不要在协调前自行支持 2.0.0。**

## 3. 本轮交付摘要（P3+P4，全部有真实测试）

- **P3（页面/比较/导出）**：`ui/report-view-model.ts`（展示决策纯函数）+ `ui/render-html.ts`（独立 HTML、零客户端脚本、双通道状态、原生 `<details>` 证据抽屉、单列移动布局、转义与 URL 白名单）+ `export?format=json` 私有复现包 + `adapters/memory/demo-runtime.ts` 显式 demo 宿主。unknown 不画绿/不当 0、比较无冠军排名、页面/MD/JSON 同快照均有测试；桌面/移动浏览器视觉验收通过。交付签收：`docs/C_P3_DELIVERY_2026-10-02.md`。
- **P4（可选模型精炼层）**：`application/model/`（ModelPort+ModelBudget/固定 prompt/七层校验/精炼编排）+ `runMatchPipelineWithModel` 包装器 + handlers 可选 `ctx.model` + `adapters/model/fake-scripted.ts` 脚本化 fake。模型只能改五维 summary；动作/约束/事实被 L7 逐字段断言锁死；一次修复后按维度降级回退模板；付费无上界调用在预算门被拒；传输失败不重发。**全部离线，零真实模型调用。** 交付签收：`docs/C_P4_DELIVERY_2026-10-02.md`。
- 提交链（均在远程）：`3c9d4a2`(P1) → `4bb78c5`(P2) → `ab68712`(v2 交接) → `1e98a2e`(P3) → `6c9698e`(P4+v3 交接前的 P4 交付)。
- 修订登记 P1–P4 实施记录：`docs/C_REMEDIATION_REGISTER_2026-10-02.md`（§6–§9）。

## 4. 动手前必跑的基线验证（全绿才继续）

```bash
# 1) 重新核实远程（main/分支/AGENTS.md 是否又变）
gh api repos/JerryFreeman333/48h-hackthon/branches --paginate -q '.[].name'
git fetch origin --prune && git log --oneline -3 origin/main

# 2) 文档/固定样例核对（不是应用测试）
python3 modules/c-report/scripts/verify_c_docs.py     # 预期：15/15 + 8/8，0 错误

# 3) C 模块工程
cd modules/c-report
npm install
npm run typecheck        # 0 错误
npm test                 # 15 文件 169 测试全过（package.json 显式文件列表）
npm run demo             # P1：14/14
npm run demo:p2          # P2：15/15
npm run demo:p3          # P3：24/24
npm run demo:p4          # P4：12/12

# 4) P1 输出可复现回归（改了引擎才允许失败，且需重生成并说明）
npm run demo -- --generated-at 2026-10-02T09:00:00Z --out /tmp/regen.json
# 与 docs/C_P1_DEMO_OUTPUT_2026-10-02.json 逐字节一致
```

## 5. 必须继承的语义决策（改前先读对应交付文档）

1. **薪资/城市/出差/外包约束一律 unknown**（1.0.0 无 provenance；比较器已实现，公共语义协调后自动生效）。别"修好"它。
2. **hold 规则表为空**（无公共命题协议，可疑文本不得自动触发 hold）。
3. **无正向依据不轻易 explore**（转 verify_first，C-10 本地预案，仅 demo/test）。
4. **输入 strict 模式**（1.0.0 字面量锁定；A 的 2.0.0 提案协调前不得放行，见 §2.1）。
5. **跨用户按 ID 读 → 404**；按项目寻址写 → 403；幽灵项目 → 403。
6. **非法输入不落 run**；run 状态与 completeness 分离。
7. **版本不可变**：update 产生新版本新 run；insert-only；导出从同一不可变快照渲染（页面/MD/JSON 同源有测试）。
8. **模型职权最小化（P4）**：只改五维 summary；L7 逐字段不变量断言违反即抛错；一次修复；按维度降级；promptVersion 忠实标记（全部被拒时保持模板标记，不冒充 AI）。
9. **付费无上界 → 调用前拒绝**；usage 的 costMinor null=未知（不是零）；传输失败不盲重发。
10. **页面语义**：unknown 灰色绝不绿灯、explore 动作中性灰；比较视图无排名/冠军/综合分；无 URL 不造链接；零客户端脚本。

## 6. 技术坑（下一对话直接受益；★为本轮新增）

- 继承自 v2：zod v4 API（两参 z.record、z.url、z.strictObject）；node:test + `tsx --test`；**package.json test 脚本是显式文件列表，新增测试文件必须手动加入**；tsconfig include 现为 domain/ui/application/adapters/scripts/tests 六目录；verify_c_docs.py 会把文档里的伪协议链接当错误；api-harness 的 fake token（`token-user-demo-1` 拥有 project-demo-1）；演示输出可复现断言；api.github.com 偶发抖动。
- ★ **注释里写 `fact-*/evidence-*` 会提前终止块注释**（`*/` 陷阱），TS 报一堆 Invalid character；本轮已踩。
- ★ **数字子串漏洞**：`'500' in '15000'` 为真——任何"数字是否在材料中出现"的检查必须用整词 token 集合（见 `validate-output.ts` 的 corpusNumberSet）。
- ★ **测试断言撞 CSS**：断言 HTML 时用 `class="chip-unknown"` 这样的属性形态，不要裸搜类名（`<style>` 里必有同名选择器）。
- ★ **角度导航会干扰 indexOf 行序断言**：比较表行序要在 `<table class="compare">` 到 `</table>` 区间内断言。
- ★ **HTTPS push 本轮直接成功了**（v2 说反复超时的是前两轮环境）；但推送后必须做 `git fetch` + 本地/远程 SHA 与 `^{tree}` 比对核验。API 推送法（§v2.2）留作预案，本轮未用。
- ★ **浏览器视觉验收**：ZCode 内置浏览器不支持 `file:`，需起本地静态服务（`python3 -m http.server`，注意用 run_in_background）；fullPage 截图有拼接伪影，重复内容先查文件本身再怀疑代码。
- ★ **fake 模型的预算语义**：`ModelBudget.reserve(null, paid)`——runtime.CallBudget 是无条件拒 null，C 侧区分"付费无上界（拒）"与"免费 fake 上界 0（过）"；对齐说明写在 `port.ts` 头注释与 P4 交付文档。

## 7. 可借鉴的成熟开源项目（按模块；本轮经搜索核实，动手前复核活跃度）

> 只写"借鉴什么"。优先级判断在 §8 的开发流程里：**对当前里程碑真正有杠杆的只有三件**——XLSForm 化 A 问卷、splink 阈值语义进 B 实体归一、oasdiff 式契约破坏检测进 CI。其余是生产期再抄。

### 共享底座
- **next-forge**（已核实）：横切能力（auth/计费/观测/日志）作为模板内挂载模块而非各业务自接——runtime 空位的成品参考；import 边界纪律。别抄它的 SaaS 业务页。
- **turborepo**：把 CI 的条件步骤升级为任务图（`test:c` 只在 C 目录变更时跑、自动继承 contracts 变更）。
- **oasdiff**：PR 内自动 diff HTTP 契约破坏性变更（删字段/改枚举/改必填）并阻断——治"公共 schema 靠口头不变"。
- **changesets**：packages/contracts 的版本纪律（改契约必须带 changeset + 自动 changelog）。

### A 画像意向
- **KoboToolbox / XLSForm 标准**（最高杠杆）：问卷=数据文件（题干/选项/跳转/多语言分列），版本化、可 diff、非程序员可改，`instrumentId+version` 直接落 assessment 字段。
- **surveyjs**：表达式驱动评分与跳题、题目 JSON schema、i18n 结构；抄元模型，不必用它的 UI。
- **Formbricks**：答卷与问卷版本绑定（改题不污染历史）；答卷/身份分离存储。
- 负面：**AIHawk**（已核实原仓库归档）——无版本化无确认流，且自动投递与"先核验再行动"定位相反，别看。

### B 调研取证（风险最高的模块）
- **JobSpy**（已核实）：多招聘源并发抓取后归一成单一 DataFrame，缺失列显式 null——CandidateBundle 雏形；限速与去重。注意：无中国平台。
- **get_jobs（loks666）**（已核实）：Boss/猎聘/51job/拉勾/智联的浏览器自动化，按平台隔离 adapter 的做法值得抄；自动打招呼/投递功能是红线，不碰。
- **splink**（英国司法部）：公司实体归一——blocking + 概率打分 + **阈值以下只给 ambiguous 不硬归一**，与 C 的 unknown 哲学同构，语义可直接共用。
- **trafilatura**：正文抽取附元数据（标题/日期/来源一起出）、抽不出显式失败——evidence 三件套 discipline。
- **Great Expectations / pandera**：覆盖检查即代码，把 coverage 表做成自动执行 expectation。

### C 匹配报告（联调后参考）
- **instructor**：错误回填式修复（结构化校验错误喂回、失败返回 None）——比 P4 现在的文本拼接更规范。
- **guardrails-ai**：校验器注册表（字段/失败动作声明式配置），若校验层将来需按客户配置。
- **promptfoo**：给 `c-prompt-model-p4.0.0` 建 prompt 回归矩阵 + 红队用例，prompt 一改自动跑——当前最大短板。
- **langfuse / litellm**：生产期 trace 树与用量/预算账本（UsagePort 生产半边参考）。

### 平台运行时
- **OpenMeter**：用量事件流 + 聚合 + 滞后结算，承接 costMinor null≠0 的语义。
- **Dagster**：DurableScheduler 候选；asset 血缘天然对应 evidence→fact→report 溯源。

### 产品化外围
- **Morphic**（已核实活跃）：引用锚定 UI（每句话挂来源卡）是证据抽屉的交互范本；它不分 supported/unknown——我们的语义比它强，别被带回去。
- **gpt-researcher / STORM**：子问题分解（先提纲再逐点取证）可用于 B 检索调度；负面：两者引用=来源存在即引用，无命题级支持校验，照抄会引入假阳性。
- **Resume-Matcher**（已核实活跃）：只看不抄——匹配分+关键词高亮是流量密码但违反 §9"无综合百分比"；看引流点（关键词可视化、逐句建议），守住"不给分、不给冠军"。

## 8. 之后继续开发的流程（建议顺序与门槛）

1. **先做合并决策（下一对话第一件事，需维护人拍板）**：把 `codex/c-offline-core` 合入 main。main 未碰 C 目录、路径不相交，预期零冲突；合并后 changed paths 核对 + 非 C tree 对比 + 远程树核验。合并后才谈"直接写 React 组件"（P3 的框架无关渲染层保留，根挂载片段在 `docs/C_P3_INTEGRATION_SNIPPETS.md`）。
2. **根目录挂载接线（维护人或授权 C）**：`app/demo/c`、demo 导出路由、`app/api/c`（P2 片段）、root `test:c`、CI 条件步骤——全部片段已备于 P2/P3 集成片段文档。
3. **P5（C 侧独立部分）**：取消/重启/外部失败恢复——run 的 cancel 路径（InMemoryRunStore.cancel 已有雏形）、响应丢失恢复语义、断点续跑（阶段落盘）；fake runtime 上测试。
4. **A→B→C 整体联调（与 P5 分开签收）**：走真实集成层（SearchIntent 快照传递、requireProjectAccess 对齐）；验收清单在架构文档 Integration acceptance 一节。**模块独立完成 ≠ 整体联调完成。**
5. **生产接入前提（不阻塞 1–4）**：公共 runtime（IdentityProvider/持久 SnapshotRepository/DurableScheduler）、ModelClient adapter + 价表上界、/reports 上线。借鉴项目里 next-forge/Dagster/OpenMeter 在这一步进场。
6. **上游跟踪**：A 的 V2 契约（§2.1）——跨模块 2.0.0 启动必须三方协调；C 侧在协调前不做任何支持。

## 9. 未解决依赖与协调事项（最新全量）

1. 根目录挂载：`app/api/c/`、`app/demo/c/`、`app/reports/`、root `test:c`、CI 条件步骤（片段已备）。
2. 生产 runtime：持久存储 + 唯一约束 + 事务（幂等预留生产半边）、公共鉴权 adapter、持久调度/取消/恢复。adapters/memory 与 demo-runtime 不得部署为无鉴权 live。
3. 生产 ModelClient adapter + 价表上界（P4 的 ModelPort 是 C 私有接口提案，公共接口成型后对齐）。
4. 语义字典：min_fixed_monthly_salary 单位/币种、薪资/城市 provenance、时序协议（登记 §3.2–3.4）。
5. 动作歧义跨模块确认（C-10 本地预案仅 demo/test）。
6. packages/contracts 与 C 本地严格 schema 的统一决策。
7. 生产快照读取方式（/reports 用专用端点还是宿主直读，P3 集成片段 §3）。
8. A V2 契约的跨模块启用时机（§2.1）。

## 10. 签收规则

- 已签收：P1 核心、P2 API/幂等/权限/不可变版本、P3 页面/比较/证据/导出（含浏览器视觉验收）、P4 模型精炼层（fake 模型上）——169 项测试、四场演示、文档核对 0 错误。运行成本至今为零。
- 不能签收：整体联调、生产 runtime 接入、真实模型/数据质量、付费/盈利、合规上线。
- 每次交付写：实际实现文件、实际启动命令、应用测试及范围、真实接口状态、未完成项、运行成本/unknown、与公共 runtime 的接入状态。

## 11. 下一对话可直接粘贴的启动指令

```text
你接手"求职 X-Ray"的 C｜个性化匹配、比较与报告模块。
仓库：https://github.com/JerryFreeman333/48h-hackthon（私有，gh 已认证）。
先读 modules/c-report/docs/C_MIGRATION_HANDOVER_V3_2026-10-02.md（v3，取代 v1/v2）：
P1–P4 已完成（169 项测试、四场演示全过），全在分支 codex/c-offline-core（远程 HEAD 6c9698e），
已推送但未合入 main；main 已被队友推进（PR #2，A 的 V2 契约提案——重要，见交接 §2.1）。
动手前重新核实远程分支与 AGENTS.md；推送后必须 SHA+树核验。
先跑基线：python3 modules/c-report/scripts/verify_c_docs.py；
cd modules/c-report && npm install && npm run typecheck && npm test（应 169 全过）
&& npm run demo（14/14）&& npm run demo:p2（15/15）&& npm run demo:p3（24/24）&& npm run demo:p4（12/12）。
然后：第一优先与维护人确认把 codex/c-offline-core 合入 main（main 没碰过 C 目录，预期零冲突）；
合并后按交接 §8 推进根目录挂载接线与 P5（取消/重启/外部失败恢复）。
不改公共 schema、A/B、packages、根工程文件；提交 [C] 前缀、只暂存 modules/c-report/。
实际测试通过后再报告完成；模块独立完成不等于整体联调完成。
```
