/**
 * 输入校验：结构（Zod）→ 绑定（§3）→ 引用与主体范围（§5）。
 *
 * 结构非法/未确认画像/绑定缺失/跨主体引用等可定位输入问题一律拒绝，
 * 不生成 insufficient 报告蒙混通过（规格 §4）。本模块不修改输入对象。
 */
import type { CandidateBundle, SearchIntent, UserProfile } from './contract.js';
import { PUBLIC_SCHEMA_VERSION } from './contract.js';
import { cError, type CError } from './errors.js';
import {
  candidateBundleSchema,
  searchIntentSchema,
  userProfileSchema,
} from './schema.js';

export interface ValidatedInputs {
  profile: UserProfile;
  intent: SearchIntent;
  bundle: CandidateBundle;
}

function zodFirstIssue(error: { issues: { path: PropertyKey[]; message: string }[] }): {
  path: string;
  message: string;
} {
  const issue = error.issues[0];
  if (issue === undefined) {
    return { path: '(unknown)', message: '未知结构问题' };
  }
  return {
    path: issue.path.map(String).join('.') || '(root)',
    message: issue.message,
  };
}

/** 阶段1：三个输入对象的 Zod 结构校验。schemaVersion 由 literal(1.0.0) 强制。 */
export function validateStructure(
  profile: unknown,
  intent: unknown,
  bundle: unknown,
): { ok: true } | { ok: false; error: CError } {
  const checks: [string, unknown, { safeParse(data: unknown): { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } } }][] = [
    ['profile', profile, userProfileSchema],
    ['intent', intent, searchIntentSchema],
    ['bundle', bundle, candidateBundleSchema],
  ];
  for (const [name, value, schema] of checks) {
    const parsed = schema.safeParse(value);
    if (!parsed.success && parsed.error) {
      const first = zodFirstIssue(parsed.error);
      const versionProblem =
        typeof value === 'object' &&
        value !== null &&
        'schemaVersion' in value &&
        (value as { schemaVersion?: unknown }).schemaVersion !== PUBLIC_SCHEMA_VERSION;
      return {
        ok: false,
        error: cError(
          versionProblem ? 'SCHEMA_VERSION_UNSUPPORTED' : 'INPUT_STRUCT_INVALID',
          `${name} 结构校验失败：${first.path} ${first.message}`,
          { object: name, path: first.path, issue: first.message },
        ),
      };
    }
  }
  return { ok: true };
}

/** 阶段2：绑定校验（规格 §3 条款 2–8；条款 9 服务器所有权属 P2 API 层）。 */
export function validateBinding(
  profile: UserProfile,
  intent: SearchIntent,
  bundle: CandidateBundle,
): { ok: true } | { ok: false; error: CError } {
  if (profile.confirmedAt === null || profile.assessment.status !== 'confirmed') {
    return {
      ok: false,
      error: cError('PROFILE_NOT_CONFIRMED', '画像未确认：confirmedAt 为空或 assessment.status 不是 confirmed', {
        profileId: profile.profileId,
      }),
    };
  }
  if (profile.projectId !== intent.projectId || profile.projectId !== bundle.projectId) {
    return {
      ok: false,
      error: cError('BINDING_MISMATCH', 'profile/intent/bundle 的 projectId 不一致', {
        profile: profile.projectId,
        intent: intent.projectId,
        bundle: bundle.projectId,
      }),
    };
  }
  if (profile.profileId !== intent.profileId) {
    return {
      ok: false,
      error: cError('BINDING_MISMATCH', 'intent.profileId 与 profile.profileId 不一致', {
        profile: profile.profileId,
        intent: intent.profileId,
      }),
    };
  }
  if (profile.revision !== intent.profileRevision) {
    return {
      ok: false,
      error: cError('BINDING_MISMATCH', 'intent.profileRevision 与 profile.revision 不一致（旧意向或旧画像）', {
        profileRevision: profile.revision,
        intentProfileRevision: intent.profileRevision,
      }),
    };
  }
  if (bundle.intentId !== intent.intentId) {
    return {
      ok: false,
      error: cError('BINDING_MISMATCH', 'bundle.intentId 与 intent.intentId 不一致（候选属于其他意向）', {
        intent: intent.intentId,
        bundle: bundle.intentId,
      }),
    };
  }
  if (bundle.intentRevision !== intent.revision) {
    return {
      ok: false,
      error: cError('BINDING_MISMATCH', 'bundle.intentRevision 与 intent.revision 不一致（候选属于旧意向）', {
        intentRevision: intent.revision,
        bundleIntentRevision: bundle.intentRevision,
      }),
    };
  }
  if (profile.mode !== intent.mode || profile.mode !== bundle.mode) {
    return {
      ok: false,
      error: cError('MODE_CONFLICT', 'profile/intent/bundle 的 mode 不一致，demo/manual/live 不得隐形混用', {
        profile: profile.mode,
        intent: intent.mode,
        bundle: bundle.mode,
      }),
    };
  }
  for (const item of bundle.evidence) {
    if (item.mode !== bundle.mode) {
      return {
        ok: false,
        error: cError('MODE_CONFLICT', `证据 ${item.evidenceId} 的 mode 与 bundle.mode 不一致`, {
          evidenceId: item.evidenceId,
          evidenceMode: item.mode,
          bundleMode: bundle.mode,
        }),
      };
    }
  }
  return { ok: true };
}

