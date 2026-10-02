import { describe, expect, it } from 'vitest';
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

function expectError(result: ReturnType<typeof runMatchPipeline>, code: string) {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error(`expected error ${code}, got ok`);
  expect(result.error.code).toBe(code);
}

describe('输入结构校验（规格 §3.1/§4）', () => {
  it('schemaVersion 非 1.0.0 拒绝且不静默迁移', () => {
    expectError(
      runWith(({ profile }) => {
        (profile as { schemaVersion: string }).schemaVersion = '1.0.1';
      }),
      'SCHEMA_VERSION_UNSUPPORTED',
    );
  });

  it('nullable 字段空字符串冒充未知被拒绝', () => {
    expectError(
      runWith(({ bundle }) => {
        bundle.jobs[0]!.city = '';
      }),
      'INPUT_STRUCT_INVALID',
    );
  });

  it('薪资区间 min>max 被拒绝', () => {
    expectError(
      runWith(({ bundle }) => {
        bundle.jobs[0]!.salary.min = 20000;
        bundle.jobs[0]!.salary.max = 10000;
      }),
      'INPUT_STRUCT_INVALID',
    );
  });

  it('非有限数字（NaN）被拒绝', () => {
    const inputs = loadDemoInputs();
    const bundle = clone(inputs.bundle);
    (bundle.facts[0] as { value: number }).value = Number.NaN;
    const result = runMatchPipeline({
      profile: clone(inputs.profile),
      intentContext: clone(inputs.intent),
      bundle,
      options: { reportId: FIXED_REPORT_ID, generatedAt: FIXED_GENERATED_AT },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INPUT_STRUCT_INVALID');
    }
  });

  it('未知字段（字段漂移）响亮失败', () => {
    expectError(
      runWith(({ bundle }) => {
        (bundle.jobs[0] as unknown as Record<string, unknown>)['vacancyStatusProvenance'] = 'made-up';
      }),
      'INPUT_STRUCT_INVALID',
    );
  });
});

describe('绑定校验（规格 §3.2–3.8）', () => {
  it('画像未确认拒绝生成报告', () => {
    expectError(
      runWith(({ profile }) => {
        profile.confirmedAt = null;
      }),
      'PROFILE_NOT_CONFIRMED',
    );
    expectError(
      runWith(({ profile }) => {
        profile.assessment.status = 'draft';
      }),
      'PROFILE_NOT_CONFIRMED',
    );
  });

  it('projectId 不一致拒绝', () => {
    expectError(
      runWith(({ bundle }) => {
        bundle.projectId = 'project-other';
      }),
      'BINDING_MISMATCH',
    );
  });

  it('profileId 不一致拒绝（同 revision 不同画像不得匹配）', () => {
    expectError(
      runWith(({ intent }) => {
        intent.profileId = 'profile-other';
      }),
      'BINDING_MISMATCH',
    );
  });

  it('profileRevision 不一致拒绝（旧意向/旧画像）', () => {
    expectError(
      runWith(({ intent }) => {
        intent.profileRevision = 2;
      }),
      'BINDING_MISMATCH',
    );
  });

  it('bundle.intentId 不一致拒绝（候选属于其他意向）', () => {
    expectError(
      runWith(({ bundle }) => {
        bundle.intentId = 'intent-other';
      }),
      'BINDING_MISMATCH',
    );
  });

  it('bundle.intentRevision 不一致拒绝（候选属于旧意向）', () => {
    expectError(
      runWith(({ bundle }) => {
        bundle.intentRevision = 2;
      }),
      'BINDING_MISMATCH',
    );
  });

  it('mode 三对象不一致拒绝', () => {
    expectError(
      runWith(({ bundle }) => {
        bundle.mode = 'live';
      }),
      'MODE_CONFLICT',
    );
  });

  it('证据 mode 与 bundle.mode 隐形混用拒绝', () => {
    expectError(
      runWith(({ bundle }) => {
        bundle.evidence[0]!.mode = 'live';
      }),
      'MODE_CONFLICT',
    );
  });
});

describe('引用与主体范围（规格 §3.10/§5）', () => {
  it('重复 ID 拒绝', () => {
    expectError(
      runWith(({ bundle }) => {
        bundle.jobs.push(clone(bundle.jobs[0]!));
      }),
      'DUPLICATE_ID',
    );
  });

  it('事实引用不存在的证据拒绝', () => {
    expectError(
      runWith(({ bundle }) => {
        bundle.facts[0]!.evidenceIds = ['missing-evidence'];
      }),
      'REFERENCE_MISSING',
    );
  });

  it('事实没有任何证据引用拒绝', () => {
    expectError(
      runWith(({ bundle }) => {
        bundle.facts[0]!.evidenceIds = [];
      }),
      'REFERENCE_MISSING',
    );
  });

  it('跨主体引用拒绝（法人证据不得转给另一法人）', () => {
    expectError(
      runWith(({ bundle }) => {
        bundle.facts[0]!.companyId = 'company-other';
      }),
      'SCOPE_MISMATCH',
    );
  });

  it('事实主体与岗位所属主体不一致拒绝', () => {
    expectError(
      runWith(({ bundle }) => {
        bundle.jobs[0]!.companyId = 'company-other';
        bundle.companies.push({
          companyId: 'company-other',
          legalName: '另一家公司',
          creditCode: null,
          brandName: null,
          identityStatus: 'confirmed',
        });
      }),
      'SCOPE_MISMATCH',
    );
  });

  it('岗位引用不存在的公司拒绝', () => {
    expectError(
      runWith(({ bundle }) => {
        bundle.jobs[0]!.companyId = 'missing-company';
      }),
      'REFERENCE_MISSING',
    );
  });

  it('证据引用不存在的岗位拒绝', () => {
    expectError(
      runWith(({ bundle }) => {
        bundle.evidence[0]!.jobId = 'missing-job';
      }),
      'REFERENCE_MISSING',
    );
  });

  it('覆盖记录引用不存在的公司拒绝', () => {
    expectError(
      runWith(({ bundle }) => {
        bundle.coverage[0]!.companyId = 'missing-company';
      }),
      'REFERENCE_MISSING',
    );
  });
});
