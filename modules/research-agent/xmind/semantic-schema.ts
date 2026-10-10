import {z} from 'zod';

const id=z.string().min(1).max(160);
const primitive=z.union([z.string().max(6000),z.number().finite(),z.boolean(),z.null()]);
export const semanticLocatorSchema=z.strictObject({paragraph:z.number().int().positive().optional(),physical_page:z.number().int().positive().optional(),table:z.number().int().positive().optional(),row:z.number().int().positive().optional(),column:z.number().int().positive().optional()});
export const semanticCandidateSchema=z.strictObject({
 questionId:id,evidenceId:id,subject:z.string().min(2).max(120),scope:z.enum(['company','job','team','business']),predicate:z.string().min(1).max(100),
 quote:z.string().min(6).max(6000),locator:semanticLocatorSchema,fields:z.record(z.string(),primitive),fieldQuotes:z.record(z.string(),z.string().min(1).max(6000)),
 period:z.string().max(120).nullable(),city:z.string().max(120).nullable(),team:z.string().max(120).nullable(),role:z.string().max(120).nullable(),
 polarity:z.enum(['positive','negative']),negationTarget:z.string().max(160).nullable(),conditions:z.array(z.string().min(1).max(1000)).max(12),
 answerTarget:z.literal('source_statement'),reason:z.string().min(1).max(1500),missingFields:z.array(z.string().max(100)).max(30)
});
export const semanticComparisonSchema=z.strictObject({questionId:id,leftEvidenceId:id,rightEvidenceId:id,leftQuote:z.string().min(6).max(6000),rightQuote:z.string().min(6).max(6000),result:z.enum(['supports','contradicts','not_comparable']),reason:z.string().min(1).max(1500),missingFields:z.array(z.string().max(100)).max(30)});
export const semanticExplanationSchema=z.strictObject({questionId:id,evidenceId:id,quote:z.string().min(6).max(6000),scope:z.enum(['company','job','team','business']),meaning:z.string().min(1).max(1500),context:z.string().min(1).max(1500),reason:z.string().min(1).max(1500),missingFields:z.array(z.string().max(100)).max(30)});
export const semanticBatchReplySchema=z.strictObject({candidates:z.array(semanticCandidateSchema).max(24),comparisons:z.array(semanticComparisonSchema).max(16),explanations:z.array(semanticExplanationSchema).max(24)});
export type SemanticCandidate=z.infer<typeof semanticCandidateSchema>;
export type SemanticComparison=z.infer<typeof semanticComparisonSchema>;
export type SemanticExplanation=z.infer<typeof semanticExplanationSchema>;

/** Explicit optional archive contract. Candidate validation never certifies a source. */
export const xmindSemanticSchema=z.strictObject({
 schemaVersion:z.literal('xmind-semantic/1'),engine:z.enum(['rules','model']),status:z.enum(['disabled','not_configured','reserved','failed','completed','partial']),
 version:z.literal('xmind-semantic-rules/1'),reason:z.string().max(3000),startedAt:z.string(),completedAt:z.string().nullable(),
 requestId:z.string().max(200).nullable(),sourceEvidenceIds:z.array(id).max(8),acceptedClaimIds:z.array(id).max(24),
 candidates:z.array(z.strictObject({candidate:semanticCandidateSchema,claimId:id.nullable(),state:z.enum(['accepted','rejected']),reason:z.string().max(1500)})).max(24),
 comparisons:z.array(z.strictObject({comparison:semanticComparisonSchema,state:z.enum(['accepted','rejected']),reason:z.string().max(1500)})).max(16),
 explanations:z.array(z.strictObject({explanation:semanticExplanationSchema,state:z.enum(['accepted','rejected']),reason:z.string().max(1500)})).max(24),
 privacy:z.literal('public_acquired_text_only'),verification:z.literal('source_claim')
});
export type XmindSemantic=z.infer<typeof xmindSemanticSchema>;
