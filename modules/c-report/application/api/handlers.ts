/**
 * C 的五个 API handler（规格 §7/§13；关卡 P2）。
 *
 * 框架无关：输入标准 Request、输出标准 Response（与公共底座/B 模块的
 * Next.js route 文件同构，挂载仅需薄封装，见 docs/C_P2_INTEGRATION_SNIPPETS）。
 *
 * 阶段语义：
 * - 非法输入（结构/绑定/引用）在创建 run 之前拒绝（422/409），不落 run。
 * - 合法输入 → 原子幂等预留（同键同输入复用、同键不同输入 409）→ 执行 → completed/partial。
 * - run 与报告版本记录不可变；update 产生新版本，旧版本逐字节保留。
 * - 所有权 = 项目访问控制（等价 packages/runtime.requireProjectAccess 语义），
 *   报告另校验索引所有者（纵深防御）。
 * - 跨用户按 ID 读取返回 404（不泄露资源存在性）；按项目寻址的写路径返回 403。
 */
import type { MatchReport } from '../../domain/contract.js';
import { cError, type CError } from '../../domain/errors.js';
import { runMatchPipeline, type PipelineResult } from '../pipeline.js';
import { runMatchPipelineWithModel } from '../pipeline-model.js';
import type { ModelRuntimeConfig } from '../model/refine.js';
import { canonicalize } from '../hash.js';
import { runMatchPipelineCancellable, PipelineCancelledError } from '../pipeline-cancellable.js';
import type { CheckpointStore, RetryPolicy, RetryBudget } from '../ports.js';
import { renderReportMarkdown } from '../markdown.js';
import type {
  CStores,
  IdentityProvider,
  Principal,
  Project,
  ReportIndexRecord,
  RunRecord,
  StoredReportSnapshot,
  StoredReportVersion,
} from '../ports.js';
import { apiError, domainErrorResponse, type ApiErrorCode } from './errors.js';

export interface CApiContext {
  stores: CStores;
  /** null = 鉴权/所有权能力未配置 → 一律 503，不允许无鉴权访问（规格 §3.9）。 */
  identity: IdentityProvider | null;
  /** 当前用户可读的项目 ID 列表（fake 扫描已知项目；生产按用户项目索引查询）。 */
  readableProjectIds(principal: Principal): Promise<string[]>;
  now(): string;
  newRequestId(): string;
  newId(prefix: string): string;
  /**
   * P4 可选模型运行时（规格 §16）：配置后创建/更新走"确定性管线 + 七层校验精炼"；
   * 未配置则与 P2 行为逐字节一致（纯模板）。生产由宿主注入公共 ModelClient adapter。
   */
  model?: ModelRuntimeConfig;
  /**
   * P5 可选 checkpoint（设计草案 §4.2）。
   * 设置后 executeOrReuse 改走 runMatchPipelineCancellable；未设置时维持原 P2 行为字节级一致。
   */
  checkpoint?: CheckpointStore;
  /**
   * P5 可选重试策略（设计草案 §4.3）。仅在 checkpoint 设置 + 模型 retry 调用时生效。
   * 未设置时维持 P4 §13 边界（响应丢失不盲重发）。
   */
  retryPolicy?: RetryPolicy;
  retryBudget?: RetryBudget;
}

interface ReportRequestBody {
  profile?: unknown;
  intentContext?: unknown;
  bundle?: unknown;
  idempotencyKey?: unknown;
}

const CREATE_OPERATION = 'c.create_match';
const UPDATE_OPERATION = 'c.update_report';
const RULE_VERSION = 'c-rules-1.0.0-p1';
const PROMPT_VERSION = 'template-no-model-p1.0.0';

function jsonResponse(status: number, body: unknown, requestId: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'x-request-id': requestId },
  });
}

function errorResponse(code: ApiErrorCode, message: string, requestId: string, details?: Record<string, string | number | string[]>): Response {
  const { status, body } = apiError(code, message, requestId, details);
  return jsonResponse(status, body, requestId);
}

function domainError(error: CError, requestId: string): Response {
  const { status, body } = domainErrorResponse(error, requestId);
  return jsonResponse(status, body, requestId);
}

function extractStringField(value: unknown, field: string): string | null {
  if (typeof value === 'object' && value !== null && field in value) {
    const candidate = (value as Record<string, unknown>)[field];
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate;
    }
  }
  return null;
}

