import {DatabaseSync} from 'node:sqlite';
import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {candidateBundleSchema,validateBundleReferences,type CandidateBundle} from '../contracts';
import {cityOptions} from '../../modules/a-profile/src/profile/selections.mjs';
import {extractNeedLeads,needSignals} from './database-investigation';
import {respondToJobNeeds} from './job-needs';

type Row=Record<string,any>;
const name='企业分析数据库_v3_20261003';
const dir=()=>join(process.cwd(),'.data','company-database');
function database(){const path=join(dir(),'xray-v3-20261003.sqlite');if(!existsSync(path))throw Object.assign(Error('本地企业数据库尚未配置'),{status:503});return new DatabaseSync(path,{readOnly:true});}
function manifest(){return JSON.parse(readFileSync(join(dir(),'manifest.json'),'utf8'));}
const text=(x:unknown)=>typeof x==='string'&&x.trim()?x.trim():null;
const url=(x:unknown)=>{try{const u=new URL(String(x));return ['http:','https:'].includes(u.protocol)?u.href:null;}catch{return null;}};
// Incomplete source dates are not silently given a day; timezone-free database times retain unknown timezone.
const date=(x:unknown)=>text(x);
// The snapshot import timestamp is a stable fallback, not a claimed source date.
// Original dates remain visible through sourceDates; repeat reads must not give
// the same evidence ID different content and break same-company comparisons.
const retrieved=(x:unknown)=>{const s=text(x);if(s&&/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(s)&&Number.isFinite(Date.parse(s)))return s;const imported=text(manifest().importedAt);if(!imported||!Number.isFinite(Date.parse(imported)))throw Error('数据库导入时间缺失，请核对导入清单');return imported;};
const rolePatterns:Record<string,RegExp>={engineering:/工程师|开发|架构|运维|技术岗|技术类|Java|C\+\+|Linux/i,research:/算法|研究|科研|研发|AGI|LLM/i,product_design:/产品经理|产品岗|产品负责人|产品设计|产品开发|策划|设计/,product_operations:/运营|内容|剪辑|主播|营销/,sales_business:/销售|商务|客户经理|BD|大区经理|地区经理/i,customer_delivery:/交付|实施|支持|服务工程师|培训/,production_quality:/质量|测试|检测|生产|工艺|工业工程/,functions:/财务|人力|行政|组织发展|信息披露/,professional:/咨询|顾问|投行|法律/};
const industryPatterns:Record<string,RegExp>={software_it:/互联网|电商|云|AI|人工智能|软件|网络|信息服务|金融科技|SaaS|IoT|视频剪辑|直播|游戏|物流科技/i,manufacturing:/制造|硬件|能源|汽车|机器人|电器|厨电|物联|医疗器械|脑机/,healthcare:/医疗|医药|医学|生物|医院|药/,education:/教育|培训|教学/,professional_services:/科研|咨询|专业服务|商务服务/,commerce:/消费|食品|饮料|商贸|零售|母婴|美妆|电商/,finance:/金融|银行|城商行|农商行|保险|证券|基金|信托|资产管理|资管/};
export function matchesDatabaseIndustry(tags:string[],domain:string|null){
 return !domain||!tags.length||tags.some(id=>industryPatterns[id]?.test(domain));
}
function documentedSalary(row:Row){
 const raw=String(row.raw_jd),min=row.salary_min,max=row.salary_max;
 const amounts=[...raw.matchAll(/(\d+(?:\.\d+)?)\s*[-~至]\s*(\d+(?:\.\d+)?)\s*([Kk千万元]?)/g)].map(m=>{const factor=/[Kk千]/.test(m[3])?1000:m[3]==='万'?10000:1;return [Number(m[1])*factor,Number(m[2])*factor];});
 const consistent=amounts.some(([a,b])=>a===min&&b===max);
 // Structured columns may describe a different role or period (e.g. monthly employee pay beside intern day pay).
 return {currency:text(row.salary_currency)??'CNY',min:consistent?min:null,max:consistent?max:null,period:/月薪|每月|\/月/.test(raw)?'month' as const:'unknown' as const,basis:/固定(?:月薪|工资)|底薪|基本工资/.test(raw)?'fixed' as const:'unknown' as const,taxBasis:/税前/.test(raw)?'pre_tax' as const:'unknown' as const,months:null};
}
function cities(row:Row){const field=text(row.city);return field?(cityOptions as string[]).filter(c=>field.includes(c)):[];}
function reference(row:Row){return /统计|口径|薪酬分布|薪资分布/.test(row.title+' '+row.raw_jd)||/\/salary(?:\/|$)/.test(row.source_url??'');}
function shortlist(input:Row){
 const db=database();try{
  const rows=db.prepare('SELECT j.*,c.name company_name,c.domain FROM company_jobs j JOIN companies c ON c.id=j.company_id ORDER BY j.id').all() as Row[];
  const intent=input.SearchIntent,goals=input.JobNeedsSnapshot.selectionData.goalIds as string[],chosenCities=intent.cities as string[];
  const hardCity=intent.filters.some((c:Row)=>c.key==='city'&&c.strength==='hard');
  const excluded={city:0,industry:0,role:0,opportunity:0,invalid:0};
  const candidates:Row[]=[],references:Row[]=[];
  for(const row of rows){
   if(!text(row.title)||!text(row.raw_jd)){excluded.invalid++;continue;}
   const knownCities=cities(row),notes:string[]=[];
   if(hardCity&&chosenCities.length&&knownCities.length&&!knownCities.some(c=>chosenCities.includes(c))){excluded.city++;continue;}
   if(chosenCities.length&&!knownCities.length)notes.push('实际工作城市待确认');
   if(knownCities.length>1)notes.push('资料提到多个工作城市，具体岗位地点待确认');
   const domain=text(row.domain),title=row.title as string;
   if(!matchesDatabaseIndustry(intent.industryTags,domain)){excluded.industry++;continue;}
   if(!domain)notes.push('行业未明确，待核验');
   if(intent.roleTypes.length&&!intent.roleTypes.some((id:string)=>rolePatterns[id]?.test(title))){excluded.role++;continue;}
   if(goals.includes('find_internship')&&!/实习/.test(title+' '+row.raw_jd)&&/社招|资深|高级|专家|负责人|总监|经理|[3-9]-[5-9]年/.test(title+' '+row.raw_jd)){excluded.opportunity++;continue;}
   if(goals.includes('find_internship')&&!/实习/.test(title+' '+row.raw_jd))notes.push('是否提供实习机会待确认');
   notes.push('行业标签与岗位标题提供方向线索，具体职责仍需核实');
   if(chosenCities.length&&knownCities.some(c=>chosenCities.includes(c)))notes.push('资料记录的城市在你的意向城市内；实际办公点仍待核实');
   else if(chosenCities.length&&knownCities.length)notes.push('资料记录的城市不在你的意向城市内；这是软偏好差异，未作为必须满足条件排除');
   if(row.salary_min!==null&&documentedSalary(row).min===null)notes.push(`数据库待遇栏记为 ${row.salary_min}–${row.salary_max??'未记载'}，未能与岗位摘录对齐；发放周期、固定部分和税前税后不能据此确认`);
   const item={recordId:Number(row.id),companyName:row.company_name,title,city:row.city??null,sourceUrl:url(row.source_url),sourceType:text(row.source_type)??'来源未记录',excerpt:String(row.raw_jd).slice(0,180),recordKind:reference(row)?'salary_reference':'job_lead',notes,cityPriority:knownCities.length?Math.min(...knownCities.map(c=>chosenCities.indexOf(c)).filter(n=>n>=0),999):999,internship:/实习/.test(title+' '+row.raw_jd)};
   (reference(row)?references:candidates).push(item);
  }
  candidates.sort((a,b)=>a.cityPriority-b.cityPriority||Number(b.internship)-Number(a.internship)||a.recordId-b.recordId);
  const m=manifest();return {sourceName:name,sourceFingerprint:m.sha256,counts:m.counts,examined:rows.length,excluded,candidates:candidates.slice(0,12).map(({cityPriority,internship,...x})=>x),candidateCount:candidates.length,references:references.slice(0,6).map(({cityPriority,internship,...x})=>x),referenceCount:references.length};
 }finally{db.close();}
}
export function databaseBundle(input:Row,recordIds:number[]){
 const found=shortlist(input);
 const selectable=[...found.candidates,...found.references];
 if(!Array.isArray(recordIds)||recordIds.length<1||recordIds.length>3||new Set(recordIds).size!==recordIds.length||recordIds.some(id=>!Number.isInteger(id)||!selectable.some((c:Row)=>c.recordId===id)))throw Error('请选择当前侧写下的一至三条候选或薪资统计参考');
 const db=database();try{return assembleBundle(db,input,recordIds,found);}finally{db.close();}
}

