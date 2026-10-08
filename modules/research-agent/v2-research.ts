import { createHash } from "node:crypto";
import type { CandidateBundle } from "../../packages/contracts";
import {
  candidateBundleSchema,
  validateBundleReferences,
} from "../../packages/contracts";
import { extractNeedLeads } from "../../packages/integration/database-investigation";
import { topicIds } from "./python-tool";
import { runV2Tool } from "./v2-tool";
import { v2ResultSchema, type V2Result } from "./v2-result";
import type { AgentProgress } from "./research";

function decimalText(input: string | null | undefined) {
  let text = (input ?? "").trim().replace(/[,，]/g, "").replace(/−/g, "-");
  if (/^\(\d+(?:\.\d+)?\)$/.test(text)) text = "-" + text.slice(1, -1);
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) return null;
  const whole = match[2].replace(/^0+(?=\d)/, "");
  const fraction = (match[3] ?? "").replace(/0+$/, "");
  return (match[1] === "-" && (whole !== "0" || fraction) ? "-" : "") + whole + (fraction ? "." + fraction : "");
}

export function validateV2Result(
  result: V2Result,
  companyId: number,
  allowFixtures = false,
) {
  const problems: string[] = [];
  const documents = new Map(result.documents.map((d) => [d.id, d]));
  const excerpts = new Map(result.excerpts.map((e) => [e.id, e]));
  const facts = new Map(result.facts.map((f) => [f.id, f]));
  if (
    result.company_id !== companyId ||
    result.identity.company_id !== companyId
  )
    problems.push("subject_mismatch");
  if (
    documents.size !== result.documents.length ||
    excerpts.size !== result.excerpts.length ||
    facts.size !== result.facts.length
  )
    problems.push("duplicate_id");
  for (const doc of documents.values())
    if (
      doc.company_id !== companyId ||
      (doc.fixture && !allowFixtures) ||
      !["legal_name_match", "credit_code_match", "alias_only"].includes(
        doc.entity_match,
      )
    )
      problems.push("unaccepted_document");
  for (const excerpt of excerpts.values()) {
    const doc = documents.get(excerpt.document_id);
    if (
      !doc ||
      excerpt.company_id !== companyId ||
      (excerpt.fixture && !allowFixtures) ||
      doc.access_mode !== excerpt.access_mode
    )
      problems.push("unaccepted_excerpt");
    if (
      createHash("sha256").update(excerpt.excerpt).digest("hex") !==
      excerpt.content_hash
    )
      problems.push("excerpt_hash_mismatch");
    const url = new URL(excerpt.url);
    url.hash = "";
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.href !== doc?.url
    )
      problems.push("source_url_mismatch");
  }
  for (const fact of facts.values()) {
    const excerpt = excerpts.get(fact.excerpt_id);
    if (
      !excerpt ||
      excerpt.document_id !== fact.evidence_id ||
      fact.company_id !== companyId ||
      !excerpt.excerpt.includes(fact.quote) ||
      JSON.stringify(excerpt.locator) !== JSON.stringify(fact.locator)
    )
      problems.push("unsupported_fact");
    if (
      fact.kind === "normalized_fact" &&
      (documents.get(fact.evidence_id)?.access_mode === "index_snippet" ||
        documents.get(fact.evidence_id)?.entity_match === "alias_only")
    )
      problems.push("financial_scope_mismatch");
    if (fact.kind === "normalized_fact") {
      const cell = fact.quote.split("|")[(fact.locator.column ?? 0) - 1];
      if (!fact.locator.table || !fact.locator.row || decimalText(cell) === null || decimalText(cell) !== decimalText(fact.value))
        problems.push("financial_value_mismatch");
    }
    if (fact.risk_event && (fact.risk_event.source_evidence_id !== fact.evidence_id || [fact.risk_event.subject, fact.risk_event.date, fact.risk_event.amount_quote].some(value => value && !fact.quote.includes(value))))
      problems.push("unsupported_risk_event");
  }
  for (const item of result.translations) {
    const linked = item.fact_ids.map((id) => facts.get(id));
    if (
      linked.some((f) => !f) ||
      !linked.some((f) => f?.quote === item.quote && JSON.stringify(f.locator) === JSON.stringify(item.locator)) ||
      item.evidence_ids.some(
        (id) =>
          !documents.has(id) || !linked.some((f) => f?.evidence_id === id),
      )
    )
      problems.push("unsupported_translation");
  }
  for (const ratio of result.ratios)
    if (ratio.input_fact_ids.some((id) => !facts.has(id)))
      problems.push("unsupported_ratio");
  for (const review of result.reviews)
    if (review.claim_ids.some((id) => !facts.has(id)))
      problems.push("unsupported_review");
  return [...new Set(problems)];
}

