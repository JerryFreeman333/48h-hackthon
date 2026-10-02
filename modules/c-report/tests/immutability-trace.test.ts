import { describe, expect, it } from 'vitest';
import { runMatchPipeline, FIXED_GENERATED_AT, FIXED_REPORT_ID, loadDemoInputs, clone, deepFreeze } from './helpers.js';

describe('不可变性与追溯（P1 要求 6 / 规格 §7.4/§12）', () => {
  it('深度冻结输入后管线正常运行（不改写输入对象）', () => {
    const inputs = loadDemoInputs();
    const result = runMatchPipeline({
      profile: deepFreeze(clone(inputs.profile)),
      intentContext: deepFreeze(clone(inputs.intent)),
      bundle: deepFreeze(clone(inputs.bundle)),
      options: { reportId: FIXED_REPORT_ID, generatedAt: FIXED_GENERATED_AT },
    });
    expect(result.ok).toBe(true);
  });

  it('DecisionTrace 记录 profilePath 与规则 ID，且不出现在公共 MatchReport', () => {
    const inputs = loadDemoInputs();
    const result = runMatchPipeline({
      profile: clone(inputs.profile),
      intentContext: clone(inputs.intent),
      bundle: clone(inputs.bundle),
      options: { reportId: FIXED_REPORT_ID, generatedAt: FIXED_GENERATED_AT },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const trace = result.snapshot.decisionTraces[0];
    expect(trace?.constraints[0]?.profilePath).toBe('preferences[0].key=accept_sales_kpi');
    expect(trace?.constraints[0]?.ruleId).toBe('c.constraint.accept_sales_kpi.v1');
    expect(trace?.constraints[0]?.jobFactIds).toEqual(['fact-demo-1']);
    expect(trace?.action.recommendation).toBe('deprioritize');
    // trace 是 C 私有结构，公共 MatchReport 不含 profilePath。
    expect(JSON.stringify(result.report)).not.toContain('profilePath');
    expect(JSON.stringify(result.report)).not.toContain('preferences[0]');
  });

  it('私有快照可复现：包含完整输入、范围、哈希与阶段记录', () => {
    const inputs = loadDemoInputs();
    const result = runMatchPipeline({
      profile: clone(inputs.profile),
      intentContext: clone(inputs.intent),
      bundle: clone(inputs.bundle),
      options: { reportId: FIXED_REPORT_ID, generatedAt: FIXED_GENERATED_AT },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const snapshot = result.snapshot;
    expect(snapshot.artifactType).toBe('c_private_report_snapshot_v1');
    expect(snapshot.inputHashes.profile).toMatch(/^[0-9a-f]{64}$/);
    expect(snapshot.inputHashes.bundle).toMatch(/^[0-9a-f]{64}$/);
    expect(snapshot.scope.candidateJobIds).toEqual(['job-demo-1']);
    expect(snapshot.scope.confirmedHardConstraintKeys).toEqual(['accept_sales_kpi']);
    const stageNames = snapshot.diagnostics.stages.map((s) => s.stage);
    for (const required of snapshot.scope.requiredStages) {
      expect(stageNames).toContain(required);
    }
  });

  it('intent.filters 的 hard 项不自动新增为用户硬约束', () => {
    const inputs = loadDemoInputs();
    const intent = clone(inputs.intent);
    intent.filters.push({ key: 'accept_travel', value: false, strength: 'hard' });
    const result = runMatchPipeline({
      profile: clone(inputs.profile),
      intentContext: intent,
      bundle: clone(inputs.bundle),
      options: { reportId: FIXED_REPORT_ID, generatedAt: FIXED_GENERATED_AT },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 用户画像没有 accept_travel 硬偏好 → 不出现对应约束条目。
    expect(result.report.results[0]?.constraints.some((c) => c.key === 'accept_travel')).toBe(false);
    const skipped = result.snapshot.diagnostics.stages.filter(
      (s) => s.status === 'skipped' && s.detail?.includes('accept_travel'),
    );
    expect(skipped.length).toBe(1);
  });
});
