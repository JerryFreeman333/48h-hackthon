import {z} from 'zod';
export const roles=['planner','router','identity','provenance','extractor','propagation','verifier','interpreter','followup','archive'] as const;
const ids=z.array(z.string()).max(1000);
export const xmindSchema=z.strictObject({
 schemaVersion:z.literal('xmind-execution/1'),designSha256:z.string(),revision:z.number().int().positive(),
 runs:z.array(z.strictObject({id:z.string(),role:z.enum(roles),engine:z.enum(['rules','model']),status:z.enum(['completed','partial','blocked','skipped']),inputIds:ids,outputIds:ids,reason:z.string(),at:z.string()})).max(200),
 routes:z.array(z.strictObject({questionId:z.string(),category:z.string(),sourceIds:ids,missingFields:ids,reason:z.string()})).max(180),
 documents:z.array(z.strictObject({id:z.string(),evidenceIds:ids,url:z.string().nullable(),hash:z.string().nullable(),sourceNature:z.enum(['official_statement','formal_record','reporting','personal_account','user_supplied','unknown']),quality:z.enum(['full','excerpt','unusable']),period:z.string().nullable(),rawRef:z.string().nullable()})).max(1000),
 entities:z.array(z.strictObject({id:z.string(),kind:z.enum(['legal_entity','brand','job','team','business','contracting_entity']),name:z.string(),companyId:z.string(),jobId:z.string().nullable()})).max(1000),
 relations:z.array(z.strictObject({from:z.string(),to:z.string(),kind:z.enum(['candidate_brand','job_context','claimed_contract','claimed_affiliate']),evidenceIds:ids,status:z.enum(['source_claim','unconfirmed']),reason:z.string()})).max(1000),
 lineage:z.array(z.strictObject({from:z.string(),to:z.string(),kind:z.enum(['same_document','explicit_origin','near_duplicate','independence_unknown']),score:z.number().min(0).max(1).nullable(),reason:z.string()})).max(1000),
 comparisons:z.array(z.strictObject({questionId:z.string(),left:z.string(),right:z.string(),result:z.enum(['supports','contradicts','not_comparable','same_origin']),reason:z.string()})).max(1200),
 translations:z.array(z.strictObject({questionId:z.string(),language:z.string(),context:z.string(),decision:z.string(),evidenceIds:ids,verification:z.literal('source_claim')})).max(180),
 followups:z.array(z.strictObject({questionId:z.string(),action:z.enum(['investigate','stop','external_confirmation','preference_clarification','silent_unknown']),untriedSourceIds:ids,reason:z.string()})).max(180),
 propagation:z.strictObject({status:z.enum(['disabled','signals_only']),reason:z.string(),observations:z.array(z.strictObject({evidenceId:z.string(),account:z.string().nullable(),at:z.string().nullable(),outboundUrls:ids})).max(1000),signals:z.array(z.strictObject({kind:z.enum(['repeated_text','short_time_same_link']),evidenceIds:ids,reason:z.string()})).max(1000)}),
 reviews:z.array(z.strictObject({id:z.string(),claimIds:ids,reason:z.string(),state:z.enum(['pending','deferred','human_reviewed','dismissed']),decision:z.string().nullable(),at:z.string()})).max(1000),
 updates:z.array(z.strictObject({kind:z.enum(['new_material','needs_revision','expired_source','review']),evidenceIds:ids,reason:z.string(),at:z.string()})).max(200)
});
export type XmindExecution=z.infer<typeof xmindSchema>;
