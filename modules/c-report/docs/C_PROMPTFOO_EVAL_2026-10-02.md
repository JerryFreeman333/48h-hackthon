# C｜promptfoo 回归测试套件（设计依据：可借鉴项目清单 §4）

> **状态**：✅ 已落地。  
> **日期**：2026-10-02。  
> **范围**：仅 `modules/c-report/tools/eval/` + `modules/c-report/package.json` devDep。不动 A/B/packages/根工程。  
> **目标**：把 P4 prompt 版本 `c-prompt-model-p4.0.0` 的人工审阅升级为自动化回归矩阵。

## 1. 为什么装 promptfoo（设计依据 §4 C 板块）

v3 交接 + 可借鉴项目清单共同指出：
- C 当前 P4 prompt 是硬编码 `SYSTEM_PROMPT` + `buildRefinePrompt` 模板
- prompt 一改靠人工审；无法回归
- promptfoo 是开源 LLM eval 框架，自带 provider 抽象 + jinja 渲染 + 多断言类型
- 不依赖真实 API key（自定 JS provider 可接 `ScriptedFakeModelPort`）

## 2. 安装范围

| 项 | 路径 / 值 |
|---|---|
| npm devDep | `modules/c-report/package.json` → `devDependencies.promptfoo: "^0.123.1"` |
| Provider 实现 | `modules/c-report/tools/eval/provider.ts`（类 `P4Provider`，调 `ScriptedFakeModelPort`）|
| 配置文件 | `modules/c-report/tools/eval/promptfooconfig.yaml`（4 个回归用例）|
| npm script | `npm run eval:p4` |
| **未触** | A、B、packages、AGENTS.md、根工程 |

## 3. 4 个回归用例

| # | 用例 | 断言 | 守住的设计边界 |
|---|---|---|---|
| 1 | 5 维齐全 + 三段标记 | is-json + 五维 key 排序 + 每维 summary 含【证据】【推断】【缺口】| 确定性管线输出结构 |
| 2 | unknown 维度也三段 | 5 维 × 3 标记 | C-08：unknown 不画绿但有结构 |
| 3 | 契约外字段透传 | 顶层仍是合法 dimensions 数组 | refine.ts L1 在生产路径拒契约外；provider 透传是测试意图 |
| 4 | 缺 dimensions 字段 | 5 维数组**不应**凭空出现 | 防 fake 偶然生成伪 5 维 |

## 4. 实测结果

| 检查 | 数字 |
|---|---|
| 4 用例全部通过 | **4/4** |
| 破坏测试 1（移除【证据】） | **1/4 fail**，精确识别（3 个 PASS + 1 个 FAIL）|
| 还原后 | **4/4 pass** |
| 端到端耗时 | < 1s |

## 5. 与现有 213 测试 + 88 演示的边界

- `npm test`（213 项）→ node:test 单测
- `npm run demo:p4`（12 项）→ 端到端 demo，含 `c_prompt-model-p4.0.0` 实际调用 `refineReportWithModel`（fake）
- `npm run eval:p4`（4 项）→ promptfoo 回归矩阵，与 demo 不同的角度：单测 prompt + 单测 JSON 结构

三者互补：
- node:test 守住代码分支（取消路径、checkpoint 原子性、API 401/404 等）
- demo 守住端到端语义（页面渲染 + 模型调用 + 字节一致输出）
- eval 守住 prompt 模板的语义结构（5 维 × 3 段 × 契约字段）

## 6. 运行方式

```bash
cd modules/c-report

# 跑 P4 prompt 回归
npm run eval:p4

# 单条用例跑（verbose）
npx promptfoo eval -c tools/eval/promptfooconfig.yaml --verbose

# 加新用例：在 promptfooconfig.yaml 的 `tests:` 数组里追加一项
# 改 prompt 模板：在 application/model/prompts.ts 改 → 跑 eval:p4 看回归
```

## 7. 已知边界与未来扩展

- **当前无真实 API key**：provider 只接 fake-scripted；接真实 OpenAI / Anthropic 等只需改 provider.ts 的 fake 部分
- **当前 4 个用例是 smoke 级别**：未来 P4 接入真实模型后，应扩到每个 demo case 都对应一个 eval case（按 demo:p4 的 12 项展开）
- **当前固定 prompt 模板**：模板写在 `application/model/prompts.ts`（TS 内部），eval 通过 ScriptedFakeModelPort 间接测；如需直接对比 prompt 一字之差，provider.ts 可同时返回 `receivedRequests` 内容供断言

## 8. 关联

- v3 移交 `C_P5_DESIGN_2026-10-02.md` §7.2 + §10 验收
- C_REMEDIATION_REGISTER §10 C-22 实施记录补充：eval 套件是 P4 prompt 回归的兜底
- 可借鉴项目清单 §4 `promptfoo`（置信度高）的本地落地
