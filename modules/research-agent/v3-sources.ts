import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {join,resolve,sep} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {z} from 'zod';
import type {CandidateBundle} from '../../packages/contracts';
import type {V3Snapshot} from './v3-contract';
import {materialKinds} from './xmind/document-schema';
const digest=(text:string|Buffer)=>createHash('sha256').update(text).digest('hex');
export const sourceOptionsSchema=z.strictObject({discovery:z.enum(['bounded','supplied_only']).default('bounded'),purpose:z.enum(['exploration','selection']).default('selection'),needOrigin:z.enum(['user_confirmed','synthetic_acceptance']).default('user_confirmed'),sourceUrls:z.array(z.url().max(4096).refine(s=>{const u=new URL(s);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password;})).max(4).default([]),importIds:z.array(z.string().regex(/^import-[a-f0-9]{64}$/)).max(3).default([])});
export const importSchema=z.strictObject({kind:z.enum(materialKinds),title:z.string().trim().min(1).max(300),content:z.string().min(1).max(25_000_000),declaredSource:z.string().max(1000).nullable().default(null),syntheticFixture:z.boolean().default(false)});
const folder=(owner:string)=>join(process.cwd(),'.data/research-agent/v3-imports',digest(owner));
export function saveV3Import(owner:string,raw:unknown){
 const data=importSchema.parse(raw),binary=data.kind!=='text',bytes=binary?Buffer.from(data.content,'base64'):Buffer.from(data.content);
 const signature=data.kind==='pdf'?bytes.toString('ascii',0,5)==='%PDF-':data.kind==='docx'||data.kind==='xlsx'?bytes.subarray(0,4).equals(Buffer.from([80,75,3,4])):data.kind==='image'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||bytes.subarray(0,3).equals(Buffer.from([255,216,255])):true;
 // A repeated-character regex over multi-megabyte base64 can overflow V8's
 // regex stack. Canonical re-encoding also validates padding and alphabet.
 if(!bytes.length||bytes.length>18_000_000||!signature||binary&&(data.content.length%4!==0||/[^A-Za-z0-9+/=]/.test(data.content)||bytes.toString('base64')!==data.content))throw Object.assign(Error('材料格式或编码不符；支持至多 18MB 的文字、PDF、DOCX、XLSX、CSV、PNG/JPEG'),{status:422});
 const id='import-'+digest(JSON.stringify(data)),dir=folder(owner);mkdirSync(dir,{recursive:true});
 const file=join(dir,id+'.json');if(!existsSync(file))writeFileSync(file,JSON.stringify(data),{flag:'wx'});
 return {importId:id,kind:data.kind,title:data.title,status:'saved_unverified',message:'原件保存在本机；文字识别和文件内容仍需核验，解析失败会明确保留原因。'};
}
export function loadV3Options(owner:string,raw:unknown){
 const options=sourceOptionsSchema.parse(raw);
 const materials=options.importIds.map(id=>{
  const file=join(folder(owner),id+'.json');
  if(!existsSync(file))throw Object.assign(Error('本会话无该导入材料'),{status:404});
  const data=importSchema.parse(JSON.parse(readFileSync(file,'utf8')));
  return {kind:data.kind,content:data.content,title:data.title,declared_source:data.declaredSource,synthetic_fixture:data.syntheticFixture};
 });
 return {discovery:options.discovery,purpose:options.purpose,needOrigin:options.needOrigin,sourceUrls:options.sourceUrls,materials};
}
export function readSavedV3Source(s:V3Snapshot|undefined,bundle:CandidateBundle,evidenceId:string){
 const evidence=bundle.evidence.find(e=>e.evidenceId===evidenceId);
 if(!s||!evidence)throw Object.assign(Error('本报告无该来源'),{status:404});
 const a=s.sourceAttempts.find(a=>a.evidenceIds.includes(evidenceId)&&a.rawRef&&a.rawHash);
 if(!a)return {evidence,originalAvailable:false,message:'仅保存本地摘录，未声称取得公开原件'};
 if(!/^\.data\/research-agent\/v3\/task-[a-f0-9]+\/q-[a-f0-9]+-r[01]\/[a-f0-9]{64}\.(?:pdf|txt|html.gz|docx|xlsx|csv|png|jpg|jpeg)$/.test(a.rawRef!))throw Error('来源路径未通过校验');
 const root=resolve(process.cwd(),'.data/research-agent/v3'),path=resolve(process.cwd(),a.rawRef!);
 if(!path.startsWith(root+sep))throw Error('来源范围错误');
 const stored=readFileSync(path),bytes=path.endsWith('.gz')?gunzipSync(stored):stored;
 if(digest(bytes)!==a.rawHash)throw Error('保存的来源哈希不一致');
 const parsedPath=path.replace(/\.(?:pdf|txt|html.gz|docx|xlsx|csv|png|jpg|jpeg)$/,'.parsed.json');
 const parsed=JSON.parse(readFileSync(parsedPath,'utf8'));
 if(!parsed.text.includes(evidence.excerpt))throw Error('保存的原文与引用不一致');
 return {evidence,originalAvailable:true,rawHash:a.rawHash,url:a.url,publishedAt:a.publishedAt,retrievedAt:a.retrievedAt,locator:a.locators[a.evidenceIds.indexOf(evidenceId)],title:parsed.title,text:parsed.text,scope:'已保存原件；来源陈述未经独立认证'};
}
