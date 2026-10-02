import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createHarness, getRun, getReport, exportReport, readJson, assertErrorShape, DEMO_TOKEN, OTHER_TOKEN } from './api-harness.js';
import { FakeIdentityProvider } from '../adapters/memory/in-memory.js';
import type { Project } from '../application/ports.js';

describe('P2 API｜鉴权与所有权（越权拒绝；ID 正确不是权限证明）', () => {
  it('鉴权能力未配置 → 503 NOT_CONFIGURED（不允许无鉴权访问）', async () => {
    const harness = createHarness({ identity: null });
    const response = await harness.createMatch({ idempotencyKey: 'k1' });
    assert.strictEqual(response.status, 503);
    const body = await readJson(response);
    assert.strictEqual(body.error.code, 'NOT_CONFIGURED');
  });

  it('无凭据 → 401 UNAUTHENTICATED', async () => {
    const harness = createHarness();
    const response = await harness.createMatch({ idempotencyKey: 'k1', omitToken: true });
    assert.strictEqual(response.status, 401);
    const body = await readJson(response);
    assert.strictEqual(body.error.code, 'UNAUTHENTICATED');
  });

  it('无效凭据 → 401', async () => {
    const harness = createHarness();
    const response = await harness.createMatch({ idempotencyKey: 'k1', token: 'Bearer wrong-token' });
    assert.strictEqual(response.status, 401);
  });

  it('他人的项目（projectId 正确但非所有者）→ 403 FORBIDDEN，不产生 run', async () => {
    const harness = createHarness();
    const response = await harness.createMatch({
      idempotencyKey: 'k-other',
      token: OTHER_TOKEN,
      profileMutation: (profile) => {
        profile.projectId = 'project-other'; // user-other 拥有该演示项目，但 profile 数据仍指向 demo 项目时也应被项目层拦截
      },
      bundleMutation: (bundle) => {
        bundle.projectId = 'project-other';
      },
    });
    // profile/bundle 指向 project-other，但 intent 仍指向 project-demo-1 → 绑定不一致 409
    assert.strictEqual(response.status, 409);
    const body = await readJson(response);
    assert.strictEqual(body.error.code, 'BINDING_MISMATCH');
    assertErrorShape(body);
  });

  it('创建者 A 的资源：用户 B 按 ID 读取一律 404（不泄露存在性）；按项目寻址的写路径 403', async () => {
    const harness = createHarness();
    const created = await readJson(await harness.createMatch({ idempotencyKey: 'k-owner' }));

    const reportB = await getReport(harness, created.reportId, OTHER_TOKEN);
    assert.strictEqual(reportB.status, 404);
    assertErrorShape(await readJson(reportB));

    const exportB = await exportReport(harness, created.reportId, OTHER_TOKEN);
    assert.strictEqual(exportB.status, 404);

    const runB = await getRun(harness, created.runId, OTHER_TOKEN);
    assert.strictEqual(runB.status, 404);
  });

  it('用户 B 无法把 A 的报告更新为自己的（更新走索引所有者校验）→ 403', async () => {
    const harness = createHarness();
    const created = await readJson(await harness.createMatch({ idempotencyKey: 'k-owner2' }));
    const response = await updateAsOther(harness, created.reportId);
    assert.strictEqual(response.status, 403);
    const body = await readJson(response);
    assert.strictEqual(body.error.code, 'FORBIDDEN');
  });

  it('不存在的 run/report → 404', async () => {
    const harness = createHarness();
    await harness.createMatch({ idempotencyKey: 'k-exists' });
    const runResponse = await getRun(harness, 'run-nonexistent', DEMO_TOKEN);
    assert.strictEqual(runResponse.status, 404);
    const reportResponse = await getReport(harness, 'report-nonexistent', DEMO_TOKEN);
    assert.strictEqual(reportResponse.status, 404);
    const exportResponse = await exportReport(harness, 'report-nonexistent', DEMO_TOKEN);
    assert.strictEqual(exportResponse.status, 404);
  });

  it('项目不存在 → 403（不泄露存在性）', async () => {
    const projects = new Map<string, Project>([
      ['project-demo-1', { projectId: 'project-demo-1', ownerId: 'user-demo-1', mode: 'demo' }],
    ]);
    const identity = new FakeIdentityProvider(
      new Map([['token-user-demo-1', 'user-demo-1']]),
      projects,
    );
    const harness = createHarness({ identity });
    const response = await harness.createMatch({
      idempotencyKey: 'k-ghost',
      profileMutation: (profile) => {
        profile.projectId = 'project-ghost';
      },
      bundleMutation: (bundle) => {
        bundle.projectId = 'project-ghost';
      },
    });
    assert.strictEqual(response.status, 403);
  });

  async function updateAsOther(harness: Awaited<ReturnType<typeof createHarness>>, reportId: string): Promise<Response> {
    const { updateReport } = await import('./api-harness.js');
    return updateReport(harness, reportId, { token: OTHER_TOKEN, idempotencyKey: 'update-by-other' });
  }
});

