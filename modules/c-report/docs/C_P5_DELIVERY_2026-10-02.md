# C｜P5（取消 / 重启 / 外部失败恢复）交付签收

> **状态**：✅ 已完成。  
> **交付时间**：2026-10-02。  
> **基线**：v3 迁移交接 §8.3 4 行骨架 + `C_P5_DESIGN_2026-10-02.md` 详细设计。  
> **会话起点**：v3 交接 §11 启动指令；PR #4 合并后（P1–P4 在 main 上，HEAD `0e0a101f`）从 `0e0a101f` 基线推进。  
> **不依赖**：根目录挂载（§8.2）、公共 ModelClient（§9 待办）、跨模块 v2 协调（v3 §2.1）。

## 1. 一句话交付

把 C 的短路径（创建→完成）扩成四态长路径（创建→阶段执行→落盘/重试→完成/取消/失败），全程在 `modules/c-report/` 内，fake runtime + fake 模型，不发依赖不冒生产形态。

## 2. 验收清单（设计草案 §10）逐项勾

- [x] `python3 scripts/verify_c_docs.py` 仍 15/15 + 8/8，0 错误；Markdown files 14→15（C_P5_DESIGN 自动纳入），local links 45
- [x] `npm run typecheck` 0 错误
- [x] `npm test` **213/213 全过**（40 suites，0 fail/0 skip）
- [x] 五个演示全过：`demo` 14/14 + `demo:p2` 15/15 + `demo:p3` 24/24 + `demo:p4` 12/12 + **`demo:p5` 23/23**
- [x] 重启路径产出与一次跑完逐字节一致（同 generatedAt + 同 bundle + checkpoint 阶段复跑；最终 report SHA-256 可计算）
- [x] 重试预算耗尽后 promptVersion 保持模板标记（C-17 不冒充 AI）
- [x] 取消的 run 不在 reportVersions / reportSnapshots（pipeline 抛出 PipelineCancelledError，handler 不调版本落盘）
- [x] 公共契约 1.0.0 输入未变（169 个旧测试 + 44 个新测试 + 重启路径全跑过即覆盖）
- [x] C-12：旧版本报告不被 checkpoint 重写覆盖（追加 stages；不修改既有阶段）
- [x] C-08：unknown 在 cancelled/恢复路径里仍不画绿（pipeline 抛错前未进入 report 装配阶段；恢复路径用 stored perJob 重新装配，同字节）

## 3. 实际实现文件（设计 §6 文件计划）

| 文件 | 行数 | 用途 |
|---|---|---|
| `application/retry-policy.ts` | 155 | DefaultRetryPolicy / InMemoryRetryBudget / NonRetryableUpstreamError / RetryBudgetError / **RetryingModelPort**（端口级重试）|
| `application/pipeline-cancellable.ts` | 451 | runMatchPipelineCancellable + PipelineCancelledError + PipelineContext + refineReportWithRetry |
| `application/ports.ts` | +60 | CRunStore 加 isCancelled/addCancelListener/requestCancel；新增 CheckpointStage / RunCheckpoint / CheckpointStore / RetryDecision / RetryPolicy / RetryBudget / AcceptedDimensionOverrides |
| `adapters/memory/in-memory.ts` | +60 | InMemoryRunStore 增 cancel 三件套：cancelFlags set + cancelListeners Map + runKey helper |
| `adapters/memory/in-memory-checkpoint.ts` | 153 | FileSystemCheckpointStore（tmpdir + 原子写）+ clearCheckpointDir 辅助 |
| `application/api/handlers.ts` | +90 | CApiContext 加 checkpoint/retryPolicy/retryBudget 字段 + handleCancelRun + executeOrReuse 加 cancelled 分支 |
| `application/api/errors.ts` | +3 | ApiErrorCode 加 RUN_NOT_CANCELLABLE → 409 |
| `tests/retry-policy.test.ts` | 新 14 项 | DefaultRetryPolicy 退避/可重试判定/预算门 |
| `tests/checkpoint.test.ts` | 新 13 项 | 原子追加/重复覆盖/列表/跨项目隔离 |
| `tests/cancel-pipeline.test.ts` | 新 10 项 | 阶段取消/重启续跑/model 重试/in-memory cancel 三件套 |
| `tests/api-cancel.test.ts` | 新 7 项 | 401/404/202/409/503/跨用户/completed |
| `scripts/run-p5-demo.ts` | 新 | npm run demo:p5；23 项演示 |
| `package.json` | scripts 加 demo:p5；test 列表加 4 个新测试文件 |
| `docs/C_P5_DESIGN_2026-10-02.md` | 346 | 设计草案（与本文件配套）|
| `docs/C_P5_DELIVERY_2026-10-02.md` | 本文件 | 交付签收 |

## 4. 关键设计决策与一致性

### 4.1 retry 注入层级

P5 retry 不能在 `refineReportWithModel` 之上加，因为 refine.ts 内部有 `try/catch` 把 `port.complete()` 的 throw 转化为 `transport_error` outcome 并返回 `{ ok: false }`——refine.ts 自己的"不盲重发"边界会拦截所有重试信号。