export function relatedCompanyRecords(db:DatabaseSync,row:Row){
 const legal=text(row.full_name),code=text(row.credit_code_collab)??text((db.prepare('SELECT credit_code FROM company_business WHERE company_id=?').get(row.company_id) as Row|undefined)?.credit_code);
 if(!legal)return [row.company_id];
 const records=(db.prepare('SELECT c.id,c.credit_code_collab,b.credit_code FROM companies c LEFT JOIN company_business b ON b.company_id=c.id WHERE c.full_name=?').all(legal) as Row[]);
 if(!code&&new Set(records.map(c=>text(c.credit_code_collab)??text(c.credit_code)).filter(Boolean)).size>1)return [row.company_id];
 return records.filter(c=>{const other=text(c.credit_code_collab)??text(c.credit_code);return c.id===row.company_id||!code||!other||code===other;}).map(c=>c.id);
}
export function relevantCompanyExcerpt(e:Row,legal:string,brand:string){
 const body=String(e.excerpt??''),title=String(e.title??'');
 if(!body.trim()||/杭州不得不去|上有天堂，下有苏杭|西湖.*美景/.test(body)||/无法提供.{0,10}(描述|摘要)|已支持 IPV6/.test(body)||/网银.*(登录|欢迎|客户端)|景点|走进杭州/.test(title))return false;
 const alias=brand.match(/[\u4e00-\u9fff]{2,}/)?.[0]??brand;
 return String(e.raw_meta??'').includes('coll_companyId')||['official','eastmoney','etnet','qcc','tianyancha'].includes(e.source_type)||(title+' '+body).includes(legal)||(title+' '+body).includes(alias);
}

