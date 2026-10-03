import {evidenceTopicLinks} from './evidence-topics';
import { escapeForMarkdown } from "../../modules/c-report/application/markdown";
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

type Evidence = CandidateBundle["evidence"][number];
export type NeedsSourceMetadata = { sourceDates?: ReadonlyArray<Record<string, unknown>> };
const recordedText = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
const scopeLabels: Record<Evidence["scope"], string> = {
  job: "对应岗位资料",
  company: "公司层面资料，不能直接作为岗位承诺",
  business: "业务或集团层面资料，不能直接作为岗位承诺",
  team: "团队层面资料，不能自动代表这份岗位的团队"
};
function sourceFor(evidence: Evidence, metadata: NeedsSourceMetadata) {
  const dates = metadata.sourceDates?.find(d => d.evidenceId === evidence.evidenceId);
  const publishedAt = recordedText(dates?.publishedAtRaw) ?? evidence.publishedAt;
  const collectedAt = recordedText(dates?.retrievedAtRaw);
  return {
    evidenceId: evidence.evidenceId, title: evidence.title, url: evidence.url, excerpt: evidence.excerpt,
    scope: evidence.scope, scopeLabel: scopeLabels[evidence.scope], verification: evidence.verification,
    publishedAt, retrievedAt: evidence.retrievedAt, collectedAt: dates ? collectedAt : evidence.retrievedAt,
    dateNote: dates && !collectedAt ? "原始采集时间未记录；本次接入时间不代表原始采集或核验时间。" : dates && collectedAt && !/(?:Z|[+-]\d{2}:\d{2})$/.test(collectedAt) ? "原始采集时间未记录时区。" : null
  };
}