export function mergeV2Materials(
  bundle: CandidateBundle,
  source: Record<string, any>,
  companyId: string,
  result: V2Result,
) {
  const recordId = Number(companyId.split("-company-").at(-1));
  if (
    !bundle.companies.some((c) => c.companyId === companyId) ||
    validateV2Result(result, recordId, bundle.mode === "demo").length
  )
    throw Error("V2 证据引用或主体校验失败");
  // Build a temporary candidate so partial conversion never corrupts the original bundle.
  const next = structuredClone(bundle),
    dates: any[] = [];
  for (const e of result.excerpts) {
    const id = "v2-" + e.id;
    if (next.evidence.some((x) => x.evidenceId === id)) continue;
    const date = new Date(e.collected_at);
    if (!Number.isFinite(date.getTime())) throw Error("V2 采集日期无效");
    const mapped = e.dimensions
      .map((t) => (t === "mental_space" ? "culture" : t))
      .filter((t) =>
        topicIds.includes(t as any),
      ) as (typeof topicIds)[number][];
    const mode =
      e.access_mode === "pdf"
        ? "PDF原文"
        : e.access_mode === "html"
          ? "网页正文"
          : "搜索索引摘要";
    next.evidence.push({
      evidenceId: id,
      companyId,
      jobId: null,
      scope: "company",
      sourceType: "agent_v2_" + e.access_mode,
      title: mode + " · " + e.title,
      url: e.url,
      publishedAt: e.published_at,
      retrievedAt: date.toISOString(),
      excerpt: e.excerpt,
      searchTopics: [...new Set(mapped)],
      mode: bundle.mode,
      verification: "unverified",
    });
    dates.push({
      evidenceId: id,
      publishedAtRaw: e.published_at,
      retrievedAtRaw: e.collected_at,
      verificationOriginal: "source_claim",
      scopeOriginal: "company",
      collectedBy: "agent_v2",
      originalAgentEvidenceId: e.document_id,
      locator: e.locator,
      accessMode: e.access_mode,
    });
  }
  for (const f of result.facts) {
    const id = "v2-" + f.id;
    if (next.facts.some((x) => x.factId === id)) continue;
    next.facts.push({
      factId: id,
      companyId,
      jobId: null,
      key: "agent.v2." + f.metric,
      value: f.quote,
      status: "unknown",
      evidenceIds: ["v2-" + f.excerpt_id],
      asOf: f.period,
    });
  }
  extractNeedLeads(next);
  candidateBundleSchema.parse(next);
  if (validateBundleReferences(next).length)
    throw Error("V2 转换后的报告引用不完整");
  Object.assign(bundle, next);
  source.sourceDates ??= [];
  source.sourceDates.push(...dates);
  source.agentV2 ??= { version: "agent-v2.1", companies: [] };
  const old = source.agentV2.companies.findIndex(
    (x: any) => x.companyId === companyId,
  );
  const entry = { companyId, ...structuredClone(result) };
  if (old >= 0) source.agentV2.companies[old] = entry;
  else source.agentV2.companies.push(entry);
}

export async function enrichWithV2(
  bundle: CandidateBundle,
  source: Record<string, any>,
  input: Record<string, any>,
  onProgress: (p: AgentProgress) => void = () => {},
  deps: {
    tool?: typeof runV2Tool;
    recover?: typeof runV2Tool;
    deadlineMs?: number;
    now?: () => number;
  } = {},
) {
  const tool = deps.tool ?? runV2Tool,
    now = deps.now ?? Date.now,
    start = now(),
    deadline = deps.deadlineMs ?? 420000;
  const topics = topicIds.filter((id) =>
    input.JobNeedsSnapshot.topics.some(
      (t: any) =>
        t.topicId === id &&
        (t.priority !== "unknown" || t.verificationItemIds.length),
    ),
  );
  const progress = (p: AgentProgress) => {
    try {
      onProgress(p);
    } catch {}
  };
  source.agentV2 = { version: "agent-v2.1", companies: [], notes: [] };
  if (!topics.length) {
    source.agentV2.notes.push("尚无已确认关注事项，沿用原资料。");
    return;
  }
  for (const company of bundle.companies) {
    const remaining = deadline - (now() - start);
    if (remaining < 10000) {
      source.agentV2.notes.push(
        "调查达到整体时间上限；已完成材料保留，其他主体尚未采集。",
      );
      break;
    }
    progress({
      stage: "collecting",
      message:
        "正在按公开渠道收集 " +
        (company.brandName ?? company.legalName) +
        " 的原始材料与来源位置",
    });
    try {
      const result = v2ResultSchema.parse(
        await tool(
          {
            company_id: Number(company.companyId.split("-company-").at(-1)),
            topics: [...topics],
          },
          Math.min(220000, remaining),
        ),
      );
      mergeV2Materials(bundle, source, company.companyId, result);
    } catch {
      try {
        // Recovery only reads committed evidence. It never issues another network/model request.
        const recover = deps.recover ?? (deps.tool ? undefined : runV2Tool);
        if (!recover) throw Error("No checkpoint reader");
        const result = v2ResultSchema.parse(
          await recover(
            {
              company_id: Number(company.companyId.split("-company-").at(-1)),
              topics: [...topics],
            },
            12000,
            "read_company_checkpoint",
          ),
        );
        if (!result.documents.length) throw Error("Empty checkpoint");
        mergeV2Materials(bundle, source, company.companyId, result);
        source.agentV2.notes.push(
          (company.brandName ?? company.legalName) +
            "：补充调查提前结束，已从检查点恢复取得的材料；其余来源仍待核实。",
        );
      } catch {
        source.agentV2.notes.push(
          (company.brandName ?? company.legalName) +
            "：补充调查未完成或证据未通过校验，保留原资料；已落库检查点可在再次分析时恢复。",
        );
      }
    }
  }
  progress({
    stage: "analyzing",
    message: "正在对照原文、范围与未知事项生成报告",
  });
}
