/**
 * §6.2 [C-IMPL-ROOT-MOUNT] 测试：GET /api/c/reports/:id/snapshot
 * （新增 endpoint 用于 /reports 页面 bundle 上下文；含所有权校验）
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, DEMO_TOKEN } from './api-harness.js';
import { handleGetReportSnapshot, handleGetReport } from '../application/api/handlers.js';

describe('§6.2 [C-IMPL-ROOT-MOUNT] handleGetReportSnapshot', () => {
  it('GET snapshot 返回 { snapshot: artifact } 含 bundle', async () => {
    const harness = createHarness();
    const create = await harness.createMatch({ idempotencyKey: 'demo-snap-1' });
    assert.strictEqual(create.status, 202);
    const created = await create.json() as { reportId: string };
    const resp = await handleGetReportSnapshot(harness.ctx, new Request('http://t/x', { headers: { authorization: DEMO_TOKEN } }), created.reportId);
    assert.strictEqual(resp.status, 200);
    const json = await resp.json() as { snapshot: { artifactType: string; bundle: { jobs: Array<{ title: string }> } } };
    assert.strictEqual(json.snapshot.artifactType, 'c_private_report_snapshot_v1');
    assert.ok(Array.isArray(json.snapshot.bundle.jobs));
    assert.ok(json.snapshot.bundle.jobs.length >= 1);
  });

  it('GET snapshot 无凭据 → 401 UNAUTHENTICATED', async () => {
    const harness = createHarness();
    const create = await harness.createMatch({ idempotencyKey: 'demo-snap-2' });
    assert.strictEqual(create.status, 202);
    const created = await create.json() as { reportId: string };
    const resp = await handleGetReportSnapshot(harness.ctx, new Request('http://t/x'), created.reportId);
    assert.strictEqual(resp.status, 401);
  });

  it('GET snapshot 不存在的 reportId → 404', async () => {
    const harness = createHarness();
    const resp = await handleGetReportSnapshot(harness.ctx, new Request('http://t/x', { headers: { authorization: DEMO_TOKEN } }), 'report-nonexistent');
    assert.strictEqual(resp.status, 404);
  });

  it('GET snapshot 与 /reports/:id 互补：snapshot 含 bundle，reports/:id 仅 diagnostics', async () => {
    const harness = createHarness();
    const create = await harness.createMatch({ idempotencyKey: 'demo-snap-3' });
    assert.strictEqual(create.status, 202);
    const created = await create.json() as { reportId: string };
    const snap = await handleGetReportSnapshot(harness.ctx, new Request('http://t/x', { headers: { authorization: DEMO_TOKEN } }), created.reportId);
    const rep = await handleGetReport(harness.ctx, new Request('http://t/x', { headers: { authorization: DEMO_TOKEN } }), created.reportId);
    assert.strictEqual(snap.status, 200);
    assert.strictEqual(rep.status, 200);
    const sJson = await snap.json() as { snapshot: { bundle: unknown } };
    const rJson = await rep.json() as { report: { reportId: string }; diagnostics: unknown };
    assert.ok(sJson.snapshot.bundle);
    assert.ok(!('bundle' in rJson));
    assert.strictEqual(rJson.report.reportId, created.reportId);
  });

  it('GET snapshot 跨用户读不泄露存在性 → 404', async () => {
    const harness = createHarness();
    const create = await harness.createMatch({ idempotencyKey: 'demo-snap-4' });
    assert.strictEqual(create.status, 202);
    const created = await create.json() as { reportId: string };
    const otherHarness = createHarness(); // 不同 identity，无项目可读
    const resp = await handleGetReportSnapshot(otherHarness.ctx, new Request('http://t/x', { headers: { authorization: 'Bearer token-user-other' } }), created.reportId);
    assert.strictEqual(resp.status, 404);
  });
});
