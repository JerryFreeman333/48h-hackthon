import {z} from "zod";
import {candidateBundleSchema,validateBundleReferences,type CandidateBundle} from "../contracts";
import type {ArchivedReport} from "./report-archive";
import {manualJobSchema} from "../../modules/b-research/inputs";
import {escapeHtml} from "../../modules/c-report/ui/render-html";
import {escapeForMarkdown} from "../../modules/c-report/application/markdown";
const updateSchema=z.object({sameJobConfirmed:z.literal(true),title:z.string().trim().min(1).max(500),rawJd:z.string().trim().min(1).max(50000),city:z.string().trim().max(500).nullable().optional(),sourceUrl:z.string().trim().max(2048).nullable().optional(),publishedAt:z.string().trim().nullable().optional()}).strict();
export function manualMaterialContext(record:ArchivedReport){
 if(record.report.mode!=="manual"||record.inputs.bundle.jobs.length!==1)throw Object.assign(Error("材料更新只用于一份人工JD报告；比较报告和合成演示请先回到原岗位。"),{status:409});
 const job=record.inputs.bundle.jobs[0],company=record.inputs.bundle.companies.find((c:any)=>c.companyId===job.companyId);
 return {reportId:record.report.reportId,profileRevision:record.report.profileRevision,jobId:job.jobId,companyName:company?.legalName??null,job:{title:job.title,rawJd:job.rawJd,city:job.city,sourceUrl:job.sourceUrl,publishedAt:job.publishedAt},previousRetrievedAt:record.inputs.bundle.retrievedAt};
}
export function parseMaterialUpdate(record:ArchivedReport,raw:unknown){const context=manualMaterialContext(record),parsed=updateSchema.parse(raw),{sameJobConfirmed,...job}=parsed;return manualJobSchema.parse({...job,city:parsed.city||null,sourceUrl:parsed.sourceUrl||null,publishedAt:parsed.publishedAt||null,projectId:record.report.projectId,companyName:context.companyName,sourceTitle:"用户更新 JD"});}
export function bindUpdatedMaterial(record:ArchivedReport,fresh:CandidateBundle):CandidateBundle{
 const old=record.inputs.bundle.jobs[0],next=structuredClone(fresh),newJob=next.jobs[0];if(next.jobs.length!==1||!newJob)throw Error("材料更新必须只包含原岗位");
 const newJobId=newJob.jobId,newCompanyId=newJob.companyId;
 // The user explicitly updates this job. This preserves local job lineage, not legal identity verification.
 for(const row of next.jobs){if(row.jobId===newJobId)row.jobId=old.jobId;if(row.companyId===newCompanyId)row.companyId=old.companyId;}
 for(const row of next.companies){if(row.companyId===newCompanyId&&old.companyId)row.companyId=old.companyId;}
 for(const rows of [next.evidence,next.facts,next.coverage])for(const row of rows){if(row.jobId===newJobId)row.jobId=old.jobId;if(row.companyId===newCompanyId)row.companyId=old.companyId;}
 const valid=candidateBundleSchema.parse(next);if(validateBundleReferences(valid).length)throw Error("更新材料引用校验失败");return valid;
}
export function describeMaterialUpdate(previous:ArchivedReport,bundle:CandidateBundle){
 const old=previous.inputs.bundle.jobs[0],next=bundle.jobs[0],labels:Record<string,string>={title:"岗位名称",rawJd:"JD正文",city:"工作城市",sourceUrl:"来源链接",publishedAt:"来源发布日期"};
 const fields=Object.keys(labels).filter(key=>old[key]!==next[key as keyof typeof next]).map(key=>({key,label:key==="rawJd"?"JD正文（内容已替换）":labels[key],before:key==="rawJd"?String(old.rawJd.length)+"字":old[key],after:key==="rawJd"?String(next.rawJd.length)+"字":next[key as keyof typeof next]}));
 if(!fields.length)throw Object.assign(Error("材料没有变化；请修改JD、岗位名称或来源信息后再生成。"),{status:409});
 return {kind:"manual_jd_update" as const,beforeRecommendation:previous.inputs.actions?.find((a:any)=>a.jobId===next.jobId)?.recommendation??previous.report.results.find(r=>r.jobId===next.jobId)?.recommendation??null,afterRecommendation:null as string|null,previousReportId:previous.report.reportId,jobId:next.jobId,profileRevision:previous.report.profileRevision,previousRetrievedAt:previous.inputs.bundle.retrievedAt,retrievedAt:bundle.retrievedAt,fields,materialPolicy:"new-user-submitted-jd-unverified-replaces-previous-job-material",previousRuleVersion:previous.report.ruleVersion};
}
export type MaterialChanges=ReturnType<typeof describeMaterialUpdate>;
const actionLabels:Record<string,string>={hold:"等待",verify_first:"先核验",deprioritize:"暂缓",explore:"继续了解",insufficient:"信息不足"};
export function materialUpdateHtml(change:MaterialChanges,ruleVersion:string){const e=escapeHtml;return '<section class="card"><h2>岗位材料已更新</h2><p>沿用需求版本 '+change.profileRevision+'，为同一岗位另存报告。新JD替换本次分析的旧岗位材料；未重新调查企业，新增内容仍未独立核验。</p><p>材料录入时间 '+e(change.previousRetrievedAt)+' → '+e(change.retrievedAt)+'。这是录入时间，不证明招聘信息仍有效。</p><ul>'+change.fields.map(f=>'<li>'+e(f.label)+'：'+e(String(f.before??'未提供'))+' → '+e(String(f.after??'未提供'))+'</li>').join('')+'</ul>'+(change.afterRecommendation?'<p>最终下一步：'+e(actionLabels[change.beforeRecommendation??'']??'无')+' → '+e(actionLabels[change.afterRecommendation]??change.afterRecommendation)+'</p>':'')+'<p>旧核验回复作为历史记录保留，不代表对新JD的核实结果。旧薪资及在招声明不自动沿用，未重新提供的字段保持未知。</p>'+(change.previousRuleVersion!==ruleVersion?'<p>同时使用更新规则，变化不能全部归因于材料更新。</p>':'')+'<a href="/flow/reports/'+e(change.previousReportId)+'">查看更新前的原报告 →</a></section>';}
export function materialUpdateMarkdown(change:MaterialChanges|null,ruleVersion:string){if(!change)return '';const e=escapeForMarkdown;return '## 岗位材料已更新\n\n沿用需求版本 '+change.profileRevision+'；同一岗位另存新报告。新JD替换本次分析的旧岗位材料，未重新调查企业，仍未独立核验。\n\n材料录入时间：'+change.previousRetrievedAt+' → '+change.retrievedAt+'；不证明招聘信息仍有效。\n\n'+change.fields.map(f=>'- '+e(f.label)+'：'+e(String(f.before??'未提供'))+' → '+e(String(f.after??'未提供'))).join('\n')+(change.afterRecommendation?'\n\n最终下一步：'+e(actionLabels[change.beforeRecommendation??'']??'无')+' → '+e(actionLabels[change.afterRecommendation]??change.afterRecommendation):'')+'\n\n旧回复为历史记录，不代表新JD已核实；旧薪资和在招声明不自动沿用。'+(change.previousRuleVersion!==ruleVersion?'同时更新规则，变化不能全归因于材料。':'')+'\n\n更新前报告：'+e(change.previousReportId)+'\n\n';}
