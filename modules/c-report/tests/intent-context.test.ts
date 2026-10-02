import { describe, expect, it } from 'vitest';
import { runMatchPipeline, FIXED_GENERATED_AT, FIXED_REPORT_ID, loadDemoInputs, clone } from './helpers.js';
import type { CandidateBundle, SearchIntent, UserProfile } from '../domain/contract.js';

function runFullLive(): ReturnType<typeof runMatchPipeline> {
  const inputs = loadDemoInputs();
  const profile = clone(inputs.profile) as UserProfile;
  const intent = clone(inputs.intent);
  const bundle = clone(inputs.bundle) as CandidateBundle;
  profile.mode = 'live';
  intent.mode = 'live';
  bundle.mode = 'live';
  bundle.evidence[0]!.mode = 'live';
  return runMatchPipeline({
    profile,
    intentContext: intent,
    bundle,
    options: { reportId: FIXED_REPORT_ID, generatedAt: FIXED_GENERATED_AT },
  });
}

describe('intentContext 完整绑定策略（规格 §3，登记 C-01）', () => {
  it('完整 SearchIntent 快照：demo 正常运行', () => {
    const inputs = loadDemoInputs();
    const result = runMatchPipeline({
      profile: clone(inputs.profile),
      intentContext: clone(inputs.intent),
      bundle: clone(inputs.bundle),
      options: { reportId: FIXED_REPORT_ID, generatedAt: FIXED_GENERATED_AT },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.diagnostics.intentContextPartial).toBe(false);
  });

  it('部分上下文（仅 intentId/revision/profileRevision）：仅 demo 显式放行并登记', () => {
    const inputs = loadDemoInputs();
    const result = runMatchPipeline({
      profile: clone(inputs.profile),
      intentContext: { intentId: 'intent-demo-1', revision: 1, profileRevision: 1 },
      bundle: clone(inputs.bundle),
      options: { reportId: FIXED_REPORT_ID, generatedAt: FIXED_GENERATED_AT },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.diagnostics.intentContextPartial).toBe(true);
  });

  it('部分上下文 + live 模式拒绝（不得仅凭 revision 生成可信报告）', () => {
    const inputs = loadDemoInputs();
    const profile = clone(inputs.profile);
    const bundle = clone(inputs.bundle);
    profile.mode = 'live';
    bundle.mode = 'live';
    bundle.evidence[0]!.mode = 'live';
    const result = runMatchPipeline({
      profile,
      intentContext: { intentId: 'intent-demo-1', revision: 1, profileRevision: 1 },
      bundle,
      options: { reportId: FIXED_REPORT_ID, generatedAt: FIXED_GENERATED_AT },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INTENT_CONTEXT_INSUFFICIENT');
  });

  it('部分上下文 + manual 模式拒绝', () => {
    const inputs = loadDemoInputs();
    const profile = clone(inputs.profile);
    const bundle = clone(inputs.bundle);
    profile.mode = 'manual';
    bundle.mode = 'manual';
    bundle.evidence[0]!.mode = 'manual';
    const result = runMatchPipeline({
      profile,
      intentContext: { intentId: 'intent-demo-1', revision: 1, profileRevision: 1 },
      bundle,
      options: { reportId: FIXED_REPORT_ID, generatedAt: FIXED_GENERATED_AT },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INTENT_CONTEXT_INSUFFICIENT');
  });

  it('部分上下文缺字段拒绝', () => {
    const inputs = loadDemoInputs();
    const result = runMatchPipeline({
      profile: clone(inputs.profile),
      intentContext: { intentId: 'intent-demo-1', revision: 1 },
      bundle: clone(inputs.bundle),
      options: { reportId: FIXED_REPORT_ID, generatedAt: FIXED_GENERATED_AT },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INTENT_CONTEXT_INSUFFICIENT');
  });

  it('部分上下文与 bundle 意向绑定不一致拒绝', () => {
    const inputs = loadDemoInputs();
    const result = runMatchPipeline({
      profile: clone(inputs.profile),
      intentContext: { intentId: 'intent-other', revision: 1, profileRevision: 1 },
      bundle: clone(inputs.bundle),
      options: { reportId: FIXED_REPORT_ID, generatedAt: FIXED_GENERATED_AT },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('BINDING_MISMATCH');
  });

  it('live 模式 + 完整快照可运行规则核心（所有权校验属 P2 API 层）', () => {
    const result = runFullLive();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.mode).toBe('live');
    // live 数据的语义边界：identity 维度仍保持 unknown（无逐字段来源）。
    const identity = result.report.results[0]?.dimensions.find((d) => d.key === 'identity_credit');
    expect(identity?.status).toBe('unknown');
  });
});
