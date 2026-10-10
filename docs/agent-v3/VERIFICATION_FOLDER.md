# 独立本机验证文件夹

`scripts/export-xmind-verification.ps1` 把当前应用源码导出到仓库旁边的 `xray-xmind-verification`。复制 Git 跟踪的当前文件及本轮新增源码，包含真实 A→B→C 路由、XMind 执行代码和运行所需 `tree.json`；这不是单独展示页面或演示假数据。源工作区有未提交源码时也会进入快照，`verification-export.json` 记录实际逐文件哈希和源 HEAD。

2026-10-10 已导出并验收最终运行源码：工作区兄弟目录 `xray-xmind-verification-20261010-102102-0ae94d`，本机地址 `http://127.0.0.1:3322`。初次导出包含 599 项文件，公开文档与 QA 交付同步后为 601 项；包含冻结依赖清单、许可证、完整运行树和公开只读企业库。此前的 `xray-xmind-verification-20261010-095625-a9d097` 等目录保留；其 3321 服务已核对归属后停止，最终验证使用新的独立数据目录。

从仓库根目录导出：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\export-xmind-verification.ps1 -DefaultPort 3322
```

目标目录必须是当前工作区内新的兄弟目录。若同名目录已存在，会增加时间和随机后缀，不删除、不覆盖旧验证结果。导出前检查公开 SQLite 是展开的原件且 SHA256 与 manifest 一致，复制后重新校验并仅对副本设置只读。没有写入原企业库。

自动生成 `START_HERE.md`、`launch.ps1`、`verification-export.json`、`verification-local-runtime.json`。导出脚本的缺省端口为 **3321**，本次终版显式使用 **3322**；入口 `/profile` 为 A→B→C，`/xmind` 为公司调查。端口冲突会退出，不停止其他服务。

```powershell
cd '..\xray-xmind-verification-20261010-102102-0ae94d'
powershell -ExecutionPolicy Bypass -File .\launch.ps1 -ReuseLocalDependencies
```

快速模式适用于当前机器：只复用已有 Node 依赖和 Python 解释器，所有用户会话、任务、材料、报告与缓存路径仍由独立项目目录决定。Node 依赖使用 Junction，所以这个模式依赖原依赖目录存在，不称为完全可移植。启动器检查原 dependency lock 没有改变；不会在共享目录上执行 `npm ci` 或递归删除。

不带 `-ReuseLocalDependencies` 会在新导出副本中 `npm ci`，使用 Python 3.12 创建独立 `.venv` 并安装 `requirements-v3-lock.txt`。若本机没有 Node.js ≥24，下载 nodejs.org 的 Node.js 24 Windows ZIP 并核对官方 SHA256，安装位置在副本 `.runtime`，不修改全局安装。Python 3.12 需已安装；缺少时给出官方安装入口。首次安装需要网络；已安装的软件依赖与本地 OCR 可以离线运行，公开网页发现/获取仍需要网络。Windows 冻结依赖在 Python 3.12 验证，不能声称其他平台已验收。

`-PrepareOnly` 仅准备依赖，`-Production` 构建后启动，`-Port` 更改端口。V3 在本实例开启，V2 和模型关闭；启动进程清除继承的模型/API凭据。即使同机原项目配置过密钥，也不会从它的 `.env` 读取。

排除所有 `.env*`、`.git`、`node_modules`、`.venv`、`.next`、Python 缓存和 `.data` 用户状态。只明确复制公开 `xray-v3-20261003.sqlite` 与 manifest，不复制个人侧写、报告、原件、Cookie、上传记录或凭据。独立目录第一次没有历史报告；这是数据隔离的预期行为。源中已版本化的合成测试 fixture 保留，不能用它们冒充真实公司材料成功。

建议实际验收：创建并确认 A 需求，选择真实本地候选，调查后打开 C、原文和关键问题；另从 `/xmind` 查询/导入材料；检查独立 `.data` 产生新记录且原项目用户状态没有被读取。正式测试入口仍在 package.json，实际依赖/模型/平台限制见 `XMIND_IMPLEMENTATION.md` 与本地文档许可证记录。

终版已通过实际 HTTP 入口完成以下检查：`/profile` 与 `/xmind` 可用；新建并确认 A 需求，选择公开数据库中的大华嵌入式岗位（候选 16），通过上传入口提交明确标记的合成受控文本，再完成 B 调查、C 报告、原文回读、历史归档重开和重复请求去重；另验证公司探索的 `supplied_only` 闭环。没有使用内部状态注入。这轮网络请求与模型调用均为 0，报告保留未知并以 `completed_with_unknowns` 停止。公司调查生成 4 个问题；岗位调查生成 6 个问题、8 条陈述，C 表格显示 11 项 Agent 职责及实际运行状态。

证据保存在终版独立目录 `.data/verification-acceptance/summary.json`、`company-report.html`、`report.html`、页面截图与 `visual-inspection.json`，未拷回主工作区。公开本地身份信息与合成上传混合时 `materialKind=mixed_sources`，不能称为真实来源通过。`summary.json` 记录必需运行文件、报告 ID 与无 Cookie 记录策略；新实例的正常会话记录只在自己的数据目录。岗位报告 `report-0835d24a-fb27-47dc-8e33-1bead6d7b0b1`，公司报告 `company-report-f8f2806d57e177a1b5289e22ef378bc8d482d13edd1f8a70ca4a8a97cb661585`。

复制前后及 HTTP 验证后的企业库 SHA256 均为 `81fb91c41495c7d0f53dc549d79e16eb63c995f003ca0fc1d8371da2e118a0f4`，副本为只读。已核对锁文件、Python 冻结依赖、文档解析器、许可证、XMind 运行树和页面全部在导出清单内，没有原项目 `.env.local`、`.git` 或私有验收材料。快速复用依赖准备和启动已实际通过；全新依赖安装、缺失 Node 自动安装和其他机器迁移尚未在独立目录完成。

终版已用独立 Chrome 上下文进行页面操作和截图，实际检查 `/profile` 初始页、确认后的 A→B 导航、`/xmind` 候选查询及历史、C 的 11 职责表格、390 像素手机布局与 `/evidence/:id` 新材料入口。截图经过 `view_image` 实际查看，表格和表单可读，没有文档横向溢出，`pageerror=[]`。这些检查使用本目录新会话与明确标记的合成材料，没有复制原项目真实原件或用户会话；主工作区另有真实官网正文文件选择框更新报告的验收，两项证据分开记录。

实施中发现并修复 Windows PowerShell 5.1 对中文脚本编码、参数默认路径、Synology 普通云文件属性和原生命令引号传递的兼容问题。脚本及生成的启动器使用 UTF-8 BOM；实际符号链接与 Junction 单独识别，不误拒普通云文件。保留早期失败目录和失败原因，不递归删除。早期 HTTP 验证断言曾误把混合来源预期成纯合成来源，已按实际来源性质纠正；它不代表调查业务故障。

终版验收脚本首次把标准 fetch 的布尔 `ok` 写成函数调用，在 A 创建前失败；修复后全链通过，失败 receipt 保存在终版目录。手机公司页面截图增加了等待初始化完成后再截图，以免把短暂加载状态作为最终页面。当前终版服务执行 session 为 92858，Next 监听 PID 为 19588；这些是本次运行标识，重启会变化。

代码提交 `78ba90f17779e91e6cdccc5334f0d9af3ae146ea` 已推送到 `implement/xmind-structure-20261010`，远端核对记录见 `XMIND_ARCHITECTURE_ACCEPTANCE.md` 与 `PROGRESS.md`。独立目录的运行代码与该代码提交逐文件核对一致；随后仅定向同步公开验收文档、进度文档和更新的 QA 脚本。交付清单 601 项与目录实际文件哈希、当前公开源码核对均为 0 差异。manifest 的 `verifiedSourceCommit` 记录该代码 SHA，保留初次创建的 `sourceCommit=3f45b4790c71d1085d7299841085e7ba40be40e5` 与 `sourceIncludesUncommittedFiles=true` 历史。没有复制私有 `.data`、重新构建或重启 3322 服务。
