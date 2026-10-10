import {xmindLifecycleSchema,validateXmindLifecycle} from './xmind/lifecycle';
import {z} from 'zod';
import type {CandidateBundle} from '../../packages/contracts';
import {xmindSchema} from './xmind/schema';
import {collaborationSchema} from './xmind/collaboration-schema';
import {xmindSemanticSchema} from './xmind/semantic-schema';
import {validateXmindSemanticRecord} from './xmind/semantic';
import {locatorSchema} from './xmind/document-schema';
import {semanticCheckSchema} from './v3-model';
export const V3_RULE='v3-rules/8';
const id=z.string().min(1).max(160);
export const answerState=z.enum(['answered','partial','conflicting','unknown','not_applicable']);
const locator=locatorSchema;
const field=z.union([z.string(),z.number().finite(),z.boolean(),z.null()]);
export const claimSchema=z.strictObject({
 id,companyId:id,jobId:id.nullable(),subject:z.string(),subjectMatch:z.enum(['exact','alias','unconfirmed','unrelated']),
 scope:z.enum(['company','job','team','business']),predicate:z.string(),quote:z.string().min(1).max(10000),evidenceId:id,locator,
 fields:z.record(z.string(),field),period:z.string().nullable(),city:z.string().nullable(),team:z.string().nullable(),role:z.string().nullable(),
 polarity:z.enum(['positive','negative']),conditions:z.array(z.string()),answerTarget:z.enum(['source_statement','applicable_arrangement','observed_practice']),
 verification:z.literal('source_claim'),reviewRequired:z.boolean()
});
export const questionSchema=z.strictObject({
 id,version:z.literal(1),companyId:id,jobId:id.nullable(),topic:z.string(),predicate:z.string(),text:z.string(),
 needRefs:z.array(z.string()),targetScope:z.enum(['company','job','team']),answerTarget:z.enum(['source_statement','applicable_arrangement','observed_practice']),
 requiredFields:z.array(z.string()),acceptableEvidence:z.array(z.string()),importance:z.enum(['hard','priority','secondary','background']),
 constraintType:z.enum(['non_negotiable','negotiable','preference','unspecified']),threshold:z.number().nullable(),
 answerState,applicability:z.enum(['applicable','conditional','unconfirmed','unrelated']),conclusion:z.enum(['pass','fail','unknown']),
 supportingClaimIds:z.array(id),missingFields:z.array(z.string()),nextAction:z.enum(['investigate','silent_unknown','preference_clarification','external_confirmation','stop']),
 stopReason:z.string().nullable(),attempts:z.number().int().nonnegative(),maxAttempts:z.number().int().nonnegative(),
 pendingRequestBudget:z.number().int().nonnegative().default(0),externalQuestion:z.string().nullable(),notApplicableReason:z.string().nullable()
});
const attemptSchema=z.strictObject({
 sourceId:id,questionId:id,sourceClass:z.string(),acquisitionMode:z.enum(['local_database','http','pdf','user_text','user_pdf','user_docx','user_xlsx','user_csv','user_image','search']),
 accessState:z.enum(['ok','empty','login_required','blocked','rate_limited','timeout','parse_error','not_configured','unsupported','unreachable','identity_mismatch','budget_exhausted']),
 contentState:z.enum(['full_text','index_snippet','partial_text','document','navigation_only','irrelevant','unusable']),
 analysisState:z.enum(['accepted','quarantined','rejected']),declaredSubject:z.string().nullable(),declaredSource:z.string().nullable().optional(),publishedAt:z.string().nullable(),retrievedAt:z.string(),
 url:z.string().nullable(),rawRef:z.string().nullable(),rawHash:z.string().nullable(),locators:z.array(locator),evidenceIds:z.array(id),capabilityVersion:z.string(),failureReason:z.string().nullable(),
 reviewRequired:z.boolean().optional(),parserVersion:z.string().optional(),warnings:z.array(z.string()).optional(),elapsedMs:z.number().nonnegative(),query:z.string().nullable()
});
export const v3SnapshotSchema=z.strictObject({
 xmindLifecycle:xmindLifecycleSchema.optional(),xmindCollaboration:collaborationSchema.optional(),xmindSemantic:xmindSemanticSchema.optional(),processedOperationIds:z.array(id).max(400).optional(),xmind:xmindSchema.optional(),schemaVersion:z.literal('agent-v3/1'),taskId:id,profileId:id,profileRevision:z.number().int().positive(),createdAt:z.string(),
 purpose:z.enum(['exploration','selection']),needOrigin:z.enum(['user_confirmed','synthetic_acceptance']).default('user_confirmed'),materialKind:z.enum(['real_sources','synthetic_fixtures','mixed_sources']),questions:z.array(questionSchema).max(180),claims:z.array(claimSchema).max(800),
 sourceRelations:z.array(z.strictObject({from:id,to:id,kind:z.enum(['confirmed_repost','suspected_common_origin','independent_unknown']),reason:z.string()})),
 assessments:z.array(z.strictObject({questionId:id,previousState:answerState,newState:answerState,claimIds:z.array(id),requiredFieldsChecked:z.array(z.string()),missingFields:z.array(z.string()),reasonCode:z.enum(['no_claim','snippet_only','subject_unconfirmed','scope_unconfirmed','missing_required_fields','direct_answer','comparable_conflict','explicit_not_applicable']),assessorVersion:z.string(),at:z.string()})),
 reviews:z.array(z.strictObject({id,claimIds:z.array(id),questionIds:z.array(id),trigger:z.string(),impact:z.string(),state:z.enum(['pending','auto_checked','human_reviewed','deferred','dismissed']),assignee:z.string().nullable(),createdAt:z.string(),updatedAt:z.string(),checks:z.array(z.string()),decision:z.string().nullable(),reason:z.string(),ruleVersion:z.string()})),
 sourceAttempts:z.array(attemptSchema).max(400),
 budget:z.strictObject({maxRequests:z.number().int().nonnegative(),usedRequests:z.number().int().nonnegative(),reservedRequests:z.number().int().nonnegative().default(0),deadlineMs:z.number().nonnegative(),elapsedMs:z.number().nonnegative(),modelCalls:z.number().int().nonnegative(),tokens:z.number().nullable(),costMinor:z.number().nullable()}),
 stopReasons:z.array(z.string()),ruleVersions:z.record(z.string(),z.string()),semanticChecks:z.array(semanticCheckSchema).max(16).default([]),model:z.strictObject({status:z.enum(['not_configured','disabled','failed','completed']),reason:z.string()}),
 propagation:z.strictObject({status:z.literal('disabled'),reason:z.string()}),keyQuestionIds:z.array(id).max(3),criticalUnknownCount:z.number().int().nonnegative()
});
export type V3Snapshot=z.infer<typeof v3SnapshotSchema>;
export type V3Question=z.infer<typeof questionSchema>;
export type V3Claim=z.infer<typeof claimSchema>;
export type AcquisitionRecord=z.infer<typeof attemptSchema>;