/** 等价 packages/runtime.requireProjectAccess 的语义，显式返回结构化错误。 */
async function authenticateAndCheckProject(
  ctx: CApiContext,
  request: Request,
  projectId: string,
): Promise<{ ok: true; principal: Principal; project: Project; requestId: string } | { ok: false; response: Response; requestId: string }> {
  const requestId = ctx.newRequestId();
  if (ctx.identity === null) {
    return { ok: false, response: errorResponse('NOT_CONFIGURED', '鉴权/所有权能力未配置，拒绝处理请求', requestId), requestId };
  }
  const principal = await ctx.identity.authenticate(request);
  if (principal === null) {
    return { ok: false, response: errorResponse('UNAUTHENTICATED', '登录后才能访问', requestId), requestId };
  }
  const project = await ctx.identity.getProject(projectId);
  if (project === null || project.ownerId !== principal.userId) {
    return { ok: false, response: errorResponse('FORBIDDEN', '无权访问该项目', requestId), requestId };
  }
  return { ok: true, principal, project, requestId };
}

function idempotencyScope(ownerId: string, projectId: string, operation: string, key: string): string {
  // 幂等作用域：所有者 + 项目 + C 操作 + 幂等键（规格 §13）。
  return `${ownerId}\u0000${projectId}\u0000${operation}\u0000${key}`;
}

/** 输入哈希冻结对象与执行配置；canonical 拒绝非有限值（§13）。 */
function computeInputHash(profile: unknown, intentContext: unknown, bundle: unknown): string {
  return canonicalize({
    profile,
    intentContext,
    bundle,
    execution: { ruleVersion: RULE_VERSION, promptVersion: PROMPT_VERSION },
  });
}

interface ParsedReportRequest {
  ok: true;
  body: { profile: unknown; intentContext: unknown; bundle: unknown; idempotencyKey: string };
  projectId: string;
  principal: Principal;
  project: Project;
  requestId: string;
}

async function parseAndAuthorize(
  ctx: CApiContext,
  request: Request,
): Promise<ParsedReportRequest | { ok: false; response: Response }> {
  if (ctx.identity === null) {
    return { ok: false, response: errorResponse('NOT_CONFIGURED', '鉴权/所有权能力未配置，拒绝处理请求', ctx.newRequestId()) };
  }
  const principal = await ctx.identity.authenticate(request);
  if (principal === null) {
    return { ok: false, response: errorResponse('UNAUTHENTICATED', '登录后才能访问', ctx.newRequestId()) };
  }
  let body: ReportRequestBody;
  try {
    body = (await request.json()) as ReportRequestBody;
  } catch {
    return { ok: false, response: errorResponse('INVALID_JSON', '请求体不是合法 JSON', ctx.newRequestId()) };
  }
  const requestId = ctx.newRequestId();
  if (typeof body.idempotencyKey !== 'string' || body.idempotencyKey.length === 0) {
    return { ok: false, response: errorResponse('MISSING_FIELD', '缺少 idempotencyKey', requestId) };
  }
  const projectId = extractStringField(body.profile, 'projectId');
  if (projectId === null) {
    return { ok: false, response: errorResponse('MISSING_FIELD', '无法从 profile 中定位 projectId', requestId) };
  }
  const access = await authenticateAndCheckProject(ctx, request, projectId);
  if (!access.ok) {
    return { ok: false, response: access.response };
  }
  const profileMode = extractStringField(body.profile, 'mode');
  if (profileMode !== null && profileMode !== access.project.mode) {
    return {
      ok: false,
      response: errorResponse('MODE_CONFLICT', `profile.mode=${profileMode} 与项目模式 ${access.project.mode} 不一致`, requestId),
    };
  }
  return {
    ok: true,
    body: {
      profile: body.profile,
      intentContext: body.intentContext,
      bundle: body.bundle,
      idempotencyKey: body.idempotencyKey,
    },
    projectId,
    principal,
    project: access.project,
    requestId,
  };
}

type ExecuteOutcome =
  | { kind: 'executed'; runId: string; reportId: string; status: 'completed' | 'partial' }
  | { kind: 'reused'; runId: string; status: string; reportId: string | null }
  | { kind: 'conflict' }
  | { kind: 'error'; response: Response }
  | { kind: 'cancelled'; runId: string; reportId: string; atStage: string };