/** Cited company or team leads remain visible, without becoming this job's promise. */
export function respondToJobNeeds(raw: unknown, bundle: CandidateBundle, metadata: NeedsSourceMetadata = {}) {
  const plan = buildInvestigationPlan(raw);
  if (plan.projectId !== bundle.projectId || plan.mode !== bundle.mode || plan.profileRevision !== bundle.intentRevision) throw new Error("需求与岗位快照不属于同一项目、模式或版本");
  const evidenceById = new Map(bundle.evidence.map(e => [e.evidenceId, e]));
  return { plan, candidates: bundle.jobs.map(job => {
    const company = bundle.companies.find(c => c.companyId === job.companyId);
    const items = plan.items.map(item => {
      // Null-job facts stay company-level leads; facts from another job are excluded.
      const matching = bundle.facts.filter(f => f.key === item.factKey && f.companyId === job.companyId && (f.jobId === null ? !!job.companyId : item.scope === "job" && f.jobId === job.jobId));
      const cited = matching.flatMap(fact => {
        const evidence = fact.evidenceIds.map(id => evidenceById.get(id));
        if (fact.value === null || !fact.evidenceIds.length || evidence.some(e => !e || e.mode !== bundle.mode || e.companyId !== fact.companyId || e.jobId !== fact.jobId || !e.excerpt.trim() || (fact.jobId !== null && !["job", "team"].includes(e.scope)) || (fact.jobId === null && e.scope === "job"))) return [];
        const sources = evidence as Evidence[];
        const sameRange = item.scope === "job" ? fact.jobId === job.jobId && sources.every(e => e.scope === "job") : fact.jobId === null && company?.identityStatus === "confirmed" && sources.every(e => e.scope === "company");
        const asOf = fact.asOf === null ? null : Date.parse(fact.asOf);
        const dateUsable = asOf === null || (Number.isFinite(asOf) && asOf <= Date.parse(bundle.retrievedAt));
        const verifiedForNeed = sameRange && dateUsable && sources.every(e => e.verification === "verified");
        return [{ fact, sources, verifiedForNeed, dateUsable }];
      });
      const eligibleEvidence=bundle.evidence.filter(e=>e.companyId===job.companyId&&e.mode===bundle.mode&&(e.jobId===null?e.scope!=='job':e.jobId===job.jobId&&e.scope==='job'));
      const related=eligibleEvidence.map(e=>({e,link:evidenceTopicLinks(e).find(link=>link.topicId===item.topicId)})).filter(x=>x.link);
      const direct=related.filter(({e,link})=>(item.itemId==='clarify'||link!.detailIds.includes(item.itemId))&&!cited.some(c=>c.sources.some(source=>source.evidenceId===e.evidenceId)));
      const supported = cited.filter(c => c.verifiedForNeed && c.fact.status === "supported");
      const booleanClaims = new Map<string, Set<boolean>>();
      for (const {fact} of supported) {
        if (typeof fact.value !== "boolean") continue;
        const key = (fact.jobId ?? "") + "\0" + (fact.asOf ?? "");
        const values = booleanClaims.get(key) ?? new Set<boolean>();
        values.add(fact.value); booleanClaims.set(key, values);
      }
      const conflicting = direct.some(({e})=>e.verification==="disputed") || cited.some(c => c.fact.status === "conflicting" || c.fact.status === "contradicted" || c.sources.some(e => e.verification === "disputed")) || [...booleanClaims.values()].some(values => values.size > 1);
      // Different text excerpts may complement each other, even when verified.
      const status = conflicting ? "conflicting" as const : supported.length ? "available" as const : cited.length||direct.length ? "lead" as const : "unknown" as const;
      const materials = cited.map(({ fact, sources, verifiedForNeed }) => ({ factId: fact.factId as string|null, value: fact.value, status: fact.status, asOf: fact.asOf, jobId: fact.jobId, verifiedForNeed, sources: sources.map(e => sourceFor(e, metadata)) }));
      materials.push(...direct.map(({e,link})=>({factId:null,value:link!.quotes.join(' '),status:e.verification==='disputed'?'conflicting' as const:'unknown' as const,asOf:e.publishedAt,jobId:e.jobId,verifiedForNeed:false,sources:[sourceFor(e,metadata)]})));
      const hasCompanyMaterial = materials.some(m => m.jobId === null);
      const gaps: string[] = [];
      if (item.itemId === "clarify") gaps.push("还需明确该主题中最在意的具体安排，才能定向调查。");
      else if (!materials.length) gaps.push(matching.length ? "相关记录缺少可核对的内容或完整引用，暂不能作为可用材料。" : "尚未找到能够回应这一具体问题的资料。");
      if (hasCompanyMaterial && item.scope === "job") gaps.push("公司、集团或员工层面的记录尚不能证明这份岗位执行相同安排，需要岗位对应的书面说明。");
      if (hasCompanyMaterial && company?.identityStatus !== "confirmed") gaps.push("已有资料所属主体与这份岗位的签约主体尚未对应。");
      if (materials.some(c => c.sources.some(e => e.scope === "team"))) gaps.push("评价或团队资料是否来自该岗位的实际团队尚未确认。");
      if (materials.some(c => c.sources.some(e => e.verification !== "verified"))) gaps.push("现有线索尚未完成独立核验，不能当作招聘方的已确认承诺。");
      if (cited.some(c => !c.dateUsable)) gaps.push("部分资料的记录日期无效或晚于本次接入时间，不能据此判断当前安排。");
      if (status === "lead" && !gaps.length) gaps.push("资料已被引用，但该事项的核验结论或适用范围尚未确认。");
      if (materials.some(m => m.sources.some(s => !s.publishedAt))) gaps.push("部分来源未记录发布或更新日期，当前有效性仍需确认。");
      if (conflicting) gaps.unshift("资料存在不同记载或争议，需要核对原文、时间及适用范围，不能任选一条。");
      const explanation = (!materials.length&&related.length?"该主题已有一般线索，但尚不能回应这一具体项目。":"") + (status === "available" ? "已有对应范围的核验材料，可以了解这项安排；有材料仍不等于符合你的预期。" : status === "conflicting" ? "已有相关资料，但存在不同记载或争议，暂不能据此确认这项安排。" : status === "lead" ? "已有资料涉及你选择的这一问题，可作为继续调查的线索；核验或岗位适用范围尚未明确。" : item.itemId === "clarify" ? "你将这一主题列为重点，但尚未选择要调查的具体项目。" : "目前没有可引用的资料回应你选择的这一问题，不能据此推断有或没有这项安排。");
      const question = item.itemId === "clarify" ? "关于" + item.topicTitle + "，先确认你最在意什么，再向招聘方核实。" : "请说明“" + item.label + "”，并提供" + (item.scope === "job" ? "这份岗位" : "与这份岗位签约主体对应") + "的可核实材料。" + (hasCompanyMaterial && item.scope === "job" ? "现有公司或员工资料提及相关安排，这份岗位是否同样适用？" : "");
      return { ...item, status, factIds: cited.map(c => c.fact.factId), evidenceIds: [...new Set([...cited.flatMap(c => c.fact.evidenceIds),...direct.map(({e})=>e.evidenceId)])], materials, explanation, gaps, question, requiresAction: status !== "available" && item.mustVerify };
    });
    return { jobId: job.jobId, actionGate: items.some(i => i.requiresAction) ? "verify_first" as const : "no_additional_gate" as const, items };
  }) };
}
export type NeedsResponse = ReturnType<typeof respondToJobNeeds>;
const statusLabels = { available: "已有对应范围核验材料", lead: "已有待确认线索", conflicting: "资料存在冲突或争议", unknown: "暂无可用资料" };
const verificationLabels = { verified: "已核验来源", unverified: "未经独立核验", disputed: "来源存在争议" };