**方案**：在 port 层包装 `RetryingModelPort`，让每次 `port.complete()` 在 base port 调用前 reserve 预算 + 退避。这样：
- refine.ts 看到的 `complete()` 永远不会抛可重试错误（要么真成功、要么耗尽抛 NonRetryable）
- 一次 refine 内多次失败依然按 refine.ts §13 降级为模板
- 一次 timeout 一次成功 → refine.ts 拿到正常 completion → 正常精炼路径 → promptVersion = MODEL_PROMPT_VERSION

这是 §5.4 的具体落地。

### 4.2 cooperative cancel

`runMatchPipelineCancellable` 在每个 stage 前后调 `checkCancel`：
- `validated_inputs` / `hard_prefs` / `per_job_eval`（整体前）/ `per_job:<jobId>`（每 job 前）/ `report` / `hash` / `model_or_done`
- demo bundle 1 个 job 时共 7 次检查；cancelCheck 可在任意一次触发
- listener 仅在 `runStore.isCancelled()` 后被触发，触发后 unsubscribe（避免泄漏）

### 4.3 不可变 checkpoint

- `appendStage` 用 `tmp + rename` 原子写
- `finalize` 写 `finalized=true`；`listInterrupted` 过滤
- `RunCheckpoint.finalized?` / `finalStatus?` 为可选字段（C 私有；不进公共 schema）

### 4.4 重试预算与模型预算并列

`RetryBudget`（重试调用次数）与 P4 `ModelBudget`（模型调用次数）独立计数：
- 每次 port.complete 调 retry 1 次
- 单次 retry 调用可能调用 base model 多次（受 ModelBudget 控制）
- 两者任何一方耗尽都阻止下一次

## 5. 拒绝 / 推迟的事项（与设计 §8 非目标一致）

- 暂停 / 恢复：不实现
- 多进程并发协调：仅 fake；DaxerThread / DB 一致性不接
- checkpoint GC：仅 finalize，不删文件（保留供人工复查）
- 跨模块取消传播：仅 C 管 C
- 公共 ModelClient adapter：仍属 §9 待办
- 根目录挂载（§8.2）：独立授权，未动根工程

## 6. 风险与已观察问题

| 风险 | 实际表现 | 缓解 |
|---|---|---|
| RetryingModelPort 与 refine.ts 端口抽象兼容性 | 一开始 retry 在 refine.ts 之上层加，被 refine.ts 内部 catch 吞掉。修复：下沉到 port.complete 层 |
| checkpoint 写入原子性（kill -9 模拟） | 用 `tmp + rename`；测试覆盖 `appendStage` 后只留 `.json` 不留 `.tmp` |
| 跨用户读 run 泄露 | `handleCancelRun` 走 `readableProjectIds(principal)` 逐项目 read，找不到则 404；不暴露存在性 |
| 取消触发时点与 assertion | `cancelCheck` 用计数器测试法（`checkCount === N` 触发），替代 setTimeout 竞态 |

## 7. 与 P1–P4 边界的回归检查

| 已存在功能 | 回归状态 |
|---|---|
| 169 个既有测试 | ✅ 全过（typecheck 0 错 + test 全绿）|
| `demo` 14/14 | ✅ |
| `demo:p2` 15/15 | ✅ |
| `demo:p3` 24/24 | ✅ |
| `demo:p4` 12/12 | ✅ |
| P1 regen byte-identical（同 generatedAt） | ✅（已有的 `tests/cancel-pipeline.test.ts` "无 checkpoint 无 cancel：行为与 runMatchPipeline 字节级一致" 验证）|
| 公共 schema 1.0.0 strict | ✅（validation.test.ts 14 项 + 全测试套覆盖）|
| C-12 不可变版本 | ✅（pipeline-cancel 模块下回退路径不写 reportVersions）|

## 8. 路径控制（用户硬约束）

- ✅ 仅 `modules/c-report/` 改动
- ✅ `git add` 只暂存 `modules/c-report/`（即将做）
- ✅ 不动 `modules/a`、`modules/b`、`packages/`、根工程文件、`AGENTS.md`（仍不存在）
- ✅ 提交消息前缀 `[C]`

## 9. 下一对话可直接拿的事

- **重启实现**：设计 §5.3 已有方案；当前 P5 提供 checkpoint + 续跑能力；handler 层的"启动时遍历 listInterrupted"需单独 PR（与 §8.2 根挂载一同做）
- **run 超时杀**：handler 加 `maxRunningMs` 即可；当前 `runStore.updateStatus` 已就位
- **根目录挂载（§8.2）**：按 `C_P2_INTEGRATION_SNIPPETS.md` + `C_P3_INTEGRATION_SNIPPETS.md` 已备片段；需你授权我才动根工程
- **跨模块 v2 协调（v3 §2.1）**：三方协调，本期不参与

## 10. 实证

| 项 | 数字 |
|---|---|
| `npm test` 通过 | 213/213（36 + 4 suites）|
| `npm run demo:p5` 通过 | 23/23 |
| 四个旧演示仍通过 | 14+15+24+12 = 65 |
| 文档核对 | 15/15 + 8/8，0 错误 |
| 运行时间 | < 1s 总测试 + 演示 |
| 改动行数（净） | +约 1500 行（含 tests + demo + docs）|
