/**
 * C 默认 CApiContext 工厂（P2/P3/P5 集成片段）。
 *
 * 用途：根目录 `app/api/c/*` / `app/demo/c/*` / `app/reports/page.tsx`
 * 各自薄封装的统一入口。维护人或生产宿主替换为公共 runtime adapter；
 * demo runtime 继续使用本文件的内存版本。
 *
 * 边界：
 * - 进程内单例（globalThis.__cDemoRuntime 模式由 demo-runtime.ts 管理）；
 *   本工厂每次返回全新独立 ctx（用于 root 路由薄封装，每次 POST 拿新 ctx 即可）。
 * - 不做 persist；重启即丢。
 * - fake Bearer token（"token-user-demo-1"）持有 project-demo-1；
 *   维护人改项目时应同步更新 api-harness 测试与 §P2_P3_INTEGRATION_SNIPPETS。
 *
 * §6.2 关联：本工厂为 handler 启动续跑预留 `onStartup` 钩子；调用方按需注入。
 */
import type { CApiContext } from '../../application/api/handlers.js';
import { InMemoryCStores, createDemoIdentity } from './in-memory.js';
import { FileSystemCheckpointStore } from './in-memory-checkpoint.js';
import { resumeInterruptedRuns } from '../../application/api/startup-resume.js';

/**
 * 全局 demo runtime 状态仓库（与 demo-runtime.ts 的 __cDemoRuntime 同构）。
 * 用途：跨 Next.js route 文件模块共享内存存储，避免每个 route 文件独立 ctx 造成
 * 跨文件 POST→GET 出现 404（见 §6.2 修复记录）。
 * 生产宿主替换为公共 persistence + 鉴权；本 demo runtime 进程内单例。
 */
interface SharedDemoState {
  ctx: CApiContext;
}
const __sharedDemoStore = globalThis as unknown as { __cSharedDemoCtx?: SharedDemoState };

/**
 * 显式 demo/test context：内存存储 + fake 鉴权；非生产。
 *
 * 默认行为：**每次新建** InMemoryCStores（与原 P3 demo-runtime.ts 单例不同；
 * 测试需独立 ctx 默认 / 共用 context 请走 createSharedCApiContext()）。
 *
 * 测试场景：直接调本函数每次拿到新 ctx，不会跨测试串状态。
 * root route 挂载场景：用 createSharedCApiContext() 走 globalThis 单例。
 */
export function createCApiContext(options?: {
  /** 共享 stores：默认新建 InMemoryCStores；resume 测试可注入同一实例以跨调用共享状态。 */
  stores?: CApiContext['stores'];
  checkpoint?: CApiContext['checkpoint'];
  model?: CApiContext['model'];
  retryPolicy?: CApiContext['retryPolicy'];
  retryBudget?: CApiContext['retryBudget'];
}): CApiContext {
  const stores = options?.stores ?? new InMemoryCStores();
  const identity = createDemoIdentity();
  let requestCounter = 0;
  const ctx: CApiContext = {
    stores,
    identity,
    readableProjectIds: async (principal) => identity.projectsOf(principal.userId),
    now: () => new Date().toISOString(),
    newRequestId: () => `req-${String(++requestCounter)}`,
    newId: (prefix) => `${prefix}-${String(++requestCounter)}`,
    checkpoint: options?.checkpoint,
    model: options?.model,
    retryPolicy: options?.retryPolicy,
    retryBudget: options?.retryBudget,
  };
  ctx.onStartup = (c: CApiContext) => resumeInterruptedRuns(c);
  return ctx;
}

/**
 * Root mount 工厂：globalThis 单例（与 demo-runtime.ts __cDemoRuntime 同模式）。
 *
 * 用途：Next.js app/api/c/<resource>/route.ts 每个文件 module-level 调一次，
 * 跨 route 文件共享同一 InMemoryCStores（InMemoryCStore 实例、报告索引、run 队列）。
 * 没有这个共享：POST /api/c/matches 成功 202，但 GET /api/c/reports/{id} 立即 404
 * （matchesContext 与 reportsContext 各持独立 store）。
 *
 * 测试场景慎用：单例会跨测试污染。生产宿主替换为公共 runtime 时，本函数直接被替换。
 */
export function createSharedCApiContext(): CApiContext {
  if (__sharedDemoStore.__cSharedDemoCtx !== undefined) {
    return __sharedDemoStore.__cSharedDemoCtx.ctx;
  }
  const ctx = createCApiContext();
  __sharedDemoStore.__cSharedDemoCtx = { ctx };
  return ctx;
}

/** 重置单例（测试专用；外部运行时别调）。 */
export function resetSharedCApiContextForTests(): void {
  __sharedDemoStore.__cSharedDemoCtx = undefined;
}

/**
 * 工厂：完整 demo runtime 上下文（用于 P5 §6.2 启动续跑验证）。
 * 与 createCApiContext() 差异：注入 FileSystemCheckpointStore（默认 tmpdir）。
 */
export function createCApiContextWithCheckpoint(options?: {
  checkpoint?: CApiContext['checkpoint'];
  model?: CApiContext['model'];
  retryPolicy?: CApiContext['retryPolicy'];
  retryBudget?: CApiContext['retryBudget'];
}): CApiContext {
  return createCApiContext({
    checkpoint: options?.checkpoint ?? new FileSystemCheckpointStore(),
    model: options?.model,
    retryPolicy: options?.retryPolicy,
    retryBudget: options?.retryBudget,
  });
}
