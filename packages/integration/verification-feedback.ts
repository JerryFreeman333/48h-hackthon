import {hardConflictQuestion} from "./product-action";
import {randomUUID} from "node:crypto";
import type {ArchivedReport} from "./report-archive";
import {escapeHtml} from "../../modules/c-report/ui/render-html";
import {escapeForMarkdown,safeUrl} from "../../modules/c-report/application/markdown";
export type VerificationQuestion={id:string;jobId:string;jobTitle:string;text:string;targets:string[]};
export type VerificationNote={noteId:string;question:VerificationQuestion;answer:string;sourceUrl:string|null;recordedAt:string;verification:"user_provided_unverified"};
export function feedbackQuestions(record:ArchivedReport):VerificationQuestion[]{
 const out:VerificationQuestion[]=[];
 for(const result of record.report.results){const title=record.inputs.bundle.jobs.find((j:any)=>j.jobId===result.jobId)?.title??result.jobId;
 const questions=result.constraints.filter(c=>c.result==="fail").map(c=>({text:hardConflictQuestion(c.key),targets:[c.key]}));
 questions.push(...result.questions.map((q:any)=>({text:q.text,targets:q.resolves})));
 for(const c of result.constraints.filter(c=>c.result==="unknown"))questions.push({text:"请补充尚未明确的必要条件："+c.key,targets:[c.key]});
 for(const item of record.inputs.needsResponse?.candidates.find((c:any)=>c.jobId===result.jobId)?.items??[])questions.push({text:item.question,targets:["needs."+item.topicId+"."+item.itemId]});
 for(const q of questions){const id=result.jobId+"|"+q.targets.join("|");if(!out.some(v=>v.id===id))out.push({id,jobId:result.jobId,jobTitle:title,text:q.text,targets:[...q.targets]});}}
 return out;
}
export function createVerificationNote(record:ArchivedReport,raw:unknown):VerificationNote{
 const b=raw as Record<string,unknown>;
 if(!b||typeof b.questionId!=="string"||typeof b.answer!=="string"||!b.answer.trim()||b.answer.length>6000)throw Object.assign(Error("请选择报告里的问题，并填写1–6000字的回复"),{status:400});
 const question=feedbackQuestions(record).find(q=>q.id===b.questionId);if(!question)throw Object.assign(Error("该问题不属于此报告的岗位范围"),{status:400});
 const url=typeof b.sourceUrl==="string"?b.sourceUrl.trim():"";if(url&&(url.length>2000||!safeUrl(url)))throw Object.assign(Error("来源链接须为http或https"),{status:400});
 return {noteId:"note-"+randomUUID(),question,answer:b.answer.trim(),sourceUrl:url||null,recordedAt:new Date().toISOString(),verification:"user_provided_unverified"};
}
export function feedbackHtml(notes:VerificationNote[],previousReportId?:string){if(!notes.length)return "";const e=escapeHtml;return '<section class="card"><h2>补充的核验记录</h2><p>以下是你提供的回复与来源，尚未独立核验；不会自动改为符合条件，也不会解除未知。</p>'+notes.map(n=>'<article><h3>'+e(n.question.jobTitle)+' · '+e(n.question.text)+'</h3><p style="white-space:pre-wrap">'+e(n.answer)+'</p><p>记录时间 '+e(n.recordedAt)+' · 用户提供，待核验'+(n.sourceUrl?' · <a href="'+e(n.sourceUrl)+'" target="_blank" rel="noopener noreferrer">查看所提供来源</a>':' · 未提供链接')+'</p></article>').join('')+(previousReportId?'<p><a href="/flow/reports/'+e(previousReportId)+'">查看补充前的报告 →</a></p>':'')+'</section>';}
export function feedbackMarkdown(notes:VerificationNote[]){if(!notes.length)return "";return "## 补充的核验记录\n\n用户提供，尚未独立核验；不自动解除未知或代表符合条件。\n\n"+notes.map(n=>"### "+escapeForMarkdown(n.question.jobTitle+" · "+n.question.text)+"\n\n"+escapeForMarkdown(n.answer)+"\n\n记录时间："+n.recordedAt+"；来源："+escapeForMarkdown(n.sourceUrl??"未提供链接")+"\n").join("\n")+"\n";}