/** Read and write boundaries use this explicit whitelist and semantic checks. */
export function validateV3Snapshot(raw:unknown,bundle:CandidateBundle){
 const s=v3SnapshotSchema.parse(raw);
 const q=new Map(s.questions.map(x=>[x.id,x])),claims=new Map(s.claims.map(x=>[x.id,x])),evidence=new Map(bundle.evidence.map(x=>[x.evidenceId,x]));
 if(q.size!==s.questions.length||claims.size!==s.claims.length)throw Error('V3 duplicate IDs');
 for(const c of s.claims){
  const e=evidence.get(c.evidenceId);
  if(!e||e.companyId!==c.companyId||!e.excerpt.includes(c.quote)||c.jobId!==null&&e.jobId!==c.jobId)throw Error('V3 unsupported claim');
 }
 for(const item of s.questions){
  if(!bundle.companies.some(c=>c.companyId===item.companyId)||item.jobId&&!bundle.jobs.some(j=>j.jobId===item.jobId&&j.companyId===item.companyId))throw Error('V3 wrong subject');
  for(const cid of item.supportingClaimIds){const c=claims.get(cid);if(!c||c.companyId!==item.companyId||c.predicate!==item.predicate)throw Error('V3 wrong question claim');}
  if(item.answerState==='answered'){
   const complete=item.supportingClaimIds.map(id=>claims.get(id)!).filter(c=>c.subjectMatch==='exact'&&c.answerTarget===item.answerTarget&&(item.targetScope==='company'?c.scope==='company'&&c.jobId===null:c.scope===item.targetScope&&c.jobId===item.jobId)&&item.requiredFields.every(f=>c.fields[f]!==null&&c.fields[f]!==undefined&&c.fields[f]!==''));
   if(!complete.length||item.missingFields.length)throw Error('V3 answer without complete applicable citation');
   if(!complete.some(c=>{const attempts=s.sourceAttempts.filter(a=>a.evidenceIds.includes(c.evidenceId));return !attempts.length||attempts.some(a=>a.accessState==='ok'&&a.analysisState==='accepted'&&item.acceptableEvidence.includes(a.contentState));}))throw Error('V3 answer from insufficient source');
  }
  if(item.answerState==='not_applicable'&&!item.notApplicableReason)throw Error('V3 not applicable without reason');
  if(item.conclusion!=='unknown'&&item.answerState!=='answered')throw Error('V3 insufficient constraint');
 }
 for(const a of s.assessments)if(!q.has(a.questionId)||a.claimIds.some(c=>!claims.has(c)))throw Error('V3 invalid assessment');
 for(const a of s.sourceAttempts)if(!q.has(a.questionId)||a.evidenceIds.some(e=>!evidence.has(e)))throw Error('V3 invalid acquisition');
 for(const r of s.sourceRelations)if(!evidence.has(r.from)||!evidence.has(r.to))throw Error('V3 invalid lineage');
 for(const r of s.reviews)if(r.claimIds.some(c=>!claims.has(c))||r.questionIds.some(x=>!q.has(x)))throw Error('V3 invalid review');
 for(const c of s.semanticChecks){const item=q.get(c.questionId),e=evidence.get(c.evidenceId);if(!item||!e||e.companyId!==item.companyId||!e.excerpt.includes(c.quote)||e.scope!==c.scope||c.answerTarget!==item.answerTarget||c.scope==='job'&&e.jobId!==item.jobId)throw Error('V3 invalid semantic check');}
 if(s.xmind){
  const x=s.xmind;
  if(x.revision!==s.profileRevision)throw Error('XMind 需求版本不一致');
  for(const r of [...x.routes,...x.translations,...x.followups])if(!q.has(r.questionId))throw Error('XMind missing question');
  for(const t of x.translations)if(t.evidenceIds.some(id=>!evidence.has(id)||evidence.get(id)!.companyId!==q.get(t.questionId)!.companyId))throw Error('XMind invalid translation citation');
  for(const d of x.documents)if(d.evidenceIds.some(id=>!evidence.has(id)))throw Error('XMind invalid document');
  for(const r of x.lineage)if(!evidence.has(r.from)||!evidence.has(r.to))throw Error('XMind invalid lineage');
  const entities=new Set(x.entities.map(e=>e.id));
  for(const r of x.relations)if(!entities.has(r.from)||!entities.has(r.to)||r.evidenceIds.some(id=>!evidence.has(id)))throw Error('XMind invalid relation');
  for(const r of x.comparisons)if(!q.has(r.questionId)||[r.left,r.right].some(id=>!claims.has(id)||!q.get(r.questionId)!.supportingClaimIds.includes(id)))throw Error('XMind invalid comparison');
  for(const r of x.reviews)if(r.claimIds.some(id=>!claims.has(id)))throw Error('XMind invalid review');
 }
 if(s.xmindLifecycle)validateXmindLifecycle(s.xmindLifecycle,s,bundle);
 if(s.xmindSemantic)validateXmindSemanticRecord(s.xmindSemantic,s,bundle);
 if(s.xmindCollaboration){const x=s.xmindCollaboration;if(!x.runId.startsWith(s.taskId+':'))throw Error('XMind runtime task scope');const tasks=new Set(x.tasks.map(t=>t.id));if(tasks.size!==x.tasks.length||x.tasks.some(t=>[...t.dependsOn,...t.after].some(id=>!tasks.has(id)))||x.messages.some(m=>!tasks.has(m.fromTaskId)||!tasks.has(m.toTaskId))||x.tools.some(c=>!tasks.has(c.taskId)))throw Error('XMind runtime references');}
 if(s.keyQuestionIds.some(id=>!q.has(id)))throw Error('V3 invalid question selection');
 if(new Set(s.keyQuestionIds).size!==s.keyQuestionIds.length||s.keyQuestionIds.some(id=>q.get(id)!.nextAction!=='external_confirmation'))throw Error('V3 invalid external questions');
 if(s.budget.usedRequests+s.budget.reservedRequests>s.budget.maxRequests||s.questions.reduce((n,q)=>n+q.pendingRequestBudget,0)!==s.budget.reservedRequests||s.budget.modelCalls!==0&&s.model.status==='not_configured')throw Error('V3 invalid budget/model state');
 return s;
}