/**
 * 原子幂等门 + 执行：enqueueWithReservation 在同一临界区完成幂等预留与 run 插入。
 * 竞争失败方按 reservation 判定：同哈希 → 复用既有 run；不同哈希 → 409。
 * 校验失败时 run 标记 failed 且 reservation 保留：同键同输入重试语义一致。
 */
async function executeOrReuse(
  ctx: CApiContext,
  owner: Principal,
  project: Project,
  body: { profile: unknown; intentContext: unknown; bundle: unknown },
  inputHash: string,
  scope: string,
  reportId: string,
  nextVersion: number,
): Promise<ExecuteOutcome> {
  const requestId = ctx.newRequestId();
  const runId = ctx.newId('run');
  const createdAt = ctx.now();

  const run: RunRecord = {
    runId,
    projectId: project.projectId,
    module: 'c',
    status: 'queued',
    stage: 'queued',
    createdAt,
    updatedAt: createdAt,
  };
  const gate = await ctx.stores.runs.enqueueWithReservation(run, {
    scopeKey: scope,
    inputHash,
    runId,
    reportId,
  });

  if (!gate.inserted) {
    if (gate.existing === null || gate.existing.inputHash !== inputHash) {
      return { kind: 'conflict' };
    }
    return {
      kind: 'reused',
      runId: gate.existing.runId,
      status: gate.existingRun?.status ?? 'queued',
      reportId: gate.existing.reportId,
    };
  }

  await ctx.stores.runs.updateStatus(project.projectId, runId, 'running', 'input_schema');

  // P4：未配置模型 → 同步确定性管线（P1 语义，零改动）；配置了 → 确定性 + 七层校验精炼。
  // P5 入口分流：未配置时字节级复用 P2 + P4；配置后走 runMatchPipelineCancellable。
  let pipeline: PipelineResult;
  if (ctx.checkpoint !== undefined) {
    try {
      pipeline = await runMatchPipelineCancellable({
        profile: body.profile,
        intentContext: body.intentContext,
        bundle: body.bundle,
        options: {
          reportId,
          generatedAt: ctx.now(),
          version: nextVersion,
          ruleVersion: RULE_VERSION,
          promptVersion: PROMPT_VERSION,
        },
      }, {
        runStore: ctx.stores.runs,
        checkpoint: ctx.checkpoint,
        retryPolicy: ctx.retryPolicy,
        retryBudget: ctx.retryBudget,
        model: ctx.model,
        projectId: project.projectId,
        runId,
      });
    } catch (err) {
      if (err instanceof PipelineCancelledError) {
        await ctx.stores.runs.updateStatus(project.projectId, runId, 'cancelled', err.atStage);
        await ctx.checkpoint.finalize(project.projectId, runId, 'cancelled');
        return { kind: 'cancelled', runId, reportId, atStage: err.atStage };
      }
      throw err;
    }
  } else {
    pipeline = ctx.model !== undefined
      ? await runMatchPipelineWithModel({
          profile: body.profile,
          intentContext: body.intentContext,
          bundle: body.bundle,
          options: {
            reportId,
            generatedAt: ctx.now(),
            version: nextVersion,
            ruleVersion: RULE_VERSION,
            promptVersion: PROMPT_VERSION,
          },
        }, ctx.model)
      : runMatchPipeline({
          profile: body.profile,
          intentContext: body.intentContext,
          bundle: body.bundle,
          options: {
            reportId,
            generatedAt: ctx.now(),
            version: nextVersion,
            ruleVersion: RULE_VERSION,
            promptVersion: PROMPT_VERSION,
          },
        });
  }

  if (!pipeline.ok) {
    await ctx.stores.runs.updateStatus(project.projectId, runId, 'failed', `failed:${pipeline.error.code}`);
    return { kind: 'error', response: domainError(pipeline.error, requestId) };
  }

  const report = pipeline.report;
  const status: 'completed' | 'partial' = report.completeness === 'complete_for_scope' ? 'completed' : 'partial';
  await ctx.stores.runs.updateStatus(project.projectId, runId, status, 'report_selfcheck');

  // 不可变版本记录：insert 重复主键会抛错（fake 与生产一致）。
  const storedVersion: StoredReportVersion = { report, ownerId: owner.userId, runId, createdAt: report.generatedAt };
  await ctx.stores.reportVersions.insert(project.projectId, `${report.reportId}:v${report.version}`, storedVersion);
  const storedSnapshot: StoredReportSnapshot = {
    report,
    snapshot: {
      artifactType: pipeline.snapshot.artifactType,
      report: pipeline.snapshot.report,
      profile: pipeline.snapshot.profile,
      intentContext: pipeline.snapshot.intentContext,
      bundle: pipeline.snapshot.bundle,
      scope: pipeline.snapshot.scope,
      inputHashes: pipeline.snapshot.inputHashes,
      decisionTraces: pipeline.snapshot.decisionTraces,
      diagnostics: pipeline.snapshot.diagnostics,
      ruleVersion: pipeline.snapshot.ruleVersion,
      promptVersion: pipeline.snapshot.promptVersion,
      generatedAt: pipeline.snapshot.generatedAt,
    },
    ownerId: owner.userId,
    projectId: project.projectId,
    runId,
    createdAt: report.generatedAt,
  };
  await ctx.stores.reportSnapshots.insert(project.projectId, `${report.reportId}:v${report.version}`, storedSnapshot);

  return { kind: 'executed', runId, reportId: report.reportId, status };
}

