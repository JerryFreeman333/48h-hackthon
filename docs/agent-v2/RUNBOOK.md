# 安装、运行、恢复与回退

## 环境与依赖

本次实测 Windows、Node 24.20.0、Python 3.12.10。CI 使用 Node 24/Python 3.12；Linux 上的执行结果以实际 CI 为准。依赖锁在 `requirements-v2-lock.txt`，第三方声明见 `THIRD_PARTY_NOTICES.md`。

```powershell
git switch agent-v2
git lfs pull
npm ci
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r modules/research-agent/requirements-v2-lock.txt
```

Linux 对应解释器为 `.venv/bin/python`。v2 本身不需要旧版 jieba/cnsenti；要运行旧 worker 测试或对比脚本，再按原 research-agent README 安装旧版依赖。

核对 `.data/company-database/manifest.json` 的 SHA256 与实际 SQLite；不要用 LFS 文本指针或合成 fixture 替换生产库。缺库时已有数据库入口会明确报错；v2 合成测试可独立运行。

## 本地启用

在现有 `.env.local` 中添加或修改以下两行，保留其他已有配置，不提交该文件：

```dotenv
RESEARCH_AGENT_ENABLED=true
RESEARCH_AGENT_V2_ENABLED=true
```

v2 不需要 MiniMax 密钥。可设置 `RESEARCH_AGENT_PYTHON` 为独立解释器绝对路径；默认自动选项目 `.venv`。配置上限见 `.env.example`：每公司 150 秒、22 次 HTTP 请求、12 份材料、18 MB 单响应、单请求 10 秒、最多两轮补查、24 小时成功材料缓存。工具外层最多 220 秒，多个公司整体采集预算约 420 秒；超时恢复另留最多 12 秒。串行与每域 0.8 秒间隔固定保守配置。

```powershell
npm run dev -- --hostname 127.0.0.1 --port 3010
```

打开 `http://127.0.0.1:3010`，沿原有侧写 → 候选 → 分析流程。新材料在 C 报告“公开材料解读与核实问题”出现。来源能力和执行详情可展开。报告里的“部分完成”和未知是实际来源边界，不能当没有风险。

## 验证

```powershell
npm run typecheck
npm test
npm run test:b
npm run test:c
npm run test:integration
npm run test:agent
.venv/Scripts/python.exe -X utf8 -m unittest discover -s modules/research-agent -p 'test_v2*.py' -v
.venv/Scripts/python.exe -X utf8 modules/research-agent/test_worker.py
npm run build
```

构建前停止同一目录的开发服务，避免两者同时写 `.next`。新增 CI 运行离线 v2 测试，不在 PR 检查中采集真实网站或使用模型密钥。

两个可复现案例：

```powershell
# 真实公开年报，结果只写独立验证目录；不会插入原企业库
.venv/Scripts/python.exe -X utf8 modules/research-agent/validate_v2_public.py
# 增加实际四渠道公开采集；--refresh 可忽略成功缓存
.venv/Scripts/python.exe -X utf8 modules/research-agent/validate_v2_public.py --all-channels
# 合成招聘、采购与匿名经历；生成的 fixture 均明确标记
.venv/Scripts/python.exe -X utf8 modules/research-agent/test_v2_pipeline.py --export-fixture
# 旧新采集器在相同合成语料上的对比，需要旧版依赖
.venv/Scripts/python.exe -X utf8 modules/research-agent/compare_v2_fixture.py
```

完整输出、原始文件和运行日志均在忽略的 `.data/agent-v2-validation/`，不要添加进 Git。提交的少量公开例子见 `docs/agent-v2/examples/`；完整合成案例在 `modules/research-agent/fixtures/`。

## 存储与恢复

首次启动自动幂等创建专用 schema v1；不修改原数据库，也不复制整个原库。持久化目录：`.data/research-agent/v2/`。部署需同时持久化现有报告归档目录，否则重启后报告会丢失。

单来源被拦截、超时或失败会记录状态并继续；已提交文档始终保留。Python 被结束时会尝试只读检查点进入当前报告。整个网站进程被结束后重新启动并再次分析；成功材料可复用，失败来源继续尝试，原采集时间不改为当前时间。不要删除工作库来解决普通来源失败。

备份 SQLite 时停止采集进程或使用 SQLite backup API，不只复制仍在写入的主文件而漏掉 WAL。工作库和原始文件按公司公开材料存储，但报告归档包含用户侧写，按现有隐私边界保管。

## 关闭与回退

- `RESEARCH_AGENT_V2_ENABLED=false` 后重启，回到原 MiniMax/v1 路线；是否启用和密钥是否齐全仍由原配置决定。
- `RESEARCH_AGENT_ENABLED=false` 后重启，停止所有新增调查，使用现有数据库材料。
- 旧报告读取不重新调查；现有公共契约未变。回退本分支提交前，先保留其专用工作库和报告文件；不需要对原数据库做降级迁移。
- 不把 API 密钥、完整 PDF、日志、浏览器会话状态、venv、node_modules 或数据库副本提交。无生产发布步骤，推送分支不会替代部署验证。

分支交付核对：`git rev-parse HEAD` 与 `git ls-remote origin refs/heads/agent-v2` 应返回相同提交。审查包内的“最终版本”始终指交付分支 HEAD；聊天交付记录和本地 receipt 保存实际核对时的完整 SHA。
