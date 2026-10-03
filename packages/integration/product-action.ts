import type {MatchReport} from "../contracts";
import type {NeedsResponse} from "./job-needs";
import type {ReportViewModel} from "../../modules/c-report/ui/report-view-model";
export function productActions(report:MatchReport,needs:NeedsResponse){
 return report.results.map(r=>{const gate=needs.candidates.find(c=>c.jobId===r.jobId),unknownHard=r.constraints.filter(c=>c.result==="unknown").map(c=>c.key),mustAsk=gate?.items.filter(i=>i.requiresAction).map(i=>i.topicId+"."+i.itemId)??[];
 const blocked=r.recommendation==="explore"&&(unknownHard.length>0||mustAsk.length>0);
 return {ruleVersion:"product-action-1" as const,jobId:r.jobId,coreRecommendation:r.recommendation,recommendation:blocked?"verify_first" as const:r.recommendation,unknownHard,mustAsk,note:blocked?"已确认硬条件或你要求先核实的重点仍未解决：先核实再决定。你要求这些信息明确后再决定，当前资料尚未回应。":null};});
}
export type ProductActions=ReturnType<typeof productActions>;
export function applyProductActions(vm:ReportViewModel,actions:ProductActions,needs?:NeedsResponse):ReportViewModel{
 const copy=structuredClone(vm);
 for(const c of copy.candidates){const action=actions.find(a=>a.jobId===c.jobId);if(action?.note){c.recommendation=action.recommendation;c.actionLabel="先核验";c.actionNote=action.note;}}
 for(const c of copy.candidates){if(copy.meta.mode==="manual"&&c.recommendation==="deprioritize"&&c.constraints.some(x=>x.result==="fail"))c.actionNote="你提供的岗位描述与已确认必要条件冲突；请核实描述是否准确、条件是否可调整。";}
 if(copy.summary.action){const candidate=copy.candidates.find(c=>c.jobId===copy.summary.action!.jobId);if(candidate){copy.summary.action.recommendation=candidate.recommendation;copy.summary.action.actionLabel=candidate.actionLabel;copy.summary.action.actionNote=candidate.actionNote;}}
 const action=actions.find(a=>a.jobId===copy.summary.action?.jobId);
 if(action?.recommendation==="verify_first"&&(action.unknownHard.length>0||action.mustAsk.length>0)){const questions:Record<string,string>={city:"这份岗位的实际工作地点是什么？请提供岗位对应的书面信息。",min_fixed_monthly_salary:"税前固定月薪是多少？请明确固定与浮动部分及书面口径。",accept_sales_kpi:"销售签单指标是否计入岗位考核？",accept_travel:"这份岗位的出差频率及范围是什么？",accept_outsourcing:"招聘、签约及实际用工主体分别是什么？"};const key=action.unknownHard[0],item=needs?.candidates.find(c=>c.jobId===action.jobId)?.items.find(i=>i.requiresAction);if(key)copy.summary.primaryQuestion={text:questions[key]??"请核实尚未明确的必要条件。",resolves:[key]};else if(item)copy.summary.primaryQuestion={text:item.question,resolves:["needs."+item.topicId+"."+item.itemId]};}
 const selected=copy.candidates.find(c=>c.jobId===copy.summary.action?.jobId),failed=selected?.constraints.find(c=>c.result==="fail");
 if(selected?.recommendation==="deprioritize"&&failed){copy.summary.primaryQuestion={text:hardConflictQuestion(failed.key),resolves:[failed.key]};}
 return copy;
}
const labels:Record<string,string>={hold:"等待",verify_first:"先核验",deprioritize:"暂缓",explore:"继续了解",insufficient:"信息不足"};
export function productActionMarkdown(actions:ProductActions){return "## 下一步动作\n\n"+actions.map(a=>"- "+a.jobId+"："+labels[a.recommendation]+(a.note?"。"+a.note:"")+"（原规则动作："+labels[a.coreRecommendation]+"）").join("\n")+"\n\n";}

export function hardConflictQuestion(key:string){const questions:Record<string,string>={city:"实际工作地点是否可以满足你确认的城市要求？请核实岗位地点及可调整安排。",min_fixed_monthly_salary:"固定月薪是否可以满足你确认的最低要求？请明确固定部分及书面口径。",accept_sales_kpi:"岗位描述包含销售签单指标，与已确认的不接受销售KPI条件冲突：该指标是否确实适用于这份岗位，是否可以调整？",accept_travel:"岗位出差要求与已确认条件冲突：实际频次、范围及是否可调整是什么？",accept_outsourcing:"岗位用工形式与已确认条件冲突：签约、实际用工主体及是否可调整是什么？"};return questions[key]??"岗位描述与已确认必要条件冲突：请核实具体要求是否准确、是否可以调整。";}