// Legacy immutable archives lack materials/explanation/gaps; keep their recorded result.
function materialHtml(item: NeedsResponse["candidates"][number]["items"][number]) {
  const e = escapeHtml;
  return (item.materials ?? []).map(m => '<div class="evidence"><p><strong>资料记载：</strong>' + e(String(m.value)) + (m.asOf ? '<small>（记录日期：' + e(m.asOf) + '）</small>' : '') + '</p>' + m.sources.map(s => '<p><small>来源：' + (s.url && /^https?:\/\//i.test(s.url) ? '<a href="' + e(s.url) + '" target="_blank" rel="noopener noreferrer">' + e(s.title) + '</a>' : e(s.title) + '（未记录原文链接）') + '；' + e(s.scopeLabel) + '；' + verificationLabels[s.verification] + '。发布时间：' + e(s.publishedAt ?? '未记录') + '；采集时间：' + e(s.collectedAt ?? '未记录') + (s.dateNote ? '。' + e(s.dateNote) : '') + '</small></p><blockquote>' + e(s.excerpt) + '</blockquote>').join('') + '</div>').join('');
}
export function renderNeedsHtml(response: NeedsResponse, report?: MatchReport, bundle?: CandidateBundle): string {
  const e = escapeHtml;
  return '<section class="card" id="your-needs"><h2 style="margin-top:0">你关心的事项与下一步</h2><p>需求版本 ' + response.plan.profileRevision + '。逐项对照你的选择与已有资料；有材料不代表满足个人预期，公司资料也不代表这份岗位的承诺。</p>' + (response.plan.items.length ? response.candidates.map(c => '<h3>' + e(bundle?.jobs.find(j => j.jobId === c.jobId)?.title ?? '岗位调查') + '</h3><p><strong>' + (report?.results.find(r => r.jobId === c.jobId)?.recommendation === 'deprioritize' ? '该岗位已存在硬条件冲突，优先处理下方冲突；若仍考虑，再核实这些关注事项。' : c.actionGate === 'verify_first' ? '你选择了先核实重点再作决定；以下未决事项仍需回答。' : '按你的未知处理选择，可以继续了解；仍需结合岗位与主体判断。') + '</strong></p><ul>' + c.items.map(i => '<li><strong>' + e(i.topicTitle + ' · ' + i.label) + '</strong>：' + statusLabels[i.status] + '；' + (i.requiresAction ? '决定前必问' : i.unknownHandling === 'continue_with_unknown' && i.status !== 'available' ? '你允许继续了解，但保留此未知' : i.status === 'available' ? '仍需与你的具体预期比较' : '建议补充了解') + (i.explanation ? '<p>' + e(i.explanation) + '</p>' : '') + materialHtml(i) + ((i.gaps ?? []).length ? '<p><strong>剩余缺口：</strong>' + e(i.gaps.join(' ')) + '</p>' : '') + '<p><strong>下一步：</strong>' + e(i.question) + '</p></li>').join('') + '</ul>').join('') : '<p>尚未填写具体关注事项，可先调查岗位，再补充个人需求。</p>') + '<p><a href="/profile">修改个人需求</a> · <a href="/research">调查其他公司与岗位</a></p></section>';
}
export function needsMarkdown(response: NeedsResponse, bundle?: CandidateBundle): string {
  const e = escapeForMarkdown;
  return "## 你的关注事项\n\n需求版本：" + response.plan.profileRevision + "；有资料不等于满足需求，公司资料不等于岗位承诺。\n\n" + response.candidates.map(c => "### " + e(bundle?.jobs.find(j => j.jobId === c.jobId)?.title ?? "岗位调查") + "\n\n" + (c.actionGate === "verify_first" ? "按你的选择，先核实未决重点再作决定。" : "按你的未知处理选择，可以继续了解，保留未决事项。") + "\n\n" + c.items.map(i => "- " + e(i.topicTitle + " / " + i.label) + "：" + statusLabels[i.status] + (i.requiresAction ? "（决定前必问）" : "") + "。" + e(i.explanation ?? "") + "\n" + (i.materials ?? []).map(m => "  资料记载：" + e(String(m.value)) + (m.asOf ? "；记录日期：" + e(m.asOf) : "") + "\n" + m.sources.map(s => "  来源：" + e(s.title) + (s.url && /^https?:\/\//i.test(s.url) ? "（" + e(s.url) + "）" : "（未记录原文链接）") + "；" + e(s.scopeLabel) + "；" + verificationLabels[s.verification] + "；发布时间：" + e(s.publishedAt ?? "未记录") + "；采集时间：" + e(s.collectedAt ?? "未记录") + (s.dateNote ? "；" + e(s.dateNote) : "") + "。\n  摘录：" + e(s.excerpt)).join("\n")).join("\n") + ((i.gaps ?? []).length ? "\n  剩余缺口：" + e(i.gaps.join(" ")) : "") + "\n  下一步：" + e(i.question)).join("\n\n")).join("\n\n") + "\n\n";
}
