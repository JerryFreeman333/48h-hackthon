import {evidenceTopicLinks} from './evidence-topics';
import { escapeForMarkdown } from "../../modules/c-report/application/markdown";
import { z } from "zod";
import { topics } from "../../modules/a-profile/src/needs/catalog.mjs";
import { refinementVersion, refinementQuestions } from "../../modules/a-profile/src/needs/refinement-catalog.mjs";
import { tradeoffDataSchema, deriveTradeoff, tradeoffTopicMapping, tradeoffVersion } from "../../modules/a-profile/src/needs/tradeoff.mjs";
import { tradeoffTopicTitles } from "../../modules/a-profile/src/needs/tradeoff-catalog.mjs";
import { isDeepStrictEqual } from "node:util";
import type { CandidateBundle, MatchReport } from "../contracts";
import { escapeHtml } from "../../modules/c-report/ui/render-html";

const topicSchema = z.object({ topicId: z.string(), title: z.string(), priority: z.enum(["priority", "secondary", "unknown"]), verificationItemIds: z.array(z.string()), unknownHandling: z.enum(["verify_first", "continue_with_unknown", "unknown"]), userConfirmed: z.boolean() });
const refinementStrength=z.enum(['must','prefer','learn','unknown']);
const refinementAnswerSchema=z.object({value:z.array(z.string().min(1).max(120)).max(30).nullable(),strength:refinementStrength});
const refinementAnswersSchema=z.record(z.string().min(1).max(160),refinementAnswerSchema);
const declaredNeedSchema=z.object({questionId:z.string().min(1).max(160),topicId:z.string().min(1).max(80),detailId:z.string().min(1).max(80),questionText:z.string().min(1).max(1000),answerIds:z.array(z.string().min(1).max(120)).min(1).max(30),answerTexts:z.array(z.string().min(1).max(1000)).min(1).max(30),strength:refinementStrength,userConfirmed:z.boolean()});
const refinementSchema=z.object({schemaVersion:z.literal('a-needs-refinement/1'),questionnaireVersion:z.literal(refinementVersion),needs:z.array(declaredNeedSchema).max(100),unknownQuestionIds:z.array(z.string().min(1).max(160)).max(100),indifferentQuestionIds:z.array(z.string().min(1).max(160)).max(100).default([]),answers:refinementAnswersSchema.optional()});
const snapshotSchema = z.object({ schemaVersion: z.literal("a-job-needs-1"), questionnaireVersion:z.enum(['job-needs-20261002-1',tradeoffVersion]).optional(), projectId: z.string(), profileId: z.string(), profileRevision: z.number().int().positive(), mode: z.enum(["demo", "manual", "live"]), confirmedAt: z.string().nullable(), topics: z.array(topicSchema).length(7),refinement:refinementSchema.optional(),tradeoff:z.unknown().optional(),selectionData:z.object({refinements:z.object({schemaVersion:z.literal('a-needs-refinement/1'),questionnaireVersion:z.literal(refinementVersion),answers:refinementAnswersSchema}).optional(),tradeoff:z.unknown().optional()}).optional() });
type Snapshot=z.infer<typeof snapshotSchema>;
type DeclaredNeed=z.infer<typeof declaredNeedSchema>;
type RefinementAnswer=z.infer<typeof refinementAnswerSchema>;
type RefinementQuestion={id:string;topicId:string;detailId:string;text:string;kind:'single'|'multiple';options:{id:string;text:string;exclusive?:boolean}[];when?:{questionId:string;answerIds:string[]}};
const refinementDirectory=refinementQuestions as RefinementQuestion[];
const equalIds=(a:string[],b:string[])=>a.length===b.length&&[...a].sort().every((id,index)=>id===[...b].sort()[index]);
function validateRefinement(snapshot:Snapshot){
 const refinement=snapshot.refinement;if(!refinement)return [] as DeclaredNeed[];
 if(!snapshot.confirmedAt||!Number.isFinite(Date.parse(snapshot.confirmedAt)))throw Error('细化需求须来自有确认时间的用户快照');
 const directory=new Map(refinementDirectory.map(q=>[q.id,q])),answers:Record<string,RefinementAnswer>={};
 const validateAnswer=(id:string,answer:RefinementAnswer)=>{
  const q=directory.get(id);if(!q)throw Error('细化需求的题目不在当前题库');
  if(answer.value===null){if(answer.strength!=='unknown')throw Error('未确定的回答不能声明需求强度');return;}
  if(!answer.value.length||new Set(answer.value).size!==answer.value.length||q.kind==='single'&&answer.value.length!==1||answer.value.some(id=>!q.options.some(o=>o.id===id))||answer.value.length>1&&answer.value.some(id=>q.options.find(o=>o.id===id)?.exclusive))throw Error('细化需求的选项与题目类型不匹配');
  if(answer.value.some(id=>['unsure','no_preference'].includes(id))&&answer.strength!=='unknown')throw Error('暂不确定或没有偏好不能声明必须满足');
 };
 for(const record of [snapshot.selectionData?.refinements?.answers,refinement.answers])for(const [id,answer] of Object.entries(record??{})){
  validateAnswer(id,answer);if(answers[id]&&(!equalIds(answers[id].value??[],answer.value??[])||answers[id].strength!==answer.strength))throw Error('细化需求的原始回答版本不一致');answers[id]=answer;
 }
 const recordedIds=[...refinement.needs.map(n=>n.questionId),...refinement.unknownQuestionIds,...refinement.indifferentQuestionIds];
 if(new Set(recordedIds).size!==recordedIds.length)throw Error('细化需求题目不可重复或同时声明已答与未知');
 for(const need of refinement.needs){
  const q=directory.get(need.questionId);
  if(!q||need.topicId!==q.topicId||need.detailId!==q.detailId||need.questionText!==q.text||!need.userConfirmed||need.answerIds.some(id=>['unsure','no_preference'].includes(id))||need.answerTexts.length!==need.answerIds.length||need.answerTexts.some((text,index)=>q.options.find(o=>o.id===need.answerIds[index])?.text!==text))throw Error('细化需求须是当前题库中用户确认的原题和选项');
  const answer={value:need.answerIds,strength:need.strength};validateAnswer(need.questionId,answer);
  if(answers[need.questionId]&&(!equalIds(answers[need.questionId].value??[],need.answerIds)||answers[need.questionId].strength!==need.strength))throw Error('细化需求与原始回答不一致');answers[need.questionId]=answer;
 }
 for(const id of refinement.unknownQuestionIds){
  if(!directory.has(id)||answers[id]?.value!==null&&answers[id]?.value!==undefined&&!equalIds(answers[id].value!,['unsure']))throw Error('未知问题与原始回答不一致');
  answers[id]??={value:null,strength:'unknown'};
 }
 for(const id of refinement.indifferentQuestionIds){
  const answer:RefinementAnswer={value:['no_preference'],strength:'unknown'};validateAnswer(id,answer);
  if(answers[id]&&(!equalIds(answers[id].value??[],answer.value!)||answers[id].strength!=='unknown'))throw Error('没有偏好的问题与原始回答不一致');answers[id]=answer;
 }
 const active=refinementDirectory.filter(q=>snapshot.topics.some(t=>t.topicId===q.topicId&&t.verificationItemIds.includes(q.detailId))&&(!q.when||q.when.answerIds.some(id=>answers[q.when!.questionId]?.value?.includes(id))));
 if(!equalIds(active.map(q=>q.id),recordedIds))throw Error('细化需求与当前选中的主题明细或条件分支不一致');
 return refinement.needs;
}
function validateTradeoff(snapshot:Snapshot){
 const value=snapshot.tradeoff;
 if(value===undefined){if(snapshot.questionnaireVersion===tradeoffVersion||snapshot.selectionData?.tradeoff!==undefined)throw Error('情境取舍问卷缺少确认附表');return undefined;}
 if(snapshot.refinement||snapshot.selectionData?.refinements)throw Error('两种答题流程不能混用');
 if(!snapshot.confirmedAt||!Number.isFinite(Date.parse(snapshot.confirmedAt)))throw Error('情境取舍须来自有确认时间的用户快照');
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('情境取舍附表格式错误');
 const recorded=value as Record<string,unknown>;
 const raw=tradeoffDataSchema.parse({schemaVersion:recorded.schemaVersion,questionnaireVersion:recorded.questionnaireVersion,answers:recorded.answers,inactiveAnswers:recorded.inactiveAnswers,review:recorded.review});
 const canonical=deriveTradeoff(raw,{confirmedAt:snapshot.confirmedAt});
 if(snapshot.questionnaireVersion!==canonical.questionnaireVersion)throw Error('情境取舍与主问卷版本不一致');
 if(!isDeepStrictEqual(canonical,recorded))throw Error('情境取舍的排序、需求或确认与原始回答不一致');
 if(snapshot.selectionData?.tradeoff!==undefined&&!isDeepStrictEqual(tradeoffDataSchema.parse(snapshot.selectionData.tradeoff),raw))throw Error('情境取舍的原始回答版本不一致');
 const mapped=tradeoffTopicMapping(raw) as Record<string,unknown>;
 for(const topic of snapshot.topics){
  const priority=mapped[topic.topicId+'.priority']==='unsure'?'unknown':mapped[topic.topicId+'.priority'];
  const policy=mapped[topic.topicId+'.policy']==='unsure'?'unknown':mapped[topic.topicId+'.policy'];
  const details=(mapped[topic.topicId+'.details'] as string[]).filter(id=>id!=='unsure');
  if(topic.priority!==priority||topic.unknownHandling!==policy||!isDeepStrictEqual(topic.verificationItemIds,details))throw Error('情境取舍与调查主题映射不一致');
 }
 return canonical;
}
export function buildInvestigationPlan(raw: unknown) {
  const snapshot = snapshotSchema.parse(raw);
  if (!snapshot.confirmedAt || snapshot.topics.some(t => !t.userConfirmed)) throw new Error("需求清单须来自已确认版本");
  if (new Set(snapshot.topics.map(t => t.topicId)).size !== 7) throw new Error("需求主题不可重复");
  const tradeoff=validateTradeoff(snapshot);
  const declared:DeclaredNeed[]=[...validateRefinement(snapshot),...(tradeoff?.needs??[]).map(need=>declaredNeedSchema.parse(need))];
  const items = snapshot.topics.flatMap(t => {
    const def = topics.find((d: { id: string }) => d.id === t.topicId);
    if (!def || new Set(t.verificationItemIds).size !== t.verificationItemIds.length || t.verificationItemIds.some(id => !def.details.some((d: { id: string }) => d.id === id))) throw new Error("需求主题或明细不在当前目录");
    const ids = t.verificationItemIds.length ? t.verificationItemIds : t.priority === "priority" ? ["clarify"] : [];
    return ids.map(itemId => {const scope=t.topicId === "company" ? "company" as const : "job" as const,declaredNeeds=declared.filter(n=>n.topicId===t.topicId&&n.detailId===itemId).map(n=>({...n,scope}));return { topicId: t.topicId, topicTitle: def.title, itemId, label: itemId === "clarify" ? "明确该主题中最在意的具体信息" : def.details.find((d: { id: string }) => d.id === itemId)!.text, priority: t.priority, unknownHandling: t.unknownHandling, mustVerify: t.priority === "priority" && t.unknownHandling === "verify_first"||declaredNeeds.some(n=>n.strength==='must'), factKey: itemId === "clarify" ? null : "needs." + t.topicId + "." + itemId, scope,declaredNeeds };});
  });
  return { schemaVersion: "product-needs-1" as const, projectId: snapshot.projectId, profileId: snapshot.profileId, profileRevision: snapshot.profileRevision, mode: snapshot.mode, items, unknownTopicIds: snapshot.topics.filter(t => t.priority === "unknown").map(t => t.topicId),...(snapshot.refinement?{refinement:{schemaVersion:snapshot.refinement.schemaVersion,questionnaireVersion:snapshot.refinement.questionnaireVersion,unknownQuestionIds:snapshot.refinement.unknownQuestionIds,indifferentQuestionIds:snapshot.refinement.indifferentQuestionIds}}:{}),...(tradeoff?{tradeoff}:{}) };
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
      const target=item.scope === "job" ? "这份岗位" : "与这份岗位签约主体对应的安排";
      const declaredNeeds=item.declaredNeeds.map(n=>({...n,fulfilment:'unknown' as const,question:'你希望“'+n.answerTexts.join('、')+'”。'+target+'是否适用这些安排，条件和书面依据分别是什么？'}));
      if(declaredNeeds.length)gaps.push('你的具体期望已记录，但现有材料尚未与这些期望逐项对照判定；有核验材料也不自动代表满足。');
      const question = declaredNeeds.length?'针对你希望的“'+declaredNeeds.map(n=>n.answerTexts.join('、')).join('；')+'”，请说明'+target+'的具体安排、适用条件和可核实材料，确认是否回应这些期望。':item.itemId === "clarify" ? "关于" + item.topicTitle + "，先确认你最在意什么，再向招聘方核实。" : "请说明“" + item.label + "”，并提供" + (item.scope === "job" ? "这份岗位" : "与这份岗位签约主体对应") + "的可核实材料。" + (hasCompanyMaterial && item.scope === "job" ? "现有公司或员工资料提及相关安排，这份岗位是否同样适用？" : "");
      return { ...item,declaredNeeds, status, factIds: cited.map(c => c.fact.factId), evidenceIds: [...new Set([...cited.flatMap(c => c.fact.evidenceIds),...direct.map(({e})=>e.evidenceId)])], materials, explanation, gaps, question, requiresAction: status !== "available" && item.mustVerify||declaredNeeds.some(n=>n.strength==='must'&&n.fulfilment==='unknown') };
    });
    return { jobId: job.jobId, actionGate: items.some(i => i.requiresAction) ? "verify_first" as const : "no_additional_gate" as const, items };
  }) };
}
export type NeedsResponse = ReturnType<typeof respondToJobNeeds>;
const statusLabels = { available: "已有对应范围核验材料", lead: "已有待确认线索", conflicting: "资料存在冲突或争议", unknown: "暂无可用资料" };
const verificationLabels = { verified: "已核验来源", unverified: "未经独立核验", disputed: "来源存在争议" };
const strengthLabels={must:'必须满足',prefer:'更希望如此，可以综合考虑',learn:'先了解实际安排',unknown:'接受标准暂不确定'};
type ResponseItem=NeedsResponse['candidates'][number]['items'][number];
function declaredHtml(item:ResponseItem){const e=escapeHtml;return (item.declaredNeeds??[]).map(n=>'<p><strong>你的具体期望：</strong>'+e(n.answerTexts.join('、'))+'<br><small>所答问题：'+e(n.questionText)+'；强度：'+strengthLabels[n.strength]+'；尚未对照判定是否满足。</small></p>').join('');}
function declaredMarkdown(item:ResponseItem){const e=escapeForMarkdown;return (item.declaredNeeds??[]).map(n=>'  你的具体期望：'+e(n.answerTexts.join('、'))+'；强度：'+strengthLabels[n.strength]+'；尚未对照判定是否满足。\n  所答问题：'+e(n.questionText)).join('\n');}
function refinementNote(response:NeedsResponse){const r=response.plan.refinement;return r?[r.unknownQuestionIds.length?'还有 '+r.unknownQuestionIds.length+' 个已选择的细化问题暂未确定，不据此猜测需求。':'',r.indifferentQuestionIds.length?'另有 '+r.indifferentQuestionIds.length+' 个细化问题明确暂不设偏好。':''].filter(Boolean).join(' '):'';}
const tradeoffTitle=(id:string)=>(tradeoffTopicTitles as Record<string,string>)[id]??id;
function exchangeDescription(exchange:{description:string;conditionText:string|null;status:string;userConfirmed:boolean}){
 const status=exchange.status==='declined-exchange'?'这项交换未接受':exchange.status==='conditions-stated'?'需满足所述条件才继续考虑':exchange.status==='unknown'?'接受条件尚不明确':'愿意继续了解，接受条件尚未明确';
 return exchange.description+'；'+status+(exchange.conditionText?'：'+exchange.conditionText:'')+'；'+(exchange.userConfirmed?'已在需求确认中保留':'尚未由本人确认')+'。';
}
function conditionalRankingDescription(relation:{higherTopicId:string;lowerTopicId:string;conditionText:string|null;originalScenarioCompatible:boolean|null;compatibilityExplanation?:string}){
 const comparison=tradeoffTitle(relation.higherTopicId)+'与'+tradeoffTitle(relation.lowerTopicId)+'之间的取舍';
 const compatible=relation.originalScenarioCompatible===false?'原题条件未达到你提出的接受条件，不能按原选项推断先后':relation.originalScenarioCompatible===true?'仅在上述条件下继续比较，不用于全局排序':'原题是否符合上述条件尚不明确，不用于全局排序';
 return comparison+'：'+(relation.conditionText??'接受条件尚未明确')+'；'+compatible+'。'+(relation.compatibilityExplanation??'');
}
function tradeoffHtml(response:NeedsResponse){
 const t=response.plan.tradeoff;if(!t)return '';
 const e=escapeHtml,r=t.ranking;
 const confirmed='<p><strong>你确认的当前重点：</strong>'+e(t.confirmedPriorityGroups.priority.map(tradeoffTitle).join('、')||'暂未明确')+'。<br>可以综合考虑：'+e(t.confirmedPriorityGroups.secondary.map(tradeoffTitle).join('、')||'暂未明确')+'。<br>仍待明确：'+e(t.confirmedPriorityGroups.unknown.map(tradeoffTitle).join('、')||'无')+'。</p>';
 const order=r.relations.length?'<ol>'+r.tiers.map((tier:string[])=>'<li>'+e(tier.map(tradeoffTitle).join('、'))+'</li>').join('')+'</ol>':'<p>当前回答尚不能确定先后顺序。</p>';
 const conflicts=r.conflicts.length?'<p><strong>保留 '+r.conflicts.length+' 组不同情境中的取舍冲突：</strong>'+e(r.conflicts.map((c:{topicIds:string[];explanation:string})=>c.topicIds.map(tradeoffTitle).join('、')+'：'+c.explanation).join(' '))+'</p>':'';
 const unknown=r.unknownTopicIds.length?'<p>相对倾向尚不明确：'+e(r.unknownTopicIds.map(tradeoffTitle).join('、'))+'。</p>':'';
 const conditional=(r.conditionalRelations??[]).length?'<details><summary>附条件的比较（'+r.conditionalRelations.length+' 条，不用于全局排序）</summary><ul>'+r.conditionalRelations.map(relation=>'<li>'+e(conditionalRankingDescription(relation))+'</li>').join('')+'</ul></details>':'';
 const qualifications=(r.qualifications??[]).length?'<p>'+e(r.qualifications.map(q=>q.explanation).join(' '))+'</p>':'';
 const exchanges=t.conditionalExchanges.length?'<details><summary>你可以考虑的交换及条件（'+t.conditionalExchanges.length+' 条）</summary><ul>'+t.conditionalExchanges.map(exchange=>'<li>'+e(exchangeDescription(exchange))+'</li>').join('')+'</ul></details>':'';
 return '<div class="tradeoff-needs"><h3>你的情境取舍</h3>'+confirmed+'<p>以下是已回答情境中的相对倾向，未比较的关系不补成完整排名；同组可能尚不可区分或存在冲突。这不代表人格评分或不可协商底线，只有本人确认的必须满足条件会阻止继续判断。</p>'+order+conflicts+unknown+conditional+qualifications+exchanges+(t.unknownQuestionIds.length?'<p>还有 '+t.unknownQuestionIds.length+' 个情境或条件暂不明确，保留未知。</p>':'')+'<p>愿意继续了解某种交换，不代表岗位已满足条件，也不代表放弃已确认的底线。</p></div>';
}
function tradeoffMarkdown(response:NeedsResponse){
 const t=response.plan.tradeoff;if(!t)return '';
 const e=escapeForMarkdown,r=t.ranking;
 const conditional=(r.conditionalRelations??[]).length?'\n\n附条件的比较（不用于全局排序）：\n\n'+r.conditionalRelations.map(relation=>'- '+e(conditionalRankingDescription(relation))).join('\n'):'';
 const qualifications=(r.qualifications??[]).length?'\n\n'+r.qualifications.map(q=>e(q.explanation)).join('\n'):'';
 return '### 你的情境取舍\n\n你确认的当前重点：'+e(t.confirmedPriorityGroups.priority.map(tradeoffTitle).join('、')||'暂未明确')+'。\n\n可以综合考虑：'+e(t.confirmedPriorityGroups.secondary.map(tradeoffTitle).join('、')||'暂未明确')+'。\n\n仍待明确：'+e(t.confirmedPriorityGroups.unknown.map(tradeoffTitle).join('、')||'无')+'。\n\n只呈现已回答情境的相对倾向；未比较的关系不补成完整排名，同组可能尚不可区分或存在冲突。不是人格评分或自动底线。\n\n'+(r.relations.length?r.tiers.map((tier:string[],index:number)=>(index+1)+'. '+e(tier.map(tradeoffTitle).join('、'))).join('\n'):'当前回答尚不能确定先后顺序。')+'\n\n'+r.conflicts.map((c:{topicIds:string[];explanation:string})=>'取舍冲突：'+e(c.topicIds.map(tradeoffTitle).join('、')+'；'+c.explanation)).join('\n')+(r.unknownTopicIds.length?'\n\n相对倾向尚不明确：'+e(r.unknownTopicIds.map(tradeoffTitle).join('、'))+'。':'')+conditional+qualifications+(t.conditionalExchanges.length?'\n\n取舍与条件：\n\n'+t.conditionalExchanges.map(exchange=>'- '+e(exchangeDescription(exchange))).join('\n'):'')+(t.unknownQuestionIds.length?'\n\n还有 '+t.unknownQuestionIds.length+' 个情境或条件暂不明确。':'')+'\n\n愿意继续了解某种交换，不代表岗位已满足条件，也不代表放弃已确认的底线。\n\n';
}

