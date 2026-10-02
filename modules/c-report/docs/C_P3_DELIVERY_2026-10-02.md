# C｜P3 页面、比较与导出：交付与签收记录

- 板块：**C**；日期：**2026-10-02**；文档版本：**1.0**。
- 对应规格：[C 新开发规格 v1.1](C_DEVELOPMENT_SPEC_V1.1_2026-10-02.md) §16 P3（/demo/c、五维/比较/证据、MD 与私有 JSON、同快照、unknown 不为 0/绿灯、键盘移动可用）。
- 公共契约：**schemaVersion = 1.0.0，未修改**。本模块未新增/修改任何公共对象、key 或枚举。
- 性质声明：**P3 在框架无关渲染层 + 显式内存 fake demo 宿主上独立完成并有真实测试**；不是整体联调签收，不是生产部署，`/reports` 未上线。

## 1. 实际实现范围（全部在 modules/c-report/ 内）

| 文件 | 内容 |
|---|---|
| `ui/report-view-model.ts` | **框架无关视图模型**（新增 ui/ 目录）：输入不可变 MatchReport + C 私有快照（可选），输出纯数据 ViewModel。全部展示决策在此层定死：首屏（动作/≤3 理由/首要问题/覆盖摘要）、逐候选（约束/五维/关键未知/核验问题/证据）、比较视图（同维度横向、无排名字段）、中文文字标签（状态/约束/动作/覆盖/核验/模式）、safeUrl 预判 |
| `ui/render-html.ts` | **框架无关 HTML 渲染**：ViewModel → 独立 HTML 文档（零客户端脚本）。HTML 实体转义防 XSS；协议白名单（仅 http/https，无 URL 显示提供方式不造链接）；双通道状态（CSS class + 中文文字标签同时出现，unknown 灰色绝不用绿）；原生 `<details>` 证据抽屉（键盘可开合）；skip link + focus-visible；单列移动布局（max-width 720px 媒体查询）+ 比较表横向滚动容器；查看角度经链接服务端切换（`aria-current` 标记） |
| `application/api/handlers.ts` | `export` 增加 `format=json`：C 私有复现包（artifactType=`c_private_report_snapshot_v1`，含 report/输入快照/trace/diagnostics），读同一不可变快照，仅所有者可导出；不支持格式仍 422 |
| `application/ports.ts` | `StoredReportSnapshot.snapshot` 补 `report` 字段（对齐 P1 演示输出的工件形状；复现包完整自洽） |
| `adapters/memory/demo-runtime.ts` | **显式 demo 宿主运行时（非生产）**：模块级内存 fake stores + demo 鉴权；种子化经真实 `handleCreateMatch`；`demoExportResponse` 走真实 `handleExportReport`（demo token 服务端注入）；`renderDemoReportHtml` 组装页面（demo 徽标/导出链接/角度切换） |
| `scripts/run-p3-demo.ts` | 端到端演示：24 项 PASS/FAIL（退出码判失败），覆盖 §3 全部验收点 + XSS 变体 + 空候选变体 |
| `tests/ui-view-model.test.ts`（16 项） | 首屏/五维/未知/比较/同快照/空候选的 VM 级断言 |
| `tests/ui-html.test.ts`（14 项） | 双通道/转义/协议白名单/结构可用性/导出入口/角度行序 |
| `tests/api-export-json.test.ts`（5 项） | json 导出工件形状/两次逐字节一致/v1 不可变/越权 404/未认证 401/422 |
| `package.json` / `tsconfig.json` | 测试列表加入 3 个新文件；新增 `demo:p3` 脚本；tsconfig include 增加 `ui/**` |
| `docs/C_P3_INTEGRATION_SNIPPETS.md` | 根目录挂载片段（/demo/c 页面、demo 导出路由、/reports 骨架、CI 步骤）与协调事项 |

## 2. 关键实现决策

