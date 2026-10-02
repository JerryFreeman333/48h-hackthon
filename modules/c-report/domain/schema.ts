/**
 * 公共对象 1.0.0 的 Zod 结构校验。
 *
 * 原则（规格 §3/§5）：
 * - 只校验结构与合法枚举；Zod 通过不证明证据支持结论。
 * - 不静默兼容 schemaVersion；非 1.0.0 直接拒绝。
 * - nullable 字段不允许空字符串冒充未知。
 * - strict 模式：未知字段报错。字段漂移必须响亮失败，
 *   而不是静默当 unknown 处理（新增公共字段属契约变更，需三方协调）。
 */
import { z } from 'zod';
import { PUBLIC_SCHEMA_VERSION } from './contract.js';

const isoDatetime = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), '不是合法的 ISO8601 时间');

/** 非空字符串：空内容按无效处理，不用空串冒充内容或未知。 */
const nonEmptyString = z.string().min(1, '不允许空字符串');

/** nullable 字符串：要么 null（未知），要么非空字符串；空串被 min(1) 拒绝。 */
const nullableNonEmptyString = z.union([nonEmptyString, z.null()]);

/** 有限数字：NaN/Infinity 按非法处理。 */
const finiteNumber = z
  .number()
  .refine((value) => Number.isFinite(value), '必须是有穷数字');

const modeSchema = z.enum(['demo', 'manual', 'live']);
const statusSchema = z.enum(['supported', 'contradicted', 'unknown', 'conflicting']);

const preferenceValueSchema = z.union([
  nonEmptyString,
  finiteNumber,
  z.boolean(),
  z.array(nonEmptyString),
  z.null(),
]);

export const preferenceSchema = z
  .object({
    key: nonEmptyString,
    value: preferenceValueSchema,
    strength: z.enum(['hard', 'soft', 'unknown']),
    confirmed: z.boolean(),
  })
  .strict();

export const userProfileSchema = z
  .object({
    schemaVersion: z.literal(PUBLIC_SCHEMA_VERSION),
    profileId: nonEmptyString,
    revision: z.number().int().nonnegative(),
    projectId: nonEmptyString,
    mode: modeSchema,
    confirmedAt: z.union([isoDatetime, z.null()]),
    assessment: z
      .object({
        instrumentId: nonEmptyString,
        version: nonEmptyString,
        scores: z.record(z.union([finiteNumber, z.null()])),
        interpretation: z.string(),
        status: z.enum(['draft', 'confirmed']),
        validation: z.enum(['prototype', 'validated']),
      })
      .strict(),
    background: z
      .object({
        education: nullableNonEmptyString,
        major: nullableNonEmptyString,
        skills: z.array(nonEmptyString),
        experiences: z
          .object({
            text: nonEmptyString,
            source: z.enum(['user', 'resume']),
            confirmed: z.boolean(),
          })
          .strict()
          .array(),
      })
      .strict(),
    goals: z.array(nonEmptyString),
    preferences: preferenceSchema.array(),
  })
  .strict();

export const intentFilterSchema = z
  .object({
    key: nonEmptyString,
    value: preferenceValueSchema,
    strength: z.enum(['hard', 'soft', 'unknown']),
  })
  .strict();

export const searchIntentSchema = z
  .object({
    schemaVersion: z.literal(PUBLIC_SCHEMA_VERSION),
    intentId: nonEmptyString,
    revision: z.number().int().nonnegative(),
    projectId: nonEmptyString,
    profileId: nonEmptyString,
    profileRevision: z.number().int().nonnegative(),
    mode: modeSchema,
    industryTags: z.array(nonEmptyString),
    industryCodes: z.array(nonEmptyString),
    roleTypes: z.array(nonEmptyString),
    cities: z.array(nonEmptyString),
    filters: intentFilterSchema.array(),
    maxCandidates: z.number().int().positive(),
  })
  .strict();

export const jobSalarySchema = z
  .object({
    currency: nonEmptyString,
    min: z.union([finiteNumber, z.null()]),
    max: z.union([finiteNumber, z.null()]),
    period: z.enum(['month', 'year', 'unknown']),
    basis: z.enum(['fixed', 'total', 'unknown']),
    taxBasis: z.enum(['pre_tax', 'after_tax', 'unknown']),
    months: z.union([z.number().int().nonnegative(), z.null()]),
  })
  .strict()
  .refine(
    (salary) =>
      salary.min === null ||
      salary.max === null ||
      salary.min <= salary.max,
    { message: '薪资区间 min 不得大于 max' },
  );

export const companySchema = z
  .object({
    companyId: nonEmptyString,
    legalName: nonEmptyString,
    creditCode: nullableNonEmptyString,
    brandName: nullableNonEmptyString,
    identityStatus: z.enum(['confirmed', 'ambiguous', 'unresolved']),
  })
  .strict();

