import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  handleCancelRun,
  type CApiContext,
} from '../application/api/handlers.js';
import {
  InMemoryCStores,
  createDemoIdentity,
  type FakeIdentityProvider,
} from '../adapters/memory/in-memory.js';

const DEMO_TOKEN = 'Bearer token-user-demo-1';
const OTHER_TOKEN = 'Bearer token-user-other';
const PROJECT_ID = 'project-demo-1';

function buildCtx(stores: InMemoryCStores, identity: FakeIdentityProvider): CApiContext {
  let idCounter = 0;
  return {
    stores,
    identity,
    async readableProjectIds(principal) {
      return identity.projectsOf(principal.userId);
    },
    now: () => new Date().toISOString(),
    newRequestId: () => `req-${String(++idCounter)}`,
    newId: (prefix) => `${prefix}-test-${String(++idCounter)}`,
  };
}

async function setupRun(stores: InMemoryCStores, runId: string): Promise<void> {
  const createdAt = '2026-10-02T09:00:00Z';
  await stores.runs.enqueueWithReservation(
    { runId, projectId: PROJECT_ID, module: 'c', status: 'running', stage: 'input_schema', createdAt, updatedAt: createdAt },
    { scopeKey: runId, inputHash: 'h', runId, reportId: `r-${runId}` },
  );
}

describe('P5 DELETE /api/c/runs/:runId（handleCancelRun）', () => {
  let baseDir: string | null = null;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'c-report-p5-api-'));
  });

  afterEach(async () => {
    if (baseDir !== null) {
      await rm(baseDir, { recursive: true, force: true });
      baseDir = null;
    }
  });

  it('401：未携带 Authorization', async () => {
    const identity = createDemoIdentity();
    const stores = new InMemoryCStores();
    const ctx = buildCtx(stores, identity);
    const req = new Request('http://test/api/c/runs/run-x', { method: 'DELETE' });
    const res = await handleCancelRun(ctx, req, 'run-x');
    assert.strictEqual(res.status, 401);
  });

  it('404：runId 不存在（不泄露存在性）', async () => {
    const identity = createDemoIdentity();
    const stores = new InMemoryCStores();
    const ctx = buildCtx(stores, identity);
    const req = new Request('http://test/api/c/runs/never-exists', {
      method: 'DELETE',
      headers: { authorization: DEMO_TOKEN },
    });
    const res = await handleCancelRun(ctx, req, 'never-exists');
    assert.strictEqual(res.status, 404);
  });

  it('202：running run 被取消 → status: cancelled', async () => {
    const identity = createDemoIdentity();
    const stores = new InMemoryCStores();
    await setupRun(stores, 'r-running');
    const ctx = buildCtx(stores, identity);
    const req = new Request('http://test/api/c/runs/r-running', {
      method: 'DELETE',
      headers: { authorization: DEMO_TOKEN },
    });
    const res = await handleCancelRun(ctx, req, 'r-running');
    assert.strictEqual(res.status, 202);
    const body = await res.json() as { status: string };
    assert.strictEqual(body.status, 'cancelled');
    const runRecord = await stores.runs.read(PROJECT_ID, 'r-running');
    assert.strictEqual(runRecord?.status, 'cancelled');
  });

  it('409：已 cancelled 的 run 第二次 DELETE → RUN_NOT_CANCELLABLE', async () => {
    const identity = createDemoIdentity();
    const stores = new InMemoryCStores();
    await setupRun(stores, 'r-done');
    await stores.runs.requestCancel(PROJECT_ID, 'r-done');
    const ctx = buildCtx(stores, identity);
    const req = new Request('http://test/api/c/runs/r-done', {
      method: 'DELETE',
      headers: { authorization: DEMO_TOKEN },
    });
    const res = await handleCancelRun(ctx, req, 'r-done');
    assert.strictEqual(res.status, 409);
    const body = await res.json() as { error: { code: string } };
    assert.strictEqual(body.error.code, 'RUN_NOT_CANCELLABLE');
  });

  it('404：跨用户读不泄露（user-other 看到自己项目里的 runId，不暴露 demo 用户的）', async () => {
    const identity = createDemoIdentity();
    const stores = new InMemoryCStores();
    await setupRun(stores, 'r-demo');
    const ctx = buildCtx(stores, identity);
    const req = new Request('http://test/api/c/runs/r-demo', {
      method: 'DELETE',
      headers: { authorization: OTHER_TOKEN },
    });
    const res = await handleCancelRun(ctx, req, 'r-demo');
    assert.strictEqual(res.status, 404);
  });

  it('409：completed run DELETE → RUN_NOT_CANCELLABLE', async () => {
    const identity = createDemoIdentity();
    const stores = new InMemoryCStores();
    await setupRun(stores, 'r-completed');
    await stores.runs.updateStatus(PROJECT_ID, 'r-completed', 'completed', 'report_selfcheck');
    const ctx = buildCtx(stores, identity);
    const req = new Request('http://test/api/c/runs/r-completed', {
      method: 'DELETE',
      headers: { authorization: DEMO_TOKEN },
    });
    const res = await handleCancelRun(ctx, req, 'r-completed');
    assert.strictEqual(res.status, 409);
  });

  it('503：identity 未配置 → NOT_CONFIGURED', async () => {
    const stores = new InMemoryCStores();
    const ctx: CApiContext = {
      stores,
      identity: null,
      readableProjectIds: async () => [],
      now: () => new Date().toISOString(),
      newRequestId: () => 'req-1',
      newId: () => 'id-1',
    };
    const req = new Request('http://test/api/c/runs/run-x', {
      method: 'DELETE',
      headers: { authorization: DEMO_TOKEN },
    });
    const res = await handleCancelRun(ctx, req, 'run-x');
    assert.strictEqual(res.status, 503);
  });
});
