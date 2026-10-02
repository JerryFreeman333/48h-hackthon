import {randomUUID,createHash} from 'node:crypto';
import {mkdirSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {z} from 'zod';
import {instrument,publicTools,canonicalResponses,assess,hash} from '../instruments/battery.mjs';
import {constraint,insight,text,valuesSchema,validateProfileV2,validateHandoff} from './schemas.mjs';
import {fit,catalog} from '../occupation-fit/index.mjs';
import {buildReport} from '../report/template.mjs';
import {exportV1} from '../adapters/v1.mjs';
import {checkFile,candidatesFromText} from '../resume/extract.mjs';
import {parseJob} from '../resume/jobs.mjs';
export class V2Error extends Error{constructor(status,code,message){super(message);this.status=status;this.code=code;}}
const fail=(status,code,message)=>{throw new V2Error(status,code,message);};
const publicSession=s=>{const {owner,...out}=s;return structuredClone(out);};
const time=()=>new Date().toISOString();
const unique=(a,message)=>{if(new Set(a).size!==a.length)fail(422,'validation_error',message);};
export const valueOptions=['收入','稳定','成长','自主','创造','帮助他人','团队支持','认可','生活平衡','地点灵活性'];
export class ProfileService{
 constructor(state,save,{dataDir,modelsDir}={}){
  this.state=state;this.save=save;this.dataDir=dataDir;this.modelsDir=modelsDir;
  this.db=state.v2??={sessions:{},profiles:[],intents:[],jobs:{}};
  let changed=false;for(const job of Object.values(this.db.jobs))if(job.status==='processing'){job.status='failed';job.error={code:'parse_failed',message:'服务重启打断解析，请重新提交'};changed=true;}if(changed)this.save();
 }
 owned(owner,id){const s=this.db.sessions[id];if(!s)fail(404,'not_found','会话不存在');if(s.owner!==owner)fail(403,'forbidden','没有访问权限');return s;}
 byProfile(owner,id){const s=Object.values(this.db.sessions).find(s=>s.profileId===id);if(!s)fail(404,'not_found','画像不存在');return this.owned(owner,s.id);}
 expected(s,input){if(input.expectedRevision!==s.revision)fail(409,'revision_conflict','记录已保存更新，请刷新后重试');}
 touch(s){s.revision++;s.updatedAt=time();this.save();}
 list(owner){return Object.values(this.db.sessions).filter(s=>s.owner===owner).map(publicSession);}
 create(owner,input){
  const x=z.object({battery:z.enum(['Quick','Standard','None']),mode:z.enum(['manual','demo']).default('manual')}).strict().parse(input);
  const s={id:randomUUID(),owner,ownerId:randomUUID(),profileId:randomUUID(),projectId:randomUUID(),revision:1,createdAt:time(),updatedAt:time(),battery:x.battery,mode:x.mode,step:0,draft:{groups:[],tradeoffs:[],constraints:[],goals:[],jobStage:null,statementBuffer:''},attempts:{},claims:[],evidence:[],insights:[]};
  const ids=x.battery==='Standard'?['onet-mini-ip','mini-ipip']:x.battery==='Quick'?['onet-mini-ip']:[];
  for(const id of ids){const t=instrument(id);s.attempts[id]={id:randomUUID(),instrumentId:id,instrumentVersion:t.instrumentVersion,scoringVersion:t.scoringVersion,answers:{},page:0,revision:1};}
  this.db.sessions[s.id]=s;this.save();return publicSession(s);
 }
 get(owner,id){return publicSession(this.owned(owner,id));}
 update(owner,id,input){const s=this.owned(owner,id);this.expected(s,input);
  const x=z.object({expectedRevision:z.number().int(),step:z.number().int().min(0).max(7).optional(),draft:z.object({groups:z.array(z.array(text).min(1).max(30)).max(30),tradeoffs:z.array(text).max(30),constraints:z.array(constraint).max(30),goals:z.array(text).max(30),jobStage:z.string().max(100).nullable(),statementBuffer:z.string().max(4000).optional()}).strict().optional()}).strict().parse(input);
  if(x.draft){unique(x.draft.groups.flat(),'价值偏好不能重复');unique(x.draft.constraints.map(c=>c.key),'条件不能重复');if(x.draft.constraints.some(c=>c.evidenceIds.length))fail(422,'validation_error','草稿证据由服务器生成');s.draft=structuredClone(x.draft);}
  if(x.step!==undefined)s.step=x.step;this.touch(s);return publicSession(s);
 }
 attempt(owner,id){for(const s of Object.values(this.db.sessions))for(const a of Object.values(s.attempts))if(a.id===id){this.owned(owner,s.id);return {s,a};}fail(404,'not_found','答题记录不存在');}
 updateAttempt(owner,id,input){const {s,a}=this.attempt(owner,id);this.expected(s,input);
  const x=z.object({expectedRevision:z.number().int(),instrumentVersion:z.string(),scoringVersion:z.string(),responses:z.array(z.object({itemId:z.string(),value:z.number().int().nullable()}).strict()).max(60),page:z.number().int().min(0).max(20).optional()}).strict().parse(input);
  const t=instrument(a.instrumentId);if(x.instrumentVersion!==a.instrumentVersion||x.scoringVersion!==a.scoringVersion||a.instrumentVersion!==t.instrumentVersion)fail(422,'version_mismatch','题库或计分版本不一致');
  if(s.imported)fail(422,'insufficient_data','导入快照没有原始答案，不能编辑或重算');
  const answers=canonicalResponses(x.responses,t);
  const changed=Object.entries(answers).some(([id,v])=>(a.answers[id]??null)!==v);
  if(changed&&a.scoreEvidenceId){for(const i of s.insights)if(i.evidenceIds.includes(a.scoreEvidenceId))i.status='rejected';const e=s.evidence.find(e=>e.evidenceId===a.scoreEvidenceId);if(e)e.status='superseded';delete a.scoreEvidenceId;delete a.insightId;}
  Object.assign(a.answers,answers);if(x.page!==undefined)a.page=x.page;a.revision++;delete a.scoredSnapshot;this.touch(s);return publicSession(s);
 }
 score(owner,id,input){const {s,a}=this.attempt(owner,id);this.expected(s,input);if(s.imported)fail(422,'insufficient_data','导入结果缺少原始答案，不能重算');
  const snapshot=assess(a.instrumentId,a.answers);a.scoredSnapshot={...snapshot,attemptRevision:a.revision};
  if(snapshot.complete&&!a.scoreEvidenceId){
   const evidenceId=randomUUID();s.evidence.push({evidenceId,kind:'assessment',sourceRef:a.id,locator:'answersHash:'+snapshot.answersHash,instrumentId:a.instrumentId,instrumentVersion:a.instrumentVersion,locale:'en',collectedAt:time(),text:null,status:'confirmed'});a.scoreEvidenceId=evidenceId;
   const top=Math.max(...snapshot.scores.map(x=>x.raw)),names=snapshot.scores.filter(x=>x.raw===top).map(x=>x.dimension);
   const description=a.instrumentId==='onet-mini-ip'?(names.length===6?'本次六类活动兴趣原始分相同，尚未区分出相对兴趣方向。':'本次问卷中，相对原始分最高的自报兴趣维度是 '+names.join(' / ')+'；兴趣不证明实际能力。'):'本次Mini-IPIP只描述本人自报行为倾向；神经质分沿情绪波动方向记录，不用于判断岗位胜任能力。';
   const insightId=randomUUID();s.insights.push({insightId,text:description,evidenceIds:[evidenceId],status:'pending',userEditedText:null,limitations:['这是当前问卷范围内的解释，不是完整人格或就业结果预测。']});a.insightId=insightId;
  }
  this.touch(s);return {session:publicSession(s),snapshot};
 }
 addCandidates(s,candidates,sourceRef,kind){
  for(const c of candidates){const evidenceId=randomUUID();s.evidence.push({evidenceId,kind,sourceRef,locator:c.locator,instrumentId:null,instrumentVersion:null,locale:'undetermined',collectedAt:time(),text:c.originalQuote,status:'pending'});
   s.claims.push({claimId:randomUUID(),kind:c.kind,skill:c.kind==='skill'?c.description:'',description:c.description,evidenceIds:[evidenceId],status:'pending'});
  }
 }
 statement(owner,id,input){const s=this.owned(owner,id);this.expected(s,input);const x=z.object({expectedRevision:z.number().int(),text:text}).strict().parse(input);
  const candidates=candidatesFromText([{text:x.text,locator:'本人陈述'}]);if(candidates.length+s.claims.length>100)fail(422,'validation_error','最多100条候选，请精简陈述或新建画像');this.addCandidates(s,candidates,randomUUID(),'user_statement');s.draft.statementBuffer='';this.touch(s);return publicSession(s);
 }
 claim(owner,id,input){const s=Object.values(this.db.sessions).find(s=>s.claims.some(c=>c.claimId===id)||s.insights.some(c=>c.insightId===id));if(!s)fail(404,'not_found','条目不存在');this.owned(owner,s.id);this.expected(s,input);
  const x=z.object({expectedRevision:z.number().int(),status:z.enum(['confirmed','rejected']),description:text.optional(),kind:z.enum(['education','major','skill','experience']).optional()}).strict().parse(input);
  const c=s.claims.find(c=>c.claimId===id)??s.insights.find(c=>c.insightId===id);const isInsight=!!c.insightId;
  if(x.description&&x.description!==(isInsight?c.text:c.description)){
   const evidenceId=randomUUID();s.evidence.push({evidenceId,kind:'user_edit',sourceRef:id,locator:null,instrumentId:null,instrumentVersion:null,locale:'zh-CN',collectedAt:time(),text:x.description,status:x.status});
   c.evidenceIds=[...c.evidenceIds,evidenceId];if(isInsight)c.userEditedText=x.description;else c.description=x.description;
  }
  if(x.kind&&!isInsight)c.kind=x.kind;c.status=x.status;if(!isInsight)c.skill=c.kind==='skill'?c.description:'';
  for(const eid of c.evidenceIds){const e=s.evidence.find(e=>e.evidenceId===eid);if(e&&e.kind!=='assessment'&&(!isInsight||e.sourceRef===id))e.status=x.status;}
  this.touch(s);return publicSession(s);
 }
 addInsight(owner,id,input){const s=this.owned(owner,id);this.expected(s,input);const x=insight.omit({insightId:true,status:true,userEditedText:true}).extend({expectedRevision:z.number().int()}).strict().parse(input);
  if(!x.evidenceIds.length||x.evidenceIds.some(id=>!s.evidence.some(e=>e.evidenceId===id&&e.status==='confirmed')))fail(422,'validation_error','解释必须引用已确认的证据');
  const {expectedRevision,...item}=x;s.insights.push({...item,insightId:randomUUID(),status:'pending',userEditedText:null});this.touch(s);return publicSession(s);
 }
 profile(owner,id,revision){const s=this.byProfile(owner,id);const list=this.db.profiles.filter(p=>p.profileId===s.profileId);const p=revision===undefined?list.at(-1):list.find(p=>p.revision===Number(revision));if(!p)fail(404,'not_found','指定确认版本不存在');return structuredClone(p);}
 confirm(owner,id,input){const s=this.byProfile(owner,id);this.expected(s,input);if(input.confirmed!==true)fail(422,'validation_error','请本人确认画像');if(s.imported)fail(422,'insufficient_data','导入快照不可重算，请创建新会话');
  if([...s.claims,...s.insights].some(c=>c.status==='pending'))fail(422,'validation_error','请逐条确认或拒绝待确认经历和解释');
  const evidence=structuredClone(s.evidence),assessments=[];
  for(const a of Object.values(s.attempts)){
   const snapshot=assess(a.instrumentId,a.answers),evidenceId=randomUUID();
   evidence.push({evidenceId,kind:'assessment',sourceRef:a.id,locator:'answersHash:'+snapshot.answersHash,instrumentId:a.instrumentId,instrumentVersion:a.instrumentVersion,locale:'en',collectedAt:time(),text:null,status:snapshot.complete?'confirmed':'pending'});assessments.push({...snapshot,evidenceId});
  }
  const statement=text=>{const evidenceId=randomUUID();evidence.push({evidenceId,kind:'user_statement',sourceRef:s.id,locator:null,instrumentId:null,instrumentVersion:null,locale:'zh-CN',collectedAt:time(),text,status:'confirmed'});return evidenceId;};
  const d=s.draft;const valueIds=d.groups.length||d.tradeoffs.length?[statement(JSON.stringify({groups:d.groups,tradeoffs:d.tradeoffs}))]:[];
  const constraints=d.constraints.map(c=>({...c,evidenceIds:[statement(`${c.key}: ${JSON.stringify(c.value)} (${c.strength}, confirmed=${c.confirmed})`)]}));
  const goals=d.goals.map(t=>({text:t,evidenceIds:[statement(t)]}));if(d.jobStage)goals.push({text:'当前求职阶段：'+d.jobStage,evidenceIds:[statement(d.jobStage)]});
  const p={schemaVersion:'2.0.0',profileId:s.profileId,projectId:s.projectId,revision:1+Math.max(0,...this.db.profiles.filter(p=>p.profileId===s.profileId).map(p=>p.revision)),ownerId:s.ownerId,mode:s.mode,createdAt:s.createdAt,confirmedAt:time(),assessments,
   values:{priorityIds:d.groups.flat(),groups:structuredClone(d.groups),tradeoffs:[...d.tradeoffs],evidenceIds:valueIds},capabilities:structuredClone(s.claims),constraints,goals,insights:structuredClone(s.insights),
   uncertainties:[...assessments.filter(a=>!a.complete).map(a=>({code:'incomplete_assessment',message:a.instrumentId+'尚未完整测评，解释保持未知。',evidenceIds:[a.evidenceId]})),...constraints.filter(c=>!c.confirmed||c.strength==='unknown').map(c=>({code:'unknown_constraint',message:c.key+'尚待本人明确。',evidenceIds:c.evidenceIds})),...(!s.claims.some(c=>c.status==='confirmed')?[{code:'no_confirmed_experience',message:'没有已确认经历，不能推断实际能力。',evidenceIds:[]}]:[])],evidence};
  validateProfileV2(p);this.db.profiles.push(structuredClone(p));s.profileRevision=p.revision;this.touch(s);return {profile:p,session:publicSession(s)};
 }
 occupationFit(owner,id,revision){return fit(this.profile(owner,id,revision));}
 intent(owner,input){const s=this.byProfile(owner,input.profileId);this.expected(s,input);const p=this.profile(owner,input.profileId,input.profileRevision);
  const x=z.object({expectedRevision:z.number().int(),profileId:z.string(),profileRevision:z.number().int().positive(),selectedCodes:z.array(z.string()).max(3),customDirection:z.string().max(200).optional(),maxCandidates:z.number().int().min(1).max(3).default(3)}).strict().parse(input);unique(x.selectedCodes,'方向不能重复');
  const selectedDirections=x.selectedCodes.map(code=>{const o=catalog.entries.find(o=>o.onetCode===code);if(!o)fail(422,'validation_error','未知或不完整的职业代码');return {roleFamily:o.titleZh??o.title,aliases:[o.title,...(o.aliases??[])],onetCodes:[code],selectedByUser:true,mappingVersion:o.mappingVersion??catalog.catalogVersion,reviewStatus:o.reviewStatus??'us_occupation_domestic_mapping_pending'};});
  if(x.customDirection?.trim())selectedDirections.push({roleFamily:x.customDirection.trim(),aliases:[x.customDirection.trim()],onetCodes:[],selectedByUser:true,mappingVersion:'user-declared-1',reviewStatus:'user_direction_unmapped'});
  if(selectedDirections.length>3)fail(422,'validation_error','最多选择3个方向，包括自选方向');
  const existing=this.db.intents.filter(i=>i.profileId===p.profileId);const i={schemaVersion:'2.0.0',intentId:existing[0]?.intentId??randomUUID(),revision:existing.length+1,profileId:p.profileId,profileRevision:p.revision,mode:p.mode,selectedDirections,filters:p.constraints.map(c=>c.confirmed?c:{...c,value:null,strength:'unknown'}),maxCandidates:x.maxCandidates};
  validateHandoff({ProfileBundleV2:p,SearchIntentV2:i});this.db.intents.push(structuredClone(i));s.intentProfileRevision=p.revision;this.touch(s);return {intent:i,session:publicSession(s)};
 }
 export(owner,id,revision,format='v2'){
  const p=this.profile(owner,id,revision),i=this.db.intents.filter(i=>i.profileId===id&&i.profileRevision===p.revision).at(-1);if(!i)fail(422,'insufficient_data','请为此画像版本确认搜索意向');
  if(format==='v1')return exportV1(p,i);if(format!=='v2')fail(422,'validation_error','未知导出格式');const f=fit(p);return {ProfileBundleV2:p,SearchIntentV2:structuredClone(i),OccupationFitSnapshot:f,Report:buildReport(p,f)};
 }
 report(owner,id,revision){const p=this.profile(owner,id,revision);return buildReport(p,fit(p));}
 import(owner,input){
  validateHandoff(input);const original=input.ProfileBundleV2;
  for(const a of original.assessments){const t=instrument(a.instrumentId);if(a.instrumentVersion!==t.instrumentVersion||a.scoringVersion!==t.scoringVersion||a.scores.length!==t.dimensions.length)fail(422,'version_mismatch','工具或分数版本不支持');
   unique(a.scores.map(s=>s.dimension),'维度重复');for(const sc of a.scores){if(!t.dimensions.includes(sc.dimension)||sc.totalItems!==t.items.filter(q=>q.dimension===sc.dimension).length||sc.answeredItems>sc.totalItems||(sc.raw!==null&&(!Number.isInteger(sc.raw)||sc.raw<t.rawMin||sc.raw>t.rawMax||sc.normalized!==(sc.raw-t.rawMin)/(t.rawMax-t.rawMin)))||((sc.raw===null)!==(sc.normalized===null))||((sc.answeredItems===sc.totalItems)!==(sc.raw!==null)))fail(422,'validation_error','导入分数与量程不一致');}
   const completeness=a.scores.reduce((n,s)=>n+s.answeredItems,0)/t.items.length;
   if(a.complete!==(completeness===1)||a.completeness!==completeness||a.locale!=='en'||a.translationVersion!==null||a.validationStatus!=='source_supported'||a.chineseValidation!=='unknown')fail(422,'validation_error','完整状态、语言或验证声明不一致');
  }
  const session=this.create(owner,{battery:'None',mode:original.mode}),s=this.owned(owner,session.id),p=structuredClone(original),i=structuredClone(input.SearchIntentV2);
  p.profileId=s.profileId;p.projectId=s.projectId;p.ownerId=s.ownerId;p.revision=1;i.profileId=p.profileId;i.profileRevision=1;i.intentId=randomUUID();i.revision=1;
  p.uncertainties=[...p.uncertainties.slice(0,99),{code:'imported_score_unverified',message:'导入文件缺少原始答案，仅校验结构与计分范围，不能独立重算或核实原始分。',evidenceIds:[]}];
  this.db.profiles.push(p);this.db.intents.push(i);s.imported=true;s.step=7;s.profileRevision=1;s.intentProfileRevision=1;this.touch(s);return publicSession(s);
 }
 async upload(owner,input){
  const x=z.object({sessionId:z.string(),expectedRevision:z.number().int(),filename:z.string().min(1).max(200),base64:z.string().max(14000000)}).strict().parse(input);
  const s=this.owned(owner,x.sessionId);this.expected(s,input);if(s.claims.length>=100)fail(422,'validation_error','候选条目已达100项');
  if(Object.values(this.db.jobs).filter(j=>j.status==='processing').length>=2)fail(429,'busy','同时最多解析两个文件，请稍后再试');
  if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(x.base64))fail(422,'validation_error','base64编码非法');
  const buffer=Buffer.from(x.base64,'base64'),kind=checkFile(x.filename,buffer),jobId=randomUUID();
  const directory=join(this.dataDir,'uploads',s.ownerId);mkdirSync(directory,{recursive:true});const path=join(directory,jobId+'.private');writeFileSync(path,buffer,{flag:'wx'});
  const job={id:jobId,sessionId:s.id,filename:x.filename,status:'processing',kind,createdAt:time(),sha256:createHash('sha256').update(buffer).digest('hex'),path};this.db.jobs[jobId]=job;this.touch(s);
  parseJob(path,kind,this.modelsDir).then(result=>{if(!this.db.jobs[jobId]||!this.db.sessions[s.id])return;
   if(result.ok){const remaining=Math.max(0,100-s.claims.length);this.addCandidates(s,result.candidates.slice(0,remaining),jobId,'resume');job.status='completed';job.method=result.method;job.warnings=result.warnings;job.candidateCount=Math.min(remaining,result.candidates.length);if(!job.candidateCount)job.warnings.push('未提取到可确认条目，请手填。');if(result.candidates.length>remaining)job.warnings.push('超过候选总量上限，仅保留前'+remaining+'条；请另建项目整理其余经历。');}
   else{job.status=result.code==='not_connected'?'not_connected':'failed';job.error={code:result.code,message:result.message};}this.touch(s);
  });return {job:this.job(owner,jobId),session:publicSession(s)};
 }
 job(owner,id){const job=this.db.jobs[id];if(!job)fail(404,'not_found','解析任务不存在');this.owned(owner,job.sessionId);const {path,...out}=job;return structuredClone(out);}
 delete(owner,id){const s=this.byProfile(owner,id);
  for(const [key,j] of Object.entries(this.db.jobs))if(j.sessionId===s.id){const path=resolve(j.path),directory=resolve(this.dataDir,'uploads',s.ownerId);if(path.startsWith(directory+'\\')||path.startsWith(directory+'/'))rmSync(path,{force:true});else fail(500,'storage_error','私有路径越界');delete this.db.jobs[key];}
  this.db.profiles=this.db.profiles.filter(p=>p.profileId!==id);this.db.intents=this.db.intents.filter(i=>i.profileId!==id);delete this.db.sessions[s.id];this.save();return {deleted:true};
 }
 bootstrap(owner){return {instruments:publicTools(),sessions:this.list(owner),valueOptions,catalog:{version:catalog.catalogVersion,loaded:catalog.loadedCount,complete:catalog.completeCount,license:catalog.license},ocrConnected:!!this.modelsDir&&['eng','chi_sim'].every(x=>existsSync(join(this.modelsDir,x+'.traineddata'))),limitations:['本地会话隔离，不是生产账户认证。','没有启用中文量表、EQ或工作方式与市场综合排名。']};}
}
