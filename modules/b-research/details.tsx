"use client";
import { useState, type FormEvent } from "react";
import type { CandidateBundle } from "./contract";
import { requestJson, formPayload } from "./client-api";

type Props = { bundle: CandidateBundle; onRefresh: () => Promise<void>; disabled: boolean };
const factLabels: Record<string, string> = { supported: "来源支持", contradicted: "来源否定", conflicting: "来源冲突", unknown: "未知" };
export function InvestigationDetails({ bundle, onRefresh, disabled }: Props) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [scope, setScope] = useState("job");
  const editable = bundle.mode === "manual" && !disabled && !saving;
  async function saveMaterial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; setError(""); setSaving(true);
    try {
      await requestJson("/api/b/evidence", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...formPayload(form), projectId: bundle.projectId }) });
      form.reset(); setScope("job"); await onRefresh();
    } catch (e) { setError(e instanceof Error ? e.message : "保存失败"); } finally { setSaving(false); }
  }
  async function selectCompany(company: CandidateBundle["companies"][number]) {
    setSaving(true); setError("");
    try {
      await requestJson("/api/b/identity-selection", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId: bundle.projectId, companyId: company.companyId, selectedLegalName: company.legalName }) });
      await onRefresh();
    } catch (e) { setError(e instanceof Error ? e.message : "选择失败"); } finally { setSaving(false); }
  }
  return <section className="b-investigation" aria-label="证据与主体">
    <h2>主体与证据</h2>
    {bundle.companies.map(company => <div className="b-identity" key={company.companyId}>
      <div><strong>{company.legalName}</strong><p>主体 ID：{company.companyId}</p><p>品牌：{company.brandName ?? "未知"} · 信用代码：{company.creditCode ?? "未知"} · {company.identityStatus}</p><p>法人、招聘方与签约方关系尚未核验。用户选择不等于官方确认。</p></div>
      <button className="button" disabled={!editable} onClick={() => void selectCompany(company)}>选择调查对象</button>
    </div>)}
    <h3>事实与待核验命题</h3>
    {!bundle.facts.length && <p>暂无可抽取命题。原始材料保留，不把未知写成安全。</p>}
    {bundle.facts.map(fact => <article className="b-fact" key={fact.factId}><strong>{fact.key === "job.sales_kpi" ? "岗位销售指标" : fact.key}</strong><span className={fact.status === "conflicting" ? "b-conflict" : ""}>{factLabels[fact.status]} · {fact.value === null ? "未知" : String(fact.value)}</span><p>适用岗位：{bundle.jobs.find(job => job.jobId === fact.jobId)?.title ?? "无"} · 事件日期：{fact.asOf ?? "未知"}</p><div className="b-citations">{fact.evidenceIds.map(id => <a key={id} href={`#${id}`}>查看原始证据 {bundle.evidence.findIndex(e => e.evidenceId === id) + 1}</a>)}</div></article>)}
    <h3>原始材料 ({bundle.evidence.length})</h3>
    {bundle.evidence.map((evidence, index) => <details key={evidence.evidenceId} id={evidence.evidenceId} className="b-evidence" open={bundle.evidence.length < 4}><summary>{index + 1}. {evidence.title} · {evidence.scope} · {evidence.verification}</summary><p>来源类型：{evidence.sourceType} · 发布：{evidence.publishedAt ?? "未知"} · 采集：{evidence.retrievedAt}</p><p>适用主体：{bundle.companies.find(c => c.companyId === evidence.companyId)?.legalName ?? "未知"} · 岗位：{bundle.jobs.find(j => j.jobId === evidence.jobId)?.title ?? "不适用"}</p><blockquote>{evidence.excerpt}</blockquote>{evidence.url && (evidence.url.startsWith("https://") || evidence.url.startsWith("http://")) && <a href={evidence.url} target="_blank" rel="noreferrer noopener">打开来源</a>}</details>)}
    <details id="b-material-entry" className="b-material" open><summary>补充材料</summary>
      {bundle.mode !== "manual" ? <p>仅人工调查可补充材料，演示资料不混入真实调查。</p> : <form onSubmit={saveMaterial}>
        <fieldset disabled={!editable}><div className="form-row"><label><span className="label">适用范围</span><select name="scope" className="select" value={scope} onChange={e => setScope(e.target.value)}><option value="job">具体岗位</option><option value="company">公司</option><option value="business">业务</option><option value="team">团队</option></select></label>
          <label><span className="label">{scope === "job" ? "对应岗位" : "对应主体"}</span><select className="select" name={scope === "job" ? "jobId" : "companyId"} required key={scope}><option value="">请选择</option>{scope === "job" ? bundle.jobs.map(job => <option key={job.jobId} value={job.jobId}>{job.title} · {job.jobId.slice(-6)}</option>) : bundle.companies.map(company => <option key={company.companyId} value={company.companyId}>{company.legalName} · {company.companyId.slice(-6)}</option>)}</select></label></div>
          <div className="form-row"><label><span className="label">材料标题</span><input className="input" name="title" required maxLength={500} /></label><label><span className="label">来源类型</span><select className="select" name="sourceType"><option value="user_material">用户材料</option><option value="official_record">官方公示材料</option><option value="company_website">公司官网</option><option value="annual_report">年报</option><option value="public_discussion">公开讨论（仅线索）</option><option value="interview_feedback">面试反馈（自报）</option></select></label></div>
          <div className="form-row"><label><span className="label">来源链接</span><input className="input" name="url" type="url" /></label><label><span className="label">原始发布日期</span><input className="input" name="publishedAt" type="date" /></label></div>
          <label><span className="label">原文片段</span><textarea className="textarea" name="excerpt" required maxLength={50000} /></label><p>人工录入均为未核验。日期不详可留空，匿名讨论不转为公司事实。</p><button className="button primary" type="submit">{saving ? "保存中" : "保存材料并重查"}</button>
        </fieldset></form>}
    </details>
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
