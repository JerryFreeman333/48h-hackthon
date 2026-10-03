"use client";
import { useEffect, useState } from "react";
import { PageHeader } from "@/packages/ui";

type Session = { id: string; mode: string; revision: number; confirmedRevisions: number[] };
type Result = { needsSession:{sessionId:string;revision:number}; reportId: string; reportUrl: string; warnings: string[] };
async function api(path: string, body?: unknown) {
  const response = await fetch(path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store" });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error?.message ?? "提交失败，请重试");
  return value;
}
export default function AnalyzePage() {
  const [sessions, setSessions] = useState<Session[]>([]), [selection, setSelection] = useState("");
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null), [confirmed, setConfirmed] = useState(false);
  const [draft,setDraft]=useState({title:'',rawJd:'',companyName:'',city:'',sourceUrl:'',sourceKind:'user_provided',actualMaterialConfirmed:false}),[draftReady,setDraftReady]=useState(false);
  useEffect(()=>{try{const saved=localStorage.getItem('xray-jd-draft-v1')??sessionStorage.getItem('xray-jd-draft-v1');if(saved)setDraft(previous=>({...previous,...JSON.parse(saved)}));}catch{/* Corrupt local storage cannot block starting a new draft. */}setDraftReady(true);},[]);
  useEffect(()=>{if(draftReady)try{localStorage.setItem('xray-jd-draft-v1',JSON.stringify(draft));}catch{setError('浏览器无法保存草稿，离开前请保留输入原文。');}},[draft,draftReady]);
  useEffect(() => { api("/api/a/needs/bootstrap").then(value => { const available=value.sessions.filter((s:Session)=>s.mode==="manual"&&s.confirmedRevisions.length);setSessions(available);const requested=new URL(location.href).searchParams.get("sessionId")??value.latestSessionId;const existing=available.find((s:Session)=>s.id===requested);if(existing){const requestedRevision=Number(new URL(location.href).searchParams.get("revision"));setSelection(JSON.stringify({sessionId:existing.id,revision:existing.confirmedRevisions.includes(requestedRevision)?requestedRevision:Math.max(...existing.confirmedRevisions)}));}setReady(true); }).catch(e => setError(e.message)); }, []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setResult(null);
    const values = new FormData(event.currentTarget);
    try {
      const chosen = selection ? JSON.parse(selection) : null;
      const answer = await api("/api/integration/manual", {
        ...(chosen ?? { confirmUnknownNeeds: confirmed }),
        sourceDeclaration:{kind:draft.sourceKind,actualMaterialConfirmed:draft.actualMaterialConfirmed},
        job: { title: values.get("title"), rawJd: values.get("rawJd"), companyName: values.get("companyName") || null, city: values.get("city") || null, sourceUrl: values.get("sourceUrl") || null }
      }); setResult(answer);setSelection(JSON.stringify(answer.needsSession));
      setSessions(previous=>{const found=previous.find(s=>s.id===answer.needsSession.sessionId);if(found)return previous;return [...previous,{id:answer.needsSession.sessionId,mode:"manual",revision:answer.needsSession.revision,confirmedRevisions:[answer.needsSession.revision]}];});
    } catch (e) { setError(e instanceof Error ? e.message : "分析失败"); } finally { setBusy(false); }
  }
  return <main><PageHeader title="分析这份工作"><p>贴入正在考虑的 JD，先看已知事实、冲突与需要核实的事项。</p></PageHeader>
    <form onSubmit={submit} onChange={()=>setResult(null)} className="panel" style={{ display: "grid", gap: 16 }}>
      <fieldset disabled={busy||!draftReady} style={{border:0,padding:0,minWidth:0,display:"grid",gap:16}}>
      <label>岗位名称<input name="title" required maxLength={300} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value,actualMaterialConfirmed:false})} placeholder="例如：产品运营" /></label>
      <label>招聘公司名称（选填）<input name="companyName" maxLength={300} value={draft.companyName} onChange={e=>setDraft({...draft,companyName:e.target.value,actualMaterialConfirmed:false})}/><small>名称只作为线索，尚未核验签约主体。</small></label>
      <label>岗位城市（选填）<input name="city" maxLength={80} value={draft.city} onChange={e=>setDraft({...draft,city:e.target.value,actualMaterialConfirmed:false})} placeholder="例如：杭州；这是实际办公城市" /></label>
      <label>来源链接（选填）<input name="sourceUrl" type="url" value={draft.sourceUrl} onChange={e=>setDraft({...draft,sourceUrl:e.target.value,actualMaterialConfirmed:false})} placeholder="https://" /></label>
      <label>原始 JD<textarea name="rawJd" required maxLength={50000} rows={10} value={draft.rawJd} onChange={e=>setDraft({...draft,rawJd:e.target.value,actualMaterialConfirmed:false})} style={{ width: "100%" }} placeholder="粘贴岗位职责、要求及招聘方提供的待遇原文" /></label>
      <label>资料来源类型<select value={draft.sourceKind} onChange={e=>setDraft({...draft,sourceKind:e.target.value,actualMaterialConfirmed:false})}><option value="user_provided">用户提供资料</option><option value="synthetic">合成测试样例（虚构）</option></select></label>
      {draft.sourceKind==='user_provided'&&<label><input type="checkbox" checked={draft.actualMaterialConfirmed} onChange={e=>setDraft({...draft,actualMaterialConfirmed:e.target.checked})}/> 我确认这是实际岗位资料，填写来源链接后可收录到本会话展示案例。</label>}
      <small>资料来源与核验状态分别记录；用户声明、招聘原文都不等于已经独立核实。</small>
      <label>用于判断的个人需求<select disabled={busy||!ready} value={selection} onChange={e => setSelection(e.target.value)}><option value="">暂不填写需求，先分析岗位</option>{sessions.flatMap(s => s.confirmedRevisions.map(revision => <option key={`${s.id}:${revision}`} value={JSON.stringify({ sessionId: s.id, revision })}>{s.id.slice(0, 8)} · 已确认版本 {revision}</option>))}</select></label>
      {!selection && <label><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /> 我确认个人需求暂时全部未知；报告不能据此宣称这份工作适合我。</label>}
      <p>继续分析另一份JD会沿用所选需求版本，之后可在“比较候选岗位”中一起查看。</p>
      <p><a href={selection?"/profile?sessionId="+JSON.parse(selection).sessionId+"&returnTo=/analyze":"/profile?new=1&returnTo=/analyze"}>补充七主题需求 →</a>　<a href="/history">查看历史报告 →</a>　<a href="/compare">比较候选岗位 →</a></p>
      <button type="submit" disabled={!ready || busy || (!selection && !confirmed)}>{busy ? "正在保存输入并生成报告…" : "确认输入并分析"}</button>
      </fieldset>
    </form>
    {error && <p role="alert">{error}</p>}
    {result && <section className="panel"><h2>分析已生成</h2>{result.warnings.map(w => <p key={w}>{w}</p>)}<p><a href={result.reportUrl} target="_blank" rel="noreferrer">打开报告 →</a></p><iframe title="岗位分析报告" src={result.reportUrl} style={{ width: "100%", height: 800, border: "1px solid #ddd" }} /></section>}
  </main>;
}
