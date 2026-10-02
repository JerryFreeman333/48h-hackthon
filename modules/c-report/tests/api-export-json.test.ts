/**
 * P3 导出测试：GET /api/c/reports/:id/export?format=json（私有复现包）。
 * 规格 §12：artifactType 明确、与裸 MatchReport 分开、读同一不可变快照、
 * 两次导出逐字节一致、仅所有者可导出（越权 404 不泄露存在性）。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createHarness,
  exportReport,
  getReport,
  readJson,
  DEMO_TOKEN,
  OTHER_TOKEN,
} from './api-harness.js';

describe('P3 export?format=json（私有快照复现包）', () => {
  it('200：artifactType=c_private_report_snapshot_v1，内含 report/输入快照/trace，与页面同一报告', () => {
    const harness = createHarness();
    const created = harness.createMatch({ idempotencyKey: 'key-json-1' }).then((r) => readJson(r));
    return created.then(async (meta) => {
      const response = await exportReport(harness, meta.reportId, DEMO_TOKEN, 'json');
      assert.strictEqual(response.status, 200);
      assert.match(response.headers.get('content-type') ?? '', /application\/json/);
      const artifact = await readJson(response);
      assert.strictEqual(artifact.artifactType, 'c_private_report_snapshot_v1');
      assert.strictEqual(artifact.report.reportId, meta.reportId);
      assert.strictEqual(artifact.report.schemaVersion, '1.0.0');
      // 复现包不是裸 MatchReport：携带输入快照与决策痕迹。
      assert.ok(artifact.profile && artifact.profile.profileId);
      assert.ok(artifact.bundle && Array.isArray(artifact.bundle.jobs));
      assert.ok(artifact.intentContext && artifact.intentContext.intentId);
      assert.ok(Array.isArray(artifact.decisionTraces) && artifact.decisionTraces.length > 0);
      assert.ok(artifact.diagnostics && Array.isArray(artifact.diagnostics.stages));
      assert.ok(artifact.inputHashes && typeof artifact.inputHashes.bundle === 'string');
    });
  });

  it('同一不可变版本两次导出逐字节一致', async () => {
    const harness = createHarness();
    const meta = await readJson(await harness.createMatch({ idempotencyKey: 'key-json-2' }));
    const text1 = await (await exportReport(harness, meta.reportId, DEMO_TOKEN, 'json')).text();
    const text2 = await (await exportReport(harness, meta.reportId, DEMO_TOKEN, 'json')).text();
    assert.strictEqual(text1, text2);
  });

  it('JSON 复现包与页面报告同快照：v1 导出不可变，最新导出随更新指向 v2', async () => {
    const harness = createHarness();
    const meta = await readJson(await harness.createMatch({ idempotencyKey: 'key-json-3' }));
    const v1ExportBefore = await (await exportReport(harness, meta.reportId, DEMO_TOKEN, 'json')).text();
    const { updateReport } = await import('./api-harness.js');
    await updateReport(harness, meta.reportId, {
      idempotencyKey: 'update-json-3',
      bundleMutation: (bundle) => {
        const job = JSON.parse(JSON.stringify(bundle.jobs[0]));
        job.jobId = 'job-json-3-b';
        bundle.jobs.push(job);
      },
    });
    // 导出端点永远导最新版本；v1 的不可变性按存储工件逐字节核对（与导出同序列化）。
    const v1Stored = await harness.stores.reportSnapshots.read('project-demo-1', `${String(meta.reportId)}:v1`);
    assert.ok(v1Stored !== null);
    assert.strictEqual(JSON.stringify(v1Stored.snapshot), v1ExportBefore);
    // 最新导出是 v2 工件：包含新候选。
    const latest = await readJson(await getReport(harness, meta.reportId));
    assert.strictEqual(latest.report.version, 2);
    const latestExport = JSON.parse(await (await exportReport(harness, meta.reportId, DEMO_TOKEN, 'json')).text());
    assert.strictEqual(latestExport.report.version, 2);
    assert.strictEqual(latestExport.bundle.jobs.length, 2);
  });

  it('越权导出 → 404（不泄露存在性）；不支持格式 → 422', async () => {
    const harness = createHarness();
    const meta = await readJson(await harness.createMatch({ idempotencyKey: 'key-json-4' }));
    const forbidden = await exportReport(harness, meta.reportId, OTHER_TOKEN, 'json');
    assert.strictEqual(forbidden.status, 404);
    const unsupported = await exportReport(harness, meta.reportId, DEMO_TOKEN, 'docx');
    assert.strictEqual(unsupported.status, 422);
    const body = await readJson(unsupported);
    assert.strictEqual(body.error.code, 'UNSUPPORTED_FORMAT');
  });

  it('未认证导出 → 401', async () => {
    const harness = createHarness();
    const meta = await readJson(await harness.createMatch({ idempotencyKey: 'key-json-5' }));
    const { handleExportReport } = await import('../application/api/handlers.js');
    const url = new URL(`http://local/api/c/reports/${String(meta.reportId)}/export?format=json`);
    const response = await handleExportReport(harness.ctx, new Request(url), String(meta.reportId), url);
    assert.strictEqual(response.status, 401);
  });
});