/** POST /api/c/matches —— body: {profile, intentContext, bundle, idempotencyKey} */
export async function handleCreateMatch(ctx: CApiContext, request: Request): Promise<Response> {
  const parsed = await parseAndAuthorize(ctx, request);
  if (!parsed.ok) {
    return parsed.response;
  }
  const { body, projectId, principal, project, requestId } = parsed;

  let inputHash: string;
  try {
    inputHash = computeInputHash(body.profile, body.intentContext, body.bundle);
  } catch (error) {
    return errorResponse('INPUT_STRUCT_INVALID', `输入哈希失败：${error instanceof Error ? error.message : String(error)}`, requestId);
  }

  const scope = idempotencyScope(principal.userId, projectId, CREATE_OPERATION, body.idempotencyKey);
  const outcome = await executeOrReuse(ctx, principal, project, body, inputHash, scope, ctx.newId('report'), 1);
  if (outcome.kind === 'conflict') {
    return errorResponse('IDEMPOTENCY_KEY_CONFLICT', '相同幂等键对应不同输入', requestId);
  }
  if (outcome.kind === 'reused') {
    return jsonResponse(202, { runId: outcome.runId, status: outcome.status, reportId: outcome.reportId ?? undefined }, requestId);
  }
  if (outcome.kind === 'error') {
    return outcome.response;
  }
  if (outcome.kind === 'cancelled') {
    return jsonResponse(202, { runId: outcome.runId, status: 'cancelled', reportId: outcome.reportId, atStage: outcome.atStage }, ctx.newRequestId());
  }

  const indexRecord: ReportIndexRecord = {
    ownerId: principal.userId,
    projectId,
    latestVersion: 1,
    versions: [{ version: 1, runId: outcome.runId, createdAt: ctx.now(), status: outcome.status }],
  };
  try {
    await ctx.stores.reportIndex.putInitial(projectId, outcome.reportId, indexRecord);
  } catch {
    // 并发下另一请求已建立同一报告索引：视为复用（生产由事务保证一致）。
  }
  return jsonResponse(202, { runId: outcome.runId, status: outcome.status, reportId: outcome.reportId }, requestId);
}

/** GET /api/c/runs/:id */
export async function handleGetRun(ctx: CApiContext, request: Request, runId: string): Promise<Response> {
  const requestId = ctx.newRequestId();
  if (ctx.identity === null) {
    return errorResponse('NOT_CONFIGURED', '鉴权/所有权能力未配置，拒绝处理请求', requestId);
  }
  const principal = await ctx.identity.authenticate(request);
  if (principal === null) {
    return errorResponse('UNAUTHENTICATED', '登录后才能查询任务', requestId);
  }
  // runId 按用户可读项目定位（生产按 run 索引查询；fake 扫描已知项目）。
  // 跨用户按 ID 读取返回 404：不泄露其他用户资源的存在性。
  for (const projectId of await ctx.readableProjectIds(principal)) {
    const run = await ctx.stores.runs.read(projectId, runId);
    if (run === null) {
      continue;
    }
    const project = await ctx.identity.getProject(projectId);
    if (project === null || project.ownerId !== principal.userId) {
      return errorResponse('FORBIDDEN', '无权访问该任务', requestId);
    }
    return jsonResponse(
      200,
      { runId: run.runId, status: run.status, stage: run.stage, projectId: run.projectId, createdAt: run.createdAt, updatedAt: run.updatedAt },
      requestId,
    );
  }
  return errorResponse('NOT_FOUND', `任务不存在：${runId}`, requestId);
}

