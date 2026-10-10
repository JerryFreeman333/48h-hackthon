import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {z} from 'zod';
import {candidateBundleSchema,type CandidateBundle} from '../../../packages/contracts';
import {enrichWithV3} from '../v3-research';
import {validateV3Snapshot} from '../v3-contract';
import {loadV3Options,readSavedV3Source} from '../v3-sources';
import {atomicWrite} from '../atomic-file';
import {agentConfiguration} from '../config';
import {renderV3Report} from '../v3-report';
import {escapeHtml} from '../../c-report/ui/render-html';
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const db=()=>new DatabaseSync(join(process.cwd(),'.data/company-database/xray-v3-20261003.sqlite'),{readOnly:true});
export function lookupCompanies(query:string){
 const q=query.trim();if(q.length<2||q.length>80)throw Object.assign(Error('公司名称须为2–80字'),{status:400});
 const conn=db();try{return conn.prepare("SELECT id,name,full_name,domain FROM companies WHERE instr(name,?)>0 OR instr(COALESCE(full_name,''),?)>0 ORDER BY id LIMIT 30").all(q,q).map(r=>({recordId:r.id,name:r.name,legalName:r.full_name,domain:r.domain,identity:'candidate_unconfirmed'}));}finally{conn.close();}
}
const directory=(owner:string)=>join(process.cwd(),'.data/research-agent/xmind-companies',hash(owner));
const reportPath=(owner:string,id:string)=>{if(!/^company-report-[a-f0-9]{64}$/.test(id))throw Object.assign(Error('报告编号错误'),{status:400});return join(directory(owner),id+'.json');};
export function readCompanyReport(owner:string,id:string){
 const path=reportPath(owner,id);if(!existsSync(path))throw Object.assign(Error('本会话无该公司报告'),{status:404});
 const record=JSON.parse(readFileSync(path,'utf8')),bundle=candidateBundleSchema.parse(record.bundle),snapshot=validateV3Snapshot(record.snapshot,bundle);
 return {reportId:id,bundle,snapshot};
}
export function listCompanyReports(owner:string){
 const folder=directory(owner);if(!existsSync(folder))return [];
 return readdirSync(folder).filter(name=>/^company-report-[a-f0-9]{64}\.json$/.test(name)).slice(-200).map(name=>{
  const r=readCompanyReport(owner,name.slice(0,-5));return {reportId:r.reportId,name:r.bundle.companies[0].legalName,createdAt:r.snapshot.createdAt,reportUrl:'/api/integration/companies/reports/'+r.reportId};
 }).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}
const active=new Map<string,Promise<{reportId:string;reportUrl:string}>>();
export async function investigateCompany(owner:string,raw:unknown){
 const config=agentConfiguration();if(!config.enabled||!config.v3Enabled)throw Object.assign(Error('V3 未开启'),{status:409});
 const body=z.strictObject({companyId:z.number().int().positive(),v3:z.unknown().optional()}).parse(raw),options=loadV3Options(owner,body.v3??{discovery:'supplied_only',purpose:'exploration'});
 const id='company-report-'+hash([owner,body.companyId,options,'xmind-company/1']),path=reportPath(owner,id);
 if(existsSync(path)){readCompanyReport(owner,id);return {reportId:id,reportUrl:'/api/integration/companies/reports/'+id};}
 const key=hash([owner,id]);if(active.has(key))return active.get(key)!;
 const task=(async()=>{
  const conn=db();let row;try{row=conn.prepare('SELECT id,name,full_name,credit_code_collab FROM companies WHERE id=?').get(body.companyId);}finally{conn.close();}
  if(!row)throw Object.assign(Error('候选公司不存在'),{status:404});
  const companyId='exploration-company-'+body.companyId,scope='exploration-'+hash(owner).slice(0,28),now=new Date().toISOString();
  const legalName=typeof row.full_name==='string'&&row.full_name.trim()?row.full_name.trim():String(row.name);
  const bundle:CandidateBundle=candidateBundleSchema.parse({schemaVersion:'1.0.0',bundleId:id,projectId:scope,intentId:scope,intentRevision:1,mode:'manual',retrievedAt:now,companies:[{companyId,legalName,brandName:row.name,creditCode:row.credit_code_collab??null,identityStatus:'ambiguous'}],jobs:[],evidence:[],facts:[],coverage:[],usage:[]});
  const source:Record<string,any>={};
  // An internal exploration task identity is not a confirmed A profile or inferred preferences.
  await enrichWithV3(bundle,source,{UserProfile:{profileId:scope,revision:1,preferences:[]}},()=>{},{...options,purpose:'exploration'},{maxRequests:6,deadlineMs:90000});
  mkdirSync(directory(owner),{recursive:true});atomicWrite(path,JSON.stringify({archiveVersion:'company-exploration/1',reportId:id,bundle,snapshot:validateV3Snapshot(source.agentV3,bundle)}));
  return {reportId:id,reportUrl:'/api/integration/companies/reports/'+id};
 })();active.set(key,task);try{return await task;}finally{active.delete(key);}
}
export function companyReportResponse(owner:string,id:string,format:string|null){
 const r=readCompanyReport(owner,id);if(format==='json')return Response.json(r,{headers:{'cache-control':'no-store'}});
 const html='<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>公司建档调查</title><style>body{max-width:960px;margin:24px auto;padding:16px;font:16px/1.6 system-ui}details,.card{padding:12px;border:1px solid #ddd;margin:12px 0}blockquote{white-space:pre-wrap;overflow-wrap:anywhere}a{color:#165dcc}</style><h1>'+escapeHtml(r.bundle.companies[0].legalName)+'</h1><p>公司探索建档；尚未提供个人需求或目标岗位，不作岗位适用或需求满足判断。</p>'+renderV3Report(r.snapshot,id).replaceAll('/api/integration/reports/','/api/integration/companies/reports/')+'</html>';
 return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
}
export function companySource(owner:string,id:string,evidenceId:string){const r=readCompanyReport(owner,id);return readSavedV3Source(r.snapshot,r.bundle,evidenceId);}