// Legacy immutable archives lack materials/explanation/gaps; keep their recorded result.
function materialHtml(item: NeedsResponse["candidates"][number]["items"][number]) {
  const e = escapeHtml;
  return (item.materials ?? []).map(m => '<div class="evidence"><p><strong>资料记载：</strong>' + e(String(m.value)) + (m.asOf ? '<small>（记录日期：' + e(m.asOf) + '）</small>' : '') + '</p>' + m.sources.map(s => '<p><small>来源：' + (s.url && /^https?:\/\//i.test(s.url) ? '<a href="' + e(s.url) + '" target="_blank" rel="noopener noreferrer">' + e(s.title) + '</a>' : e(s.title) + '（未记录原文链接）') + '；' + e(s.scopeLabel) + '；' + verificationLabels[s.verification] + '。发布时间：' + e(s.publishedAt ?? '未记录') + '；采集时间：' + e(s.collectedAt ?? '未记录') + (s.dateNote ? '。' + e(s.dateNote) : '') + '</small></p><blockquote>' + e(s.excerpt) + '</blockquote>').join('') + '</div>').join('');
}
export function renderNeedsHtml(response: NeedsResponse, report?: MatchReport, bundle?: CandidateBundle): string {
  const e = escapeHtml;
  const note=refinementNote(response);
  const candidates=response.candidates.map(c => '<h3>' + e(bundle?.jobs.find(j => j.jobId === c.jobId)?.title ?? '岗位调查') + '</h3><p><strong>' + (report?.results.find(r => r.jobId === c.jobId)?.recommendation === 'deprioritize' ? '该岗位已存在硬条件冲突，优先处理下方冲突；若仍考虑，再核实这些关注事项。' : c.actionGate === 'verify_first' ? '你选择了先核实重点再作决定；以下未决事项仍需回答。' : '按你的未知处理选择，可以继续了解；仍需结合岗位与主体判断。') + '</strong></p><ul>' + c.items.map(i => '<li><strong>' + e(i.topicTitle + ' · ' + i.label) + '</strong>：' + statusLabels[i.status] + '；' + (i.requiresAction ? '决定前必问' : i.unknownHandling === 'continue_with_unknown' && i.status !== 'available' ? '你允许继续了解，但保留此未知' : i.status === 'available' ? '仍需与你的具体预期比较' : '建议补充了解') + declaredHtml(i) + (i.explanation ? '<p>' + e(i.explanation) + '</p>' : '') + materialHtml(i) + ((i.gaps ?? []).length ? '<p><strong>剩余缺口：</strong>' + e(i.gaps.join(' ')) + '</p>' : '') + '<p><strong>下一步：</strong>' + e(i.question) + '</p></li>').join('') + '</ul>').join('');
  return '<section class="card" id="your-needs"><h2 style="margin-top:0">你关心的事项与下一步</h2><p>需求版本 ' + response.plan.profileRevision + '。逐项对照你的选择与已有资料；有材料不代表满足个人预期，公司资料也不代表这份岗位的承诺。</p>'+tradeoffHtml(response)+(note?'<p>'+e(note)+'</p>':'')+(response.plan.items.length?candidates:'<p>尚未填写具体关注事项，可先调查岗位，再补充个人需求。</p>')+'<p><a href="/profile">修改个人需求</a> · <a href="/research">调查其他公司与岗位</a></p></section>';
}
export function needsMarkdown(response: NeedsResponse, bundle?: CandidateBundle): string {
  const e = escapeForMarkdown;
  const note=refinementNote(response);
  return "## 你的关注事项\n\n需求版本：" + response.plan.profileRevision + "；有资料不等于满足需求，公司资料不等于岗位承诺。\n\n"+tradeoffMarkdown(response)+(note?e(note)+'\n\n':'')+ response.candidates.map(c => "### " + e(bundle?.jobs.find(j => j.jobId === c.jobId)?.title ?? "岗位调查") + "\n\n" + (c.actionGate === "verify_first" ? "按你的选择，先核实未决重点再作决定。" : "按你的未知处理选择，可以继续了解，保留未决事项。") + "\n\n" + c.items.map(i => "- " + e(i.topicTitle + " / " + i.label) + "：" + statusLabels[i.status] + (i.requiresAction ? "（决定前必问）" : "") + "。" + e(i.explanation ?? "") + "\n" + declaredMarkdown(i)+'\n'+(i.materials ?? []).map(m => "  资料记载：" + e(String(m.value)) + (m.asOf ? "；记录日期：" + e(m.asOf) : "") + "\n" + m.sources.map(s => "  来源：" + e(s.title) + (s.url && /^https?:\/\//i.test(s.url) ? "（" + e(s.url) + "）" : "（未记录原文链接）") + "；" + e(s.scopeLabel) + "；" + verificationLabels[s.verification] + "；发布时间：" + e(s.publishedAt ?? "未记录") + "；采集时间：" + e(s.collectedAt ?? "未记录") + (s.dateNote ? "；" + e(s.dateNote) : "") + "。\n  摘录：" + e(s.excerpt)).join("\n")).join("\n") + ((i.gaps ?? []).length ? "\n  剩余缺口：" + e(i.gaps.join(" ")) : "") + "\n  下一步：" + e(i.question)).join("\n\n")).join("\n\n") + "\n\n";
}