function findDuplicate(ids: string[]): string | null {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      return id;
    }
    seen.add(id);
  }
  return null;
}

/** 阶段3：ID 唯一性、引用存在性、主体范围一致性（规格 §3 条款 10 与 §5）。 */
export function validateReferences(
  bundle: CandidateBundle,
): { ok: true } | { ok: false; error: CError } {
  const companyIds = bundle.companies.map((item) => item.companyId);
  const jobIds = bundle.jobs.map((item) => item.jobId);
  const evidenceIds = bundle.evidence.map((item) => item.evidenceId);
  const factIds = bundle.facts.map((item) => item.factId);

  for (const [label, ids] of [
    ['company', companyIds],
    ['job', jobIds],
    ['evidence', evidenceIds],
    ['fact', factIds],
  ] as const) {
    const duplicate = findDuplicate([...ids]);
    if (duplicate !== null) {
      return {
        ok: false,
        error: cError('DUPLICATE_ID', `${label} 集合中存在重复 ID：${duplicate}`, {
          collection: label,
          duplicateId: duplicate,
        }),
      };
    }
  }

  const companies = new Set(companyIds);
  const jobs = new Map(jobIds.map((id) => [id, bundle.jobs.find((j) => j.jobId === id)]));
  const evidence = new Map(evidenceIds.map((id) => [id, bundle.evidence.find((e) => e.evidenceId === id)]));

  for (const job of bundle.jobs) {
    if (job.companyId !== null && !companies.has(job.companyId)) {
      return {
        ok: false,
        error: cError('REFERENCE_MISSING', `岗位 ${job.jobId} 引用的公司 ${job.companyId} 不存在`, {
          jobId: job.jobId,
          companyId: job.companyId,
        }),
      };
    }
  }

  for (const item of bundle.evidence) {
    if (item.companyId !== null && !companies.has(item.companyId)) {
      return {
        ok: false,
        error: cError('REFERENCE_MISSING', `证据 ${item.evidenceId} 引用的公司 ${item.companyId} 不存在`, {
          evidenceId: item.evidenceId,
          companyId: item.companyId,
        }),
      };
    }
    if (item.jobId !== null && !jobs.has(item.jobId)) {
      return {
        ok: false,
        error: cError('REFERENCE_MISSING', `证据 ${item.evidenceId} 引用的岗位 ${item.jobId} 不存在`, {
          evidenceId: item.evidenceId,
          jobId: item.jobId,
        }),
      };
    }
  }

  for (const fact of bundle.facts) {
    if (fact.evidenceIds.length === 0) {
      return {
        ok: false,
        error: cError('REFERENCE_MISSING', `事实 ${fact.factId} 没有任何 evidenceIds，无法追溯来源`, {
          factId: fact.factId,
        }),
      };
    }
    for (const evidenceId of fact.evidenceIds) {
      const target = evidence.get(evidenceId);
      if (target === undefined) {
        return {
          ok: false,
          error: cError('REFERENCE_MISSING', `事实 ${fact.factId} 引用的证据 ${evidenceId} 不在 bundle.evidence 中`, {
            factId: fact.factId,
            evidenceId,
          }),
        };
      }
      if (
        fact.companyId !== null &&
        target.companyId !== null &&
        target.companyId !== fact.companyId
      ) {
        return {
          ok: false,
          error: cError('SCOPE_MISMATCH', `事实 ${fact.factId} 与证据 ${evidenceId} 的公司主体不一致，不得跨主体引用`, {
            factId: fact.factId,
            factCompanyId: fact.companyId,
            evidenceCompanyId: target.companyId,
          }),
        };
      }
      if (fact.jobId !== null && target.jobId !== null && target.jobId !== fact.jobId) {
        return {
          ok: false,
          error: cError('SCOPE_MISMATCH', `事实 ${fact.factId} 与证据 ${evidenceId} 的岗位不一致`, {
            factId: fact.factId,
            factJobId: fact.jobId,
            evidenceJobId: target.jobId,
          }),
        };
      }
    }
    if (fact.jobId !== null && !jobs.has(fact.jobId)) {
      return {
        ok: false,
        error: cError('REFERENCE_MISSING', `事实 ${fact.factId} 引用的岗位 ${fact.jobId} 不存在`, {
          factId: fact.factId,
          jobId: fact.jobId,
        }),
      };
    }
    if (fact.companyId !== null && !companies.has(fact.companyId)) {
      return {
        ok: false,
        error: cError('REFERENCE_MISSING', `事实 ${fact.factId} 引用的公司 ${fact.companyId} 不存在`, {
          factId: fact.factId,
          companyId: fact.companyId,
        }),
      };
    }
    // 事实与岗位同属一个主体：非空 companyId 必须与岗位的 companyId 一致。
    if (fact.jobId !== null && fact.companyId !== null) {
      const job = jobs.get(fact.jobId);
      if (job !== undefined && job.companyId !== null && job.companyId !== fact.companyId) {
        return {
          ok: false,
          error: cError('SCOPE_MISMATCH', `事实 ${fact.factId} 的主体 ${fact.companyId} 与岗位 ${fact.jobId} 所属主体 ${job.companyId} 不一致`, {
            factId: fact.factId,
            companyId: fact.companyId,
            jobCompanyId: job.companyId,
          }),
        };
      }
    }
  }

  for (const item of bundle.coverage) {
    if (item.companyId !== null && !companies.has(item.companyId)) {
      return {
        ok: false,
        error: cError('REFERENCE_MISSING', `覆盖记录 ${item.topic} 引用的公司 ${item.companyId} 不存在`, {
          topic: item.topic,
          companyId: item.companyId,
        }),
      };
    }
    if (item.jobId !== null && !jobs.has(item.jobId)) {
      return {
        ok: false,
        error: cError('REFERENCE_MISSING', `覆盖记录 ${item.topic} 引用的岗位 ${item.jobId} 不存在`, {
          topic: item.topic,
          jobId: item.jobId,
        }),
      };
    }
  }

  return { ok: true };
}

export function validateInputs(
  profile: unknown,
  intent: unknown,
  bundle: unknown,
): { ok: true; value: ValidatedInputs } | { ok: false; error: CError } {
  const structure = validateStructure(profile, intent, bundle);
  if (!structure.ok) {
    return structure;
  }
  const typed = {
    profile: profile as UserProfile,
    intent: intent as SearchIntent,
    bundle: bundle as CandidateBundle,
  };
  const binding = validateBinding(typed.profile, typed.intent, typed.bundle);
  if (!binding.ok) {
    return binding;
  }
  const references = validateReferences(typed.bundle);
  if (!references.ok) {
    return references;
  }
  return { ok: true, value: typed };
}
