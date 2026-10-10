# V3 开源方案核对与采用记录

检查：2026-10-09。只读官方 README/许可证，用 git ls-remote 固定 HEAD。维护列是官方 commits Atom 首条时间（UTC），不保证对应固定 HEAD；REST API 不可用后改用公开 Atom。没有用英文基准宣称中文准确率。

实际短板：静态正文重复/导航干扰、PDF 访问超时、主体/岗位范围与时期缺失、原始材料没有账号与精确时间。先修规则/定位与恢复，避免加入整套框架。

| 项目与固定 HEAD | 维护记录 UTC | 决定 / 许可证出处 | 功能、成本、中文与接入理由 | 具体借鉴或试验位置 |
|---|---|---|---|---|
| [coordination-network-toolkit](https://github.com/QUT-Digital-Observatory/coordination-network-toolkit/tree/daa0e11f3543756bc62950c630deae01b4702590) `daa0e11f3543` | [2022-11-08T23:47:39Z](https://github.com/QUT-Digital-Observatory/coordination-network-toolkit/commits/main.atom) | 仅参考；[MIT](https://github.com/QUT-Digital-Observatory/coordination-network-toolkit/blob/daa0e11f3543756bc62950c630deae01b4702590/LICENSE) | 账号—共享行为网络与独立支持计数；本轮只有文本，缺账号/时间，不运行算法。Python 图网络成本中等，中文效果未测。 | v3-research.ts 来源同文归组概念 |
| [CooRTweet](https://github.com/nicolarighetti/CooRTweet/tree/de337e099f204e98608df4e4dcdce4b0d41c2cd5) `de337e099f20` | [2025-07-10T09:47:57Z](https://github.com/nicolarighetti/CooRTweet/commits/master.atom) | 仅参考；[MIT + file LICENSE（DESCRIPTION 2.1.3）](https://github.com/nicolarighetti/CooRTweet/blob/de337e099f204e98608df4e4dcdce4b0d41c2cd5/DESCRIPTION) | 通用协调事件网络；引入 R 与标准事件表成本高，当前缺必要字段，中文适配未验证。 | README、DESCRIPTION；未复制代码 |
| [coorsim](https://github.com/thieled/coorsim/tree/231617d405890341eed652037088e1136e696f47) `231617d40589` | [2026-07-02T12:24:27Z](https://github.com/thieled/coorsim/commits/main.atom) | 仅参考；[GPL-3.0](https://github.com/thieled/coorsim/blob/231617d405890341eed652037088e1136e696f47/LICENSE.md) | 语义相似和时间窗口线索；模型/嵌入资源与分发约束需评估，中文未测，重复不能判虚假。 | README；未接入 |
| [coordination-detection](https://github.com/osome-iu/coordination-detection/tree/a9ea3188d131ec7701886b8da213cbe5c4a88f99) `a9ea3188d131` | [2024-12-20T21:53:27Z](https://github.com/osome-iu/coordination-detection/commits/main.atom) | 仅参考；[根 LICENSE 未找到，未确定](https://github.com/osome-iu/coordination-detection/blob/a9ea3188d131ec7701886b8da213cbe5c4a88f99/README.md) | 研究型协调网络方法；旧研究代码、账号数据要求，当前收益低，中文未测。 | README；不复制实现 |
| [AVeriTeC](https://github.com/MichSchli/AVeriTeC/tree/7c62d1ec8df3fb560d6efe2b85fa191135636f81) `7c62d1ec8df3` | [2024-11-27T15:15:59Z](https://github.com/MichSchli/AVeriTeC/commits/main.atom) | 仅参考；[CC-BY-NC-4.0（README）](https://github.com/MichSchli/AVeriTeC/blob/7c62d1ec8df3fb560d6efe2b85fa191135636f81/README.md) | 以问题—回答—来源拆解可核验陈述；英语基准不代表中文平台准确率，不导入非商业数据。 | v3-contract.ts、v3-assessment.ts 独立实现方法 |
| [HerO](https://github.com/ssu-humane/HerO/tree/9840dfaa1cc48de5d2de11c28ab1ba99f06cb66a) `9840dfaa1cc4` | [2025-03-18T13:04:56Z](https://github.com/ssu-humane/HerO/commits/main.atom) | 仅参考；[根 LICENSE 未找到，未确定](https://github.com/ssu-humane/HerO/blob/9840dfaa1cc48de5d2de11c28ab1ba99f06cb66a/README.md) | 检索、问题拆分和证据核验；模型推理成本和中文语料验证缺口，首版不用全流水线。 | README；不复制实现 |
| [crawl4ai](https://github.com/unclecode/crawl4ai/tree/8afd0a68064ff7049303c9f9d037ab6228aac43c) `8afd0a68064f` | [2026-10-05T05:44:25Z](https://github.com/unclecode/crawl4ai/commits/main.atom) | 不采用（本轮）；[Apache-2.0](https://github.com/unclecode/crawl4ai/blob/8afd0a68064ff7049303c9f9d037ab6228aac43c/LICENSE) | 动态网页可选后备；浏览器/反爬依赖较重，当前主要失败是网络访问，无法据此证明接入会解决。中文未测。 | README、LICENSE；无运行依赖 |
| [trafilatura](https://github.com/adbar/trafilatura/tree/e2f85c965662c7df26b73290ef175b2c2a5fdca6) `e2f85c965662` | [2026-10-06T19:31:14Z](https://github.com/adbar/trafilatura/commits/master.atom) | 试验；[Apache-2.0（2.3.1；早于1.8为GPL）](https://github.com/adbar/trafilatura/blob/e2f85c965662c7df26b73290ef175b2c2a5fdca6/LICENSE) | 实际保存的大华中文网页：3213→1529字，业务短语3→2，0.047秒；保留法人/业务但没有原段落映射，因此不替换定位解析器。 | trafilatura 2.3.1 extract(deduplicate=True)，仅本地 .venv 试验 |
| [docling](https://github.com/docling-project/docling/tree/d0f55469c56d38d93ed47049b8c9d17f6785e94b) `d0f55469c56d` | [2026-10-09T14:12:18Z](https://github.com/docling-project/docling/commits/main.atom) | 不采用（本轮）；[MIT（模型权重另核）](https://github.com/docling-project/docling/blob/d0f55469c56d38d93ed47049b8c9d17f6785e94b/LICENSE) | 多格式/版面识别依赖及模型成本高，首版文本 PDF 已可解析；扫描件后续再评估中文与页定位。 | README、LICENSE；无下载模型 |
| [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR/tree/dab3fe35379033fdcb2d0e9572fac0b36c9a9ebf) `dab3fe353790` | [2026-09-16T03:30:53Z](https://github.com/PaddlePaddle/PaddleOCR/commits/main.atom) | 不采用（本轮）；[Apache-2.0](https://github.com/PaddlePaddle/PaddleOCR/blob/dab3fe35379033fdcb2d0e9572fac0b36c9a9ebf/LICENSE) | 中文 OCR 是合理候选，但本轮扫描件明确 unsupported；未测错误率，不以宣传替代引用核验。 | README、LICENSE；未采集 AV |
| [datatrove](https://github.com/huggingface/datatrove/tree/1977fbb0f3c163d43cace334b073dda17fa3ef26) `1977fbb0f3c1` | [2026-09-30T08:12:03Z](https://github.com/huggingface/datatrove/commits/main.atom) | 仅参考；[Apache-2.0](https://github.com/huggingface/datatrove/blob/1977fbb0f3c163d43cace334b073dda17fa3ef26/LICENSE) | 批处理与近重复分组；小量任务不需要整个分布式框架，中文阈值需另验。 | v3-research.ts 精确同文归组；未复制源码 |
| [dedupe](https://github.com/dedupeio/dedupe/tree/3f61e79102910bd355e920a2df7e44c14c9cb247) `3f61e7910291` | [2025-07-29T00:18:20Z](https://github.com/dedupeio/dedupe/commits/main.atom) | 仅参考；[MIT](https://github.com/dedupeio/dedupe/blob/3f61e79102910bd355e920a2df7e44c14c9cb247/LICENSE) | 实体消歧需要标注训练和解释，不足以确认同名法人；当前采用显式法人/岗位范围门槛。中文名称未测。 | README、LICENSE；无训练调用 |
| [langfuse](https://github.com/langfuse/langfuse/tree/44eaf9df3f1f75d17fe0a162932083a50858db2a) `44eaf9df3f1f` | [2026-10-09T14:27:11Z](https://github.com/langfuse/langfuse/commits/main.atom) | 不采用（本轮）；[MIT 核心；ee 另许可](https://github.com/langfuse/langfuse/blob/44eaf9df3f1f75d17fe0a162932083a50858db2a/LICENSE) | 自托管追踪需要数据库和额外服务；本轮本地预算/检查点已够用，避免上传材料。中文不涉及模型效果。 | v3 snapshot budget/sourceAttempts；未调用外部服务 |
| [botometer-python](https://github.com/osome-iu/botometer-python/tree/e25972b01b99cd68b1fba4a8063f54a4657bd044) `e25972b01b99` | [2024-06-26T13:33:08Z](https://github.com/osome-iu/botometer-python/commits/master.atom) | 不采用；[MIT 客户端](https://github.com/osome-iu/botometer-python/blob/e25972b01b99cd68b1fba4a8063f54a4657bd044/LICENSE.txt) | 面向既定社交账号/API的历史项目，服务凭据/计费另需核；不能将机器人概率外推中文水军或真假。 | README、LICENSE；无账号输入 |
| [MediaCrawler](https://github.com/NanmiCoder/MediaCrawler/tree/e9dd17a16338c3915f2335bc609383d316e055f2) `e9dd17a16338` | [2026-10-09T06:08:17Z](https://github.com/NanmiCoder/MediaCrawler/commits/main.atom) | 不采用；[非商业学习许可证 1.1](https://github.com/NanmiCoder/MediaCrawler/blob/e9dd17a16338c3915f2335bc609383d316e055f2/LICENSE) | 虽有中文平台适配，但登录/风控与维护成本高，许可证限制商业使用；首版不接入也不采集视频音频。 | LICENSE、README；无运行调用 |
| [playwright](https://github.com/microsoft/playwright/tree/b28411b105a25fcd97014111764a1cf76f0c6bb0) `b28411b105a2` | [2026-10-09T00:49:50Z](https://github.com/microsoft/playwright/commits/main.atom) | 采用（仅验收）；[Apache-2.0](https://github.com/microsoft/playwright/blob/b28411b105a25fcd97014111764a1cf76f0c6bb0/LICENSE) | 真实页面入口和手机布局验证，运行已有 Chrome，独立临时浏览器，无个人资料；不成为采集引擎。 | Playwright 1.64.0 本地测试包；scripts/validate-v3-browser.mjs、validate-a-v3-browser.mjs |

试验原件：大华官网公司简介，SHA256 `88a2dace34ff490e92fde8326df3d863051dfae14a71dad91ade22086fa104bb`。结果保留 `.data/v3-acceptance/trafilatura-trial.json`。只证明该网页此次正文试验，不是准确率评估。Trafilatura 未写入 requirements，验收环境安装不要求用户运行时安装。

来源重复只产生“疑似共同来源、独立性未知”信号，不认定水军、机器人或内容虚假。正式协同检测禁用，直到获得合规账号/时间字段与中文验证集。

本轮未复制第三方框架源码。复用的是仓库自身 V2 公网 DNS 固定/重定向保护及原件/PDF解析；方法参考独立落实在 V3 文件。Playwright 可选验收安装版本见实施说明，运行 Agent 不需要浏览器。

## 2026-10-10 架构补齐新增采用

上表是首版调查时的决定，以下是当前实际运行依赖。识别到的具体短板是主动提供的办公文件和中文图片只有空接口；因此采用小范围本机解析器，保留原件与定位，不引入整套平台采集框架。

| 项目/版本 | 决定与技术位置 | 维护、许可与成本/适配边界 |
|---|---|---|
| [python-docx 1.2.0](https://python-docx.readthedocs.io/en/latest/) | 采用，v3_documents.py DOCX段落/表格单元格 | 官方文档当前列1.2.0；MIT。纯本机，不需服务费用，不重建Word排版页码。 |
| [openpyxl 3.1.5](https://openpyxl.readthedocs.io/en/stable/) | 采用，XLSX只读工作表/单元格、保留公式文本 | 安装锁固定3.1.5；官方文档版本页仍列3.1.3，不能把文档版本当安装版本。MIT/Expat；本机CPU，不执行公式/外链。项目先验ZIP/XML保护弥补库默认XML保护的限制。 |
| [RapidOCR 1.4.4固定源码](https://github.com/RapidAI/RapidOCR/tree/86ae3f5079df3422c1829cd84baf19bc8a7a9453) | 采用ONNX中文CPU识别，PNG/JPEG/扫描PDF；bbox、物理页、置信度与复核标记 | Apache-2.0，wheel包含本地模型，运行时不下载；不接付费OCR、GPU或音视频。1.4.4是受控固定版，不宣称最新版本。 |
| [PaddleOCR模型出处](https://github.com/PaddlePaddle/PaddleOCR/blob/release/2.7/LICENSE) | 间接采用PP-OCRv4中文模型经RapidOCR转换的ONNX文件；未采用PaddleOCR整套Python流水线 | Apache-2.0；3个实际模型哈希保留。合成中文样本识别通过不能推导中文平台准确率。 |
| [ONNX Runtime](https://github.com/microsoft/onnxruntime) 1.31.0 | RapidOCR本机CPU推理依赖 | MIT及其第三方声明；与安装包版本一致，额外约16MB OCR模型，初始化和推理服从25秒默认子进程预算。 |

直接/间接17项新依赖、47份安装包许可文件以及模型哈希见 [许可清单](../../modules/research-agent/v3/licenses/README.md) 和 dependency-manifest.json；全部Python版本冻结于 requirements-v3-lock.txt。第三方声明包括BSD、tqdm的MPL-2.0 AND MIT及OpenCV第三方组件，未将其笼统写成全MIT。

Agent任务运行器、工具权限、持久调用凭据、问题反馈、中文三层解释和图节点是本项目实现。没有复制LangGraph、AutoGen等多Agent框架源码，也没有声称有11个独立模型实例；可选语义模型共用一次结构化批次，真实无凭据时不运行。爬虫项目决定沿前序延期要求保留，未知来源/传播信号仍不认证真假。
