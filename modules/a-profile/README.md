# A｜人格倾向、职业兴趣与求职需求 · v0.4

A整理自报人格倾向、职业兴趣、求职需求和现实条件，不评估能力或岗位胜任力。代码独立保存在 `modules/a-profile/`，开发分支 `feat/a-profile`。

## 启动

Node.js 22+，在本目录运行：

```sh
npm ci
npm start
```

打开 http://127.0.0.1:3100/demo/a 。保留的v1入口为 `/demo/a/v1`，也已移除经历填写。答案与画像保存到Git忽略的 `.data/state.json`；本地Cookie隔离，不是生产账户鉴权。

## 本轮变更

- 测评 → 结果与人格倾向 → 价值偏好 → 现实条件 → 画像确认 → 原有职业方向与导出。移除经历步骤、简历上传、OCR/提取任务和经历确认。
- Quick保留英文Mini-IP30；Standard加Mini-IPIP20中文译稿，可切回英文。原题、题号、维度、选项编码、反向键及两份计分代码逐字节不变。
- Mini-IPIP中文题干、选项、说明及英文原文保存在 `src/instruments/mini-ipip.zh-CN.draft.json`；这是AI忠实翻译初稿，未独立双语审校、回译或心理测量验证。
- O*NET30中文审校稿仅在本机 `.translation-drafts/`，不提交、不提供HTTP、不启用。开发者许可要求的验证研究尚未完成，不能靠免责声明代替。兴趣测评暂保留英文。
- 可读摘要和报告不再出现经历或技能章节；服务器拒绝新能力材料，原始答案与测评依据仍保留。

[实施与兼容说明](docs/SCOPE_TRANSLATION_2026-10-02.md) · [逐题来源与翻译记录](docs/ITEM_PROVENANCE_V2.json) · [本轮测试](docs/V04_TEST_RESULTS.md)。原V2指导MD原文未改；本轮用户范围调整优先。历史v0.3文档不代表当前活动功能。

## 历史与B/C兼容

旧48题与停用的经历代码在 `rubbish/` 只存档。升级先校验私有state逐字节备份；旧不可变画像、原答案与旧上传文件保留。对外提供删除经历的投影，原始历史快照不被覆盖。

公共v1契约保持原样：`background`为 `{education:null,major:null,skills:[],experiences:[]}`。内部v2保留 `capabilities:[]` 兼容占位，不采集这些内容。空值表示A范围不评估能力，不能解释为能力低。非空能力材料导入或草稿被拒绝。B/C未改动、未联调。

## 验证

```sh
npm test
npm run test:browser
npm run fixtures:v2
```

浏览器测试需要本机Chrome。私有O*NET译稿检查在无该本地文件的Git克隆中会明确跳过；本机实测记录见测试文档。工程分数一致不等于翻译效度或心理测量验证。
