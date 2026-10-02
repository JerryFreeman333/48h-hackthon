# A｜用户画像与意向选择 · V2

本模块独立保存于 `modules/a-profile/`，开发分支 `feat/a-profile`。负责问卷、可读画像、经历证据确认、价值偏好、职业方向和现实条件，输出版本化画像与搜索意向。

开发指导原文：[Career DNA 嫁接与扩展规格 V2](docs/求职X-Ray_CareerDNA嫁接与扩展开发规格_V2.md)。实际实现、接口和限制见 [V2_IMPLEMENTATION](docs/V2_IMPLEMENTATION.md)，第三方来源与替换关系见 [PORT_MAP](docs/PORT_MAP.md)。

## 启动

Node.js 22+，在本目录运行：

```sh
npm ci
npm run setup:ocr
npm start
```

打开 http://127.0.0.1:3100/demo/a 。`setup:ocr` 为可选模型安装步骤；未安装时扫描件与图片解析明确显示未连接，PDF/DOCX文字提取和手填可用。PORT 可修改端口。所有页面资源、本地解析和OCR在本机运行，不调用模型或运行时CDN。

## 当前流程

1. Quick 完整英文 Mini-IP 30题，Standard 再加完整英文 Mini-IPIP 20题；允许暂不测评。
2. 原始分与可读解释共用服务器确定性计分；解释草稿由本人确认、编辑或拒绝。
3. 价值偏好直接选择与并列排序；上传PDF/DOCX/扫描件/图片，或输入经历原句；提取候选逐条核对。
4. 确认城市、固定月薪及其他必要条件，明确硬、软、未知与本人确认状态。
5. 冻结新画像版本，查看O*NET兴趣形状参考或浏览职业，最多选择3个方向，保存搜索意向。
6. 导出完整v2 JSON、最小SearchIntentV2、中文模板报告；可修改生成新版本，保留旧快照。

正式题文保持英文原文，没有上线AI中文翻译；[50题逐题来源台账](docs/ITEM_PROVENANCE_V2.json)记录来源、计分、反向题、许可与未知。价值偏好是本人声明，不是正式工作价值观测评。没有35/65分类、常模百分位或实际能力推断。

职业参考使用O*NET®31.0官方完整六维OI数据：923个可排序职业，93个缺维职业排除；Pearson相关只比较兴趣形状，不代表匹配概率。中文浏览别名的国内JD对应关系仍待人工核对。A不实施公司调查、真实职位检索或C的最终匹配。

## 后端、交接与存档

真实Node后端保存答案、草稿、画像版本、意向和异步解析状态；Cookie隔离本人项目。数据在Git忽略的 `.data/`，OCR模型在 `.models/`。这是本地单进程后端，生产身份、数据库及B/C v2联调尚未完成。

公共ABC v1契约文件保持原样；A内部v2单独定义。v1导出返回丢失信息警告；无法表达额外已确认硬条件时拒绝导出，避免静默丢条件。现有v1独立入口保留 `/demo/a/v1`。

旧自编48题与历史实现保存在 `rubbish/legacy-20261002/`，只存档、不加载、不重算。旧v0.2 README存放 `rubbish/release-v0.2-20261002/`；本机私人历史数据留在Git忽略的 `rubbish/private/`。不删除旧历史。

## 验证

```sh
npm test
npm run test:browser
npm run fixtures:v2
```

浏览器验证需要本机Chrome；OCR实测需要已安装的两份模型。合成输入输出在 `fixtures/ProfileHandoffV2.demo.json`，明确demo。实际测试记录见 [V2_TEST_RESULTS](docs/V2_TEST_RESULTS.md)。工程测试通过不表示中文心理测量验证或整个ABC联调通过。
