# Agent V3 开发入口

日期：2026-10-09。首版 B→C 已实现并完成真实正文/PDF、公开 HTTP、浏览器及关闭回退验收；高级模型与平台能力仍有明确限制。开关默认关闭。

- [实施交接与逐节状态](HANDOFF.md)：运行、代码、验收、证据、未知与下一步。
- [持续检查点](PROGRESS.md)：各轮实际结果和修复。
- [开源比较](OPEN_SOURCE.md)：固定版本、许可证与采用决定。

- [V3 设计与实施规格](V3.md)：模块输入输出、问题状态、预算、证据、舆论、解释与验收。
- [原始树状逻辑](source/一家公司完整Agent运行树.md)：设计依据；新增组件与平台是候选，不是已验证接入。
- [原始 XMind](source/一家公司完整Agent运行树.xmind)：保留图的跨模块关系。
- [V2 历史架构](../../Trash/docs/agent-v2/ARCHITECTURE.md)、[运行方式](../../Trash/docs/agent-v2/RUNBOOK.md)、[能力矩阵](../../Trash/docs/agent-v2/SOURCE_CAPABILITIES.md)：用于复用判断，不覆盖 V3 设计。
- [历史归档](../../Trash/README.md)：main 历史资料与 V2 文档。

分支从 agent-v2 的 `80851bda9e9d0d53aebb2376f6c601e81a004b1b` 开始，带入 main 的文档整理。可运行能力仍为继承的 ABC/v1/v2；本次没有更改业务代码、模型调用、A 问卷、数据库或报告计算。V2 原分支保留。

先完成 P0 问题契约、命题与回答判断、问题级补查、未知出口，再按规格推进。历史 HANDOFF 中的旧授权、时限和命令仅为历史记录，不作为 V3 执行授权。
