# Agent v2 审查包

## 交付身份

- 仓库：<https://github.com/JerryFreeman333/48h-hackthon>，分支 `agent-v2`。
- 基线：`17349766b9aee5e615437dc2745d79dc5f77e270`；实现阶段提交 `ce860f3`，之后另有规则修正与验收提交。
- 最终审查版本为此文档所在分支 HEAD。最终 SHA 的远端核对结果写在聊天交付及本地 `.data/agent-v2-validation/delivery-receipt.json`，避免在提交内容中写入无法自引用的 SHA。
- 隔离目录：`C:/Users/Sophie/Documents/Codex/agent-v2-20261008`。原 main 未改动。未部署、未合并 main、未强推；仓库 workflow 只运行检查。

## 审查入口

先读 `HANDOFF.md` 推理边界、`BASELINE.md` 调用链，再看以下路径（均相对 `modules/research-agent/`）：

1. `v2/identity.py`、`v2/provenance.py`、`v2-research.ts`：错误主体、虚构引用、摘要/正文、数字位置、公司/岗位边界。
2. `v2/analysis.py`：否定/条件、财报单位/列/范围、采购阶段、风险事件、栏目文本过滤；精神空间不等于技术自主或晋升。
3. `v2/pipeline.py`、`v2/store.py`、`v2-tool.ts`：预算、全文、幂等、部分失败、重启、无网络恢复。
4. `v2-report.ts` 及 `packages/integration/demo-flow.ts`：冻结报告、五段解释、差异、未知和原文链接。
5. `REUSE_MANIFEST.md` 与 notices：MARA 仅小模块改编，GPT Researcher 仅参考，Docling 未用于生产。

实际架构见 `ARCHITECTURE.md`，运行/回退见 `RUNBOOK.md`，真实来源边界见 `SOURCE_CAPABILITIES.md`，执行结果见 `ACCEPTANCE.md`。

## 两个可复现案例

**真实披露**：`validate_v2_public.py` 下载中控技术 2025 年年报，物理页 140 货币资金可回查；`--all-channels` 扩展实际信用、招聘/采购、社区。原始文件只在忽略的验证目录。`examples/public-disclosure.json` 为少量实际摘录和解释，不是 live 公司 fixture。

**合成招聘/匿名经历**：`test_v2_pipeline.py --export-fixture`、`compare_v2_fixture.py`。20–30 万含奖金不换算固定月薪；不加班/奖金条件保留；采购计划不变成兑现福利；匿名旧经历不变成普遍情况。TS 测试拒绝 fixture 进入 manual/live 报告。结果见 `examples/comparison-summary.json` 与 `modules/research-agent/fixtures/v2-channels.fixture.json`。

## 限制与复查重点

- 新路径模型调用为 0。原 MiniMax 边界通过自动测试，真实密钥/API 未实测。没有新的模型计费幂等账本，不把 v1 说成已获得 v2 的保证。
- 七个平台未全部直连，没有专有 API、登录内容、评论全集或付费来源。矩阵明确索引和未验证状态。
- 引用有效不代表来源陈述真实；复杂中文、标准条文和隐含范围仍可能漏提或误读。置信度保守，没有准确率百分比/独立认证，未全面实现时效衰减。
- 来源角色/城市只从显式标签保留，不能自动证明与应聘岗位对应；集团关系未知不补全。
- 未配置 OCR，复杂表格不对齐时不推断；一个成功的 304 页样本不证明支持所有版式。
- 去重支持网址、正文哈希与明确原文链接，不能保证识别全部改写转载。
- 无持久盘/Python 的托管环境未部署验证。全站结束后要重启并再次分析，没有自动定时唤醒。

浏览器使用合成侧写和真实数据库候选完成 B→C，桌面/手机实看。完整会话、归档、日志和大文件不提交。自有代码做 diff 格式检查；第三方 LICENSE 的原有空白保留，`.gitattributes` 禁止 notices 换行转换，manifest 校验原始字节。