function assembleBundle(db:DatabaseSync,input:Row,recordIds:number[],found:ReturnType<typeof shortlist>){
  const stamp=new Date().toISOString(),prefix='db-'+found.sourceFingerprint.slice(0,12),inputIntent=input.SearchIntent;
  const sourceDates:Row[]=[],factRecords:Row[]=[],companyRecords:Row[]=[],coverageRecords:Row[]=[],selectionRecords:Row[]=[],withdrawnEvidenceRecords:Row[]=[];
  const bundle:CandidateBundle={schemaVersion:'1.0.0',bundleId:'bundle-'+randomUUID(),projectId:inputIntent.projectId,intentId:inputIntent.intentId,intentRevision:inputIntent.revision,mode:inputIntent.mode,retrievedAt:stamp,companies:[],jobs:[],evidence:[],facts:[],coverage:[],usage:[]};
  for(const id of recordIds){
   const row=db.prepare('SELECT j.*,c.name company_name,c.full_name,c.domain,c.credit_code_collab,c.identity_status_collab,c.notes company_notes FROM company_jobs j JOIN companies c ON c.id=j.company_id WHERE j.id=?').get(id) as Row;
   const salaryReference=reference(row),recordKind=salaryReference?'salary_reference':'job_lead';
   const linkedIds=relatedCompanyRecords(db,row);
   const companyId=prefix+'-company-'+row.company_id,jobId=prefix+'-job-'+id,jobEvidence=prefix+'-jd-'+id;
   selectionRecords.push({jobId,recordId:id,recordKind});
   // The database's company bucket may combine a group, brand and subsidiary. It does not prove this job's signing entity.
   const business=db.prepare('SELECT * FROM company_business WHERE company_id=?').get(row.company_id) as Row|undefined;
   if(!bundle.companies.some(c=>c.companyId===companyId)){
    const legalName=text(business?.legal_name)??text(row.full_name),creditCode=text(business?.credit_code)??text(row.credit_code_collab);
    bundle.companies.push({companyId,legalName:legalName??row.company_name,brandName:row.company_name,creditCode,identityStatus:legalName||creditCode?'ambiguous':'unresolved'});
    companyRecords.push({companyId,linkedRecordIds:linkedIds,association:'全称相同且已知信用代码无冲突，仅关联公司层面资料，不确认岗位签约主体',legalNameRaw:legalName,creditCodeRaw:creditCode,identityOriginal:row.identity_status_collab,notesRaw:row.company_notes,policy:'本地登记线索；尚无岗位签约关系及独立核验来源，不是已确认主体'});
    if(business?.is_listed===1&&business?.listing_market==='未上市'){
     const evidenceId=prefix+'-identity-fields-'+row.company_id;
     bundle.evidence.push({evidenceId,companyId,jobId:null,scope:'company',sourceType:'local_database_field_comparison',title:'主体资料字段不一致（原始来源待核）',url:null,publishedAt:null,retrievedAt:retrieved(business.retrieved_at),excerpt:'同一公司记录的上市标记为「是」，上市市场却记为「未上市」。该桶可能混合品牌、法人及上市集团，需要核对各字段对应主体。',mode:bundle.mode,verification:'disputed'});
     bundle.facts.push({factId:evidenceId+'-fact',companyId,jobId:null,key:'company.identity_conflict',value:'本地资料同时记录已上市和未上市，主体或口径未对齐；不能据此认定签约公司上市或未上市。',status:'conflicting',evidenceIds:[evidenceId],asOf:null});
     sourceDates.push({evidenceId,publishedAtRaw:null,retrievedAtRaw:business.retrieved_at,recordTable:'company_business',recordId:business.id,verificationOriginal:'not_recorded'});
    }
   }
   const cs=cities(row);
   // A neutral job-shaped context satisfies the report contract without turning a statistics record into a vacancy.
   bundle.jobs.push({jobId,companyId,title:salaryReference?'薪资统计参考 · '+row.title:row.title,rawJd:salaryReference?'用于公司层面调查的薪资统计参考；不是岗位 JD，不说明实际工作城市、在招状态或该岗位薪酬。原始统计摘录保留在公司范围资料中。':row.raw_jd,city:salaryReference?null:cs.length===1?cs[0]:null,sourceUrl:url(row.source_url),publishedAt:date(row.published_at),vacancyStatus:'unknown',salary:salaryReference?{currency:text(row.salary_currency)??'CNY',min:null,max:null,period:'unknown',basis:'unknown',taxBasis:'unknown',months:null}:documentedSalary(row)});
   bundle.evidence.push({evidenceId:jobEvidence,companyId,jobId:salaryReference?null:jobId,scope:salaryReference?'company':'job',sourceType:salaryReference?'local_database_salary_reference':'local_database_job_summary',title:(text(row.source_type)??'数据库')+(salaryReference?' · 公司薪资统计参考':' · 岗位摘录'),url:url(row.source_url),publishedAt:date(row.published_at),retrievedAt:retrieved(row.retrieved_at),excerpt:row.raw_jd,mode:bundle.mode,verification:'unverified'});
   if(!salaryReference){
    bundle.facts.push({factId:jobEvidence+'-description',companyId,jobId,key:'job.description',value:row.raw_jd,status:'unknown',evidenceIds:[jobEvidence],asOf:date(row.published_at)});
    if(cs.length===1&&String(row.raw_jd).includes(cs[0]))bundle.facts.push({factId:jobEvidence+'-city',companyId,jobId,key:'job.city',value:cs[0],status:'unknown',evidenceIds:[jobEvidence],asOf:date(row.published_at)});
   }
   sourceDates.push({evidenceId:jobEvidence,jobId:salaryReference?null:jobId,recordId:id,recordKind,scopeOriginal:salaryReference?'company':'job',publishedAtRaw:row.published_at,retrievedAtRaw:row.retrieved_at,timezone:'not_recorded',salaryRaw:{min:row.salary_min,max:row.salary_max,period:row.salary_period,basis:row.salary_basis,taxBasis:row.salary_tax_basis,months:row.salary_months}});
   // Select only bounded, relevant company material. Search noise and sentiment labels never become company/job facts.
   const addEvidence=(e:Row)=>{
    if(Number(e.is_stale)===1||e.verification==='contradicted')return null;
    if(salaryReference&&(e.job_id!==null||e.scope==='job'))return null;
    if(!relevantCompanyExcerpt(e,text(row.full_name)??row.company_name,row.company_name))return null;
    const duplicate=bundle.evidence.find(x=>x.companyId===companyId&&x.excerpt===String(e.excerpt)&&x.title.endsWith(text(e.title)??'公司资料摘录')&&x.url===url(e.url));if(duplicate)return duplicate.evidenceId;
    const evidenceId=prefix+'-ev-'+e.id;if(bundle.evidence.some(x=>x.evidenceId===evidenceId))return evidenceId;
    const group=/上市公司集团|归母净利|集团年报/.test(e.excerpt),review=/员工评价/.test(e.title??'');
    bundle.evidence.push({evidenceId,companyId,jobId:e.job_id===id?jobId:null,scope:/支行|分行/.test(e.title??'')&&e.job_id===null?'business':e.scope,sourceType:text(e.source_type)??'database_material',title:(group?'公司或集团报道线索 · ':review?'公司员工评价线索 · ':'')+(text(e.title)??'公司资料摘录'),url:url(e.url),publishedAt:date(e.published_at),retrievedAt:retrieved(e.retrieved_at),excerpt:String(e.excerpt),mode:bundle.mode,verification:e.verification==='disputed'?'disputed':'unverified'});
    sourceDates.push({evidenceId,companyRecordIdOriginal:e.company_id,linkedBy:linkedIds.includes(e.company_id)&&e.company_id!==row.company_id?'same_legal_name_no_known_credit_conflict':null,publishedAtRaw:e.published_at,retrievedAtRaw:e.retrieved_at,verificationOriginal:e.verification,isStaleOriginal:e.is_stale,staleReasonOriginal:e.stale_reason,scopeOriginal:e.scope,jobRecordIdOriginal:e.job_id});return evidenceId;
   };
   const eligibleScope="company_id=? AND ((job_id IS NULL AND scope IN ('company','business','team')) OR (job_id=? AND scope='job' AND "+(salaryReference?'0':'1')+")) AND length(trim(excerpt))>0";
   // Upstream withdrawals are retained as provenance only, never fed to needs extraction or report facts.
   const eligible=eligibleScope+" AND COALESCE(is_stale,0)<>1 AND COALESCE(verification,'')<>'contradicted'";
   for(const cid of linkedIds){
    const withdrawn=db.prepare(`SELECT * FROM evidence WHERE ${eligibleScope} AND (COALESCE(is_stale,0)=1 OR verification='contradicted') ORDER BY id`).all(cid,cid===row.company_id?id:-1) as Row[];
    for(const e of withdrawn)if(!withdrawnEvidenceRecords.some(r=>r.recordId===e.id))withdrawnEvidenceRecords.push({recordId:e.id,originalEvidenceId:e.evidence_id,companyRecordIdOriginal:e.company_id,jobRecordIdOriginal:e.job_id,isStaleOriginal:e.is_stale,staleReasonOriginal:e.stale_reason,verificationOriginal:e.verification,reason:'上游已标记撤销或失效，仅保留撤销标记，不纳入分析证据。'});
   }
   // Correlate company passages only; never borrow another record's jobs.
   const materials=linkedIds.flatMap(cid=>db.prepare(`SELECT * FROM evidence WHERE ${eligible} ORDER BY id`).all(cid,cid===row.company_id?id:-1) as Row[])
    .filter(e=>relevantCompanyExcerpt(e,text(row.full_name)??row.company_name,row.company_name));
   const selectedDetails=input.JobNeedsSnapshot.topics.flatMap((t:Row)=>(t.verificationItemIds as string[]).map(detail=>t.topicId+'.'+detail)) as string[];
   const unique=new Map<string,Row>();for(const e of materials)unique.set(JSON.stringify([e.title,e.excerpt,e.url]),e);
   const passages=[...unique.values()];passages.slice(0,24).forEach(addEvidence);
   for(const detail of selectedDetails){const signals=needSignals[detail];if(signals)passages.filter(e=>signals.some(signal=>String(e.excerpt).includes(signal))).slice(0,4).forEach(addEvidence);}
   const companyFacts=linkedIds.flatMap(cid=>db.prepare("SELECT * FROM facts WHERE company_id=? AND (job_id IS NULL OR job_id=?) AND (fact_key LIKE 'company.%' OR fact_key LIKE 'needs.%' OR (job_id=? AND fact_key LIKE 'job.%')) ORDER BY id").all(cid,cid===row.company_id?id:-1,cid===row.company_id?id:-1) as Row[]);
   for(const f of companyFacts){
    if(salaryReference&&(f.job_id!==null||String(f.fact_key).startsWith('job.')))continue;
    const factId=prefix+'-fact-'+f.id;if(bundle.facts.some(x=>x.factId===factId))continue;
    let ids:string[]=[];try{const parsed=JSON.parse(f.evidence_ids);if(Array.isArray(parsed))ids=parsed.filter((x:unknown)=>typeof x==='string');}catch{ids=[];}
    const evidenceIds:string[]=[],withdrawnFact=f.status==='contradicted';
    for(const eid of withdrawnFact?[]:ids){const e=db.prepare(`SELECT * FROM evidence WHERE ${eligible} AND evidence_id=?`).get(f.company_id,f.company_id===row.company_id?(f.job_id??-1):-1,eid) as Row|undefined;if(!e||!text(e.excerpt)||e.job_id!==f.job_id)continue;const ref=addEvidence(e);if(ref)evidenceIds.push(ref);}
    const included=!withdrawnFact&&ids.length>0&&evidenceIds.length===ids.length&&!!text(f.fact_value);
    factRecords.push({factId,originalFactId:f.fact_id,companyRecordIdOriginal:f.company_id,valueRaw:f.fact_value,key:f.fact_key,statusOriginal:f.status,nVerifiedOriginal:f.n_verified,asOfRaw:f.as_of,included,missingEvidenceIds:ids.filter(eid=>!db.prepare('SELECT id FROM evidence WHERE evidence_id=?').get(eid)),withdrawnEvidenceIds:ids.filter(eid=>withdrawnEvidenceRecords.some(e=>e.originalEvidenceId===eid)),note:withdrawnFact?'上游事实已标记否定或撤销，不作为判断事实。':included?'保留采集值及同范围引用，未独立核验。':'原记录缺少完整有效的同范围引用，不作为判断事实；不为它补造证据。'});
    if(!included)continue;
    bundle.facts.push({factId,companyId,jobId:f.job_id===id?jobId:null,key:f.fact_key,value:text(f.fact_value),status:f.status==='conflicting'?'conflicting':'unknown',evidenceIds,asOf:date(f.as_of)});
   }
   for(const cid of linkedIds){
    const legacy=db.prepare("SELECT * FROM facts WHERE company_id=? AND job_id IS NULL AND fact_key GLOB 'B[1-9].*' AND COALESCE(status,'')<>'contradicted'").all(cid) as Row[];
    for(const f of legacy){let refs:string[]=[];try{refs=JSON.parse(f.evidence_ids);}catch{}if(!Array.isArray(refs))continue;
     for(const ref of refs){const e=db.prepare(`SELECT * FROM evidence WHERE ${eligible} AND evidence_id=?`).get(cid,-1,ref) as Row|undefined;
      if(!e||!relevantCompanyExcerpt(e,text(row.full_name)??row.company_name,row.company_name))continue;
      // All seven themes are reconstructed by extractNeedLeads using literal source passages.
      if(Object.values(needSignals).some(signals=>signals.some(signal=>String(e.excerpt).includes(signal))))addEvidence(e);
     }
    }
   }
   const sourceCoverage=db.prepare('SELECT * FROM coverage WHERE company_id=? AND (job_id IS NULL OR job_id=?)').all(row.company_id,salaryReference?-1:id) as Row[];
   coverageRecords.push(...sourceCoverage.map(c=>({companyId,jobId:c.job_id,topic:c.topic,status:c.status,reason:c.reason,checkedAtRaw:c.checked_at})));
   const topicSignals:Record<string,RegExp>={business:/主营|业务|营收|经营/,business_financials:/财报|年报|净利|营收|亏损/,credit_legal:/信用代码|登记|监管|处罚|诉讼/,work_conditions:/工时|打卡|加班|双休|社保|五险|六险|补贴/,team_growth:/内部培训|带教|晋升|轮岗|团队/};
   for(const topic of ['job_description','company_identity','business','business_financials','credit_legal','work_conditions','team_growth']){
    const has=topic==='job_description'?!salaryReference:(topic==='company_identity'?!!text(row.full_name)||!!text(row.credit_code_collab):bundle.evidence.some(e=>e.companyId===companyId&&(salaryReference?e.jobId===null:!e.jobId||e.jobId===jobId)&&topicSignals[topic]?.test(e.excerpt)));
    bundle.coverage.push({companyId,jobId:topic==='job_description'?jobId:null,topic,status:has?'available':'unavailable',reason:topic==='job_description'?salaryReference?'所选记录为公司薪资统计参考，不是招聘 JD；具体岗位、工作城市、薪酬约定和是否在招均未提供。':'已有岗位摘录；原文完整性、来源和当前在招仍待核验。':has?'已有与本问题相关的本地资料线索；其主体、岗位适用性和真实性仍待确认，不代表需求已满足。':'本次未找到具有明确引用且范围可对齐的相关资料；主体待确认并非抹去其他公司线索的理由。',checkedAt:stamp});
   }
  }
  extractNeedLeads(bundle);
  candidateBundleSchema.parse(bundle);if(validateBundleReferences(bundle).length)throw Error('数据库资料引用关系不一致');
  return {bundle,databaseSource:{name,fingerprint:found.sourceFingerprint,recordIds,selectionRecords,sourceDates,factRecords,companyRecords,coverageRecords,withdrawnEvidenceRecords,importedFromLocal:true,policy:'question-driven-local-leads; preserve-scope-date-and-unverified-status; no-unbound-job-or-sentiment-facts; salary-references-are-company-statistics-not-vacancies; exclude-withdrawn-or-stale-evidence-and-contradicted-facts'}};
}

export function findDatabaseCandidates(input:Row){
 const found=shortlist(input),db=database();
 try{
  const candidates=found.candidates.map((candidate:Row)=>{
   const {bundle,databaseSource}=assembleBundle(db,input,[candidate.recordId],found);
   const response=respondToJobNeeds(input.JobNeedsSnapshot,bundle,{sourceDates:databaseSource.sourceDates});
   const investigation=response.candidates[0].items.map(item=>({
    topic:item.topicTitle,label:item.label,status:item.status,explanation:item.explanation,gaps:item.gaps,question:item.question,
    materials:item.materials.slice(0,3).map(m=>({
     text:String(m.value??'').slice(0,180),
     sources:m.sources.map(s=>({title:s.title,scope:s.scope,url:s.url,publishedAt:s.publishedAt,collectedAt:s.collectedAt,dateNote:s.dateNote,excerpt:s.excerpt.slice(0,180)}))
    }))
   }));
   return {...candidate,investigation};
  });
  return {...found,candidates};
 }finally{db.close();}
}
