import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ACTION_PRIORITY, HOLD_RULES } from '../domain/recommendation.js';
import { runMatchPipeline, FIXED_GENERATED_AT, FIXED_REPORT_ID, loadDemoInputs, clone } from './helpers.js';
import type { CandidateBundle, SearchIntent, UserProfile } from '../domain/contract.js';

function runWith(mutate: (inputs: { profile: UserProfile; intent: SearchIntent; bundle: CandidateBundle }) => void) {
  const inputs = loadDemoInputs();
  const profile = clone(inputs.profile);
  const intent = clone(inputs.intent);
  const bundle = clone(inputs.bundle);
  mutate({ profile, intent, bundle });
  return runMatchPipeline({
    profile,
    intentContext: intent,
    bundle,
    options: { reportId: FIXED_REPORT_ID, generatedAt: FIXED_GENERATED_AT },
  });
}

describe('动作优先级（规格 §8）', () => {
  it('优先级常量顺序正确', () => {
    assert.deepStrictEqual(ACTION_PRIORITY, ['insufficient', 'hold', 'deprioritize', 'verify_first', 'explore']);
  });

  it('hold 规则表 1.0.0 为空：可疑文本不自动触发 hold（无已协调命题）', () => {
    assert.strictEqual((HOLD_RULES).length, 0);
    const result = runWith(({ bundle }) => {
      bundle.jobs[0]!.rawJd = '入职需先向私人账户支付押金，完后退还。';
    });
    assert.strictEqual(result.ok, true);
    if (!result.ok) return;
    const action = result.report.results[0]?.recommendation;
    assert.notStrictEqual(action, 'hold');
    assert.strictEqual(action, 'deprioritize'); // 硬冲突仍由确定性规则得出
  });

  it('deprioritize 保留多原因：事实 + 推断 + 未知共存', () => {
    const result = runWith(() => {});
    if (!result.ok) throw new Error('pipeline failed');
    const first = result.report.results[0];
    assert.strictEqual(first?.recommendation, 'deprioritize');
    const kinds = new Set(first?.reasons.map((r) => r.kind));
    assert.strictEqual(kinds.has('fact'), true);
    assert.strictEqual(kinds.has('inference'), true);
    assert.strictEqual(kinds.has('unknown'), true);
  });

  it('已确认硬约束关键条件未核验 → verify_first（高于 explore）', () => {
    // 用户拒绝销售KPI，但岗位事实状态是 unknown（非 supported）。
    const result = runWith(({ bundle }) => {
      bundle.facts[0]!.status = 'unknown';
    });
    assert.strictEqual(result.ok, true);
    if (!result.ok) return;
    assert.strictEqual(result.report.results[0]?.recommendation, 'verify_first');
  });

  it('主体未确认 → verify_first', () => {
    const result = runWith(({ bundle }) => {
      bundle.companies[0]!.identityStatus = 'ambiguous';
      bundle.facts[0]!.value = false; // 消除硬冲突，隔离主体变量
    });
    assert.strictEqual(result.ok, true);
    if (!result.ok) return;
    assert.strictEqual(result.report.results[0]?.recommendation, 'verify_first');
    assert.strictEqual(result.report.results[0]?.reasons.some((r) => r.text.includes('主体未确认')), true);
  });

  it('job.companyId=null 主体未定位 → verify_first，不自动绑定第一个公司', () => {
    const result = runWith(({ bundle }) => {
      bundle.jobs[0]!.companyId = null;
      bundle.facts[0]!.value = false;
    });
    assert.strictEqual(result.ok, true);
    if (!result.ok) return;
    assert.strictEqual(result.report.results[0]?.recommendation, 'verify_first');
    assert.strictEqual(result.report.results[0]?.reasons.some((r) => r.text.includes('主体未定位')), true);
  });

  it('本人接受一项条件，不等于存在岗位侧正向适配依据', () => {
    const result = runWith(({ profile }) => {
      profile.preferences[0]!.value = true;
    });
    assert.strictEqual(result.ok, true);
    if (!result.ok) return;
    assert.strictEqual(result.report.results[0]?.recommendation, 'verify_first');
  });

  it('有材料但无正向依据 → verify_first（不轻易 explore，C-10 本地预案）', () => {
    // 移除硬约束偏好（无 pass/fail），岗位事实不构成正向适配依据。
    const result = runWith(({ profile }) => {
      profile.preferences = [];
    });
    assert.strictEqual(result.ok, true);
    if (!result.ok) return;
    assert.strictEqual(result.report.results[0]?.recommendation, 'verify_first');
    assert.strictEqual(result.report.results[0]?.reasons.some((r) => r.text.includes('缺少正向适配依据')), true);
  });

  it('岗位无任何事实/证据 → insufficient', () => {
    const result = runWith(({ bundle }) => {
      bundle.facts = [];
      bundle.evidence = [];
    });
    assert.strictEqual(result.ok, true);
    if (!result.ok) return;
    assert.strictEqual(result.report.results[0]?.recommendation, 'insufficient');
    assert.ok((result.report.results[0]?.reasons[0]?.text).includes('没有任何事实或证据'));
  });

  it('空候选：results=[] 且不伪造 jobId；私有 diagnostics 携带 insufficient 说明', () => {
    const result = runWith(({ bundle }) => {
      bundle.jobs = [];
      bundle.facts = [];
      bundle.evidence = [];
      bundle.coverage = [];
    });
    assert.strictEqual(result.ok, true);
    if (!result.ok) return;
    assert.deepStrictEqual(result.report.results, []);
    assert.strictEqual(result.report.completeness, 'partial');
    assert.notStrictEqual(result.snapshot.diagnostics.insufficientNote, null);
    assert.ok(result.snapshot.diagnostics.insufficientNote?.includes('没有候选岗位'));
    // 公共 MatchReport 不私加顶层 recommendation/message 字段。
    assert.ok(!(Object.keys(result.report)).includes('recommendation'));
    assert.ok(!(Object.keys(result.report)).includes('message'));
  });
});

