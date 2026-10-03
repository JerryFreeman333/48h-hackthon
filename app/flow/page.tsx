"use client";

import { useEffect, useState } from "react";
import { PageHeader, StateBadge } from "@/packages/ui";

type Mode = "demo" | "manual" | "live";
type Condition = {
  key: string;
  value: string[] | number | boolean | null;
  strength: "hard" | "soft" | "unknown";
};
type NeedsData = {
  answers: Record<string, string | string[] | null>;
  conditions: Condition[];
  stageId: string | null;
  goalIds: string[];
  industryTags: string[];
  roleTypes: string[];
};
type SessionSummary = {
  id: string;
  revision: number;
  mode: Mode;
  confirmedRevisions: number[];
};
type Session = SessionSummary & { data: NeedsData };
type Bootstrap = {
  latestSessionId: string | null;
  sessions: SessionSummary[];
  catalog: { version: string; topics: { id: string; details: { id: string }[] }[] };
};
type FlowResult = {
  reportId: string;
  jobCount: number;
  reportUrl: string;
  warnings: string[];
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    headers: { "content-type": "application/json", ...init?.headers }
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error?.message ?? `请求失败（${response.status}），请刷新后重试。`);
  }
  if (!body) throw new Error("服务未返回有效数据，请重试。");
  return body as T;
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "操作失败，请重试。";
}

const cardStyle = { background: "white", border: "1px solid #d7e0db", borderRadius: 12, padding: 20, marginBlock: 20 };
const actionsStyle = { display: "flex", flexWrap: "wrap" as const, gap: 16, alignItems: "center" };
const buttonStyle = { padding: "10px 16px", borderRadius: 8, border: "1px solid #176c58", cursor: "pointer" };
const primaryStyle = { ...buttonStyle, color: "white", background: "#176c58" };
const selectStyle = { padding: 10, border: "1px solid #b5c7bc", borderRadius: 6, maxWidth: "100%", background: "white" };