interface LocatedReport {
  projectId: string;
  index: ReportIndexRecord;
  version: StoredReportVersion;
  snapshot: StoredReportSnapshot | null;
  requestId: string;
}

async function locateReport(ctx: CApiContext, request: Request, reportId: string): Promise<{ ok: true; value: LocatedReport } | { ok: false; response: Response }> {
  const requestId = ctx.newRequestId();
  if (ctx.identity === null) {
    return { ok: false, response: errorResponse('NOT_CONFIGURED', '鉴权/所有权能力未配置，拒绝处理请求', requestId) };
  }
  const principal = await ctx.identity.authenticate(request);
  if (principal === null) {
    return { ok: false, response: errorResponse('UNAUTHENTICATED', '登录后才能访问报告', requestId) };
  }
  // 跨用户按 ID 读取返回 404：不泄露其他用户资源的存在性。
  for (const projectId of await ctx.readableProjectIds(principal)) {
    const index = await ctx.stores.reportIndex.get(projectId, reportId);
    if (index === null) {
      continue;
    }
    const project = await ctx.identity.getProject(projectId);
    if (project === null || project.ownerId !== principal.userId || index.ownerId !== principal.userId) {
      return { ok: false, response: errorResponse('FORBIDDEN', '无权访问该报告', requestId) };
    }
    const versionRecord = await ctx.stores.reportVersions.read(projectId, `${reportId}:v${index.latestVersion}`);
    if (versionRecord === null) {
      return { ok: false, response: errorResponse('NOT_FOUND', `报告版本缺失：${reportId}:v${index.latestVersion}`, requestId) };
    }
    const snapshot = await ctx.stores.reportSnapshots.read(projectId, `${reportId}:v${index.latestVersion}`);
    return { ok: true, value: { projectId, index, version: versionRecord, snapshot, requestId } };
  }
  return { ok: false, response: errorResponse('NOT_FOUND', `报告不存在：${reportId}`, requestId) };
}

/** GET /api/c/reports/:id —— 返回最新版本的公共 MatchReport 与 C 私有 run 诊断投影。 */
export async function handleGetReport(ctx: CApiContext, request: Request, reportId: string): Promise<Response> {
  const located = await locateReport(ctx, request, reportId);
  if (!located.ok) {
    return located.response;
  }
  const { value } = located;
  return jsonResponse(200, { report: value.version.report, diagnostics: value.snapshot?.snapshot.diagnostics ?? null }, value.requestId);
}

/**
 * GET /api/c/reports/:id/export?format=md|json —— 从不可变快照渲染，不再模型重写。
 * md：公共报告导出（application/markdown.ts）。
 * json：C 私有复现包（artifactType=c_private_report_snapshot_v1，规格 §12），
 *       含完整输入快照与 trace，与裸 MatchReport 分开，仅所有者可导出。
 */
export async function handleExportReport(ctx: CApiContext, request: Request, reportId: string, url: URL): Promise<Response> {
  const format = url.searchParams.get('format') ?? 'md';
  if (format !== 'md' && format !== 'json') {
    return errorResponse('UNSUPPORTED_FORMAT', `不支持的导出格式：${format}（当前支持 md、json）`, ctx.newRequestId());
  }
  const located = await locateReport(ctx, request, reportId);
  if (!located.ok) {
    return located.response;
  }
  const { value } = located;
  if (format === 'json') {
    const artifact = value.snapshot?.snapshot ?? null;
    if (artifact === null) {
      return errorResponse('NOT_FOUND', `报告快照缺失：${reportId}`, value.requestId);
    }
    return new Response(JSON.stringify(artifact), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'x-request-id': value.requestId,
        'content-disposition': `attachment; filename="${reportId}-v${String(value.version.report.version)}-snapshot.json"`,
      },
    });
  }
  const markdown = renderReportMarkdown(value.version.report, value.snapshot);
  return new Response(markdown, {
    status: 200,
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'x-request-id': value.requestId,
      'content-disposition': `attachment; filename="${reportId}-v${String(value.version.report.version)}.md"`,
    },
  });
}

