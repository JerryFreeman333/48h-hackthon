import { escapeHtml as e } from "../c-report/ui/render-html";
import type { V2Result } from "./v2-result";

const channelLabels: Record<string, string> = {
  credit: "企业信用",
  disclosure: "企业披露",
  recruitment_procurement: "招聘与采购",
  community: "社区经历",
};
const topics: Record<string, string> = {
  company: "企业经营",
  growth: "晋升与成长",
  mental_space: "精神空间",
  pay: "薪资透明",
  hours: "劳动时长",
  benefits: "五险一金",
  culture: "企业文化",
  position: "职位稳定",
};
const modes: Record<string, string> = {
  pdf: "PDF 原文",
  html: "网页正文",
  index_snippet: "搜索索引摘要",
};
const statuses: Record<string, string> = {
  ok: "取得资料",
  empty: "检索未返回结果",
  blocked: "访问受限",
  login_required: "需要登录",
  timeout: "超时",
  parse_error: "解析未完成",
  not_configured: "未配置",
  unsupported: "不支持",
  unreachable: "不可达",
  not_found: "页面不存在",
  identity_mismatch: "主体不符或未明确",
  budget_exhausted: "达到预算上限",
  not_attempted: "尚未尝试",
};
const reasons: Record<string, string> = {
  original_body_unavailable: "原始正文未取得",
  verification_page: "来源要求验证",
  login_page: "来源要求登录",
  non_public_destination: "目标地址不是公开网络地址",
  request_timeout: "请求超时",
  deadline: "达到时间上限",
  no_article_body: "未识别到正文",
  unrecognized_results_or_unresolved_urls: "搜索页面结构或来源链接未识别",
  unexpected_parser_error: "正文解析失败",
  request_or_time_budget: "达到请求或时间上限",
  other_subject: "材料涉及其他主体",
  unresolved: "材料主体未明确",
  scan_or_no_text_ocr_unavailable: "扫描件或没有可提取文本；尚未配置 OCR",
};
const confidence: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低",
  unknown: "未知",
};
const metrics: Record<string, string> = {
  revenue: "营业收入",
  total_revenue: "营业总收入",
  net_profit: "净利润",
  parent_net_profit: "归母净利润",
  operating_cashflow: "经营活动现金流量净额",
  cash: "货币资金",
  total_assets: "资产总额",
  total_liabilities: "负债总额",
  current_liabilities: "流动负债",
  short_term_borrowings: "短期借款",
  long_term_borrowings: "长期借款",
  employees: "员工数量",
};
function link(url: string, label: string) {
  try {
    const parsed = new URL(url);
    if (
      !["https:", "http:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password
    )
      return e(label);
    return (
      '<a href="' +
      e(url) +
      '" target="_blank" rel="noopener noreferrer">' +
      e(label) +
      "</a>"
    );
  } catch {
    return e(label);
  }
}
export function locatorLabel(l: V2Result["excerpts"][number]["locator"]) {
  return [
    l.physical_page ? "PDF 物理第 " + l.physical_page + " 页" : null,
    l.printed_page ? "印刷页码 " + l.printed_page : null,
    l.paragraph ? "网页段落 " + l.paragraph : null,
    l.table ? "表 " + l.table : null,
    l.row ? "行 " + l.row : null,
    l.column ? "列 " + l.column : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Render only the frozen report input; reading an old report performs no live lookup. */
export function renderV2Report(
  data: { companies: V2Result[]; notes?: string[] } | undefined,
) {
  if (!data) return "";
  return (
    '<section class="card" id="public-material-interpretation"><h2>公开材料解读与核实问题</h2><p>以下内容区分来源记载、条件推断和资料缺口。资料取得不等于独立核验，公司材料不等于岗位承诺。</p>' +
    data.companies
      .map((company) => {
        const excerpts = new Map(company.excerpts.map((x) => [x.id, x]));
        const financial = company.facts.filter(
          (f) => f.kind === "normalized_fact",
        );
        const table = financial.length
          ? "<details open><summary>财务原表与口径（" +
            financial.length +
            ' 条）</summary><div style="overflow-x:auto"><table><thead><tr><th>项目</th><th>原表金额</th><th>期间与口径</th><th>原文位置</th></tr></thead><tbody>' +
            financial
              .map((f) => {
                const x = excerpts.get(f.excerpt_id);
                return (
                  "<tr><td>" +
                  e(metrics[f.metric] ?? f.metric) +
                  "</td><td>" +
                  e(f.value ?? "未知") +
                  " " +
                  e(f.unit ?? "") +
                  " " +
                  e(f.currency ?? "") +
                  "</td><td>" +
                  e(f.period ?? "未知") +
                  " · " +
                  e(
                    f.reporting_scope === "unknown"
                      ? "口径未明确"
                      : (f.reporting_scope ?? "未知"),
                  ) +
                  "</td><td>" +
                  (x ? link(x.url, locatorLabel(f.locator)) : "引用缺失") +
                  "</td></tr>"
                );
              })
              .join("") +
            "</tbody></table></div><p>金额为来源原始单位。货币资金、资产总额与注册资本都不能直接当作可发工资的现金。</p></details>"
          : "";
        const translations = company.translations
          .map((t, i) => {
            const f = company.facts.find((x) => t.fact_ids.includes(x.id)),
              x = f ? excerpts.get(f.excerpt_id) : undefined;
            return (
              "<details" +
              (i < 2 ? " open" : "") +
              "><summary>" +
              e(topics[t.dimension] ?? t.dimension) +
              " · " +
              e(t.finding.slice(0, 90)) +
              "</summary><p><strong>看到了什么：</strong>" +
              e(t.finding) +
              "</p><blockquote>" +
              e(t.quote) +
              "</blockquote>" +
              (x
                ? "<p>" +
                  link(x.url, locatorLabel(t.locator) || "查看来源") +
                  " · " +
                  e(modes[x.access_mode]) +
                  "</p>"
                : "") +
              "<p><strong>可能意味着什么：</strong>" +
              e(t.inference) +
              "</p><p><strong>与你的关联：</strong>" +
              e(t.relevance) +
              "</p><p><strong>还不知道什么：</strong>" +
              e(t.unknown) +
              "</p><p><strong>建议询问：</strong>" +
              e(t.question) +
              '</p><p class="muted">证据支持程度：' +
              e(confidence[t.confidence]) +
              "；尚未独立核验。</p></details>"
            );
          })
          .join("");
        const procurement = company.documents
          .filter((d) => d.procurement)
          .map(
            (d) =>
              "<p>采购阶段：" +
              e(
                (
                  {
                    planned: "计划或意向",
                    tender: "招标",
                    awarded: "中标或成交",
                    contract: "合同",
                    acceptance: "验收",
                    unknown: "未知",
                  } as Record<string, string>
                )[d.procurement!.stage] ?? "未知",
              ) +
              "；采购人：" +
              e(d.procurement!.buyer ?? "未明确") +
              "。" +
              e(d.procurement!.limitation) +
              "</p>",
          )
          .join("");
        const reviewLabels: Record<string, string> = {
          not_comparable: "条件不足，尚不可比",
          time_difference: "时期不同",
          scope_difference: "范围不同",
          conditional: "存在生效条件",
          possible_conflict: "可能存在矛盾，待核实",
        };
        const reviews = company.reviews.length
          ? "<details><summary>材料之间的差异与待核对事项（" +
            company.reviews.length +
            " 组）</summary>" +
            company.reviews
              .slice(0, 12)
              .map(
                (r) =>
                  "<p><strong>" +
                  e(reviewLabels[r.kind] ?? "待核实") +
                  "：</strong>" +
                  e(r.reason) +
                  "</p><ul>" +
                  r.claim_ids
                    .map((id) => {
                      const f = company.facts.find((x) => x.id === id),
                        x = f ? excerpts.get(f.excerpt_id) : undefined;
                      return f
                        ? "<li>" +
                            e(f.quote) +
                            (x
                              ? " " +
                                link(x.url, locatorLabel(f.locator) || "来源")
                              : "") +
                            "</li>"
                        : "";
                    })
                    .join("") +
                  "</ul>",
              )
              .join("") +
            "<p>展示前 12 组。预算结束不会自动把未解决事项视为已证实。</p></details>"
          : "";
        const eventLabels: Record<string, string> = {
          source_reports_none: "来源称未发生",
          alleged: "指称或涉嫌",
          pending: "尚待结果",
          effective_result: "来源称结果已生效",
          decision_issued: "来源记载已出具决定书",
          unknown: "事件阶段未知",
        };
        const events = company.facts
          .filter((f) => f.risk_event)
          .map((f) => {
            const r = f.risk_event!,
              x = excerpts.get(f.excerpt_id);
            return (
              "<p>经营事件线索：" +
              e(eventLabels[r.event_status] ?? "未知") +
              "；主体 " +
              e(r.subject ?? "本句未明确") +
              "；日期 " +
              e(r.date ?? "未明确") +
              "；金额 " +
              e(r.amount_quote ?? "未明确") +
              "。" +
              (x ? link(x.url, locatorLabel(f.locator) || "核对原文") : "") +
              " " +
              e(r.limitation) +
              "</p>"
            );
          })
          .join("");
        const gaps = company.gaps.length
          ? "<ul>" +
            company.gaps
              .map(
                (g) =>
                  "<li>" +
                  e(topics[g.topic] ?? g.topic) +
                  "：" +
                  e(g.reason) +
                  "</li>",
              )
              .join("") +
            "</ul>"
          : "";
        const details =
          "<details><summary>来源能力、完整材料与本次执行说明</summary><p>库中保存 " +
          company.stored_document_count +
          " 份材料、" +
          company.stored_fact_count +
          " 条提取记录；本页按关注事项选择展示。按相同网址、正文哈希或已知转载来源去重后 " +
          company.independent_sources +
          " 组，未识别的转载关系仍可能存在。</p>" +
          company.documents
            .map(
              (d) =>
                "<p>" +
                link(d.url, d.title) +
                " · " +
                e(modes[d.access_mode]) +
                " · 原采集时间 " +
                e(d.collected_at) +
                (d.physical_pages ? " · " + d.physical_pages + " 页" : "") +
                "；发表时间 " +
                e(d.published_at ?? "未明确") +
                "；经历时间 " +
                e(d.experience_period ?? "未明确") +
                "；来源岗位 " +
                e(d.role ?? "未明确") +
                "；城市 " +
                e(d.city ?? "未明确") +
                "；部门 " +
                e(d.department ?? "未明确") +
                "；员工身份未独立验证。</p>",
            )
            .join("") +
          "<ul>" +
          company.capabilities
            .map(
              (c) =>
                "<li>" +
                e(c.label) +
                "：" +
                e(c.reason) +
                "；正文状态：" +
                e(statuses[c.direct_status] ?? c.direct_status) +
                "</li>",
            )
            .join("") +
          "</ul><ul>" +
          company.attempts
            .map(
              (a) =>
                "<li>" +
                e(channelLabels[a.channel]) +
                " · " +
                e(a.provider ?? a.platform ?? "公开来源") +
                "：" +
                e(statuses[a.status] ?? a.status) +
                (a.reason
                  ? "（" +
                    e(
                      reasons[a.reason] ??
                        (/^http_\d+$/.test(a.reason)
                          ? "来源返回访问错误 " + a.reason.slice(5)
                          : "详细原因已记入采集记录"),
                    ) +
                    "）"
                  : "") +
                "</li>",
            )
            .join("") +
          "</ul><p>缺口补查 " +
          company.followups.length +
          " 轮；停止后未解决的问题继续保留未知。</p>" +
          company.notes.map((n) => "<p>" + e(n) + "</p>").join("") +
          "</details>";
        return (
          "<h3>" +
          e(company.identity.legal_name ?? company.identity.brand) +
          "</h3>" +
          table +
          translations +
          procurement +
          events +
          reviews +
          gaps +
          details
        );
      })
      .join("") +
    (data.notes ?? []).map((n) => "<p>" + e(n) + "</p>").join("") +
    "</section>"
  );
}
