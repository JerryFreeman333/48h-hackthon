> 当前集成说明（2026-10-03）：A 的独立模块说明；集成产品从根目录启动并使用 /profile，当前显示薪资高低，旧目录键和历史快照保留。集成运行要求 Node.js 24；请先看[根 README](../../README.md)与[当前状态](../../docs/CURRENT_STATE.md)。

# A｜七主题求职需求侧写 · v0.7

A了解用户看重什么、希望核验什么及现实条件，不评估能力，不调查企业，不生成最终岗位匹配。代码、文档、样例与测试只在`modules/a-profile/`，开发分支`feat/a-profile`。

## 启动与检验

Node.js 22+，在本目录执行：

```sh
npm ci
npm start
```

打开[本机中文入口](http://127.0.0.1:3100/demo/a)。`npm run start:review`为同一入口的兼容别名，不再开启旧50题或私有译稿。默认端口3100，可用环境变量PORT修改。没有外部API或模型密钥要求。

```sh
npm test
npm run test:browser
```

浏览器测试使用已安装Chrome；后端测试不依赖Chrome。实际结果见[V07_TEST_RESULTS.md](docs/V07_TEST_RESULTS.md)。

## 当前内容

七个主题、21道全中文选择问题：晋升成长、薪酬透明、工时休息、五险一金、团队文化、企业经营稳定、职位与用工稳定。每个主题记录关注程度、具体核验项目和未知处理意愿。之后选择阶段、目标、城市、最低固定月薪、销售KPI、出差、外包、行业及岗位类型，再由本人确认。

问题是本产品新写的需求采集文字，论文提供主题依据，**不是已验证心理量表**。不输出人格、兴趣、能力、风险承受或公司安全分。不重新设计权重、反向计分、阈值或匹配算法。未回答的保持未知，关注重点不自动变成硬约束。

- [完整21题审阅表](docs/JOB_NEEDS_21_QUESTIONS.md)
- [逐题选项、编码与来源JSON](docs/JOB_NEEDS_ITEM_PROVENANCE.json)
- [论文依据、许可及中文验证限制](docs/JOB_NEEDS_EVIDENCE.md)
- [实现与B/C兼容说明](docs/JOB_NEEDS_IMPLEMENTATION.md)
- [当前API](docs/API.md)

## 保存与交接

答案、草稿和确认版本实际保存在本机`.data/state.json`；支持刷新恢复、前后页、版本冲突检查、完整JSON导入、重新确认生成新版本及JSON／Markdown导出。后端严格校验选择和访问归属；没有简历、经历、技能或自由填写入口。当前为本地独立服务器，Cookie不是正式账户系统，不宣称已有生产数据库或多人部署。

完整导出包含`UserProfile`、`SearchIntent`、`JobNeedsSnapshot`、题目来源、同快照报告与checksum。前两项遵守公共1.0.0；七主题附表由A独立保存，**尚未接入B/C判断**。不能把符合旧schema说成七主题联调完成；不提供会静默丢失新答案的降级导出。

演示样例：[AJobNeedsExport.demo.json](fixtures/AJobNeedsExport.demo.json)，明确`mode=demo`；[UserProfile](fixtures/UserProfile.json)、[SearchIntent](fixtures/SearchIntent.json)只是该演示文件的兼容子对象，完整恢复须导入前者。生成样例：`npm run fixtures:needs`。

## 旧内容完整封存

旧48题在`rubbish/legacy-20261002/`；后续兴趣／人格问卷、旧UI、旧测试及样例在`rubbish/interest-personality-v0.6-20261002/`。原30题、20题及两份算法文件字节不变，仅保留历史读取与回归，活动需求流不使用它们。英语页面、原文展开、语言切换、旧测评创建／写入／计分／删除API停用。

启动新流前将旧完整state按字节存档到`rubbish/private/needs-transition-<sha256>.json`并核验哈希；新流另开命名空间，不把旧分数换算成新需求。私有译稿、用户数据、node_modules和测试截图均不上传。历史O*NET译稿的许可及验证缺口没有因本轮新题而消失，也不作为新流的测评依据。

后续需要用户题目理解测试及三方附表、证据映射协调。本轮未修改B/C或公共契约，未接入企业检索、简历解析、语音或模型。
