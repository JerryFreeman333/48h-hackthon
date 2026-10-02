import { z } from "zod";

const text = z.string().trim().min(1).max(500);
export const projectIdSchema = text;
const optionalText = text.nullable().optional().transform(value => value ?? null);
export const sourceUrlSchema = z.string().url().max(2048).refine(value => {
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
}, "Only HTTP(S) source links without credentials are supported").nullable().optional().transform(value => value ?? null);
export const dateSchema = z.string().datetime({ offset: true }).refine(value => {
  const date = value.slice(0, 10);
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}, "Invalid calendar date").nullable().optional().transform(value => value ?? null);
const amount = z.number().finite().nonnegative().max(1e9).nullable().optional().transform(value => value ?? null);

export const manualJobSchema = z.object({
  projectId: projectIdSchema, companyName: optionalText, title: text,
  rawJd: z.string().trim().min(1).max(50000), city: optionalText,
  sourceUrl: sourceUrlSchema, sourceTitle: text.default("用户提交 JD"), publishedAt: dateSchema,
  vacancyStatus: z.enum(["open", "closed", "unknown"]).default("unknown"),
  currency: z.string().regex(/^[A-Z]{3}$/).default("CNY"),
  salaryMin: amount, salaryMax: amount,
  salaryPeriod: z.enum(["month", "year", "unknown"]).default("unknown"),
  salaryBasis: z.enum(["fixed", "total", "unknown"]).default("unknown"),
  taxBasis: z.enum(["pre_tax", "after_tax", "unknown"]).default("unknown"),
  salaryMonths: z.number().int().min(1).max(36).nullable().optional().transform(value => value ?? null),
  industryTags: z.array(text).max(30).default([]),
  industryCodes: z.array(text).max(30).default([]),
  roleTypes: z.array(text).max(30).default([])
}).strict().refine(value => value.salaryMin === null || value.salaryMax === null || value.salaryMin <= value.salaryMax, { message: "Salary minimum exceeds maximum", path: ["salaryMin"] });

export const materialSchema = z.object({
  projectId: projectIdSchema, companyId: optionalText, jobId: optionalText,
  scope: z.enum(["company", "business", "team", "job"]),
  sourceType: z.enum(["user_material", "official_record", "company_website", "annual_report", "public_discussion", "interview_feedback"]),
  title: text, excerpt: z.string().trim().min(1).max(50000),
  url: sourceUrlSchema, publishedAt: dateSchema
}).strict();

export const identitySchema = z.object({
  projectId: projectIdSchema, companyId: text, selectedLegalName: text,
  jobId: optionalText
}).strict();