/** POST /api/c/reports/:id/update —— 新确认材料产生新版本；旧版本逐字节保留。 */
export async function handleUpdateReport(ctx: CApiContext, request: Request, reportId: string): Promise<Response> {
  const parsed = await parseAndAuthorize(ctx, request);
  if (!parsed.ok) {
    return parsed.response;
  }
  const { body, projectId, principal, project } = parsed;
  const requestId = parsed.requestId;

  const index = await ctx.stores.reportIndex.get(projectId, reportId);
  if (index === null || index.projectId !== projectId) {
    return errorResponse('NOT_FOUND', `报告不存在：${reportId}`, requestId);
  }
  if (index.ownerId !== principal.userId) {
    return errorResponse('FORBIDDEN', '无权更新该报告', requestId);
  }

  let inputHash: string;
  try {
    inputHash = computeInputHash(body.profile, body.intentContext, body.bundle);
  } catch (error) {
    return errorResponse('INPUT_STRUCT_INVALID', `输入哈希失败：${error instanceof Error ? error.message : String(error)}`, requestId);
  }
  const scope = idempotencyScope(principal.userId, projectId, UPDATE_OPERATION, body.idempotencyKey);

  // 版本号在预留前确定；不同幂等键的并发更新由生产事务串行化（fake 单进程测试不覆盖该路径）。
  const nextVersion = index.latestVersion + 1;
  const outcome = await executeOrReuse(ctx, principal, project, body, inputHash, scope, reportId, nextVersion);
  if (outcome.kind === 'conflict') {
    return errorResponse('IDEMPOTENCY_KEY_CONFLICT', '相同幂等键对应不同输入', requestId);
  }
  if (outcome.kind === 'reused') {
    return jsonResponse(202, { runId: outcome.runId, status: outcome.status, reportId }, requestId);
  }
  if (outcome.kind === 'error') {
    return outcome.response;
  }
  if (outcome.kind === 'cancelled') {
    return jsonResponse(202, { runId: outcome.runId, status: 'cancelled', reportId: outcome.reportId, atStage: outcome.atStage }, ctx.newRequestId());
  }

  await ctx.stores.reportIndex.appendVersion(projectId, reportId, nextVersion, outcome.runId, ctx.now(), outcome.status);
  return jsonResponse(202, { runId: outcome.runId, status: outcome.status, reportId, version: nextVersion }, requestId);
}

/**
 * DELETE /api/c/runs/:runId —— 取消正在跑 / 排队的 run。
 *
 * 路径：401 无凭据 / 404 跨用户读不泄露 / 409 RUN_NOT_CANCELLABLE（已完成/失败/已取消） / 202 取消成功
 * 幂等：第二次 DELETE 同 runId 在 queued/running 已被取消后 → wasRunning=false → 409 with currentStatus
 *
 * 注：本端点不依赖 ctx.checkpoint；requestCancel 在 InMemoryRunStore 上始终可用。
 */
export async function handleCancelRun(ctx: CApiContext, request: Request, runId: string): Promise<Response> {
  const requestId = ctx.newRequestId();
  if (ctx.identity === null) {
    return errorResponse('NOT_CONFIGURED', '鉴权/所有权能力未配置，拒绝处理请求', requestId);
  }
  const principal = await ctx.identity.authenticate(request);
  if (principal === null) {
    return errorResponse('UNAUTHENTICATED', '登录后才能访问', requestId);
  }
  const readableIds = await ctx.readableProjectIds(principal);
  if (readableIds.length === 0) {
    return errorResponse('NOT_FOUND', `运行不存在：${runId}`, requestId);
  }
  // 跨用户读不泄露：逐项目 read，找不到则 404
  let locatedProjectId: string | null = null;
  let runRecord: import('../ports.js').RunRecord | null = null;
  for (const projectId of readableIds) {
    const r = await ctx.stores.runs.read(projectId, runId);
    if (r !== null) {
      locatedProjectId = projectId;
      runRecord = r;
      break;
    }
  }
  if (locatedProjectId === null || runRecord === null) {
    return errorResponse('NOT_FOUND', `运行不存在：${runId}`, requestId);
  }
  const outcome = await ctx.stores.runs.requestCancel(locatedProjectId, runId);
  if (!outcome.wasRunning) {
    return errorResponse('RUN_NOT_CANCELLABLE', `run 已处于终态（${runRecord.status}），不可再取消`, requestId, {
      currentStatus: runRecord.status,
    });
  }
  return jsonResponse(202, { runId, status: 'cancelled', requestId }, requestId);
}

export type { MatchReport };