1. **框架无关渲染 + 薄 Next 封装**（交接文档 §9 建议）：渲染层不 import React/Next；`ui/` 两个文件是纯函数，node:test 直接覆盖。根挂载只需把 `renderDemoReportHtml()` 的返回值放进页面/route（片段见 P3 集成片段）。React 组件化留待 C 分支并入 main 后由维护人决定。
2. **unknown 不为 0/绿灯（C-08）**：比较单元格渲染「未知」文字而非数值；全页不存在 unknown→绿色通道（`chip-unknown` 为灰色 + 文字标签）。`supported` 绿色只用于命题有支持的事实/约束/维度状态，不用于动作——动作 `explore` 亦为中性灰（不暗示安全），`deprioritize` 红、`verify_first` 琥珀。核验状态（verified/unverified/disputed）与在招状态（open/closed/unknown）是独立配色通道，文字标签始终同时出现。
3. **无冠军排名**：比较视图只有五维状态行 × 候选列，候选保持快照原始顺序；VM 无 score/rank/champion 字段（有测试）；页面带「本表不产生排名、冠军或综合分」常驻说明。查看角度（`?angle=`）只把聚焦维度行置前并标记，不改变候选顺序、不打分。
4. **同快照**：页面 ViewModel、MD 导出、JSON 导出全部来自同一不可变 `StoredReportSnapshot`；测试证明 v1 存储工件在 update 后逐字节不变、JSON 导出两次逐字节一致、页面证据集合与 `evidenceSnapshot` 同源。
5. **空候选（C-13）**：`results=[]` 时页面显示 insufficient 空状态说明（来自私有 diagnostics），不伪造岗位卡片；VM/HTML 均有测试。
6. **零客户端脚本**：键盘可用性全部由原生元素承担（`<details>`、链接、focus-visible 样式、skip link）；无 onclick/无 `<script>`（有测试）。移动端单列 + 比较表 `overflow-x` 滚动容器（`role="region"` + `tabindex="0"` 可键盘滚动）。
7. **转义与链接**：渲染层所有动态文本经 HTML 实体转义（含属性上下文）；岗位来源/证据 URL 仅 http/https 成链（`rel="noopener noreferrer nofollow"`），其余显示「原值协议受限已隐藏」或「无链接（提供方式：…）」。XSS 注入变体（`<script>`、`<img onerror>`、`javascript:`）经真实管线进入渲染层后无活动内容（有测试）。
8. **demo 徽标**：`/demo/c` 页面顶部常驻「演示入口：本页数据为公共合成样例…非生产」横幅（§15：demo 为明确合成/人工演示入口）。

## 3. 实际测试结果（2026-10-02 本轮真实运行）

- `tsc --noEmit`：0 错误。
- `npm test`（tsx --test / node:test）：**13 文件 147 测试全部通过**（P1 83 + P2 29 + P3 35）。P3 覆盖：
  - 首屏：动作取首个候选、理由 ≤3、must 问题优先、覆盖摘要含关键主题缺口（demo 样例缺口=3：收入可判定/真实在招/经营财务）。
  - 五维与未知：恰好五 key 各一次；unknown 保留「未知」标签；关键未知清单来源结构化（constraint/dimension/coverage）；薪资显示保留 total 口径不冒充固定。
  - 比较：行=五维（可聚焦）、列=候选原始顺序；非法角度回退中性；unknown 单元格为「未知」；VM 无排名/分数字段；多候选列数随 results 增长。
  - HTML：`chip-unknown` 渲染计数与 VM unknown 数一致且全部带文字；verified/vacancy/动作独立通道；XSS 三种注入向量全部失效；href 白名单（#/相对/http(s)）；零脚本/无内联事件/skip link/details/viewport/媒体查询；导出入口由 host 注入。
  - JSON 导出：工件形状（artifactType/report/输入快照/trace/diagnostics）、两次逐字节一致、v1 不可变、越权 404、未认证 401、不支持格式 422。
- `npm run demo:p3`：**24/24 PASS**（真实 handler 种子化 → VM → HTML → 导出 → 注入变体 → 空候选）。
- 回归：P1 演示 **14/14**，输出与提交样例 `docs/C_P1_DEMO_OUTPUT_2026-10-02.json` **逐字节一致**；P2 演示 **15/15**；112 项既有测试无回归（P2 既有「不支持格式」用例的示例格式由 `json` 改为 `docx`——P3 起 json 为受支持格式，断言语义未变）。
- 浏览器视觉验收（本轮真实运行）：桌面 1280px 全页（首屏/覆盖/比较/五维/抽屉/事实快照/页脚）、证据抽屉点开交互、移动 375px 单列与比较表布局，均正常渲染（Chrome/Chromium 实测截图核对）。
- 文档核对 `verify_c_docs.py`：15/15 + 8/8，0 错误。

## 4. 未完成项

- **根目录挂载**：`app/demo/c/`、`app/reports/`、`app/api/c/`（P2 片段）、root `test:c`、CI 条件步骤——见 [C_P3_INTEGRATION_SNIPPETS.md](C_P3_INTEGRATION_SNIPPETS.md)，维护人提交或授权 C 提交。
- **/reports 正式入口未上线**：依赖公共 runtime（IdentityProvider + 持久 SnapshotRepository）；生产快照读取方式（专用端点 vs 宿主直读）待确认。
- **P4**：模型接入、七层语义校验、预算、一次修复降级。
- **P5**：取消/重启/外部失败恢复、A→B→C 联调；**模块独立完成 ≠ 整体联调完成**。

## 5. 真实接口状态

无任何真实数据供应商/模型/支付调用；未发生成本；demo 宿主仍是显式内存 fake（单进程、重启即丢、不得部署为无鉴权 live）；测试与视觉验收均基于公共合成样例与注入变体，不构成语义准确率证明。
