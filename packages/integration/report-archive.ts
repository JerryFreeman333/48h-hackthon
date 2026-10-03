import {reportDataStatus} from './data-status';
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { candidateBundleSchema, matchReportSchema, validateReportReferences, type MatchReport } from "../contracts";
import type { StoredReportSnapshot } from "../../modules/c-report/application/ports";

export type ArchivedReport = { archiveVersion: 1; ownerId: string; report: MatchReport; snapshot: StoredReportSnapshot; inputs: Record<string, any>; markdown: string; jsonExport: unknown };
const digest = (text: string) => createHash("sha256").update(text).digest("hex");
const validId = (id: string) => /^report-[a-zA-Z0-9-]{1,100}$/.test(id);
// Local single-machine archive, not a production database or account service.
export class ReportArchive {
  private memory = new Map<string, string>();
  constructor(private directory?: string) {}
  private folder(owner: string) { return this.directory ? join(this.directory, digest(owner)) : null; }
  private key(owner: string, id: string) { return digest(owner) + ":" + id; }
  private validate(value: ArchivedReport, owner: string, id: string) {
    const report = matchReportSchema.parse(value.report), bundle = candidateBundleSchema.parse(value.inputs.bundle);
    if (value.archiveVersion !== 1 || value.ownerId !== owner || report.reportId !== id || value.snapshot.ownerId !== owner || value.snapshot.projectId !== report.projectId || value.inputs.aExport.UserProfile.profileId !== report.profileId || value.inputs.aExport.UserProfile.revision !== report.profileRevision || JSON.stringify(value.snapshot.report) !== JSON.stringify(value.report) || JSON.stringify(value.snapshot.snapshot.report) !== JSON.stringify(value.report) || validateReportReferences(report,bundle).length) throw new Error("报告归档的身份或引用不一致");
  }
  save(value: ArchivedReport) {
    const id=value.report.reportId, owner=value.ownerId;
    if (!validId(id)) throw new Error("无效报告编号");
    this.validate(value,owner,id);
    const payload=JSON.stringify(value), wrapped=JSON.stringify({ checksum:digest(payload),payload });
    const folder=this.folder(owner);
    if (folder) {
      mkdirSync(folder,{recursive:true}); const file=join(folder,id+".json");
      if (existsSync(file)) throw new Error("旧报告归档不可覆盖");
      const temp=join(folder,id+"."+randomUUID()+".tmp");
      writeFileSync(temp,wrapped,{encoding:"utf8",flag:"wx"}); renameSync(temp,file);
    } else { if (this.memory.has(this.key(owner,id))) throw new Error("旧报告归档不可覆盖"); this.memory.set(this.key(owner,id),wrapped); }
  }
  read(owner: string, id: string): ArchivedReport | null {
    if (!validId(id)) return null;
    const folder=this.folder(owner), file=folder ? join(folder,id+".json") : null;
    const raw=file ? existsSync(file) ? readFileSync(file,"utf8") : null : this.memory.get(this.key(owner,id));
    if (!raw) return null;
    const {checksum,payload}=JSON.parse(raw);
    if (typeof payload!=="string" || checksum!==digest(payload)) throw new Error("报告归档损坏，请勿以此生成判断");
    const value=JSON.parse(payload) as ArchivedReport; this.validate(value,owner,id); return value;
  }
  list(owner: string) {
    const folder=this.folder(owner);
    const ids=folder ? existsSync(folder) ? readdirSync(folder).filter(n=>n.endsWith(".json")).map(n=>n.slice(0,-5)) : [] : [...this.memory.keys()].filter(k=>k.startsWith(digest(owner)+":")).map(k=>k.slice(k.indexOf(":")+1));
    const labels:Record<string,string>={needs_revision:"修改需求",verification_feedback:"补充核验记录",manual_jd_update:"更新岗位材料",candidate_comparison:"候选比较",initial_analysis:"首次分析"};
    return ids.map(id=>this.read(owner,id)).filter((v):v is ArchivedReport=>!!v).map(v=>{const kind=v.inputs.researchRun?.kind??"initial_analysis",jobs=v.inputs.bundle.jobs;return {dataStatus:reportDataStatus(v),reportId:v.report.reportId,generatedAt:v.report.generatedAt,mode:v.report.mode,projectId:v.report.projectId,profileId:v.report.profileId,profileRevision:v.report.profileRevision,jobTitles:jobs.map((j:any)=>j.title),jobIds:jobs.map((j:any)=>j.jobId),candidateSignatures:jobs.map((j:any)=>digest(JSON.stringify([j.title,j.rawJd,j.city,j.sourceUrl,v.inputs.bundle.companies.find((c:any)=>c.companyId===j.companyId)?.legalName??null]))),kind,kindLabel:labels[kind]??"归档分析",previousReportId:v.inputs.researchRun?.previousReportId??v.inputs.changes?.previousReportId??null,reportUrl:"/flow/reports/"+v.report.reportId};}).sort((a,b)=>b.generatedAt.localeCompare(a.generatedAt)||b.reportId.localeCompare(a.reportId));
  }
}
