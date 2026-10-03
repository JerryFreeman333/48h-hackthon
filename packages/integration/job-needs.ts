import {escapeForMarkdown} from "../../modules/c-report/application/markdown";
import { z } from "zod";
import { topics } from "../../modules/a-profile/src/needs/catalog.mjs";
import type { CandidateBundle, MatchReport } from "../contracts";
import { escapeHtml } from "../../modules/c-report/ui/render-html";

const topicSchema = z.object({ topicId: z.string(), title: z.string(), priority: z.enum(["priority", "secondary", "unknown"]), verificationItemIds: z.array(z.string()), unknownHandling: z.enum(["verify_first", "continue_with_unknown", "unknown"]), userConfirmed: z.boolean() });
const snapshotSchema = z.object({ schemaVersion: z.literal("a-job-needs-1"), projectId: z.string(), profileId: z.string(), profileRevision: z.number().int().positive(), mode: z.enum(["demo", "manual", "live"]), confirmedAt: z.string().nullable(), topics: z.array(topicSchema).length(7) });
export function buildInvestigationPlan(raw: unknown) {
  const snapshot = snapshotSchema.parse(raw);
  if (!snapshot.confirmedAt || snapshot.topics.some(t => !t.userConfirmed)) throw new Error("需求清单须来自已确认版本");
  if (new Set(snapshot.topics.map(t => t.topicId)).size !== 7) throw new Error("需求主题不可重复");
  const items = snapshot.topics.flatMap(t => {
    const def = topics.find((d: { id: string }) => d.id === t.topicId);
    if (!def || new Set(t.verificationItemIds).size !== t.verificationItemIds.length || t.verificationItemIds.some(id => !def.details.some((d: { id: string }) => d.id === id))) throw new Error("需求主题或明细不在当前目录");
    const ids = t.verificationItemIds.length ? t.verificationItemIds : t.priority === "priority" ? ["clarify"] : [];
    return ids.map(itemId => ({ topicId: t.topicId, topicTitle: def.title, itemId, label: itemId === "clarify" ? "明确该主题中最在意的具体信息" : def.details.find((d: { id: string }) => d.id === itemId)!.text, priority: t.priority, unknownHandling: t.unknownHandling, mustVerify: t.priority === "priority" && t.unknownHandling === "verify_first", factKey: itemId === "clarify" ? null : "needs." + t.topicId + "." + itemId, scope: t.topicId === "company" ? "company" as const : "job" as const }));
  });
  return { schemaVersion: "product-needs-1" as const, projectId: snapshot.projectId, profileId: snapshot.profileId, profileRevision: snapshot.profileRevision, mode: snapshot.mode, items, unknownTopicIds: snapshot.topics.filter(t => t.priority === "unknown").map(t => t.topicId) };
}
export function respondToJobNeeds(raw: unknown, bundle: CandidateBundle) {
  const plan = buildInvestigationPlan(raw);
  if (plan.projectId !== bundle.projectId || plan.mode !== bundle.mode || plan.profileRevision !== bundle.intentRevision) throw new Error("需求与岗位快照不属于同一项目、模式或版本");
  return { plan, candidates: bundle.jobs.map(job => {
    const items = plan.items.map(item => {
      const facts = bundle.facts.filter(f => f.key === item.factKey && (item.scope === "job" ? f.jobId === job.jobId && f.companyId === job.companyId : !!job.companyId && f.jobId === null && f.companyId === job.companyId && bundle.companies.some(c => c.companyId === job.companyId && c.identityStatus === "confirmed")));
      const relevant = facts.filter(f => f.evidenceIds.length && f.evidenceIds.every(id => bundle.evidence.some(e => e.evidenceId === id && e.mode === bundle.mode && e.scope === item.scope && e.companyId === f.companyId && e.jobId === f.jobId && e.verification === "verified" && !!e.excerpt.trim())));
      const conflicting = relevant.some(f => f.status === "conflicting" || f.status === "contradicted") || new Set(relevant.filter(f => f.status === "supported").map(f => JSON.stringify(f.value))).size > 1;
      const available = relevant.some(f => f.status === "supported" && f.value !== null);
      const status = conflicting ? "conflicting" as const : available ? "available" as const : "unknown" as const;
      return { ...item, status, factIds: relevant.map(f => f.factId), evidenceIds: [...new Set(relevant.flatMap(f => f.evidenceIds))], question: item.itemId === "clarify" ? "关于" + item.topicTitle + "，先确认你最在意什么，再向招聘方核实。" : "请说明“" + item.label + "”，并提供对应岗位或主体的可核实材料。", requiresAction: status !== "available" && item.mustVerify };
    });
    return { jobId: job.jobId, actionGate: items.some(i => i.requiresAction) ? "verify_first" as const : "no_additional_gate" as const, items };
  }) };
}
export type NeedsResponse = ReturnType<typeof respondToJobNeeds>;
export function renderNeedsHtml(response: NeedsResponse, report?: MatchReport, bundle?: CandidateBundle): string {
  const e = escapeHtml;
  return '<section class="card" id="your-needs"><h2 style="margin-top:0">你关心的事项与下一步</h2><p>需求版本 ' + response.plan.profileRevision + '。这里判断资料是否回应了你的问题，不计算匹配分；有资料不代表满足个人预期。</p>' + (response.plan.items.length ? response.candidates.map(c => '<h3>' + e(bundle?.jobs.find(j=>j.jobId===c.jobId)?.title??c.jobId) + '</h3><p><strong>' + (report?.results.find(r => r.jobId === c.jobId)?.recommendation === 'deprioritize' ? '该岗位已存在硬条件冲突，优先处理下方冲突；若仍考虑，再核实这些关注事项。' : c.actionGate === 'verify_first' ? '你的重点仍未核实：先核实以下必问事项，再作决定。' : '你的需求没有增加新的核验门槛；仍需结合下方岗位与主体判断。') + '</strong></p><ul>' + c.items.map(i => '<li><strong>' + e(i.topicTitle + ' · ' + i.label) + '</strong>：' + (i.status === 'available' ? '已有同范围核验材料' : i.status === 'conflicting' ? '材料相互冲突' : '尚未核实') + '；' + (i.requiresAction ? '决定前必问' : i.unknownHandling === 'continue_with_unknown' ? '你允许继续了解，但保留此未知' : '建议补充了解') + '<p>' + e(i.question) + '</p>' + (i.factIds.length ? '<small>引用事实：' + e(i.factIds.join('、')) + '</small>' : '') + '</li>').join('') + '</ul>').join('') : '<p>尚未填写具体关注事项，可先调查岗位，再补充个人需求。</p>') + '<p><a href="/profile">修改个人需求</a> · <a href="/analyze">分析另一份 JD</a></p></section>';
}
export function needsMarkdown(response: NeedsResponse,bundle?:CandidateBundle): string {
  return "## 你的关注事项\n\n需求版本：" + response.plan.profileRevision + "；有资料不等于满足需求。\n\n" + response.candidates.map(c => "### " + escapeForMarkdown(bundle?.jobs.find(j=>j.jobId===c.jobId)?.title??c.jobId) + "\n\n需求行动门槛：" + c.actionGate + "\n\n" + c.items.map(i => "- " + i.topicTitle + " / " + i.label + "：" + i.status + (i.requiresAction ? "（决定前必问）" : "") + "。" + i.question).join("\n")).join("\n\n") + "\n\n";
}
