import {topics} from "../../modules/a-profile/src/needs/catalog.mjs";
import type {ProductActions} from "./product-action";
import {escapeForMarkdown} from "../../modules/c-report/application/markdown";
import type { MatchReport } from "../contracts";
import { escapeHtml } from "../../modules/c-report/ui/render-html";
export function describeRevision(previous: Record<string, any>, next: Record<string, any>, oldReport: MatchReport, report: MatchReport, beforeActions?:ProductActions, afterActions?:ProductActions) {
 const before=previous.JobNeedsSnapshot,after=next.JobNeedsSnapshot;
 const conditions=next.UserProfile.preferences.filter((p:any)=>JSON.stringify(p)!==JSON.stringify(previous.UserProfile.preferences.find((v:any)=>v.key===p.key))).map((p:any)=>({key:p.key,before:previous.UserProfile.preferences.find((v:any)=>v.key===p.key),after:p}));
 const topics=after.topics.filter((t:any)=>{const old=before.topics.find((v:any)=>v.topicId===t.topicId);return JSON.stringify([t.priority,t.verificationItemIds,t.unknownHandling])!==JSON.stringify([old?.priority,old?.verificationItemIds,old?.unknownHandling]);}).map((t:any)=>({topicId:t.topicId,title:t.title,before:before.topics.find((v:any)=>v.topicId===t.topicId),after:t}));
 const goalsChanged=JSON.stringify(previous.UserProfile.goals)!==JSON.stringify(next.UserProfile.goals);
 const actions=report.results.map(r=>({jobId:r.jobId,before:oldReport.results.find(v=>v.jobId===r.jobId)?.recommendation??null,after:r.recommendation}));
 const productActions=report.results.map(r=>({jobId:r.jobId,before:beforeActions?.find(v=>v.jobId===r.jobId)?.recommendation??oldReport.results.find(v=>v.jobId===r.jobId)?.recommendation??null,after:afterActions?.find(v=>v.jobId===r.jobId)?.recommendation??r.recommendation}));
 return {productActions,ruleVersions:{before:oldReport.ruleVersion,after:report.ruleVersion},previousReportId:oldReport.reportId,fromRevision:oldReport.profileRevision,toRevision:report.profileRevision,conditions,topics,goalsChanged,actions,materialPolicy:"reuse-original-frozen-evidence-no-new-research"};
}
export type RevisionChanges=ReturnType<typeof describeRevision>;
const labels:Record<string,string>={city:"城市",min_fixed_monthly_salary:"固定月薪下限",accept_sales_kpi:"销售签单指标",accept_travel:"出差",accept_outsourcing:"外包用工"};
const policies:Record<string,string>={verify_first:'决定前先核实',continue_with_unknown:'允许带着未知继续了解',unknown:'尚未决定'};
const priorities:Record<string,string>={priority:'重点',secondary:'次要',unknown:'未知'};
const detailLabels=(topicId:string,ids:string[])=>ids.map(id=>topics.find((t:{id:string})=>t.id===topicId)?.details.find((d:{id:string})=>d.id===id)?.text??"目录外明细").join("、")||"无";
const actionLabels:Record<string,string>={hold:"等待",verify_first:"先核验",deprioritize:"暂缓",explore:"继续了解",insufficient:"信息不足"};
export function renderRevisionHtml(change: RevisionChanges) {
 const e=escapeHtml;
 return '<section class="card"><h2 style="margin-top:0">与上份报告相比</h2><p>需求版本 '+change.fromRevision+' → '+change.toRevision+'。岗位与证据使用原始快照，没有重新调查或更新资料日期。</p><ul>'+change.conditions.map((c:any)=>'<li>'+e(labels[c.key]??c.key)+'：'+e(JSON.stringify(c.before?.value??null))+' → '+e(JSON.stringify(c.after.value??null))+'；条件强度 '+e(c.before?.strength??'unknown')+' → '+e(c.after.strength)+'</li>').join('')+change.topics.map((t:any)=>'<li>'+e(t.title)+'：'+e(priorities[t.before?.priority]??'未知')+' → '+e(priorities[t.after.priority]??'未知')+'；未知处理 '+e(policies[t.before?.unknownHandling]??'未知')+' → '+e(policies[t.after.unknownHandling]??'未知')+'；所选明细 '+e(detailLabels(t.topicId,t.before?.verificationItemIds??[]))+' → '+e(detailLabels(t.topicId,t.after.verificationItemIds))+'</li>').join('')+(change.goalsChanged?'<li>求职目标已修改。</li>':'')+(change.productActions??change.actions).map(a=>'<li>最终下一步 '+e(a.jobId)+'：'+e(actionLabels[a.before??'']??'无')+' → '+e(actionLabels[a.after]??a.after)+'</li>').join('')+'</ul>'+(change.ruleVersions&&change.ruleVersions.before!==change.ruleVersions.after?'<p>规则版本 '+e(change.ruleVersions.before)+' → '+e(change.ruleVersions.after)+'。本次同时使用更新的规则，判断差异不全归因于需求变化。</p>':'')+'<p><a href="/flow/reports/'+e(change.previousReportId)+'">查看上份原始报告 →</a></p></section>';
}

export function revisionMarkdown(change:RevisionChanges|null):string{
 if(!change)return "";const e=escapeForMarkdown;
 const lines=["## 与上份报告相比","","需求版本 "+change.fromRevision+" → "+change.toRevision+"。岗位及证据使用原快照，没有重新调查或更新日期。",""];
 for(const c of change.conditions)lines.push("- "+e(labels[c.key]??c.key)+"："+e(JSON.stringify(c.before?.value??null))+" → "+e(JSON.stringify(c.after.value??null))+"；强度 "+e(c.before?.strength??"unknown")+" → "+e(c.after.strength));
 for(const t of change.topics)lines.push("- "+e(t.title)+"："+e(priorities[t.before?.priority]??"未知")+" → "+e(priorities[t.after.priority]??"未知")+"；未知处理 "+e(policies[t.before?.unknownHandling]??"未知")+" → "+e(policies[t.after.unknownHandling]??"未知"));
 if(change.goalsChanged)lines.push("- 求职目标已修改。");
 for(const a of change.productActions??change.actions)lines.push("- 最终下一步 "+e(a.jobId)+"："+e(actionLabels[a.before??""]??"无")+" → "+e(actionLabels[a.after]??a.after));
 if(change.ruleVersions&&change.ruleVersions.before!==change.ruleVersions.after)lines.push("- 规则版本 "+e(change.ruleVersions.before)+" → "+e(change.ruleVersions.after)+"；判断差异不全归因于需求变化。");
 lines.push("","上一份报告："+e(change.previousReportId),"");return lines.join("\n")+"\n";
}
