"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import type { CandidateBundle, SearchIntent } from "./contract";
import { searchIntentSchema, candidateBundleSchema, validateBundleReferences } from "./contract";
import type { ResearchRun } from "./research-service";
import { requestJson, formPayload } from "./client-api";
import { InvestigationDetails } from "./details";
import demoIntent from "./fixtures/search-intent.json";
import demoBundle from "./fixtures/candidate-bundle.json";
import "../../app/styles.css";
import "./workspace.css";

type Props = { initialMode: "demo" | "manual" };
const initial = { intent: demoIntent as SearchIntent, bundle: demoBundle as CandidateBundle };
const statusText: Record<string, string> = { open: "在招状态：开放", closed: "已关闭", unknown: "在招状态待确认", available: "已录入", not_connected: "未接入", unavailable: "暂不可用", no_result: "无结果", not_public: "未公开" };
const topics = [["company_identity", "主体与工商"], ["business", "经营与产品"], ["business_financials", "公开财务"], ["credit_legal", "信用与司法"], ["work_conditions", "工作时间与保障"], ["team_growth", "团队与成长"]];

export function ResearchWorkspace({ initialMode }: Props) {
  const [mode, setMode] = useState<"demo" | "manual" | "live">(initialMode);
  const [intentText, setIntentText] = useState(JSON.stringify({ ...initial.intent, mode: initialMode }, null, 2));
  const [bundle, setBundle] = useState<CandidateBundle>(initialMode === "demo" ? initial.bundle : { ...initial.bundle, companies: [], jobs: [], evidence: [], facts: [], coverage: [], usage: [], mode: "manual" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showJobForm, setShowJobForm] = useState(false);
  const [jobCount, setJobCount] = useState(0);
  const [runStatus, setRunStatus] = useState("尚未运行");
  const [run, setRun] = useState<ResearchRun | null>(null);

  useEffect(() => { void fetch("/api/b/jobs").then((res) => res.json()).then((data) => setJobCount(data.jobs?.length ?? 0)).catch(() => undefined); }, []);
  const companyById = useMemo(() => new Map(bundle.companies.map((company) => [company.companyId, company])), [bundle.companies]);

  function changeMode(next: "demo" | "manual" | "live") {
    setMode(next);
    setRun(null); setRunStatus("尚未运行"); setError("");
    try { const intent = JSON.parse(intentText); intent.mode = next; setIntentText(JSON.stringify(intent, null, 2)); } catch { /* Keep invalid text editable. */ }
    if (next === "demo") setBundle(initial.bundle);
    else setBundle({ ...initial.bundle, companies: [], jobs: [], evidence: [], facts: [], coverage: [], usage: [], mode: next });
  }

  async function importIntent(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      if (file.size > 200000) throw new Error("意向文件超过 200KB");
      const intent = searchIntentSchema.parse(JSON.parse(await file.text()));
      changeMode(intent.mode); setIntentText(JSON.stringify(intent, null, 2));
    } catch (e) { setError(e instanceof Error ? e.message : "意向 JSON 无效"); }
    event.target.value = "";
  }

  async function loadResearch(intent: SearchIntent) {
    const started = await requestJson<{ runId: string }>("/api/b/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(intent) });
    const nextRun = await requestJson<ResearchRun>(`/api/b/runs/${started.runId}`);
    const nextBundle = candidateBundleSchema.parse(await requestJson(`/api/b/bundles/${nextRun.bundleId}`));
    if (validateBundleReferences(nextBundle).length || nextBundle.projectId !== intent.projectId || nextBundle.intentRevision !== intent.revision || nextBundle.mode !== intent.mode) throw new Error("返回档案引用或意向不一致");
    setBundle(nextBundle); setRun(nextRun); setMode(intent.mode); setRunStatus(nextRun.status === "partial" ? "部分完成" : "已完成");
  }

  async function runSearch(event?: FormEvent) {
    event?.preventDefault(); setBusy(true); setError("");
    try {
      await loadResearch(searchIntentSchema.parse(JSON.parse(intentText)));
    } catch (e) { setError(e instanceof Error ? e.message : "请输入有效的 SearchIntent JSON"); }
    finally { setBusy(false); }
  }

  async function submitJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setBusy(true);
    const data = formPayload(event.currentTarget);
    try {
      const intent = searchIntentSchema.parse({ ...JSON.parse(intentText), mode: "manual" });
      await requestJson("/api/b/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...data, projectId: intent.projectId }) });
      const pool = await requestJson<{ jobs: unknown[] }>("/api/b/jobs"); setJobCount(pool.jobs.length);
      setShowJobForm(false); setMode("manual"); setIntentText(JSON.stringify(intent, null, 2));
      await loadResearch(intent);
    } catch (e) { setError(e instanceof Error ? e.message : "提交 JD 失败"); }
    finally { setBusy(false); }
  }

  async function exportBundle() {
    if (!run) { setError("请先运行检索，再导出快照"); return; }
    const response = await fetch(`/api/b/bundles/${bundle.bundleId}/export`);
    if (!response.ok) { setError("请先运行检索，再导出 CandidateBundle。"); return; }
    const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `candidate-bundle-${bundle.bundleId}.json`; link.click(); URL.revokeObjectURL(url);
  }

  const notJobCompanies = bundle.companies.filter((company) => !bundle.jobs.some((job) => job.companyId === company.companyId));
  return <div className="shell b-workspace">
    <header className="topbar">
      <a className="brand" href="/demo/b"><span className="brandmark">X</span>求职 X-Ray</a>
      <nav className="nav"><a className={mode === "demo" ? "active" : ""} href="/demo/b">B 演示</a><a className={mode !== "demo" ? "active" : ""} href="/research">资料调查</a></nav>
      <div className="top-right"><span><i className="status-dot" />{mode === "live" ? "LIVE provider 未接入" : mode === "manual" ? "人工资料模式" : "合成演示数据"}</span><span className="tag">CONTRACT 1.0.0</span></div>
    </header>
    <main className="main">
      <div className="eyebrow">RESEARCH / COMPANY + JOB</div>
      <div className="heading-row"><div><h1>公司与岗位调查</h1><p className="sub">候选发现、主体确认与来源证据</p></div><span className="tag">意向版本 {readRevision(intentText)}</span></div>
      <div className="layout">
        <aside className="panel filters">
          <h2 className="panel-title">检索意向 <span className="tag">SearchIntent</span></h2>
          <div className="mode-tabs" aria-label="数据模式">
            {(["demo", "manual", "live"] as const).map((item) => <button type="button" disabled={busy} key={item} className={mode === item ? "selected" : ""} onClick={() => changeMode(item)}>{item}</button>)}
          </div>
          <label className="label" htmlFor="intent-json">输入 JSON</label>
          <textarea id="intent-json" className="textarea" disabled={busy} value={intentText} onChange={(e) => { setIntentText(e.target.value); setRun(null); setRunStatus("意向已编辑，需重新检索"); }} spellCheck={false} />
          <label className="import-label">↑　导入 SearchIntent JSON<input type="file" accept="application/json,.json" onChange={importIntent} /></label>
          <button className="button primary full" onClick={() => void runSearch()} disabled={busy}>{busy ? "处理中…" : "运行检索"}</button>
          <button className="button full" onClick={() => setShowJobForm(true)}>＋ 提交真实 JD</button>
          <p className="notice"><strong>{mode === "live" ? "未接入真实数据源" : mode === "demo" ? "合成演示数据" : "本地人工资料池"}</strong><br />{mode === "live" ? "此模式不会调用或伪装任何外部检索。" : mode === "demo" ? "合成样例只用于演示契约，不表示公司真实情况。" : `当前会话已录入 ${jobCount} 条 JD；进程内保存，重启后清空。`}</p>
          {error && <div className="error" role="alert">{error}</div>}
        </aside>
        <section className="results">
          <div className="panel">
            <div className="toolbar"><div className="toolbar-left"><strong className="count">职位 <span>{bundle.jobs.length}</span></strong><span className="tag">{runStatus}</span></div><div className="toolbar-actions"><button className="button" onClick={() => void exportBundle()}>↓ 导出 JSON</button><button className="button" onClick={() => setShowJobForm(true)}>＋ 提交 JD</button></div></div>
            {bundle.jobs.length === 0 ? <div className="empty"><h3>{mode === "live" ? "没有连接外部检索源" : "当前条件下没有职位"}</h3><p>{mode === "live" ? "coverage 已记录为 not_connected；可切换至人工模式提交 JD。" : "可调整岗位、城市或添加真实 JD；没有候选不代表没有相关公司。"}</p><button className="button primary" onClick={() => setShowJobForm(true)}>提交 JD</button></div> : bundle.jobs.map((job) => {
              const company = job.companyId ? companyById.get(job.companyId) : undefined;
              const evidence = bundle.evidence.find((item) => item.jobId === job.jobId);
              return <article className="company-block" key={job.jobId}>
                <div className="company-head"><div className="company-icon">{company?.legalName.slice(0, 1) ?? "?"}</div><div><div className="company-name">{company?.legalName ?? "招聘主体待确认"}</div><div className="company-meta"><span>{company?.identityStatus === "confirmed" ? "演示主体已确认" : "法人主体未确认"}</span><span>·</span><span>{evidence?.title ?? "无职位来源"}</span></div></div><span className="company-extra">{job.publishedAt ? `发布于 ${job.publishedAt}` : "发布日期未知"}</span></div>
                <div className="job"><div className="job-title-row"><span className="job-title">{job.title}</span><span className={`chip ${job.vacancyStatus !== "open" ? "warn" : ""}`}>{statusText[job.vacancyStatus]}</span></div><div className="job-meta"><span>⌖ {job.city ?? "工作城市未知"}</span><span>{job.salary.currency} {formatSalary(job.salary)}</span><span>{job.salary.basis === "total" ? "综合薪资" : job.salary.basis === "fixed" ? "固定薪资" : "薪资口径未知"}</span><span>{job.salary.taxBasis === "pre_tax" ? "税前" : job.salary.taxBasis === "after_tax" ? "税后" : "税务口径未知"} · {job.salary.months === null ? "薪数未知" : `${job.salary.months} 薪`}</span></div><p className="job-desc">{job.rawJd}</p><div className="job-footer"><span className="source-line">来源：{evidence?.sourceType ?? "未记录"}　·　采集：{evidence ? new Date(evidence.retrievedAt).toLocaleDateString("zh-CN") : "无"}　·　核验：{evidence?.verification ?? "未知"}</span><a className="link-button" href="#b-material-entry">补充材料　↗</a></div></div>
              </article>;
            })}
          </div>
          {notJobCompanies.length > 0 && <div className="panel details"><h2>待关注公司 <span className="tag">与招聘机会分开</span></h2>{notJobCompanies.map((company) => <div className="company-head" key={company.companyId} style={{ marginTop: 12 }}><div className="company-icon">{company.legalName.slice(0, 1)}</div><div><div className="company-name">{company.legalName}</div><div className="company-meta">尚无关联职位　·　主体：{company.identityStatus === "confirmed" ? "演示确认" : "待确认"}</div></div></div>)}</div>}
          <div className="panel details"><h2>调查主题 <span className="tag">不生成综合评分</span></h2><div className="detail-grid">{topics.map(([key, label]) => <div className="detail-item" key={key}><small>{label}</small><strong>{topicStatus(key, bundle)}</strong></div>)}</div></div>
          <InvestigationDetails key={bundle.bundleId} bundle={bundle} disabled={busy || !run} onRefresh={() => runSearch()} />
          {run && <section className="b-run" aria-label="检索任务详情"><h2>任务记录</h2><p>阶段：{run.stage} · 意向版本：{run.intentRevision} · 外部调用：{run.cost.externalCalls} 次 · 已知外部费用：{run.cost.knownCostMinor} 分{run.cost.hasUnknown ? "（含未知费用）" : "（不含人工和部署成本）"}</p>{run.warnings.map(w => <p key={w}>{w}</p>)}<details><summary>候选筛选依据</summary>{run.decisions.map(d => <p key={d.jobId}>{d.jobId} · {d.included ? "纳入" : "未纳入"}：{d.reasons.join("；")}</p>)}</details></section>}
          <div className="panel coverage"><h2 className="panel-title">数据覆盖 <span className="tag">{bundle.mode.toUpperCase()}</span></h2>{bundle.coverage.length ? bundle.coverage.map((row, i) => <div className="coverage-row" key={`${row.topic}-${i}`}><strong>{row.topic}</strong><span className="coverage-status">{statusText[row.status]}</span><span className="coverage-reason">{row.reason}</span></div>) : <div className="coverage-row"><strong>待运行</strong><span className="coverage-status">未知</span><span className="coverage-reason">运行检索后记录数据源的实际覆盖状态。</span></div>}</div>
          <div className="footer-note">任务状态：{runStatus}　·　调用成本：{bundle.usage.length ? bundle.usage.map((x) => x.costMinor ?? "未知").join(", ") : "未知 / 无外部调用"}</div>
        </section>
      </div>
    </main>
    {showJobForm && <div className="drawer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowJobForm(false); }}><section className="drawer" role="dialog" aria-modal="true" aria-labelledby="job-form-title"><div className="drawer-head"><h2 id="job-form-title">提交职位材料</h2><button className="button" onClick={() => setShowJobForm(false)} aria-label="关闭">✕</button></div><form onSubmit={submitJob}>
      <div className="form-section"><h3>岗位信息</h3><div className="form-row"><Field label="公司名称" name="companyName" placeholder="招聘公司或品牌名" /><Field label="岗位名称" name="title" placeholder="例如：产品运营" required /></div><div className="form-row"><Field label="工作城市" name="city" placeholder="城市" /><Field label="来源 URL" name="sourceUrl" placeholder="https://…" type="url" /></div><div className="form-row"><Field label="发布时间" name="publishedAt" placeholder="YYYY-MM-DD" /><label><span className="label">在招状态</span><select className="select" name="vacancyStatus"><option value="unknown">待确认</option><option value="open">确认开放</option><option value="closed">已关闭</option></select></label></div></div>
      <div className="form-section"><h3>薪资（按来源填写，不推测缺失值）</h3><div className="form-row"><Field label="最低薪资" name="salaryMin" placeholder="月/年金额" type="number" /><Field label="最高薪资" name="salaryMax" placeholder="月/年金额" type="number" /></div><div className="form-row"><SelectField label="周期" name="salaryPeriod" options={[["unknown","未知"],["month","月薪"],["year","年薪"]]} /><SelectField label="口径" name="salaryBasis" options={[["unknown","未知"],["fixed","固定"],["total","综合"]]} /></div><div className="form-row"><SelectField label="税务口径" name="taxBasis" options={[["unknown","未知"],["pre_tax","税前"],["after_tax","税后"]]} /><Field label="薪数/月数" name="salaryMonths" placeholder="未知可留空" type="number" /></div></div>
      <div className="form-section"><h3>原始 JD 正文</h3><textarea className="textarea" name="rawJd" required placeholder="粘贴职位原文；将作为 unverified 证据保存" /></div>
      {error && <div className="error" role="alert">{error}</div>}<div className="drawer-actions"><button type="button" className="button" onClick={() => setShowJobForm(false)}>取消</button><button className="button primary" type="submit" disabled={busy}>{busy ? "处理中" : "保存并检索"}</button></div>
    </form></section></div>}
  </div>;
}

function Field({ label, name, placeholder, type = "text", required = false }: { label: string; name: string; placeholder: string; type?: string; required?: boolean }) { return <label><span className="label">{label}</span><input className="input" name={name} type={type} placeholder={placeholder} required={required} /></label>; }
function SelectField({ label, name, options }: { label: string; name: string; options: [string, string][] }) { return <label><span className="label">{label}</span><select name={name} className="select">{options.map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select></label>; }
function readRevision(value: string) { try { return JSON.parse(value).revision ?? "-"; } catch { return "-"; } }
function formatSalary(salary: CandidateBundle["jobs"][number]["salary"]) { if (salary.min === null && salary.max === null) return "未知"; const amount = salary.min === salary.max ? `${salary.min}` : `${salary.min ?? "?"}–${salary.max ?? "?"}`; return `${amount}${salary.period === "month" ? "/月" : salary.period === "year" ? "/年" : ""}`; }
function topicStatus(topic: string, bundle: CandidateBundle) { if (bundle.mode === "demo") return "演示资料 / 不代表真实调查"; const status = bundle.coverage.find((row) => row.topic === topic)?.status; return status ? statusText[status] : bundle.facts.length ? "有记录，查看来源" : "未知 / 未调查"; }
