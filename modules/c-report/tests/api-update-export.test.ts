import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createHarness, getReport, exportReport, updateReport, readJson, assertErrorShape } from './api-harness.js';

describe('P2 API｜POST /api/c/reports/:id/update（新版本；旧版本不可变）', () => {
  it('更新产生 version=2 的新 run 与新报告；v1 记录逐字节不变', async () => {
    const harness = createHarness();
    const created = await readJson(await harness.createMatch({ idempotencyKey: 'create-1' }));
    const reportId = created.reportId as string;

    const v1Before = await harness.stores.reportVersions.read('project-demo-1', `${reportId}:v1`);
    assert.ok(v1Before !== null);

    const updateResponse = await updateReport(harness, reportId, {
      idempotencyKey: 'update-1',
      bundleMutation: (bundle) => {
        // 新材料：候选加入第二个岗位
        bundle.jobs.push({ ...JSON.parse(JSON.stringify(bundle.jobs[0])), jobId: 'job-demo-2', title: '产品运营（二期）' });
      },
    });
    assert.strictEqual(updateResponse.status, 202);
    const updated = await readJson(updateResponse);
    assert.strictEqual(updated.version, 2);
    assert.strictEqual(updated.reportId, reportId);
    assert.notStrictEqual(updated.runId, created.runId);

    const v1After = await harness.stores.reportVersions.read('project-demo-1', `${reportId}:v1`);
    assert.deepStrictEqual(v1After, v1Before, 'v1 版本记录必须逐字节不变');

    const latest = await readJson(await getReport(harness, reportId));
    assert.strictEqual(latest.report.version, 2);
    assert.strictEqual(latest.report.results.length, 2);
    assert.strictEqual(latest.report.results[0]?.jobId, 'job-demo-1');
    assert.strictEqual(latest.report.results[1]?.jobId, 'job-demo-2');
  });

  it('相同幂等键相同更新的重复提交 → 复用同一 run，不产生 version=3', async () => {
    const harness = createHarness();
    const created = await readJson(await harness.createMatch({ idempotencyKey: 'create-2' }));
    const reportId = created.reportId as string;
    const first = await readJson(await updateReport(harness, reportId, { idempotencyKey: 'update-same' }));
    const second = await readJson(await updateReport(harness, reportId, { idempotencyKey: 'update-same' }));
    assert.strictEqual(second.runId, first.runId);
    const latest = await readJson(await getReport(harness, reportId));
    assert.strictEqual(latest.report.version, 2);
  });

  it('更新非法输入 → 422，且最新版本仍是 v1（旧报告不受影响）', async () => {
    const harness = createHarness();
    const created = await readJson(await harness.createMatch({ idempotencyKey: 'create-3' }));
    const reportId = created.reportId as string;
    const response = await updateReport(harness, reportId, {
      idempotencyKey: 'update-bad',
      profileMutation: (profile) => {
        profile.assessment.status = 'draft';
      },
    });
    assert.strictEqual(response.status, 422);
    assertErrorShape(await readJson(response));
    const latest = await readJson(await getReport(harness, reportId));
    assert.strictEqual(latest.report.version, 1);
  });

  it('更新不存在的报告 → 404', async () => {
    const harness = createHarness();
    const response = await updateReport(harness, 'report-nonexistent', { idempotencyKey: 'update-404' });
    assert.strictEqual(response.status, 404);
  });
});

describe('P2 API｜GET /api/c/reports/:id/export?format=md（同快照导出与转义）', () => {
  it('导出包含动作/五维/约束/问题；两次导出逐字节一致；Content-Type 为 text/markdown', async () => {
    const harness = createHarness();
    const created = await readJson(await harness.createMatch({ idempotencyKey: 'export-1' }));
    const reportId = created.reportId as string;
    const first = await exportReport(harness, reportId);
    assert.strictEqual(first.status, 200);
    assert.strictEqual(first.headers.get('content-type'), 'text/markdown; charset=utf-8');
    const text = await first.text();
    assert.ok(text.includes('# 求职 X-Ray｜C 匹配报告'));
    assert.ok(text.includes('**deprioritize**'));
    assert.ok(text.includes('accept_sales_kpi：**fail**'));
    for (const dimension of ['identity_credit', 'business', 'role_clarity', 'career_value', 'personal_fit']) {
      assert.ok(text.includes(dimension));
    }
    assert.ok(text.includes('未运行模型'));
    const second = await exportReport(harness, reportId);
    assert.strictEqual(await second.text(), text);
  });

  it('恶意/结构化用户内容被转义：HTML、行首标记、代码栅栏不进入输出结构', async () => {
    const harness = createHarness();
    const created = await readJson(
      await harness.createMatch({
        idempotencyKey: 'export-xss',
        bundleMutation: (bundle) => {
          // 证据片段进入导出附录；标题进入候选标题行（转义必须覆盖两者）。
          bundle.evidence[0].excerpt = '<script>alert(1)</script>\n# 伪造标题\n```bash\nrm -rf /\n```\n![img](javascript:alert(1)) **加粗伪造** > 引用伪造';
          bundle.jobs[0].title = '产品运营 <b>加粗</b>';
        },
      }),
    );
    const reportId = created.reportId as string;
    const response = await exportReport(harness, reportId);
    assert.strictEqual(response.status, 200);
    const text = await response.text();
    assert.ok(!text.includes('<script>'), '脚本标签必须被转义');
    assert.ok(text.includes('&lt;script&gt;'));
    assert.ok(!text.includes('\n# 伪造标题'), '用户内容不得生成一级标题');
    assert.ok(text.includes('\\# 伪造标题'));
    assert.ok(!text.includes('```bash'), '代码栅栏不得进入输出');
    // 链接语法两侧括号均被转义：CommonMark 不解析为链接，伪协议成为纯文本。
    assert.ok(text.includes('\\[img\\](javascript:alert(1))'));
    assert.ok(text.includes('&lt;b&gt;'));
  });

  it('不支持的导出格式 → 422 UNSUPPORTED_FORMAT', async () => {
    const harness = createHarness();
    const created = await readJson(await harness.createMatch({ idempotencyKey: 'export-fmt' }));
    // P3 起 json 为受支持格式（私有复现包）；此处用真正不支持的格式验证。
    const response = await exportReport(harness, created.reportId as string, undefined, 'docx');
    assert.strictEqual(response.status, 422);
    const body = await readJson(response);
    assert.strictEqual(body.error.code, 'UNSUPPORTED_FORMAT');
  });
});