describe('同一事实对不同用户解释不同，但事实本身不变（产品原则 10）', () => {
  it('同一 bundle：拒绝销售者 fail / 接受销售者 pass，factsSnapshot 逐值一致', () => {
    const rejecting = runWith(({ profile }) => {
      profile.preferences[0]!.value = false;
    });
    const accepting = runWith(({ profile }) => {
      profile.preferences[0]!.value = true;
    });
    if (!rejecting.ok || !accepting.ok) throw new Error('pipeline failed');
    assert.strictEqual(rejecting.report.results[0]?.constraints[0]?.result, 'fail');
    assert.strictEqual(accepting.report.results[0]?.constraints[0]?.result, 'pass');
    assert.deepStrictEqual(accepting.report.factsSnapshot, rejecting.report.factsSnapshot);
    assert.deepStrictEqual(accepting.report.evidenceSnapshot, rejecting.report.evidenceSnapshot);
  });
});

describe('岗位模板使用当前材料，不携带演示岗位职责', () => {
  it('仓储岗位与物流目标不会产生产品反馈职责或产品成长声称', () => {
    const result = runWith(({ profile, bundle }) => {
      profile.goals = ['积累仓储与物流管理技能'];
      profile.background.experiences = [];
      bundle.jobs[0]!.title = '仓库管理员';
      bundle.jobs[0]!.rawJd = '负责入库、盘点、出库及库存记录。';
      bundle.evidence[0]!.excerpt = '负责入库、盘点、出库及库存记录。';
      bundle.facts = [];
    });
    assert.strictEqual(result.ok, true);
    if (!result.ok) return;
    const first = result.report.results[0]!;
    const career = first.dimensions.find((dimension) => dimension.key === 'career_value')!;
    assert.strictEqual(career.status, 'unknown');
    assert.ok(career.summary.includes('积累仓储与物流管理技能'));
    assert.ok(career.summary.includes('仓库管理员'));
    assert.ok(career.summary.includes('尚未核验'));
    assert.ok(!career.summary.includes('产品反馈'));
    assert.ok(!career.summary.includes('产品设计'));
    assert.ok(!career.summary.includes('产品交付'));
    assert.ok(first.questions.some((question) => question.text.includes('仓库管理员')));
    assert.ok(first.questions.every((question) => !question.text.includes('产品反馈')));
  });
});