export default function FlowPage() {
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [revision, setRevision] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<FlowResult | null>(null);

  useEffect(() => {
    let active = true;
    api<Bootstrap>("/api/a/needs/bootstrap")
      .then(data => {
        if (!active) return;
        setBoot(data);
        const confirmed = data.sessions.filter(session => session.confirmedRevisions.length > 0);
        setSelectedId((confirmed.find(session => session.id === data.latestSessionId) ?? confirmed.at(-1))?.id ?? "");
      })
      .catch(reason => { if (active) setError(message(reason)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const sessions = boot?.sessions.filter(session => session.confirmedRevisions.length > 0) ?? [];
  const selected = sessions.find(session => session.id === selectedId);
  const selectedRevision = selected?.confirmedRevisions.includes(Number(revision))
    ? Number(revision)
    : selected?.confirmedRevisions.at(-1);
  const disabled = loading || Boolean(busy);

  async function refresh(preferredId?: string) {
    const data = await api<Bootstrap>("/api/a/needs/bootstrap");
    setBoot(data);
    const confirmed = data.sessions.filter(session => session.confirmedRevisions.length > 0);
    setSelectedId(previous => {
      const wanted = preferredId ?? previous;
      return (confirmed.find(session => session.id === wanted)
        ?? confirmed.find(session => session.id === data.latestSessionId)
        ?? confirmed.at(-1))?.id ?? "";
    });
    if (preferredId) setRevision("");
  }

  async function refreshRecords() {
    setError("");
    setLoading(true);
    try { await refresh(); }
    catch (reason) { setError(message(reason)); }
    finally { setLoading(false); }
  }

  async function runConfirmed() {
    if (!selected || !selectedRevision) return;
    if (selected.mode !== "demo") {
      setError("当前联调只支持演示需求。本人填写的需求不会转换为合成岗位结果，请创建独立的演示需求。");
      return;
    }
    setError("");
    setResult(null);
    setBusy("正在按已确认需求检索合成岗位并生成报告…");
    try {
      setResult(await api<FlowResult>("/api/integration/demo", {
        method: "POST", body: JSON.stringify({ sessionId: selected.id, revision: selectedRevision })
      }));
    } catch (reason) { setError(message(reason)); }
    finally { setBusy(""); }
  }

  async function createSyntheticFlow() {
    setError("");
    setResult(null);
    setBusy("正在创建独立的合成求职需求…");
    try {
      const catalog = boot ?? await api<Bootstrap>("/api/a/needs/bootstrap");
      let session = await api<Session>("/api/a/needs/sessions", {
        method: "POST", body: JSON.stringify({ mode: "demo" })
      });
      const data = structuredClone(session.data);
      data.stageId = "graduate";
      data.goalIds = ["find_first_job"];
      data.industryTags = ["software_it"];
      data.roleTypes = ["product_operations"];
      data.conditions = data.conditions.map(condition => {
        if (condition.key === "city") return { key: condition.key, value: ["上海"], strength: "hard" };
        if (condition.key === "accept_sales_kpi") return { key: condition.key, value: false, strength: "hard" };
        return { key: condition.key, value: null, strength: "unknown" };
      });
      for (const topic of catalog.catalog.topics) {
        data.answers[`${topic.id}.priority`] = "priority";
        data.answers[`${topic.id}.details`] = topic.details[0] ? [topic.details[0].id] : null;
        data.answers[`${topic.id}.policy`] = "verify_first";
      }
      session = await api<Session>(`/api/a/needs/sessions/${encodeURIComponent(session.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ expectedRevision: session.revision, questionnaireVersion: catalog.catalog.version, step: 8, data })
      });
      setBusy("正在保存合成需求的确认版本…");
      const confirmed = await api<{ session: Session }>(`/api/a/needs/sessions/${encodeURIComponent(session.id)}/confirm`, {
        method: "POST", body: JSON.stringify({ expectedRevision: session.revision, confirmed: true })
      });
      setBusy("正在通过 B 检索合成岗位，并由 C 生成规则报告…");
      const report = await api<FlowResult>("/api/integration/demo", {
        method: "POST", body: JSON.stringify({ sessionId: session.id, revision: confirmed.session.confirmedRevisions.at(-1) })
      });
      setResult(report);
      try { await refresh(session.id); }
      catch (reason) { setError(`报告已生成；记录列表刷新失败：${message(reason)}`); }
    } catch (reason) { setError(message(reason)); }
    finally { setBusy(""); }
  }

  return <main>
    <PageHeader title="开发测试 · 合成数据">
      <p>此入口只用于开发测试，不用于展示真实公司或岗位。实际资料展示请进入展示案例。</p>
      <p><StateBadge state="unknown">资料来源：合成测试样例</StateBadge> A 使用实际确认流程；B 的公司与岗位为合成样例，C 按规则生成报告。</p>
    </PageHeader>

    <p><a href="/showcase">查看实际资料展示案例 →</a></p>
    <nav aria-label="模块入口" style={actionsStyle}>
      <a href="/profile">A · 填写并确认求职需求</a>
      <a href="/demo/b">B · 公司与岗位调查</a>
      <a href="/demo/c">C · 匹配与报告</a>
      <a href="/">返回项目首页</a>
    </nav>

    <section aria-labelledby="confirmed-title" style={cardStyle}>
      <h2 id="confirmed-title">使用 A 已确认的需求</h2>
      <p>在 A 中完成并确认需求后，刷新这里的记录。每次联调使用所选的确认版本，旧版本继续保留。</p>
      <button type="button" style={buttonStyle} onClick={refreshRecords} disabled={disabled}>刷新已确认记录</button>
      {loading ? <p role="status">正在加载本会话的求职需求…</p> : sessions.length === 0
        ? <p>当前会话尚无已确认记录。可以先<a href="/profile">填写求职需求</a>，或使用下方合成示例验证流程。</p>
        : <div style={{ display: "grid", gap: 14, marginTop: 20 }}>
          <label htmlFor="flow-session">已确认需求记录</label>
          <select id="flow-session" style={selectStyle} value={selectedId} disabled={disabled}
            onChange={event => { setSelectedId(event.target.value); setRevision(""); }}>
            {sessions.map((session, index) => <option key={session.id} value={session.id}>
              记录 {index + 1} · {session.mode === "demo" ? "演示需求" : "本人填写"} · {session.id.slice(0, 8)}
            </option>)}
          </select>
          <label htmlFor="flow-revision">确认版本</label>
          <select id="flow-revision" style={selectStyle} value={selectedRevision ?? ""} disabled={disabled}
            onChange={event => setRevision(event.target.value)}>
            {selected?.confirmedRevisions.map(version => <option key={version} value={version}>画像版本 {version}</option>)}
          </select>
          {selected?.mode !== "demo" && <p>这份需求由本人填写。当前闭环仅连接演示数据，无法为它生成真实调查报告。使用下方按钮可创建独立的合成需求。</p>}
          <div><button type="button" style={primaryStyle} onClick={runConfirmed}
            disabled={disabled || selected?.mode !== "demo" || !selectedRevision}>使用所选版本生成演示报告</button></div>
        </div>}
    </section>

    <section aria-labelledby="synthetic-title" style={cardStyle}>
      <h2 id="synthetic-title">一键验证完整流程</h2>
      <p>创建一份独立的合成需求：应届求职、上海、软件行业、产品运营、不接受销售 KPI；其他现实条件保持未知。七主题使用示例选择，仅代表合成数据，不代表你已作答，不生成能力或人格分数。</p>
      <button type="button" style={primaryStyle} onClick={createSyntheticFlow} disabled={disabled}>
        一键创建合成需求并联调
      </button>
    </section>

    <div aria-live="polite" aria-atomic="true">{busy && <p role="status">{busy}</p>}</div>
    {error && <p role="alert" style={{ color: "#9e3a38", background: "#f8e6e4", padding: 16, borderRadius: 8 }}>{error}</p>}

    {result && <section aria-labelledby="result-title" style={cardStyle}>
      <h2 id="result-title">报告已生成</h2>
      <p><StateBadge state="known">联调完成</StateBadge> 共 {result.jobCount} 个合成候选。报告 ID：{result.reportId}</p>
      <div style={actionsStyle}>
        <a href={result.reportUrl} target="_blank" rel="noopener noreferrer">打开完整报告</a>
      </div>
      {result.warnings.length > 0 && <ul>{result.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul>}
      <iframe title="ABC 联调报告预览" src={result.reportUrl}
        style={{ width: "100%", height: "75vh", minHeight: 500, border: "1px solid #d7e0db", borderRadius: 8, marginTop: 16 }} />
    </section>}
  </main>;
}
