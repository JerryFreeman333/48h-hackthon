# 2026-10-02 开源组件整合记录

本页记录v0.2整合与公共v1兼容的历史背景。当前v0.5选择项映射、本机中文审校及交接限制见 [V05_CHOICES_PRIVATE_REVIEW.md](V05_CHOICES_PRIVATE_REVIEW.md)；v0.4移除经历与能力采集的说明保留在 [SCOPE_TRANSLATION_2026-10-02.md](SCOPE_TRANSLATION_2026-10-02.md)。[V2_IMPLEMENTATION.md](V2_IMPLEMENTATION.md) 与 [PORT_MAP.md](PORT_MAP.md) 保留为v0.3历史说明。

## 实际复用范围

| 项目 | 固定来源 | 实际整合 | 排除 |
|---|---|---|---|
| SurveyJS | npm survey-core/survey-js-ui 3.1.2；Git标签v3.1.2 ref e4d71ee94cdbae15da3aa8f7b96345c1111fa6fa | MIT组件直接依赖；本地提供JS/CSS；JSON题本渲染、导航、必答、进度；自有保存恢复适配器 | Creator、Dashboard、PDF Generator等商业产品 |
| riasec-co | [5afa75f9cf43c12e5568ebd5e7acc3483625c8ad](https://github.com/affromero/riasec-co/tree/5afa75f9cf43c12e5568ebd5e7acc3483625c8ad) | 借鉴题库/状态/评分分离的组织思路，代码自有实现 | 不复制题库、Dirichlet计分、自适应截断、置信度、院校推荐 |
| psyche-public | [28480802ce025a986a6574c013d2c7d07084c8ec](https://github.com/AshitaOrbis/psyche-public/tree/28480802ce025a986a6574c013d2c7d07084c8ec) | 借鉴注册表与第三方工具许可台账，代码自有实现 | 不复制RIASEC题文、其它量表、AI融合与人格推断 |

两处“借鉴”是结构参考，不冒称已移植其算法。许可记录在 THIRD_PARTY_NOTICES.md。没有更改公共ABC契约，也没有实现B/C。

## 存档与兼容

整合前所有A文件复制到rubbish/legacy-20261002，SHA256清单和Git原提交可核验。删除活动旧题库/来源脚本/旧测试入口；旧文档仅留存档。真实状态在本机rubbish/private按内容哈希备份，不上传。

启动迁移先封存原始完整状态，再去掉旧项目的attempt/profile/intent/metadata活动引用；不会用旧答案重新评分。导入旧instrumentId也拒绝。原A经历、分类、本人确认、版本和交接保留。

新增工具ID是1.0.0契约已有string字段的取值，没有改变字段或枚举。B/C集成须明确scores是展示分，按instrumentId/version理解；不能延用旧题库高低界限。A的原始分与证据metadata尚未包含在公共导出字段中，扩展须另行协调。

## 已有研究暂存，不等于最终审查完成

- [Mini-IP官方报告](https://www.onetcenter.org/dl_files/Mini-IP.pdf)与[2021手册](https://www.onetcenter.org/dl_files/IP_Manual.pdf)：原文、维度、电子计分已核对；不称为最新2025版本。个体缺答细则/中文题本未确认。
- [中文VIS原始论文](https://journals.sagepub.com/doi/10.1017/prp.2017.26)：表11包含54题完整中文、九维；研究施测54题+4重复题。样本中国大学生。CC BY-NC-SA，商业复用需另行书面许可；完整产品评分/缺答规则尚待核实。本轮没有启用或复制题目。
- [PGI官方开放存档](https://www.psycharchives.org/en/item/61d2cabd-25f0-47ea-ac0f-728b26a89c17)：英文题本、手册与评分文件标CC BY-SA；已找到中国样本研究，但未取得并核对同一中文完整题本和评分。本轮不启用。
- [Work Values Matcher官方说明](https://cloudfront.careeronestop.org/Toolkit/Careers/work-values-matcher-help.aspx)：20卡片、六工作价值；实现细节与中文许可/验证未全部核实。[旧WIL官方档案](https://www.onetcenter.org/reports/WIL_Archive.html)已退休，档案声明研究用途，不移植为当前正式产品。
- [中文工作价值观WVM研究](https://doi.org/10.1177/10690727251338255)：有中国大学生研究；题本/评分/商业许可未全部获得。[香港WVI研究](https://hub.hku.hk/handle/10722/184351)区分45题初版与42题修订，不能混用；没有移植。

后续中文量表验证、价值观工具筛选、认知访谈与用户测试仍待用户决定。本次组件整合不替代原先要求的完整工具台账审查。
