import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {CandidateBundle} from '../../../packages/contracts';
import type {V3Claim,V3Question,V3Snapshot} from '../v3-contract';
import {explainXmindQuestion} from './semantic';

const id=z.string().min(1).max(160);
export const refreshQuestionSchema=z.strictObject({questionId:id,evidenceIds:z.array(id).max(1000),reason:z.string(),acceptableMaterials:z.string(),priority:z.enum(['hard','priority','secondary','background'])});
export const xmindLifecycleSchema=z.strictObject({
 schemaVersion:z.literal('xmind-lifecycle/1'),evaluatedAt:z.string(),cachePolicy:z.literal('acquisition_cache_not_content_validity'),
 sources:z.array(z.strictObject({evidenceId:id,sourceId:id.nullable(),companyId:id.nullable(),jobId:id.nullable(),
 status:z.enum(['expired','not_yet_effective','within_declared_window','ambiguous_window','historical_period','dated_reference','undated','unusable']),
 validFrom:z.string().nullable(),validUntil:z.string().nullable(),declaredPeriods:z.array(z.string()).max(50),publishedAt:z.string().nullable(),retrievedAt:z.string(),shouldRefresh:z.boolean(),reason:z.string()})).max(1000),
 refreshQuestions:z.array(refreshQuestionSchema).max(180),
 reviewSummary:z.strictObject({pending:z.number().int().nonnegative(),deferred:z.number().int().nonnegative(),humanReviewed:z.number().int().nonnegative(),dismissed:z.number().int().nonnegative(),reason:z.string()})
});
export type XmindLifecycle=z.infer<typeof xmindLifecycleSchema>;
export type RefreshQuestion=z.infer<typeof refreshQuestionSchema>;
type At=Date|number|string;
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,28);
function atDate(now?:At){const date=now===undefined?new Date():new Date(now);if(!Number.isFinite(date.getTime()))throw Error('时效检查时间无效。');return date;}
const dateParts=(text:string)=>text.match(/(20\d{2})\s*(?:年|[-/])\s*(\d{1,2})\s*(?:月|[-/])\s*(\d{1,2})\s*日?/);
function calendarDate(text:string){
 const match=dateParts(text);if(!match)return null;
 const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]),parsed=new Date(Date.UTC(year,month-1,day));
 return parsed.getUTCFullYear()===year&&parsed.getUTCMonth()===month-1&&parsed.getUTCDate()===day?`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`:null;
}
function localToday(date:Date){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Hong_Kong',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);}
function declaredDeadlines(text:string){
 const intervals=[...text.matchAll(/有效期(?:限)?(?:为)?[：:\s]*(20\d{2}\s*(?:年|[-/])\s*\d{1,2}\s*(?:月|[-/])\s*\d{1,2}\s*日?)\s*(?:至|到|—|~)\s*(20\d{2}\s*(?:年|[-/])\s*\d{1,2}\s*(?:月|[-/])\s*\d{1,2}\s*日?)/g)];
 const standalone=[...text.matchAll(/(?:有效期(?:限)?(?:至|到|截止|截至)|有效截至|有效至|截止(?:日期|时间)?|招聘截止|报名截止|申请截止)[^。；;\n\d]{0,16}(20\d{2}\s*(?:年|[-/])\s*\d{1,2}\s*(?:月|[-/])\s*\d{1,2}\s*日?)/g)];
 const values=[...standalone.map(m=>calendarDate(m[1])),...intervals.map(m=>calendarDate(m[2]))].filter((v):v is string=>v!==null),starts=intervals.map(m=>calendarDate(m[1])).filter((v):v is string=>v!==null);
 return {deadlines:[...new Set(values)],starts:[...new Set(starts)]};
}
const currentArrangement=(q:V3Question)=>q.answerTarget!=='source_statement'||q.predicate==='recruitment'||q.targetScope!=='company'&&!['preference_clarification'].includes(q.predicate);
function freshnessSources(s:V3Snapshot,bundle:CandidateBundle,date:Date):XmindLifecycle['sources']{
 const today=localToday(date),year=Number(today.slice(0,4));
 return bundle.evidence.slice(0,1000).map(e=>{
  const attempt=s.sourceAttempts.find(a=>a.evidenceIds.includes(e.evidenceId)),claims=s.claims.filter(c=>c.evidenceId===e.evidenceId),text=e.title+'\n'+e.excerpt;
  const {deadlines,starts}=declaredDeadlines(text),claimPeriods=claims.map(c=>c.period).filter((v):v is string=>v!==null);
  const reportPeriods=text.match(/20\d{2}年(?:度|上半年|下半年|半年度|第[一二三四1234]季度)(?:报告|报表)?/g)??[];
  const declaredPeriods=[...new Set([...claimPeriods,...reportPeriods])].slice(0,50),periodYears=declaredPeriods.map(v=>Number(v.match(/20\d{2}/)?.[0]??NaN)).filter(v=>Number.isFinite(v));
  let status:XmindLifecycle['sources'][number]['status']='undated',reason='原文未明示有效窗口或适用时期；获取时间不能代替内容有效期。',validFrom:string|null=null,validUntil:string|null=null,shouldRefresh=false;
  if(attempt&&(attempt.accessState!=='ok'||attempt.analysisState!=='accepted'||['index_snippet','navigation_only','unusable'].includes(attempt.contentState))){status='unusable';reason='来源访问或正文条件不满足；这是获取状态，不作为企业风险，也不推定内容过期。';}
  else if(deadlines.length>1||starts.length>1||starts.length===1&&deadlines.length===1&&starts[0]>deadlines[0]){status='ambiguous_window';reason='同一保存段落出现不同或倒置的有效日期，尚未确认各日期对应的岗位/事项，不能任选一个期限。';shouldRefresh=true;}
  else if(deadlines.length===1){validUntil=deadlines[0];validFrom=starts[0]??null;status=validUntil<today?'expired':validFrom&&validFrom>today?'not_yet_effective':'within_declared_window';shouldRefresh=status==='expired'||status==='not_yet_effective';reason=status==='expired'?`已超过来源明示截止 ${validUntil}；保留历史原文，核实现行安排需取得新材料。`:status==='not_yet_effective'?`来源明示的安排要到 ${validFrom} 才生效，不能证明当前安排。`:`尚未超过来源明示截止 ${validUntil}；仅说明该截止日期仍在窗口内，不保证岗位当前开放或安排实际执行。`;}
  else if(periodYears.length&&periodYears.every(v=>v<year)){status='historical_period';reason=`材料明确涉及历史期间（${declaredPeriods.join('、')}），可回答对应历史问题，不能自动证明当前岗位安排。`;shouldRefresh=true;}
  else if(declaredPeriods.length||e.publishedAt){status='dated_reference';reason='有适用时期或发布日期，但没有明确有效截止；发布日期和24小时采集缓存都不等于内容有效期。';}
  return {evidenceId:e.evidenceId,sourceId:attempt?.sourceId??null,companyId:e.companyId,jobId:e.jobId,status,validFrom,validUntil,declaredPeriods,publishedAt:e.publishedAt,retrievedAt:e.retrievedAt,shouldRefresh,reason};
 });
}

/** Refresh suggestions are scoped to affected questions. Historical facts remain in the frozen archive. */
export function targetedRefreshQuestions(s:V3Snapshot,bundle:CandidateBundle,now?:At):RefreshQuestion[]{
 const date=atDate(now),sources=freshnessSources(s,bundle,date),sourceMap=new Map(sources.map(v=>[v.evidenceId,v]));
 return s.questions.filter(currentArrangement).flatMap(q=>{
  const related=s.claims.filter(c=>q.supportingClaimIds.includes(c.id)&&c.subjectMatch==='exact'&&c.companyId===q.companyId&&(q.targetScope==='company'?c.scope==='company'&&c.jobId===null:c.scope===q.targetScope&&c.jobId===q.jobId));
  const affected=related.map(c=>sourceMap.get(c.evidenceId)).filter((v):v is XmindLifecycle['sources'][number]=>!!v&&['expired','not_yet_effective','ambiguous_window','historical_period'].includes(v.status));
  if(!affected.length)return [];
  const reusable=related.some(c=>{const state=sourceMap.get(c.evidenceId)?.status;return state==='within_declared_window'||state==='dated_reference';});
  if(reusable)return [];
  const description=explainXmindQuestion(q,s.claims,bundle);
  return [{questionId:q.id,evidenceIds:[...new Set(affected.map(v=>v.evidenceId))],reason:`仅定向更新“${q.text}”：${[...new Set(affected.map(v=>v.reason))].join(' ')}不重采无关板块，不删除历史陈述。`,acceptableMaterials:description.acceptableMaterials,priority:q.importance}];
 });
}

export function sourceFreshness(s:V3Snapshot,bundle:CandidateBundle,now?:At):XmindLifecycle{
 const date=atDate(now);
 return xmindLifecycleSchema.parse({schemaVersion:'xmind-lifecycle/1',evaluatedAt:date.toISOString(),cachePolicy:'acquisition_cache_not_content_validity',sources:freshnessSources(s,bundle,date),refreshQuestions:targetedRefreshQuestions(s,bundle,date),reviewSummary:{pending:s.reviews.filter(r=>r.state==='pending'||r.state==='auto_checked').length,deferred:s.reviews.filter(r=>r.state==='deferred').length,humanReviewed:s.reviews.filter(r=>r.state==='human_reviewed').length,dismissed:s.reviews.filter(r=>r.state==='dismissed').length,reason:'复核状态与来源真实性分开；未指定维护者的内部复核保留待处理，不阻塞报告。'}});
}
export function validateXmindLifecycle(raw:unknown,s:V3Snapshot,bundle:CandidateBundle){
 const lifecycle=xmindLifecycleSchema.parse(raw),evidence=new Map(bundle.evidence.map(e=>[e.evidenceId,e])),questions=new Map(s.questions.map(q=>[q.id,q]));
 for(const item of lifecycle.sources){const e=evidence.get(item.evidenceId);if(!e||e.companyId!==item.companyId||e.jobId!==item.jobId||item.sourceId&&!s.sourceAttempts.some(a=>a.sourceId===item.sourceId&&a.evidenceIds.includes(item.evidenceId)))throw Error('时效记录引用了不存在或主体不符的来源。');}
 for(const item of lifecycle.refreshQuestions){const q=questions.get(item.questionId);if(!q||item.evidenceIds.some(id=>evidence.get(id)?.companyId!==q.companyId))throw Error('定向更新引用了不存在或主体不符的问题/材料。');}
 return lifecycle;
}

const marker='xmind:';
const checks=['quote','subject','negation_target','conditions','event_stage','independence','scope'];
function claimFingerprint(c:V3Claim){return digest({companyId:c.companyId,jobId:c.jobId,subject:c.subject,scope:c.scope,predicate:c.predicate,quote:c.quote.replace(/\s+/g,' ').trim(),period:c.period,city:c.city,team:c.team,role:c.role,polarity:c.polarity,conditions:[...c.conditions].sort()});}
function questionFingerprint(q:V3Question){return digest({companyId:q.companyId,jobId:q.jobId,predicate:q.predicate,targetScope:q.targetScope,answerTarget:q.answerTarget,threshold:q.threshold,constraintType:q.constraintType});}
type Review=V3Snapshot['reviews'][number];
const stored=(r:Review,kind:string)=>r.checks.find(v=>v.startsWith(`${marker}${kind}:`))?.slice(`${marker}${kind}:`.length);
const authority:Record<Review['state'],number>={human_reviewed:5,dismissed:4,deferred:3,pending:2,auto_checked:1};
export type ReviewNormalization={pending:number;deferred:number;humanReviewed:number;merged:number;reopened:number;reason:string};

/** Fingerprint plus question scope merges duplicates. New text/origin or rule version reopens, never elapsed time alone. */
export function normalizeReviewQueue(s:V3Snapshot):ReviewNormalization{
 const claimMap=new Map(s.claims.map(c=>[c.id,c])),questionMap=new Map(s.questions.map(q=>[q.id,q])),groups=new Map<string,Review[]>(),original=s.reviews.length;
 for(const r of s.reviews){
  r.claimIds=[...new Set(r.claimIds)].filter(id=>claimMap.has(id));r.questionIds=[...new Set(r.questionIds)].filter(id=>questionMap.has(id));
  if(!r.claimIds.length&&!r.questionIds.length)continue;
  const fingerprint=digest({claims:[...new Set(r.claimIds.map(id=>claimFingerprint(claimMap.get(id)!)))].sort(),scope:[...new Set(r.questionIds.map(id=>questionFingerprint(questionMap.get(id)!)))].sort()});
  const values=groups.get(fingerprint)??[];values.push(r);groups.set(fingerprint,values);
 }
 let reopened=0;const output:Review[]=[];
 for(const [fingerprint,values] of groups){
  const ordered=[...values].sort((a,b)=>authority[b.state]-authority[a.state]||a.createdAt.localeCompare(b.createdAt)),base=structuredClone(ordered[0]);
  const claimIds=[...new Set(values.flatMap(v=>v.claimIds))],questionIds=[...new Set(values.flatMap(v=>v.questionIds))];
  const evidenceIds=[...new Set(claimIds.map(id=>claimMap.get(id)!.evidenceId))];
  const origins=evidenceIds.map(id=>{const a=s.sourceAttempts.find(a=>a.evidenceIds.includes(id));return a?.rawHash?'hash:'+a.rawHash:a?.rawRef?'raw:'+a.rawRef:a?.url?'url:'+a.url:'evidence:'+id;});
  const evidenceKey=digest([...new Set(origins)].sort()),priorEvidenceKey=stored(base,'evidence-key'),version=s.ruleVersions.assessment??base.ruleVersion;
  const evidenceChanged=priorEvidenceKey!==undefined&&priorEvidenceKey!==evidenceKey,ruleChanged=base.ruleVersion!==version;
  if(evidenceChanged||ruleChanged){
   reopened++;base.state=base.assignee?'pending':'deferred';base.updatedAt=new Date().toISOString();base.reason=`${evidenceChanged?'新增了不同正文或出处':'判断规则版本变更'}，重新进入内部复核；${base.assignee?'已保留指定维护者':'尚未指定维护者，暂缓处理'}。此前决定仅作历史记录，不认证更新后的陈述。`;
   base.checks=[...base.checks.filter(v=>!v.startsWith(marker)),...(base.decision?['prior_decision_preserved']:[])];
  }else if(!['human_reviewed','dismissed','deferred'].includes(base.state)){
   base.state=base.assignee?'pending':'deferred';base.reason=base.assignee?'等待指定维护者核对引用、主体、否定、事件阶段与来源独立性；机器检查不认证来源。':'内部规则检查已完成，但尚未指定维护者；复核保留待处理，不将内部解析任务转交求职用户，不认证来源。';
  }
  base.id='review-fingerprint-'+fingerprint;base.claimIds=claimIds;base.questionIds=questionIds;base.ruleVersion=version;
  base.trigger=values.some(v=>v.trigger==='high_impact_event')?'high_impact_event':base.trigger;
  base.createdAt=values.map(v=>v.createdAt).sort()[0];
  base.checks=[...new Set([...base.checks.filter(v=>!v.startsWith(marker)),...checks,`${marker}review-key:${fingerprint}`,`${marker}evidence-key:${evidenceKey}`])];
  if(base.state==='deferred'&&!base.reason.includes('未指定')&&!base.reason.includes('无常驻'))base.reason+=' 尚未指定维护者，保留待处理原因。';
  output.push(base);
 }
 s.reviews=output.sort((a,b)=>{const importance=(r:Review)=>r.questionIds.some(id=>questionMap.get(id)?.importance==='hard')?0:r.trigger==='high_impact_event'?1:2;return importance(a)-importance(b)||a.createdAt.localeCompare(b.createdAt);});
 return {pending:s.reviews.filter(r=>r.state==='pending').length,deferred:s.reviews.filter(r=>r.state==='deferred').length,humanReviewed:s.reviews.filter(r=>r.state==='human_reviewed').length,merged:Math.max(0,original-s.reviews.length),reopened,reason:'按陈述内容与问题范围归并；重复执行和时间流逝不重开，只有新来源正文/出处或规则变更才重开。'};
}
