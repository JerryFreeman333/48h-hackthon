import {z} from 'zod';
import {hash} from '../instruments/battery.mjs';
export const text=z.string().trim().min(1).max(4000),id=z.string().min(1).max(150),ids=z.array(id).max(100);
const status=z.enum(['pending','confirmed','rejected','superseded']);
const jsonValue=z.union([z.string().max(4000),z.number().finite(),z.boolean(),z.array(z.string().max(200)).max(30),z.null()]);
export const constraint=z.object({key:id,value:jsonValue,strength:z.enum(['hard','soft','unknown']),confirmed:z.boolean(),evidenceIds:ids}).strict().superRefine((c,ctx)=>{
 if(c.strength==='unknown'&&c.value!==null)ctx.addIssue({code:'custom',message:'unknown条件必须为null'});
 if(c.strength!=='unknown'&&c.value===null)ctx.addIssue({code:'custom',message:'已知条件不能为null'});
 if(c.key==='city'&&c.value!==null&&(!Array.isArray(c.value)||!c.value.length))ctx.addIssue({code:'custom',message:'城市必须为非空数组'});
 if(c.key==='min_fixed_monthly_salary'&&c.value!==null&&(typeof c.value!=='number'||c.value<0))ctx.addIssue({code:'custom',message:'固定月薪必须为非负数字'});
 if(['accept_sales_kpi','accept_travel','accept_outsourcing'].includes(c.key)&&c.value!==null&&typeof c.value!=='boolean')ctx.addIssue({code:'custom',message:'接受条件必须为布尔值'});
});
export const evidence=z.object({evidenceId:id,kind:z.enum(['assessment','user_statement','user_edit']),sourceRef:id,locator:z.string().max(300).nullable(),instrumentId:id.nullable(),instrumentVersion:id.nullable(),locale:z.string().max(30),collectedAt:z.iso.datetime(),text:z.string().max(10000).nullable(),status}).strict();
export const insight=z.object({insightId:id,text, evidenceIds:ids,status:z.enum(['pending','confirmed','rejected']),userEditedText:text.nullable(),limitations:z.array(text).max(20)}).strict();
export const assessment=z.object({instrumentId:id,instrumentVersion:id,scoringVersion:id,locale:z.string(),validationStatus:z.string(),translationVersion:z.string().nullable(),chineseValidation:z.string(),complete:z.boolean(),completeness:z.number().min(0).max(1),scores:z.array(z.object({dimension:id,raw:z.number().finite().nullable(),normalized:z.number().min(0).max(1).nullable(),answeredItems:z.number().int().min(0),totalItems:z.number().int().min(1)}).strict()).max(6),answersHash:z.string().regex(/^[a-f0-9]{64}$/),confidence:z.null(),displayTransform:z.string(),missingPolicy:z.string(),thresholds:z.null(),norms:z.null(),evidenceId:id}).strict();
export const valuesSchema=z.object({priorityIds:z.array(text).max(30),groups:z.array(z.array(text).min(1).max(30)).max(30),tradeoffs:z.array(text).max(30),evidenceIds:ids}).strict();
export const profileSchema=z.object({schemaVersion:z.literal('2.0.0'),profileId:id,projectId:id,revision:z.number().int().positive(),ownerId:id,mode:z.enum(['demo','manual']),createdAt:z.iso.datetime(),confirmedAt:z.iso.datetime().nullable(),assessments:z.array(assessment).max(2),values:valuesSchema,capabilities:z.array(z.never()).length(0),constraints:z.array(constraint).max(30),goals:z.array(z.object({text,evidenceIds:ids}).strict()).max(30),insights:z.array(insight).max(100),uncertainties:z.array(z.object({code:id,message:text,evidenceIds:ids}).strict()).max(100),evidence:z.array(evidence).max(250)}).strict();
export const direction=z.object({roleFamily:text,aliases:z.array(text).max(20),onetCodes:z.array(id).max(10),selectedByUser:z.literal(true),mappingVersion:id,reviewStatus:id}).strict();
export const intentSchema=z.object({schemaVersion:z.literal('2.0.0'),intentId:id,revision:z.number().int().positive(),profileId:id,profileRevision:z.number().int().positive(),mode:z.enum(['demo','manual']),selectedDirections:z.array(direction).max(3),filters:z.array(constraint).max(30),maxCandidates:z.number().int().min(1).max(3)}).strict();
export function validateProfileV2(p){
 profileSchema.parse(p);const index=new Map(p.evidence.map(e=>[e.evidenceId,e]));if(index.size!==p.evidence.length)throw new Error('重复证据ID');
 if(new Set(p.assessments.map(a=>a.instrumentId)).size!==p.assessments.length||new Set(p.constraints.map(a=>a.key)).size!==p.constraints.length)throw new Error('重复工具或条件');
 for(const x of [...p.capabilities,...p.constraints,...p.goals,...p.insights,p.values,...p.assessments.map(a=>({evidenceIds:[a.evidenceId]}))]){
  if(x.evidenceIds.some(id=>!index.has(id)))throw new Error('证据引用不存在');
  if((x.status==='confirmed'||x.confirmed)&&(!x.evidenceIds.length||x.evidenceIds.some(id=>index.get(id).status!=='confirmed')))throw new Error('确认条目缺少确认的证据');
 }
 return p;
}
export function validateHandoff(x){validateProfileV2(x.ProfileBundleV2);intentSchema.parse(x.SearchIntentV2);const p=x.ProfileBundleV2,i=x.SearchIntentV2;
 if(i.profileId!==p.profileId||i.profileRevision!==p.revision||i.mode!==p.mode||!p.confirmedAt)throw new Error('意向与确认画像版本不一致');
 if(hash(i.filters)!==hash(p.constraints.map(c=>c.confirmed?c:{...c,value:null,strength:'unknown'})))throw new Error('意向过滤与画像条件不一致');return x;
}
