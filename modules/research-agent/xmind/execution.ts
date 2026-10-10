import type {CandidateBundle} from '../../../packages/contracts';
import type {V3Snapshot} from '../v3-contract';
import {xmindSchema,roles,type XmindExecution} from './schema';
import {groupSources} from './processing';
import tree from './tree.json';
import {category,routeSources,sources} from './sources';

/** Specialist rule workers share the frozen evidence store. None assert independent verification. */
export function executeXmind(s:V3Snapshot,bundle:CandidateBundle):XmindExecution {
 const at=new Date().toISOString();
 const x:XmindExecution={schemaVersion:'xmind-execution/1',designSha256:tree.designSha256,revision:s.profileRevision,runs:[],routes:[],documents:[],entities:[],relations:[],lineage:[],comparisons:[],translations:[],followups:[],propagation:{status:'disabled',reason:'缺少经过校验的账号与精确时间；不运行协调行为推断',observations:[],signals:[]},reviews:[],updates:[]};
 const run=(role:typeof roles[number],inputIds:string[],outputIds:string[],reason:string,status:XmindExecution['runs'][number]['status']='completed')=>x.runs.push({id:`${s.taskId}:${role}`,role,engine:'rules',status,inputIds:inputIds.slice(0,1000),outputIds:outputIds.slice(0,1000),reason,at});
 run('planner',s.questions.flatMap(q=>q.needRefs),s.questions.map(q=>q.id),'按已确认需求拆分具体问题；硬约束未知保留未知');
 for(const q of s.questions)x.routes.push({questionId:q.id,category:category(q.predicate,q.topic),sourceIds:routeSources(q.predicate,q.topic,q.missingFields),missingFields:q.missingFields,reason:'按问题类别和缺失字段排序；仅表示候选来源，未取得材料不计成功'});
 run('router',s.questions.map(q=>q.id),x.routes.map(r=>r.questionId),'可用通用正文入口优先；专用平台适配器等待下一阶段', 'partial');
 for(const company of bundle.companies){
  x.entities.push({id:company.companyId,kind:'legal_entity',name:company.legalName,companyId:company.companyId,jobId:null});
  if(company.brandName){const id=company.companyId+':brand';x.entities.push({id,kind:'brand',name:company.brandName,companyId:company.companyId,jobId:null});x.relations.push({from:id,to:company.companyId,kind:'candidate_brand',evidenceIds:[],status:'unconfirmed',reason:'候选库品牌关系为线索，不自动认定同一法人'});}
 }
 for(const j of bundle.jobs)if(j.companyId){x.entities.push({id:j.jobId,kind:'job',name:j.title,companyId:j.companyId,jobId:j.jobId});x.relations.push({from:j.jobId,to:j.companyId,kind:'job_context',evidenceIds:[],status:'unconfirmed',reason:'候选岗位上下文；公司证据不能自动代替该岗位证据'});}
 for(const c of s.claims)if(typeof c.fields.contractingEntity==='string'){
  const id=c.id+':contract';x.entities.push({id,kind:'contracting_entity',name:c.fields.contractingEntity,companyId:c.companyId,jobId:c.jobId});x.relations.push({from:id,to:c.companyId,kind:'claimed_contract',evidenceIds:[c.evidenceId],status:'source_claim',reason:'正文声明的签约主体关系，需原件核验'});
 }
 run('identity',bundle.companies.map(c=>c.companyId),x.entities.map(e=>e.id),'法人、品牌、岗位和合同主体分别建图；不跨主体继承结论');
 for(const a of s.sourceAttempts)x.documents.push({id:a.sourceId+':'+a.questionId,evidenceIds:a.evidenceIds,url:a.url,hash:a.rawHash,sourceNature:a.acquisitionMode.startsWith('user_')?'user_supplied':a.sourceClass.includes('official')?'official_statement':'unknown',quality:a.accessState!=='ok'?'unusable':['full_text','document'].includes(a.contentState)?'full':'excerpt',period:a.publishedAt,rawRef:a.rawRef});
 for(const r of s.sourceRelations)x.lineage.push({from:r.from,to:r.to,kind:r.kind==='confirmed_repost'?'explicit_origin':r.kind==='suspected_common_origin'?'near_duplicate':'independence_unknown',score:null,reason:r.reason});
 // Same saved document is one origin even when it contains several useful paragraphs.
 for(const a of s.sourceAttempts)for(const id of a.evidenceIds.slice(1))if(x.lineage.length<1000)x.lineage.push({from:a.evidenceIds[0],to:id,kind:'same_document',score:1,reason:'同一保存文档；不是新增独立来源'});
 groupSources(bundle,x);
 run('provenance',bundle.evidence.map(e=>e.evidenceId),x.documents.map(d=>d.id),'正文、摘录、访问失败及用户提供分开；保存来源谱系，不推定来源独立');
 run('extractor',bundle.evidence.map(e=>e.evidenceId),s.claims.map(c=>c.id),'提取保留否定、条件、口径、时期、原文位置；未覆盖语义保留未知',s.claims.length?'partial':'blocked');
 run('propagation',x.propagation.observations.map(o=>o.evidenceId),x.propagation.signals.flatMap(o=>o.evidenceIds),x.propagation.reason,x.propagation.status==='disabled'?'skipped':'completed');
 for(const q of s.questions){
  const cs=s.claims.filter(c=>q.supportingClaimIds.includes(c.id));
  for(let i=0;i<cs.length;i++)for(let j=i+1;j<cs.length&&x.comparisons.length<1200;j++){
   const a=cs[i],b=cs[j];
   const sameOrigin=a.evidenceId===b.evidenceId||x.lineage.some(r=>['same_document','explicit_origin'].includes(r.kind)&&((r.from===a.evidenceId&&r.to===b.evidenceId)||(r.to===a.evidenceId&&r.from===b.evidenceId)));
   const comparable=a.subjectMatch==='exact'&&b.subjectMatch==='exact'&&a.companyId===b.companyId&&a.jobId===b.jobId&&a.scope===b.scope&&a.period===b.period&&a.city===b.city&&a.team===b.team&&a.role===b.role&&JSON.stringify(a.conditions)===JSON.stringify(b.conditions)&&['currency','reportingScope','metric','taxBasis','basis'].every(f=>a.fields[f]===b.fields[f]);
   const normalized=(c:typeof a)=>c.predicate==='fixed_salary'?JSON.stringify([c.fields.min,c.fields.max,c.polarity]):c.predicate==='finance'?JSON.stringify([Number(c.fields.value)*(c.fields.unit==='亿元'?1e8:c.fields.unit==='万元'?1e4:1),c.polarity]):JSON.stringify([c.fields.mechanism??c.fields.frequency,c.polarity]);
   const identical=normalized(a)===normalized(b), numeric=['fixed_salary','finance'].includes(a.predicate)&&['value','min'].some(f=>typeof a.fields[f]==='number'&&typeof b.fields[f]==='number');
   const result=sameOrigin?'same_origin':!comparable?'not_comparable':identical?'supports':numeric||a.fields.mechanism===b.fields.mechanism&&a.polarity!==b.polarity?'contradicts':'not_comparable';
   x.comparisons.push({questionId:q.id,left:a.id,right:b.id,result,reason:sameOrigin?'同源不可重复计支持':!comparable||result==='not_comparable'?'主体、时期、范围、条件、指标或非结构化语义不可比':result==='contradicts'?'可比命题的极性相反；进入复核':'同范围陈述；不代表独立证实'});
  }
  x.translations.push({questionId:q.id,language:cs.length?cs.slice(0,3).map(c=>c.quote).join('\n'):'未取得直接回答的陈述',context:`适用性 ${q.applicability}；缺失 ${q.missingFields.join('、')||'无'}；陈述尚未独立证实`,decision:`问题状态 ${q.answerState}；需求满足 ${q.conclusion}；${q.stopReason??'继续调查'}`,evidenceIds:[...new Set(cs.map(c=>c.evidenceId))],verification:'source_claim'});
  x.followups.push({questionId:q.id,action:q.nextAction,untriedSourceIds:q.nextAction==='investigate'?x.routes.find(r=>r.questionId===q.id)!.sourceIds:[],reason:q.stopReason??'按缺失字段补查；受原问题预算约束'});
 }
 x.reviews=s.reviews.map(r=>({id:r.id,claimIds:r.claimIds,reason:r.reason,state:r.state==='auto_checked'?'pending':r.state,decision:r.decision,at:r.updatedAt}));
 run('verifier',s.claims.map(c=>c.id),s.questions.map(q=>q.id),'语义支持、范围、来源独立性和字段完整性分别检查；机器检查不冒充人工复核',x.reviews.length?'partial':'completed');
 if(['completed','failed'].includes(s.model.status))x.runs.push({id:s.taskId+':semantic-model',role:'verifier',engine:'model',status:s.model.status==='completed'?'completed':'blocked',inputIds:s.semanticChecks.map(c=>c.evidenceId),outputIds:s.semanticChecks.map(c=>c.questionId),reason:s.model.reason,at});
 run('interpreter',s.questions.map(q=>q.id),x.translations.map(t=>t.questionId),'原句、适用范围、个人需求判断分三层呈现');
 run('followup',s.questions.map(q=>q.id),x.followups.map(f=>f.questionId),'复用问题级预算与退出条件；关键外部追问最多三项');
 x.updates.push({kind:s.questions.some(q=>q.stopReason==='reused_frozen_sources')?'needs_revision':'new_material',evidenceIds:bundle.evidence.slice(0,1000).map(e=>e.evidenceId),reason:'冻结当前材料和判断；需求修订复用原文，不重复付费获取',at});
 run('archive',s.questions.map(q=>q.id),[s.taskId],'执行结果进入显式校验、检查点和实际历史报告；旧报告不强制补字段');
 return xmindSchema.parse(x);
}

export function xmindCapabilities(){return {designSha256:tree.designSha256,nodeCount:tree.nodes.length,relationships:tree.relationships,roles,sources,nodes:tree.nodes.map(n=>({...n,implementation:n.stage==='planning'?'planner':n.stage==='routing'?'router':n.stage==='processing'?'identity/provenance/extractor/verifier':n.stage==='interpretation'?'interpreter':n.stage==='followup'?'followup':n.stage==='archive'?'archive':n.stage==='groups'?'controlled_text_import':n.stage==='tools'?'source_registry':'design_reference',status:['groups','tools'].includes(n.stage)?'partial':'structural_mapping'}))};}