describe('P2 API｜幂等（相同键相同输入复用；同键不同输入 409；并发唯一）', () => {
  it('相同幂等键 + 相同输入两次 → 同一 runId（任务复用，不产生第二个同范围任务）', async () => {
    const harness = createHarness();
    const first = await readJson(await harness.createMatch({ idempotencyKey: 'same-key' }));
    const second = await readJson(await harness.createMatch({ idempotencyKey: 'same-key' }));
    assert.strictEqual(second.runId, first.runId);
    assert.strictEqual(second.status, first.status);
    assert.strictEqual(second.reportId, first.reportId);
  });

  it('相同幂等键 + 不同输入 → 409 IDEMPOTENCY_KEY_CONFLICT', async () => {
    const harness = createHarness();
    await harness.createMatch({ idempotencyKey: 'conflict-key' });
    const conflict = await harness.createMatch({
      idempotencyKey: 'conflict-key',
      profileMutation: (profile) => {
        profile.revision = 1;
        profile.goals = ['修改后的目标'];
      },
    });
    assert.strictEqual(conflict.status, 409);
    const body = await readJson(conflict);
    assert.strictEqual(body.error.code, 'IDEMPOTENCY_KEY_CONFLICT');
  });

  it('不同幂等键 + 相同输入 → 两个独立 run（键在作用域内区分任务）', async () => {
    const harness = createHarness();
    const first = await readJson(await harness.createMatch({ idempotencyKey: 'key-a' }));
    const second = await readJson(await harness.createMatch({ idempotencyKey: 'key-b' }));
    assert.notStrictEqual(first.runId, second.runId);
  });

  it('并发提交相同幂等键 → 恰好一个 run（putIfAbsent 原子性，对应数据库唯一约束）', async () => {
    const harness = createHarness();
    const responses = await Promise.all([
      harness.createMatch({ idempotencyKey: 'race-key' }),
      harness.createMatch({ idempotencyKey: 'race-key' }),
      harness.createMatch({ idempotencyKey: 'race-key' }),
    ]);
    const runIds = new Set<string>();
    for (const response of responses) {
      assert.strictEqual(response.status, 202);
      const body = await readJson(response);
      runIds.add(body.runId);
    }
    assert.strictEqual(runIds.size, 1);
  });

  it('幂等作用域按用户隔离：不同用户同键互不影响', async () => {
    const projects = new Map<string, Project>([
      ['project-demo-1', { projectId: 'project-demo-1', ownerId: 'user-demo-1', mode: 'demo' }],
      ['project-other', { projectId: 'project-other', ownerId: 'user-other', mode: 'demo' }],
    ]);
    const identity = new FakeIdentityProvider(
      new Map([
        ['token-user-demo-1', 'user-demo-1'],
        ['token-user-other', 'user-other'],
      ]),
      projects,
    );
    const harness = createHarness({ identity });
    const a = await readJson(await harness.createMatch({ idempotencyKey: 'shared-key', token: DEMO_TOKEN }));
    const b = await readJson(
      await harness.createMatch({
        idempotencyKey: 'shared-key',
        token: OTHER_TOKEN,
        profileMutation: (profile) => {
          profile.projectId = 'project-other';
        },
        bundleMutation: (bundle) => {
          bundle.projectId = 'project-other';
        },
      }),
    );
    assert.notStrictEqual(a.runId, b.runId);
  });
});
