/**
 * P2 独立演示：五个 API handler + 显式内存 fake runtime 的端到端走查。
 * 网络关闭、无模型、无外部服务；仅使用公共合成 fixtures。
 *
 * 展示：创建（202）→ 查询 run → 读取报告 → 导出 MD → 幂等复用 →
 *       幂等冲突（409）→ 未登录（401）→ 越权（404 不泄露存在性）→
 *       更新产生新版本且旧版本不变 → 非法输入 422。
 *
 * 退出码：全部符合预期 = 0；否则 1。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  createHarness,
  getRun,
  getReport,
  exportReport,
  updateReport,
  readJson,
  DEMO_TOKEN,
  OTHER_TOKEN,
} from '../tests/api-harness.js';
import { matchReportSchema } from '../domain/schema.js';

const moduleRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixturesDir = join(moduleRoot, 'fixtures');
function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf8'));
}
void readFixture;

type Check = { name: string; pass: boolean; detail: string };
const checks: Check[] = [];
function check(name: string, pass: boolean, detail: string): void {
  checks.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  —— ${detail}`);
}

async function main(): Promise<void> {
  const harness = createHarness();

  // 1) 创建（202）
  const createResponse = await harness.createMatch({ idempotencyKey: 'demo-key-1' });
  const created = await readJson(createResponse);
  check('POST /api/c/matches → 202', createResponse.status === 202, `status=${String(createResponse.status)} runId=${created.runId}`);
  check('run 状态 = partial（demo 关键主题有缺口）', created.status === 'partial', `status=${String(created.status)}`);

  // 2) 查询 run
  const runResponse = await getRun(harness, created.runId);
  const run = await readJson(runResponse);
  check('GET /api/c/runs/:id → 200', runResponse.status === 200, `status=${String(run.status)} stage=${run.stage}`);

  // 3) 读取报告
  const reportResponse = await getReport(harness, created.reportId);
  const reportBody = await readJson(reportResponse);
  const parsed = matchReportSchema.safeParse(reportBody.report);
  check('GET /api/c/reports/:id → 公共 MatchReport 通过 schema 自检', parsed.success && reportResponse.status === 200,
    `recommendation=${String(reportBody.report.results[0]?.recommendation)} completeness=${String(reportBody.report.completeness)}`);

  // 4) 导出 MD（两次一致）
  const export1 = await exportReport(harness, created.reportId);
  const export2 = await exportReport(harness, created.reportId);
  const md = await export1.text();
  check('GET export?format=md → 200 且两次逐字节一致', export1.status === 200 && (await export2.text()) === md,
    `content-type=${String(export1.headers.get('content-type'))} bytes=${String(md.length)}`);
  check('MD 无模型标记', md.includes('未运行模型'), 'promptVersion/template 标记在导出中');

  // 5) 幂等复用
  const reused = await readJson(await harness.createMatch({ idempotencyKey: 'demo-key-1' }));
  check('同键同输入 → 复用同一 run', reused.runId === created.runId, `runId 一致=${String(reused.runId === created.runId)}`);

  // 6) 幂等冲突
  const conflict = await harness.createMatch({ idempotencyKey: 'demo-key-1', profileMutation: (profile) => { profile.goals = ['另一目标']; } });
  check('同键不同输入 → 409', conflict.status === 409, `code=${String((await readJson(conflict)).error.code)}`);

  // 7) 未登录
  const anonymous = await harness.createMatch({ idempotencyKey: 'demo-key-2', omitToken: true });
  check('无凭据 → 401', anonymous.status === 401, `code=${String((await readJson(anonymous)).error.code)}`);

  // 8) 越权读取（404 不泄露存在性）
  const forbiddenReport = await getReport(harness, created.reportId, OTHER_TOKEN);
  const forbiddenExport = await exportReport(harness, created.reportId, OTHER_TOKEN);
  const forbiddenRun = await getRun(harness, created.runId, OTHER_TOKEN);
  check('他人按 ID 读取 → 404（不泄露存在性）',
    forbiddenReport.status === 404 && forbiddenExport.status === 404 && forbiddenRun.status === 404,
    `report=${String(forbiddenReport.status)} export=${String(forbiddenExport.status)} run=${String(forbiddenRun.status)}`);

  // 9) 越权更新（按项目寻址 → 403）
  const forbiddenUpdate = await updateReport(harness, created.reportId, { token: OTHER_TOKEN, idempotencyKey: 'other-update' });
  check('他人更新 → 403', forbiddenUpdate.status === 403, `code=${String((await readJson(forbiddenUpdate)).error.code)}`);

  // 10) 更新产生新版本且旧版本不变
  const v1Before = await harness.stores.reportVersions.read('project-demo-1', `${created.reportId}:v1`);
  const updated = await readJson(await updateReport(harness, created.reportId, {
    idempotencyKey: 'demo-update-1',
    bundleMutation: (bundle) => {
      const job = JSON.parse(JSON.stringify(bundle.jobs[0]));
      job.jobId = 'job-demo-2';
      bundle.jobs.push(job);
    },
  }));
  const v1After = await harness.stores.reportVersions.read('project-demo-1', `${created.reportId}:v1`);
  const latest = await readJson(await getReport(harness, created.reportId));
  check('更新 → 新版本 v2', updated.version === 2, `version=${String(updated.version)}`);
  check('v1 版本记录逐字节不变', JSON.stringify(v1After) === JSON.stringify(v1Before), `v1 不变=${String(JSON.stringify(v1After) === JSON.stringify(v1Before))}`);
  check('最新报告包含两个候选', latest.report.results.length === 2, `results=${String(latest.report.results.length)}`);

  // 11) 非法输入 422 且不落 run
  const invalid = await harness.createMatch({
    idempotencyKey: 'demo-invalid',
    profileMutation: (profile) => {
      profile.confirmedAt = null;
    },
  });
  check('未确认画像 → 422', invalid.status === 422, `code=${String((await readJson(invalid)).error.code)}`);

  let failed = 0;
  for (const item of checks) {
    if (!item.pass) {
      failed += 1;
    }
  }
  console.log(`\n共 ${String(checks.length)} 项，通过 ${String(checks.length - failed)}，失败 ${String(failed)}。`);
  console.log('说明：本演示运行在显式内存 fake runtime 上（非生产）；鉴权为 fake Bearer token；进程退出即数据消失。');
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('演示失败：', error);
  process.exit(1);
});
