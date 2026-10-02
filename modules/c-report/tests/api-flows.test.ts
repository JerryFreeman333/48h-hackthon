import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadDemoInputs, clone } from './helpers.js';
import {
  createHarness,
  getRun,
  getReport,
  readJson,
  assertErrorShape,
  DEMO_TOKEN,
} from './api-harness.js';
import { matchReportSchema } from '../domain/schema.js';

describe('P2 API｜POST /api/c/matches 基本流', () => {
  it('合法输入 → 202 {runId,status,reportId}；GET run → completed/partial；GET report → 合法 MatchReport', async () => {
    const harness = createHarness();
    const createResponse = await harness.createMatch({ idempotencyKey: 'k1' });
    assert.strictEqual(createResponse.status, 202);
    const created = await readJson(createResponse);
    assert.strictEqual(typeof created.runId, 'string');
    assert.ok(['completed', 'partial'].includes(created.status));
    assert.strictEqual(typeof created.reportId, 'string');

    const runResponse = await getRun(harness, created.runId);
    assert.strictEqual(runResponse.status, 200);
    const run = await readJson(runResponse);
    assert.strictEqual(run.status, created.status);
    assert.ok(run.createdAt);
    assert.ok(run.updatedAt);

    const reportResponse = await getReport(harness, created.reportId);
    assert.strictEqual(reportResponse.status, 200);
    const reportBody = await readJson(reportResponse);
    const parsed = matchReportSchema.safeParse(reportBody.report);
    assert.strictEqual(parsed.success, true);
    assert.strictEqual(reportBody.report.results[0]?.recommendation, 'deprioritize');
    assert.strictEqual(reportBody.report.results[0]?.constraints[0]?.result, 'fail');
    // demo 关键主题有缺口 → 报告 partial 且 run 状态为 partial
    assert.strictEqual(reportBody.report.completeness, 'partial');
    assert.strictEqual(created.status, 'partial');
    // run 诊断投影随报告返回（C-13 空候选说明的载体）
    assert.ok(reportBody.diagnostics.keyTopicGaps.includes('salary_income_assessability'));
  });

  it('空候选：run 完成、results=[]、diagnostics.insufficientNote 存在', async () => {
    const harness = createHarness();
    const response = await harness.createMatch({
      idempotencyKey: 'k-empty',
      bundleMutation: (bundle) => {
        bundle.jobs = [];
        bundle.facts = [];
        bundle.evidence = [];
        bundle.coverage = [];
      },
    });
    assert.strictEqual(response.status, 202);
    const created = await readJson(response);
    const reportResponse = await getReport(harness, created.reportId);
    const reportBody = await readJson(reportResponse);
    assert.deepStrictEqual(reportBody.report.results, []);
    assert.ok(reportBody.diagnostics.insufficientNote.includes('没有候选岗位'));
  });
});

describe('P2 API｜非法输入在创建 run 之前拒绝', () => {
  it('请求体非 JSON → 422 INVALID_JSON', async () => {
    const harness = createHarness();
    const response = await handleCreateRaw(harness, '<not json>');
    assert.strictEqual(response.status, 422);
    assertErrorShape(await readJson(response));
  });

  it('缺少 idempotencyKey → 422 MISSING_FIELD，且不产生任何 run', async () => {
    const harness = createHarness();
    const inputs = loadDemoInputs();
    const response = await harness.createMatch({
      bodyOverride: { profile: clone(inputs.profile), intentContext: clone(inputs.intent), bundle: clone(inputs.bundle) },
    });
    assert.strictEqual(response.status, 422);
    const body = await readJson(response);
    assert.strictEqual(body.error.code, 'MISSING_FIELD');
    const runsAfter = await harness.stores.runs.read('project-demo-1', 'run-test-1');
    assert.strictEqual(runsAfter, null);
  });

  it('未确认画像 → 422 PROFILE_NOT_CONFIRMED，不产生 run', async () => {
    const harness = createHarness();
    const response = await harness.createMatch({
      idempotencyKey: 'k-unconfirmed',
      profileMutation: (profile) => {
        profile.confirmedAt = null;
      },
    });
    assert.strictEqual(response.status, 422);
    const body = await readJson(response);
    assert.strictEqual(body.error.code, 'PROFILE_NOT_CONFIRMED');
  });

  it('schemaVersion 非 1.0.0 → 409 SCHEMA_VERSION_UNSUPPORTED', async () => {
    const harness = createHarness();
    const response = await harness.createMatch({
      idempotencyKey: 'k-version',
      profileMutation: (profile) => {
        (profile as any).schemaVersion = '1.0.1';
      },
    });
    assert.strictEqual(response.status, 409);
    const body = await readJson(response);
    assert.strictEqual(body.error.code, 'SCHEMA_VERSION_UNSUPPORTED');
  });

  it('候选属于旧意向 → 409 BINDING_MISMATCH', async () => {
    const harness = createHarness();
    const response = await harness.createMatch({
      idempotencyKey: 'k-stale',
      bundleMutation: (bundle) => {
        bundle.intentRevision = 2;
      },
    });
    assert.strictEqual(response.status, 409);
    const body = await readJson(response);
    assert.strictEqual(body.error.code, 'BINDING_MISMATCH');
  });

  it('profile.mode 与项目模式不一致 → 409 MODE_CONFLICT', async () => {
    const harness = createHarness();
    const response = await harness.createMatch({
      idempotencyKey: 'k-mode',
      profileMutation: (profile) => {
        profile.mode = 'live';
      },
    });
    assert.strictEqual(response.status, 409);
    const body = await readJson(response);
    assert.strictEqual(body.error.code, 'MODE_CONFLICT');
  });

  it('profile 缺 projectId → 422 MISSING_FIELD', async () => {
    const harness = createHarness();
    const response = await harness.createMatch({
      idempotencyKey: 'k-noproject',
      bodyOverride: { profile: { schemaVersion: '1.0.0' }, intentContext: {}, bundle: {}, idempotencyKey: 'k' },
    });
    assert.strictEqual(response.status, 422);
    const body = await readJson(response);
    assert.strictEqual(body.error.code, 'MISSING_FIELD');
  });

  async function handleCreateRaw(harness: ReturnType<typeof createHarness>, rawBody: string): Promise<Response> {
    const { handleCreateMatch } = await import('../application/api/handlers.js');
    return handleCreateMatch(
      harness.ctx,
      new Request('http://local/api/c/matches', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: DEMO_TOKEN },
        body: rawBody,
      }),
    );
  }
});
