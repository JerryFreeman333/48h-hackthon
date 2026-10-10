import {extraPredicates,specializedFields} from './xmind/catalog';
import {createHash} from 'node:crypto';
import type {CandidateBundle} from '../../packages/contracts';
import {buildInvestigationPlan} from '../../packages/integration/job-needs';
import {V3_RULE,type V3Snapshot,type V3Question,type V3Claim} from './v3-contract';
export const stableV3=(...values:unknown[])=>createHash('sha256').update(JSON.stringify(values)).digest('hex').slice(0,28);
const requirements:Record<string,string[]>={
 ...Object.fromEntries(Object.entries(extraPredicates).map(([k,v])=>[k,v.required])),
 fixed_salary:['min','max','currency','period','basis','taxBasis','effectiveConditions','role'],
 rest:['frequency','mandatory','effectiveConditions','period','role'],
 training:['mechanism','eligibility','period'],
 business:['mechanism','period'],social_insurance:['mechanism','eligibility','period'],
 accommodation:['mechanism','eligibility','period'],overtime_pay:['mechanism','period','role'],
 finance:['value','unit','currency','reportingScope','period'],identity:['legalName','relation','period'],
};
export function createV3Questions(input:Record<string,any>,bundle:CandidateBundle):V3Question[]{
 const plan=input.JobNeedsSnapshot?buildInvestigationPlan(input.JobNeedsSnapshot):{items:[]};
 const result:V3Question[]=[];
 for(const job of bundle.jobs){
  if(!job.companyId)continue;
  const add=(topic:string,predicate:string,text:string,refs:string[],importance:V3Question['importance'],scope:V3Question['targetScope']='job',threshold:number|null=null)=>{
   const existing=result.find(q=>q.companyId===job.companyId&&q.jobId===(scope==='company'?null:job.jobId)&&q.predicate===predicate);
   if(existing){existing.needRefs=[...new Set([...existing.needRefs,...refs])];return;}
   result.push({id:'q-'+stableV3(input.UserProfile.profileId,input.UserProfile.revision,scope==='company'?job.companyId:job.jobId,predicate),version:1,companyId:job.companyId!,jobId:scope==='company'?null:job.jobId,topic,predicate,text,needRefs:refs,targetScope:scope,answerTarget:'source_statement',
    requiredFields:requirements[predicate]??['mechanism','eligibility','period','role'],acceptableEvidence:['full_text','document','user_text','user_pdf'],importance,constraintType:importance==='hard'?'non_negotiable':importance==='priority'?'unspecified':importance==='secondary'?'preference':'unspecified',threshold,
    answerState:'unknown',applicability:'unconfirmed',conclusion:'unknown',supportingClaimIds:[],missingFields:requirements[predicate]??['mechanism','eligibility','period','role'],nextAction:'investigate',stopReason:null,attempts:0,maxAttempts:2,pendingRequestBudget:0,externalQuestion:null,notApplicableReason:null});
  };
  const salary=input.UserProfile.preferences.find((p:any)=>p.key==='min_fixed_monthly_salary'&&p.confirmed&&typeof p.value==='number');
  if(salary)add('pay','fixed_salary','招聘方声明的该岗位固定税前月薪及奖金分别是多少？',['preferences.min_fixed_monthly_salary'],salary.strength==='hard'?'hard':'secondary','job',salary.value);
  for(const item of plan.items){
   if(item.itemId==='clarify'){add(item.topicId,'preference_clarification',item.topicTitle+'：你最在意哪种具体安排？',['topics.'+item.topicId],item.priority==='priority'?'priority':'secondary');const q=result.at(-1)!;q.nextAction='preference_clarification';q.stopReason='user_meaning_not_confirmed';continue;}
   const pred=item.topicId==='pay'&&item.itemId==='fixed'?'fixed_salary':item.topicId==='hours'&&item.itemId==='rest'?'rest':item.topicId==='growth'&&item.itemId==='learning'?'training':item.topicId==='company'&&item.itemId==='public_finance'?'finance':item.topicId==='company'&&item.itemId==='business'?'business':item.topicId==='benefits'&&item.itemId==='coverage'?'social_insurance':item.topicId+'.'+item.itemId;
   add(item.topicId,pred,item.label+'：对应主体、范围、时期和条件是什么？',['topics.'+item.topicId+'.'+item.itemId],item.priority==='priority'?'priority':'secondary',item.topicId==='company'?'company':'job');
  }
  // Background question describes source statements; it never adds a user preference.
  add('identity','identity','招聘品牌、法定主体与签约主体的对应关系及期间是什么？',[],'background','company');
  add('position','recruitment','该岗位招聘状态和对应招聘期间是什么？',[],'background');
  add('opinion','opinion.event','是否有对应该主体、期间及处理阶段的公开事件陈述？',[],'background','company');
  add('company','business','该法人公开资料明确声明的主营业务及报告期是什么？',[],'background','company');
 }
 for(const company of bundle.companies.filter(c=>!bundle.jobs.some(j=>j.companyId===c.companyId))){
  for(const [topic,predicate,text] of [['identity','identity','品牌、法定主体与签约主体关系是什么？'],['company','business','公开声明的主营业务与期间是什么？'],['company','finance','公开财务的指标、单位、币种、披露主体和期间是什么？'],['opinion','opinion.event','公开事件的主体、阶段、回应与期间是什么？']]){
   const requiredFields=requirements[predicate]??['mechanism','eventStage','period'];
   result.push({id:'q-'+stableV3(input.UserProfile.profileId,input.UserProfile.revision,company.companyId,predicate),version:1,companyId:company.companyId,jobId:null,topic,predicate,text,needRefs:[],targetScope:'company',answerTarget:'source_statement',requiredFields,acceptableEvidence:['full_text','document','user_text','user_pdf'],importance:'background',constraintType:'unspecified',threshold:null,answerState:'unknown',applicability:'unconfirmed',conclusion:'unknown',supportingClaimIds:[],missingFields:requiredFields,nextAction:'investigate',stopReason:null,attempts:0,maxAttempts:2,pendingRequestBudget:0,externalQuestion:null,notApplicableReason:null});
  }
 }
 return result;
}
const patterns:Record<string,RegExp>={
 fixed_salary:/固定月薪|月固定工资|每月固定工资|年薪|薪酬|工资|底薪/,
 rest:/每周.{0,8}休|双休|单休|值班|轮班|周末/,
 training:/员工培训|培训体系|入职培训|导师|带教|培训机制|晋升/,
 business:/主营业务|主要业务|业务涵盖|主要从事|解决方案提供商/,
 social_insurance:/社保|社会保险|五险|公积金/,accommodation:/住宿/,overtime_pay:/加班费|加班补偿/,
 finance:/营业收入|净利润|现金流/,
 ...Object.fromEntries(Object.entries(extraPredicates).map(([k,v])=>[k,v.pattern])),
};
/** Deterministic extraction never claims a semantic model ran. Whole source clauses retain negation and conditions. */
export function extractV3Claims(bundle:CandidateBundle,s:V3Snapshot){
 for(const e of bundle.evidence){
  if(!e.companyId)continue;
  const attempt=s.sourceAttempts.find(a=>a.evidenceIds.includes(e.evidenceId));
  const chunks=e.excerpt.split(/(?<=[。；;])\s*|\n+/).filter(x=>x.trim());
  const company=bundle.companies.find(c=>c.companyId===e.companyId)!;
  for(const [i,text] of chunks.entries()){
   const quote=text.trim();if(!quote)continue;
   // A paragraph may mention several companies. A statement owned by another explicit legal name is quarantined.
   const named=quote.match(/[\u4e00-\u9fffA-Za-z（）()]{2,60}?(?:股份有限公司|有限责任公司|有限公司)/g)??[];
   const unrelated=named.length>0&&named.some(n=>!n.includes(company.legalName));
   for(const [predicate,pattern] of Object.entries(patterns)){
    if(!pattern.test(quote)||predicate==='business'&&quote.length<20||predicate==='training'&&quote.length<8||predicate==='business'&&/主营业务成本|主营业务收入|公司上市以来主营业务的变化|^[一二三四五六七八九十]+[、.]/.test(quote)||predicate==='social_insurance'&&/股东|派发|红股|转增|资本公积/.test(quote))continue;
    const id='claim-'+stableV3(e.evidenceId,predicate,quote);if(s.claims.some(c=>c.id===id))continue;
    if(s.claims.length>=800){if(!s.stopReasons.includes('claim_limit'))s.stopReasons.push('claim_limit');return;}
    const exact=!unrelated&&(attempt?.declaredSubject===company.legalName||quote.includes(company.legalName));
    const period=quote.match(/20\d{2}年(?:度|上半年|下半年)?/)?.[0]??e.title.match(/20\d{2}\s*年\s*(?:年度|半年度)报告/)?.[0]??e.publishedAt;
    const role=e.jobId?bundle.jobs.find(j=>j.jobId===e.jobId)?.title??null:null;
    const fields:V3Claim['fields']={period,role};
    // No implied tax basis, currency, scope, current availability or fixed amount.
    if(predicate==='fixed_salary'){
     const amount=quote.match(/(?:固定月薪|月固定工资|每月固定工资)[^\d]{0,12}(\d+(?:\.\d+)?)(?:\s*[-—~至]\s*(\d+(?:\.\d+)?))?\s*([kK千万]?)/);
     const denied=/不提供固定月薪|没有固定月薪|并非固定月薪|不是固定月薪|不属于固定月薪/.test(quote);
     if(amount&&!denied){const f=/[kK千]/.test(amount[3])?1000:amount[3]==='万'?10000:1;fields.min=Number(amount[1])*f;fields.max=Number(amount[2]??amount[1])*f;fields.period='month';fields.basis='fixed';
      if(/固定月薪[^\d]{0,12}(?:不低于|不少于|至少|起)/.test(quote))fields.max=null;
      if(/固定月薪[^\d]{0,12}(?:最高|不超过|至多)/.test(quote))fields.min=null;
      if(/固定月薪[^\d]{0,12}(?:大约|约|左右|预计)/.test(quote)){fields.min=null;fields.max=null;}
     }
     if(/税前/.test(quote))fields.taxBasis='pre_tax';if(/人民币|CNY|元/.test(quote))fields.currency='CNY';
     if(/无附加条件|无条件|自入职起/.test(quote))fields.effectiveConditions=quote;
    } else if(predicate==='rest'){
     if(/每周|双休|单休/.test(quote))fields.frequency=quote;
     if(/必须|强制|无需|自愿/.test(quote))fields.mandatory=quote;
     if(/无附加条件|正常工作周|自入职起/.test(quote))fields.effectiveConditions=quote;
    } else {
     fields.mechanism=quote;
     if(/全体员工|在职员工|新员工|适用于|参加条件|无需申请/.test(quote))fields.eligibility=quote;
    }
    specializedFields(predicate,quote,fields);
    const negative=predicate==='fixed_salary'?/不提供固定月薪|没有固定月薪|并非固定月薪|不是固定月薪|不属于固定月薪/.test(quote):predicate==='accommodation'?/不提供住宿|无住宿/.test(quote):predicate==='social_insurance'?/不(?:缴纳|提供)[^，,。；;但]{0,6}(?:社保|社会保险)|没有社保/.test(quote):predicate==='overtime_pay'?/没有加班费|无加班费/.test(quote):false;
    s.claims.push({id,companyId:e.companyId!,jobId:e.jobId,subject:attempt?.declaredSubject??company.legalName,subjectMatch:unrelated?'unrelated':exact?'exact':'unconfirmed',scope:e.scope,predicate,quote,evidenceId:e.evidenceId,locator:attempt?.locators[attempt.evidenceIds.indexOf(e.evidenceId)]??{paragraph:i+1},fields,period,city:e.jobId?bundle.jobs.find(j=>j.jobId===e.jobId)?.city??null:null,team:null,role,polarity:negative?'negative':'positive',conditions:quote.match(/(?:如果|仅限|须|需|取决于|视)[^。；;]+/g)??[],answerTarget:'source_statement',verification:'source_claim',reviewRequired:!!attempt?.reviewRequired||/欠薪|拖欠工资|监管处罚|岗位取消/.test(quote)});
   }
  }
 }
}
export function assessV3Question(q:V3Question,claims:V3Claim[],s:V3Snapshot){
 const previousState=q.answerState;
 const related=claims.filter(c=>c.companyId===q.companyId&&c.predicate===q.predicate&&c.subjectMatch!=='unrelated');
 q.supportingClaimIds=related.map(c=>c.id);q.missingFields=[...q.requiredFields];q.conclusion='unknown';q.applicability='unconfirmed';
 let reason:'no_claim'|'snippet_only'|'subject_unconfirmed'|'scope_unconfirmed'|'missing_required_fields'|'direct_answer'|'comparable_conflict'|'explicit_not_applicable'='no_claim';
 q.answerState='unknown';
 if(q.notApplicableReason){q.answerState='not_applicable';q.missingFields=[];reason='explicit_not_applicable';}
 else if(related.length){
  q.answerState='partial';
  const exact=related.filter(c=>c.subjectMatch==='exact');
  const scoped=exact.filter(c=>q.targetScope==='company'?c.scope==='company'&&c.jobId===null:c.jobId===q.jobId&&c.scope===q.targetScope);
  const full=scoped.filter(c=>{
   const attempts=s.sourceAttempts.filter(a=>a.evidenceIds.includes(c.evidenceId));
   return (!attempts.length||attempts.some(a=>a.accessState==='ok'&&q.acceptableEvidence.includes(a.contentState)&&a.analysisState==='accepted'))&&c.answerTarget===q.answerTarget;
  });
  const complete=full.filter(c=>q.requiredFields.every(f=>c.fields[f]!==null&&c.fields[f]!==undefined&&c.fields[f]!==''&&(!(f==='period')||c.fields.period!==null)));
  reason=!exact.length?'subject_unconfirmed':!scoped.length?'scope_unconfirmed':!full.length?'snippet_only':'missing_required_fields';
  q.applicability=scoped.length?'applicable':'conditional';
  const best=[...full].sort((a,b)=>q.requiredFields.filter(f=>b.fields[f]!=null).length-q.requiredFields.filter(f=>a.fields[f]!=null).length)[0];
  if(best)q.missingFields=q.requiredFields.filter(f=>best.fields[f]===null||best.fields[f]===undefined||best.fields[f]==='');
  if(complete.length){
   // Only equal contexts are comparable. Numbers are canonical, units explicitly normalized.
   const comparable=(a:V3Claim,b:V3Claim)=>a.period===b.period&&a.city===b.city&&a.team===b.team&&a.role===b.role&&JSON.stringify(a.conditions)===JSON.stringify(b.conditions)&&a.fields.currency===b.fields.currency&&a.fields.reportingScope===b.fields.reportingScope&&a.fields.metric===b.fields.metric;
   const value=(c:V3Claim)=>q.predicate==='fixed_salary'?JSON.stringify([c.fields.min,c.fields.max,c.fields.taxBasis]):q.predicate==='finance'?JSON.stringify([Number(c.fields.value)*(c.fields.unit==='万元'?10000:c.fields.unit==='亿元'?100000000:1),c.polarity]):JSON.stringify([c.fields.mechanism??c.fields.frequency,c.polarity]);
   const conflict=complete.some((a,i)=>complete.slice(i+1).some(b=>comparable(a,b)&&(q.predicate==='fixed_salary'||q.predicate==='finance'?value(a)!==value(b):a.polarity!==b.polarity&&a.fields.mechanism===b.fields.mechanism)));
   q.answerState=conflict?'conflicting':'answered';q.missingFields=[];reason=conflict?'comparable_conflict':'direct_answer';
   if(!conflict&&q.threshold!==null&&q.predicate==='fixed_salary'){
    const c=complete[0];
    if(c.fields.currency==='CNY'&&c.fields.basis==='fixed'&&c.fields.taxBasis==='pre_tax'&&c.fields.period==='month'){
     q.conclusion=Number(c.fields.min)>=q.threshold?'pass':Number(c.fields.max)<q.threshold?'fail':'unknown';
    }
   }
  }
 }
 s.assessments.push({questionId:q.id,previousState,newState:q.answerState,claimIds:q.supportingClaimIds,requiredFieldsChecked:q.requiredFields,missingFields:q.missingFields,reasonCode:reason,assessorVersion:V3_RULE,at:new Date().toISOString()});
}
export function finishV3Questions(s:V3Snapshot){
 // A declared amount can be compared arithmetically; unverified source claims cannot prove fulfilment.
 for(const q of s.questions)if(q.supportingClaimIds.some(id=>s.claims.find(c=>c.id===id)?.verification==='source_claim'))q.conclusion='unknown';
 for(const q of s.questions){
  if(q.predicate==='preference_clarification'){q.nextAction='preference_clarification';q.externalQuestion=null;q.stopReason='user_meaning_not_confirmed';continue;}
  if(q.answerState==='answered'||q.answerState==='not_applicable'){q.nextAction='stop';q.stopReason='applicable_source_answer';continue;}
  q.stopReason??=q.attempts>=q.maxAttempts?'source_attempts_complete':'task_budget_exhausted';
  const critical=q.importance==='hard'||q.importance==='priority';
  if(s.purpose==='selection'&&critical&&q.targetScope!=='company'){
   q.nextAction='external_confirmation';q.externalQuestion=q.predicate==='fixed_salary'?'请招聘方书面说明这个岗位固定税前月薪、奖金及生效条件分别是什么。':q.predicate==='rest'?'请招聘方说明该岗位正常工作周的休息、值班频率和强制条件。':q.predicate==='training'?'请招聘方说明该岗位可参加的培训、带教机制及参加条件。':'请招聘方提供该岗位关于“'+q.text+'”的书面范围、时期和条件。';
  }else q.nextAction='silent_unknown';
 }
 const unknown=s.questions.filter(q=>q.answerState!=='not_applicable'&&(q.importance==='hard'&&q.conclusion==='unknown'||q.importance==='priority'&&q.answerState!=='answered'));
 s.criticalUnknownCount=unknown.length;
 s.keyQuestionIds=s.questions.filter(q=>q.nextAction==='external_confirmation').sort((a,b)=>Number(b.importance==='hard')-Number(a.importance==='hard')).slice(0,3).map(q=>q.id);
 for(const c of s.claims.filter(c=>c.reviewRequired||s.questions.some(q=>q.importance==='hard'&&q.supportingClaimIds.includes(c.id)))){
  if(s.reviews.some(r=>r.id==='review-'+stableV3(c.id)))continue;
  const stamp=new Date().toISOString();s.reviews.push({id:'review-'+stableV3(c.id),claimIds:[c.id],questionIds:s.questions.filter(q=>q.supportingClaimIds.includes(c.id)).map(q=>q.id),trigger:c.reviewRequired?'high_impact_event':'hard_constraint',impact:'requires_verification',state:'deferred',assignee:null,createdAt:stamp,updatedAt:stamp,checks:['quote','subject','scope','conditions'],decision:null,reason:'规则二次检查已完成；无常驻人工复核，来源陈述仍待核验。',ruleVersion:V3_RULE});
  for(const q of s.questions.filter(q=>q.supportingClaimIds.includes(c.id)))q.conclusion='unknown';
 }
}
