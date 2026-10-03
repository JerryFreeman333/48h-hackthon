/**
 * P3 视图模型测试（规格 §9/§15）：首屏、五维、比较、未知、证据的展示决策。
 * 关键验收：unknown 不当 0、不画绿；比较视图无冠军排名；同快照一致。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runMatchPipeline, FIXED_GENERATED_AT, FIXED_REPORT_ID, loadDemoInputs, clone } from './helpers.js';
import { buildReportViewModel, type ReportViewModel } from '../ui/report-view-model.js';
import type { StoredReportSnapshot } from '../application/ports.js';

function run() {
  const inputs = loadDemoInputs();
  return runMatchPipeline({
    profile: clone(inputs.profile),
    intentContext: clone(inputs.intent),
    bundle: clone(inputs.bundle),
    options: { reportId: FIXED_REPORT_ID, generatedAt: FIXED_GENERATED_AT },
  });
}

function storedOf(snapshot: Extract<ReturnType<typeof run>, { ok: true }>['snapshot']): StoredReportSnapshot {
  // pipeline.snapshot 与 StoredReportSnapshot.snapshot 工件形状一致（含 report）。
  return {
    report: snapshot.report,
    snapshot,
    ownerId: 'user-demo-1',
    projectId: 'project-demo-1',
    runId: 'run-test',
    createdAt: snapshot.generatedAt,
  };
}

function demoViewModel(angle?: string | null): { vm: ReportViewModel; snapshot: StoredReportSnapshot } {
  const result = run();
  if (!result.ok) throw new Error('pipeline failed');
  const stored = storedOf(result.snapshot);
  return { vm: buildReportViewModel({ report: result.report, snapshot: stored, comparisonAngle: angle ?? null }), snapshot: stored };
}

describe('P3 首屏（动作/≤3 理由/首要问题/覆盖摘要）', () => {
  it('建议动作取首个候选，附语义说明', () => {
    const { vm } = demoViewModel();
    assert.strictEqual(vm.summary.hasResults, true);
    assert.strictEqual(vm.summary.action?.jobId, 'job-demo-1');
    assert.strictEqual(vm.summary.action?.recommendation, 'deprioritize');
    assert.match(vm.summary.action?.actionNote ?? '', /软偏好不能抵消硬冲突/);
  });

  it('首屏关键理由最多 3 条，剩余条数有提示', () => {
    const { vm } = demoViewModel();
    assert.ok(vm.summary.keyReasons.length <= 3);
    assert.strictEqual(vm.summary.keyReasons.length, 3);
    assert.strictEqual(vm.summary.moreReasonCount, (vm.candidates[0]?.reasons.length ?? 0) - 3);
  });

  it('首要核验问题优先取 must', () => {
    const { vm } = demoViewModel();
    const first = vm.candidates[0];
    assert.strictEqual(first?.questions[0]?.priority, 'must');
    assert.strictEqual(vm.summary.primaryQuestion?.text, first?.questions[0]?.text);
  });

  it('覆盖摘要包含关键主题缺口与覆盖行，未决主题有标签', () => {
    const { vm } = demoViewModel();
    assert.deepStrictEqual(
      vm.summary.coverage.keyTopicGaps.map((gap) => gap.topic),
      ['salary_income_assessability', 'current_real_vacancy', 'business_financials'],
    );
    assert.ok(vm.summary.coverage.rows.length > 0);
    const financials = vm.summary.coverage.rows.find((row) => row.topic === 'business_financials');
    assert.strictEqual(financials?.statusLabel, '未接入');
    // 不把 partial 说成完整。
    assert.strictEqual(vm.meta.completeness, 'partial');
    assert.strictEqual(vm.summary.coverage.completenessLabel, '部分资料');
  });
});

describe('P3 五维与未知（unknown 不画绿、双通道）', () => {
  it('每个候选恰好五维各一次，全部带文字标签', () => {
    const { vm } = demoViewModel();
    const dimensions = vm.candidates[0]?.dimensions ?? [];
    assert.strictEqual(dimensions.length, 5);
    assert.strictEqual(new Set(dimensions.map((d) => d.key)).size, 5);
    for (const dimension of dimensions) {
      assert.ok(dimension.statusLabel.length > 0);
      assert.ok(dimension.summary.includes('【证据】'));
    }
  });

  it('unknown 维度保留 unknown 且标签为「未知」，不产生绿色语义', () => {
    const { vm } = demoViewModel();
    const unknowns = (vm.candidates[0]?.dimensions ?? []).filter((d) => d.status === 'unknown');
    assert.strictEqual(unknowns.length, 3);
    for (const dimension of unknowns) {
      assert.strictEqual(dimension.statusLabel, '未知');
    }
    const role = vm.candidates[0]?.dimensions.find((d) => d.key === 'role_clarity');
    assert.strictEqual(role?.status, 'supported');
    assert.ok(role?.summary.includes('不等于满足个人需求'));
  });

  it('关键未知清单来自结构化数据（约束/维度/覆盖），逐项有来源', () => {
    const { vm } = demoViewModel();
    const unknowns = vm.candidates[0]?.unknowns ?? [];
    const sources = new Set(unknowns.map((item) => item.source));
    assert.ok(sources.has('dimension'));
    assert.ok(sources.has('coverage'));
    // coverage 来源：business_financials 未接入进入未知清单。
    const coverageGap = unknowns.find((item) => item.source === 'coverage');
    assert.strictEqual(coverageGap?.key, 'business_financials');
    assert.ok(unknowns.every((item) => item.detail.length > 0));
  });

  it('薪资显示保留口径未知（total 不冒充固定底薪，null 不当 0）', () => {
    const { vm } = demoViewModel();
    assert.match(vm.candidates[0]?.salaryText ?? '', /total/);
    assert.match(vm.candidates[0]?.salaryText ?? '', /非固定底薪/);
  });
});

describe('P3 比较视图（同维度横向、无冠军排名）', () => {
  it('行=五维（可聚焦角度置前），列=候选且保持快照原始顺序', () => {
    const { vm } = demoViewModel('role_clarity');
    assert.strictEqual(vm.comparison.focusedKey, 'role_clarity');
    assert.strictEqual(vm.comparison.rows[0]?.key, 'role_clarity');
    assert.strictEqual(vm.comparison.rows.length, 5);
    assert.strictEqual(vm.comparison.columns[0]?.jobId, 'job-demo-1');
    // 除聚焦行外保持公共五维顺序。
    assert.deepStrictEqual(
      vm.comparison.rows.slice(1).map((row) => row.key),
      ['identity_credit', 'business', 'career_value', 'personal_fit'],
    );
  });

  it('非法角度回退中性视图', () => {
    const { vm } = demoViewModel('not_a_dimension');
    assert.strictEqual(vm.comparison.focusedKey, null);
    assert.deepStrictEqual(
      vm.comparison.rows.map((row) => row.key),
      ['identity_credit', 'business', 'role_clarity', 'career_value', 'personal_fit'],
    );
  });

  it('unknown 单元格渲染「未知」，ViewModel 无任何排名/分数字段', () => {
    const { vm } = demoViewModel();
    for (const row of vm.comparison.rows) {
      for (const cell of row.cells) {
        if (cell.status === 'unknown') {
          assert.strictEqual(cell.statusLabel, '未知');
        }
      }
    }
    const serialized = JSON.stringify(vm.comparison);
    assert.ok(!serialized.includes('score'));
    assert.ok(!serialized.includes('rank'));
    assert.ok(!serialized.includes('champion'));
    assert.match(vm.comparison.note, /不产生排名、冠军或综合分/);
  });

  it('多候选报告列数随 results 增长且顺序不变', () => {
    const inputs = loadDemoInputs();
    const bundle = clone(inputs.bundle);
    const second = clone(bundle.jobs[0]);
    second.jobId = 'job-demo-2';
    bundle.jobs.push(second);
    const result = runMatchPipeline({
      profile: clone(inputs.profile),
      intentContext: clone(inputs.intent),
      bundle,
      options: { reportId: 'report-p3-multi', generatedAt: FIXED_GENERATED_AT },
    });
    if (!result.ok) throw new Error('pipeline failed');
    const vm = buildReportViewModel({ report: result.report, snapshot: storedOf(result.snapshot) });
    assert.strictEqual(vm.comparison.columns.length, 2);
    assert.deepStrictEqual(vm.comparison.columns.map((column) => column.jobId), ['job-demo-1', 'job-demo-2']);
    assert.strictEqual(vm.comparison.rows.length, 5);
    assert.ok(vm.comparison.rows.every((row) => row.cells.length === 2));
  });
});

describe('P3 证据与同快照一致性', () => {
  it('候选证据抽屉与 evidenceSnapshot 同源；无 URL 不造链接字段', () => {
    const { vm, snapshot } = demoViewModel();
    const candidate = vm.candidates[0];
    assert.deepStrictEqual(
      (candidate?.evidence ?? []).map((item) => item.evidenceId),
      snapshot.report.evidenceSnapshot.map((item) => item.evidenceId),
    );
    const item = candidate?.evidence[0];
    assert.strictEqual(item?.url, null);
    assert.match(item?.sourceType ?? '', /\S/);
    assert.strictEqual(item?.verificationLabel, '已核验');
  });

  it('profile 摘要只含 confirmed 且 hard 的偏好', () => {
    const { vm } = demoViewModel();
    assert.strictEqual(vm.profile?.hardPrefs.length, 1);
    assert.strictEqual(vm.profile?.hardPrefs[0]?.key, 'accept_sales_kpi');
    assert.strictEqual(vm.profile?.hardPrefs[0]?.valueText, 'false');
  });

  it('meta 携带未运行模型标记（模板语义不得冒充 AI）', () => {
    const { vm } = demoViewModel();
    assert.strictEqual(vm.meta.promptVersion, 'template-no-model-p1.0.0');
    assert.match(vm.meta.modelNote, /未运行任何模型/);
  });

  it('空候选：insufficient 空状态，不伪造岗位', () => {
    const inputs = loadDemoInputs();
    const bundle = clone(inputs.bundle);
    bundle.jobs = [];
    bundle.facts = [];
    bundle.evidence = [];
    bundle.coverage = [];
    const result = runMatchPipeline({
      profile: clone(inputs.profile),
      intentContext: clone(inputs.intent),
      bundle,
      options: { reportId: 'report-p3-empty', generatedAt: FIXED_GENERATED_AT },
    });
    if (!result.ok) throw new Error('pipeline failed');
    const vm = buildReportViewModel({ report: result.report, snapshot: null });
    assert.strictEqual(vm.summary.hasResults, false);
    assert.strictEqual(vm.candidates.length, 0);
    assert.match(vm.summary.emptyNote ?? '', /请补充候选/);
  });
});
