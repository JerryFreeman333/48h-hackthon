# Agent V3 开发入口

日期：2026-10-09。当前交付是设计规格与仓库整理，尚未实现 V3 功能。

- [V3 设计与实施规格](V3.md)：模块输入输出、问题状态、预算、证据、舆论、解释与验收。
- [原始树状逻辑](source/一家公司完整Agent运行树.md)：设计依据；新增组件与平台是候选，不是已验证接入。
- [原始 XMind](source/一家公司完整Agent运行树.xmind)：保留图的跨模块关系。
- [V2 历史架构](../../Trash/docs/agent-v2/ARCHITECTURE.md)、[运行方式](../../Trash/docs/agent-v2/RUNBOOK.md)、[能力矩阵](../../Trash/docs/agent-v2/SOURCE_CAPABILITIES.md)：用于复用判断，不覆盖 V3 设计。
- [历史归档](../../Trash/README.md)：main 历史资料与 V2 文档。

分支从 agent-v2 的 `80851bda9e9d0d53aebb2376f6c601e81a004b1b` 开始，带入 main 的文档整理。可运行能力仍为继承的 ABC/v1/v2；本次没有更改业务代码、模型调用、A 问卷、数据库或报告计算。V2 原分支保留。

先完成 P0 问题契约、命题与回答判断、问题级补查、未知出口，再按规格推进。历史 HANDOFF 中的旧授权、时限和命令仅为历史记录，不作为 V3 执行授权。
