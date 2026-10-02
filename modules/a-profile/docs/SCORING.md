# 当前计分与解释

v0.5正式计分继续不变；当前本机中文审校边界及源码/算法来源区分见 [V05_CHOICES_PRIVATE_REVIEW.md](V05_CHOICES_PRIVATE_REVIEW.md)。本页英语题本描述对应默认公开模式。

此页描述v1 Mini-IP计分。V2继续保留这些30题规则，另启用独立Mini-IPIP20；两者不合成统一分数。v0.4没有更改这些算法；语言与许可处理见 [SCOPE_TRANSLATION_2026-10-02.md](SCOPE_TRANSLATION_2026-10-02.md)，逐题记录见 [ITEM_PROVENANCE_V2.json](ITEM_PROVENANCE_V2.json)。[V2_IMPLEMENTATION.md](V2_IMPLEMENTATION.md) 保留为v0.3历史说明。

使用官方 [Mini-IP 2016开发报告](https://www.onetcenter.org/dl_files/Mini-IP.pdf)，Appendix A印刷19–20页列出全部30题及维度；印刷13页规定电子版计分。原PDF SHA256与逐题原文在 src/instruments/onet-mini-ip.json；来源台账在 ITEM_PROVENANCE.json。

| 核查项 | 实现及证据 |
|---|---|
| 题本 | 英文原文，2016电子版，30题完整保留；不混入60题纸笔版本 |
| 维度 | R/I/A/S/E/C，每维5题；按官方题号映射 |
| 编码 | Strongly dislike=0，Dislike=1，Unsure=2，Like=3，Strongly like=4 |
| 正反向 | 所有题按兴趣编码直接累加；无反向题 |
| 维度原始分 | 每维5题求和，范围0–20；服务器执行 |
| 缺答 | 原工具个体缺答插补规则未确认，记录null。产品选择完整答题才出分，不按75%覆盖或均值外推；不称为官方缺答规则 |
| 展示分 | raw/20×100，仅UI线性转换，不是百分位或原正式原始分 |
| 解释 | 六维相对排序。依据[官方技术手册第3章，印刷33页](https://www.onetcenter.org/dl_files/IP_Manual.pdf)；同分并列是透明产品展示策略，不冒称官方固定同分算法 |
| 阈值/常模 | 本实现不使用高低分类、常模、百分位；未找到可直接沿用的中文解释标准，保持未知 |
| 许可 | [CC BY-ND 4.0及官方工具许可说明](https://www.onetcenter.org/license_tools.html)，原文不改写、不翻译。软件集成不代表工具方背书 |
| 中文 | 无经核实的正式中文版；本机显式审校允许保留原题身份的未验证中文译稿，公开模式不提供30题中文 |
| 验证 | 原始英语工具有官方研究；本实现、中文目标人群及移动界面尚未独立验证，导出validation保留prototype |

`scoring.mjs`一次确定性计算生成rawScores、displayScores、ranking、interpretation、portrait。Service.confirm同时保存同一结果到UserProfile与内部metadata；用户文字纠正不改分。硬约束只能由用户显式填写并确认。

“暂不测评”使用not-administered/version1，六维均为null，不生成兴趣代码。工作价值观仍待核实，现实条件表单不宣称是经验证价值观测评。
