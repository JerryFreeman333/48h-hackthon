import {randomUUID} from "node:crypto";
import {candidateBundleSchema,validateBundleReferences,type CandidateBundle} from "../contracts";
import type {ArchivedReport} from "./report-archive";
const error=(message:string):never=>{throw Object.assign(new Error(message),{status:409});};
export function mergeComparison(records:ArchivedReport[]):CandidateBundle{
 if(records.length<2||records.length>3||new Set(records.map(r=>r.report.reportId)).size!==records.length)error("请选择两至三份不同的岗位报告");
 const first=records[0];
 if(records.some(r=>r.report.projectId!==first.report.projectId||r.report.profileId!==first.report.profileId||r.report.profileRevision!==first.report.profileRevision||r.report.mode!==first.report.mode||r.inputs.aExport.checksum!==first.inputs.aExport.checksum))error("比较须使用同一需求记录、确认版本和资料模式；请先用同一版本重新分析");
 const result=structuredClone(first.inputs.bundle) as CandidateBundle;
 result.bundleId="bundle-"+randomUUID();result.jobs=[];result.companies=[];result.evidence=[];result.facts=[];result.coverage=[];result.usage=[];
 const jobSignatures=new Set<string>();
 function merge<T>(target:T[],items:T[],id:(item:T)=>string){for(const item of items){const previous=target.find(t=>id(t)===id(item));if(previous){if(JSON.stringify(previous)!==JSON.stringify(item))error("相同编号的资料内容冲突，不能悄悄覆盖");}else target.push(structuredClone(item));}}
 for(const record of records){
  const b=candidateBundleSchema.parse(record.inputs.bundle);
  for(const job of b.jobs){const company=b.companies.find(c=>c.companyId===job.companyId);const signature=JSON.stringify([job.title,job.rawJd,job.city,job.sourceUrl,company?.legalName??null]);if(jobSignatures.has(signature)||result.jobs.some(j=>j.jobId===job.jobId))error("同一岗位的重复报告应查看版本变化，不作为不同候选比较");jobSignatures.add(signature);result.jobs.push(structuredClone(job));}
  merge(result.companies,b.companies,c=>c.companyId);merge(result.evidence,b.evidence,e=>e.evidenceId);merge(result.facts,b.facts,f=>f.factId);merge(result.coverage,b.coverage,c=>JSON.stringify(c));merge(result.usage,b.usage,u=>JSON.stringify(u));
  if(b.retrievedAt<result.retrievedAt)result.retrievedAt=b.retrievedAt;
 }
 if(result.jobs.length<2||result.jobs.length>3)error("当前支持两至三个不同岗位；请勿选择包含多岗位的合并报告重复比较");
 const valid=candidateBundleSchema.parse(result);if(validateBundleReferences(valid).length)error("比较资料范围或引用不一致");return valid;
}