export const jobSchema = z
  .object({
    jobId: nonEmptyString,
    companyId: nullableNonEmptyString,
    title: nonEmptyString,
    rawJd: nonEmptyString,
    city: nullableNonEmptyString,
    sourceUrl: z.union([z.string().url(), z.null()]),
    publishedAt: z.union([isoDatetime, z.null()]),
    vacancyStatus: z.enum(['open', 'closed', 'unknown']),
    salary: jobSalarySchema,
  })
  .strict();

export const evidenceSchema = z
  .object({
    evidenceId: nonEmptyString,
    companyId: nullableNonEmptyString,
    jobId: nullableNonEmptyString,
    scope: z.enum(['company', 'business', 'team', 'job']),
    sourceType: nonEmptyString,
    title: nonEmptyString,
    url: z.union([z.string().url(), z.null()]),
    publishedAt: z.union([isoDatetime, z.null()]),
    retrievedAt: isoDatetime,
    excerpt: nonEmptyString,
    mode: modeSchema,
    verification: z.enum(['verified', 'unverified', 'disputed']),
  })
  .strict();

export const factSchema = z
  .object({
    factId: nonEmptyString,
    companyId: nullableNonEmptyString,
    jobId: nullableNonEmptyString,
    key: nonEmptyString,
    value: z.union([nonEmptyString, finiteNumber, z.boolean(), z.null()]),
    status: statusSchema,
    evidenceIds: z.array(nonEmptyString),
    asOf: z.union([isoDatetime, z.null()]),
  })
  .strict();

export const coverageSchema = z
  .object({
    companyId: nullableNonEmptyString,
    jobId: nullableNonEmptyString,
    topic: nonEmptyString,
    status: z.enum(['available', 'not_connected', 'unavailable', 'no_result', 'not_public']),
    reason: nonEmptyString,
    checkedAt: isoDatetime,
  })
  .strict();

export const usageEntrySchema = z
  .object({
    provider: nonEmptyString,
    requestId: nonEmptyString,
    costMinor: z.union([z.number().int(), z.null()]),
  })
  .strict();

export const candidateBundleSchema = z
  .object({
    schemaVersion: z.literal(PUBLIC_SCHEMA_VERSION),
    bundleId: nonEmptyString,
    projectId: nonEmptyString,
    intentId: nonEmptyString,
    intentRevision: z.number().int().nonnegative(),
    mode: modeSchema,
    retrievedAt: isoDatetime,
    companies: companySchema.array(),
    jobs: jobSchema.array(),
    evidence: evidenceSchema.array(),
    facts: factSchema.array(),
    coverage: coverageSchema.array(),
    usage: usageEntrySchema.array(),
  })
  .strict();

export const matchReportSchema = z
  .object({
    schemaVersion: z.literal(PUBLIC_SCHEMA_VERSION),
    reportId: nonEmptyString,
    version: z.number().int().positive(),
    projectId: nonEmptyString,
    profileId: nonEmptyString,
    profileRevision: z.number().int().nonnegative(),
    bundleId: nonEmptyString,
    mode: modeSchema,
    generatedAt: isoDatetime,
    completeness: z.enum(['complete_for_scope', 'partial']),
    results: z
      .object({
        jobId: nonEmptyString,
        recommendation: z.enum(['hold', 'verify_first', 'deprioritize', 'explore', 'insufficient']),
        reasons: z
          .object({
            text: nonEmptyString,
            kind: z.enum(['fact', 'inference', 'unknown']),
            factIds: z.array(nonEmptyString),
          })
          .strict()
          .array(),
        constraints: z
          .object({
            key: nonEmptyString,
            result: z.enum(['pass', 'fail', 'unknown']),
            factIds: z.array(nonEmptyString),
          })
          .strict()
          .array(),
        dimensions: z
          .object({
            key: z.enum([
              'identity_credit',
              'business',
              'role_clarity',
              'career_value',
              'personal_fit',
            ]),
            summary: nonEmptyString,
            status: statusSchema,
            factIds: z.array(nonEmptyString),
          })
          .strict()
          .array(),
        questions: z
          .object({
            text: nonEmptyString,
            priority: z.enum(['must', 'optional']),
            resolves: z.array(nonEmptyString),
          })
          .strict()
          .array(),
      })
      .strict()
      .array(),
    evidenceSnapshot: evidenceSchema.array(),
    factsSnapshot: factSchema.array(),
    coverageSnapshot: coverageSchema.array(),
    ruleVersion: nonEmptyString,
    promptVersion: nonEmptyString,
  })
  .strict();

export type ZodIssuePath = (string | number)[];
