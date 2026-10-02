import {randomUUID,createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {z} from 'zod';
import {catalog,version,topics,questions,priorities,policies} from './catalog.mjs';
import {keys,validateProfile,validateIntent,validateExport} from '../contracts.mjs';
import {industries,roles,taxonomyVersion} from '../taxonomy.mjs';
import {cityOptions,salaryOptions,goalOptions,stageOptions,conditionLabels,conditionText,validateChosenConstraints} from '../profile/selections.mjs';
import {opportunities,expectationIds,validateOpportunityDraft,validateHandoff} from './condition-branches.mjs';

export class NeedsError extends Error{constructor(status,message,code='validation_error'){super(message);this.status=status;this.code=code;}}
const bad=message=>{throw new NeedsError(422,message);};
const parse=(schema,input)=>{const r=schema.safeParse(input);if(!r.success)bad('只接受当前选择与版本，输入字段或格式不正确');return r.data;};
const unique=xs=>new Set(xs).size===xs.length;
const choice=(ids)=>z.enum(ids).nullable();
const answerSchema=z.strictObject(Object.fromEntries(topics.flatMap(t=>[
 [t.id+'.priority',choice(priorities.map(x=>x.id))],
 [t.id+'.details',z.array(z.enum([...t.details.map(x=>x.id),'unsure'])).max(t.details.length).refine(unique).refine(xs=>!xs.includes('unsure')||xs.length===1).nullable()],
 [t.id+'.policy',choice(policies.map(x=>x.id))]
])));
const constraintSchema=z.strictObject({key:z.enum(keys),value:z.union([z.boolean(),z.number(),z.array(z.string())]).nullable(),strength:z.enum(['hard','soft','unknown'])});
const dataSchema=z.strictObject({
 answers:answerSchema,
 conditions:z.array(constraintSchema).length(keys.length).refine(xs=>unique(xs.map(x=>x.key))),
 goalIds:z.array(z.enum(goalOptions.map(x=>x.id))).max(goalOptions.length).refine(unique),
 stageId:choice(stageOptions.map(x=>x.id)),
 industryTags:z.array(z.enum(industries.map(x=>x.id))).max(industries.length).refine(unique),
 roleTypes:z.array(z.enum(roles.map(x=>x.id))).max(roles.length).refine(unique)
});
function validateData(input){
 const d=parse(dataSchema,input);validateChosenConstraints(d.conditions);
 for(const c of d.conditions){if(c.value===null&&c.strength!=='unknown')bad('未选择的现实条件必须保留未知');if(c.value!==null&&c.strength==='unknown')bad('已选择条件请明确设为偏好或必须满足');}
 return d;
}
const clone=x=>structuredClone(x);
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
export const digest=x=>createHash('sha256').update(JSON.stringify(canonical(x))).digest('hex');
export function emptyData(){return {answers:Object.fromEntries(questions.map(q=>[q.id,null])),conditions:keys.map(key=>({key,value:null,strength:'unknown'})),goalIds:[],stageId:null,industryTags:[],roleTypes:[]};}
export function deriveNeeds(data,{projectId,profileId,revision,confirmedAt,mode}){
 validateData(data);
 return {schemaVersion:'a-job-needs-1',instrumentId:'job-needs-requirements',questionnaireVersion:version,projectId,profileId,profileRevision:revision,mode,confirmedAt,
 measurement:'user-declared-job-needs-not-psychometric-assessment',validationStatus:'not-validated',scores:null,
 answers:clone(data.answers),selectionData:clone(data),topics:topics.map(t=>{
  const p=data.answers[t.id+'.priority'],details=data.answers[t.id+'.details'],policy=data.answers[t.id+'.policy'];
  const knownDetails=details?.filter(x=>x!=='unsure')??[];
  return {topicId:t.id,title:t.title,priority:p===null||p==='unsure'?'unknown':p,verificationItemIds:knownDetails,verificationSelectionStatus:knownDetails.length?'selected':'unknown',unknownHandling:policy===null||policy==='unsure'?'unknown':policy,userConfirmed:confirmedAt!==null,sourceIds:t.sourceIds,evidenceRelation:'topic-support-only-not-item-validation'};
 }),handoff:{status:'requires-bc-needs-mapping',message:'公共1.0.0契约只传递既有五类条件；七主题侧写保存在A附表中，尚未接入B/C判断。',unmappedTopics:topics.map(t=>t.id)}};
}
function profileFrom(snapshot){
 const d=snapshot.selectionData;
 const p={schemaVersion:'1.0.0',profileId:snapshot.profileId,revision:snapshot.profileRevision,projectId:snapshot.projectId,mode:snapshot.mode,confirmedAt:snapshot.confirmedAt,
 assessment:{instrumentId:'not-administered',version:'1',scores:{R:null,I:null,A:null,S:null,E:null,C:null},interpretation:'本次未进行兴趣或人格测评。求职需求由用户选择并确认；七主题明细见JobNeedsSnapshot，不计算能力、人格或风险分。',status:snapshot.confirmedAt?'confirmed':'draft',validation:'prototype'},
 background:{education:null,major:null,skills:[],experiences:[]},
 goals:[...d.goalIds.map(id=>goalOptions.find(x=>x.id===id).text),...(d.stageId?['当前求职阶段：'+stageOptions.find(x=>x.id===d.stageId).text]:[])],
 preferences:d.conditions.map(c=>({...clone(c),confirmed:snapshot.confirmedAt!==null&&c.value!==null}))};
 validateProfile(p);return p;
}
function intentFrom(snapshot,p,intentId){
 const d=snapshot.selectionData,i={schemaVersion:'1.0.0',intentId,revision:p.revision,projectId:p.projectId,profileId:p.profileId,profileRevision:p.revision,mode:p.mode,
 industryTags:clone(d.industryTags),industryCodes:[...new Set(industries.filter(x=>d.industryTags.includes(x.id)).flatMap(x=>x.codes))],roleTypes:clone(d.roleTypes),cities:clone(p.preferences.find(c=>c.key==='city')?.value??[]),
 filters:p.preferences.map(c=>({key:c.key,value:c.confirmed?clone(c.value):null,strength:c.confirmed?c.strength:'unknown'})),maxCandidates:3};validateIntent(i,p);return i;
}
export function describe(snapshot){
 return snapshot.topics.map(t=>{
  const def=topics.find(x=>x.id===t.topicId);
  return {title:t.title,priority:t.priority==='unknown'?'暂不确定':priorities.find(x=>x.id===t.priority).text,
   details:t.verificationItemIds.length?t.verificationItemIds.map(id=>def.details.find(x=>x.id===id).text):['关注项目暂不确定'],
   policy:t.unknownHandling==='unknown'?'信息不清楚时如何继续：暂不确定':policies.find(x=>x.id===t.unknownHandling).text,description:def.description};
 });
}
export function markdown(snapshot,p,i){
 const sections=describe(snapshot).map(t=>'## '+t.title+'\n\n'+t.priority+'\n\n'+t.details.map(text=>'- '+text).join('\n')+'\n\n'+t.policy+'\n\n'+t.description).join('\n\n');
 return '# 求职需求侧写\n\n画像版本：'+p.revision+'；问卷版本：'+version+'\n\n这是用户确认的求职需求，不是经过验证的心理量表。没有兴趣、人格、能力或公司风险分。\n\n'+sections+'\n\n## 现实条件\n\n'+p.preferences.map(c=>'- '+conditionLabels[c.key]+'：'+conditionText(c)+(c.strength==='hard'?'（本人确认必须满足）':c.strength==='soft'?'（偏好）':'')).join('\n')+'\n\n## 行业与岗位\n\n行业：'+(i.industryTags.map(id=>industries.find(x=>x.id===id).name).join('、')||'暂不确定')+'\n\n岗位：'+(i.roleTypes.map(id=>roles.find(x=>x.id===id).name).join('、')||'暂不确定')+'\n\n## 交接状态\n\n'+snapshot.handoff.message+'\n\n## 研究依据\n\n'+catalog.sources.map(s=>'- '+s.titleZh+'：'+s.url+'；只支持主题，不验证本产品题目。').join('\n');
}
function pack(snapshot,intentId){
 const p=profileFrom(snapshot),i=intentFrom(snapshot,p,intentId);
 const out={schemaVersion:'a-job-needs-export-1',UserProfile:p,SearchIntent:i,JobNeedsSnapshot:clone(snapshot),questionProvenance:clone(questions.map(q=>({itemId:q.id,text:q.text,...q.provenance}))),taxonomyVersion,Report:{templateVersion:'a-needs-report-1',markdown:markdown(snapshot,p,i)}};
 return {...out,checksum:digest(out)};
}
export class NeedsService{
 constructor(state,write=()=>{}){this.state=state;this.write=write;}
 db(){return this.state.needs??{version,sessions:{},snapshots:{}};}
 commit(db){this.write({...this.state,needs:db});this.state.needs=db;}
 owned(owner,id){const s=this.db().sessions[id];if(!s)throw new NeedsError(404,'求职需求记录不存在');if(s.owner!==owner)throw new NeedsError(403,'没有访问权限');return s;}
 public(s){const {owner,...rest}=s;return clone(rest);}
 bootstrap(owner){const sessions=Object.values(this.db().sessions).filter(s=>s.owner===owner);return {catalog,conditions:{labels:conditionLabels,cities:cityOptions,salaries:salaryOptions},goals:goalOptions.filter(g=>expectationIds.includes(g.id)),opportunities,expectationIds,industries,roles,taxonomyVersion,latestSessionId:sessions.at(-1)?.id??null,sessions:sessions.map(s=>({id:s.id,revision:s.revision,confirmedRevisions:s.confirmedRevisions,mode:s.mode})),historicalRecordCount:Object.values(this.state.attempts??{}).filter(s=>s.owner===owner).length+Object.values(this.state.v2?.sessions??{}).filter(s=>s.owner===owner).length,backend:'local-persistent-cookie-session'};}
 create(owner,input){const {mode}=parse(z.strictObject({mode:z.enum(['manual','demo']).default('manual')}),input);const db=clone(this.db()),s={id:randomUUID(),owner,projectId:randomUUID(),profileId:randomUUID(),intentId:randomUUID(),questionnaireVersion:version,mode,revision:1,step:0,data:emptyData(),confirmedRevisions:[],createdAt:new Date().toISOString()};db.sessions[s.id]=s;this.commit(db);return this.public(s);}
 get(owner,id){return this.public(this.owned(owner,id));}
 update(owner,id,input){
  const body=parse(z.strictObject({expectedRevision:z.number().int().positive(),questionnaireVersion:z.literal(version),step:z.number().int().min(0).max(9),data:dataSchema}),input),s=this.owned(owner,id);
  if(body.expectedRevision!==s.revision)throw new NeedsError(409,'另一个页面已保存，请刷新后重试','revision_conflict');
  validateData(body.data);
  // Old drafts may retain old goal combinations until this page is edited; never rewrite snapshots.
  if(body.data.stageId!==s.data.stageId||!isDeepStrictEqual(body.data.goalIds,s.data.goalIds))validateOpportunityDraft(body.data.stageId,body.data.goalIds);
  if(body.step===8)validateHandoff(body.data);
  const db=clone(this.db()),next=db.sessions[id];Object.assign(next,{data:clone(body.data),step:body.step,revision:s.revision+1});this.commit(db);return this.public(next);
 }
 preview(owner,id){const s=this.owned(owner,id),n=deriveNeeds(s.data,{...s,revision:s.confirmedRevisions.length+1,confirmedAt:null});return {snapshot:n,description:describe(n)};}
 confirm(owner,id,input){
  const body=parse(z.strictObject({expectedRevision:z.number().int().positive(),confirmed:z.literal(true)}),input),s=this.owned(owner,id);
  if(body.expectedRevision!==s.revision)throw new NeedsError(409,'记录已更新，请刷新后确认','revision_conflict');
  validateHandoff(s.data);
  const revision=s.confirmedRevisions.length+1,n=deriveNeeds(s.data,{...s,revision,confirmedAt:new Date().toISOString()}),out=pack(n,s.intentId),db=clone(this.db());
  db.snapshots[s.id+':'+revision]=out;const next=db.sessions[id];next.confirmedRevisions.push(revision);next.revision++;next.step=9;this.commit(db);return {session:this.public(next),export:clone(out),description:describe(n)};
 }
 export(owner,id,revision){const s=this.owned(owner,id),rev=revision===undefined?s.confirmedRevisions.at(-1):Number(revision);if(!Number.isInteger(rev)||rev<1)throw new NeedsError(422,'请先确认画像');const out=this.db().snapshots[id+':'+rev];if(!out)throw new NeedsError(404,'指定画像版本不存在');return clone(out);}
 import(owner,input){
  if(input?.schemaVersion!=='a-job-needs-export-1')bad('只接收含七主题附表的新版本JSON；旧记录保留在历史存档，不能把旧分数转换成需求');
  const {checksum,...content}=input;if(checksum!==digest(content))bad('JSON校验不一致，请使用完整原始导出');
  validateExport(input);const n=input.JobNeedsSnapshot;if(!n||n.questionnaireVersion!==version||!n.confirmedAt)bad('需求问卷版本或确认状态错误');
  const rebuilt=deriveNeeds(validateData(n.selectionData),{projectId:n.projectId,profileId:n.profileId,revision:n.profileRevision,confirmedAt:n.confirmedAt,mode:n.mode});
  if(!isDeepStrictEqual(pack(rebuilt,input.SearchIntent.intentId),input))bad('JSON中答案、画像、意向、来源或说明不一致；不接收自行添加的分数与经历');
  const db=clone(this.db()),id=randomUUID(),s={id,owner,projectId:randomUUID(),profileId:randomUUID(),intentId:randomUUID(),questionnaireVersion:version,mode:n.mode,revision:1,step:9,data:clone(n.selectionData),confirmedRevisions:[1],createdAt:new Date().toISOString(),importedFrom:{projectId:n.projectId,profileId:n.profileId,profileRevision:n.profileRevision}};
  const remapped=deriveNeeds(s.data,{...s,revision:1,confirmedAt:n.confirmedAt});db.sessions[id]=s;db.snapshots[id+':1']=pack(remapped,s.intentId);this.commit(db);return this.public(s);
 }
}
export function handleNeeds(service,owner,req,url,body){
 const p=url.pathname.replace('/api/a/needs','');let m;
 if(req.method==='GET'&&p==='/bootstrap')return service.bootstrap(owner);
 if(req.method==='POST'&&p==='/sessions')return service.create(owner,body);
 if(req.method==='POST'&&p==='/import')return service.import(owner,body);
 if((m=p.match(/^\/sessions\/([^/]+)(?:\/(preview|confirm|export|report))?$/))){
  if(req.method==='GET'&&!m[2])return service.get(owner,m[1]);
  if(req.method==='PATCH'&&!m[2])return service.update(owner,m[1],body);
  if(req.method==='GET'&&m[2]==='preview')return service.preview(owner,m[1]);
  if(req.method==='POST'&&m[2]==='confirm')return service.confirm(owner,m[1],body);
  if(req.method==='GET'&&['export','report'].includes(m[2])){const out=service.export(owner,m[1],url.searchParams.get('revision')??undefined);return m[2]==='report'?out.Report:out;}
 }
 throw new NeedsError(404,'接口不存在');
}
