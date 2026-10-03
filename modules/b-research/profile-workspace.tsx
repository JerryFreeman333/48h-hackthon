"use client";
import {useEffect,useState,useRef} from 'react';
import './workspace.css';
type Candidate={recordId:number;companyName:string;title:string;city:string|null;sourceUrl:string|null;sourceType:string;excerpt:string;notes:string[];investigation?:{topic:string;label:string;status:string;explanation:string;gaps:string[];question:string;materials:{text:string;sources:{title:string;scope:string;url:string|null;publishedAt:string|null;collectedAt:string|null;dateNote:string|null;excerpt:string}[]}[]}[]};
type Handoff={agent?:{enabled:boolean;configured:boolean};sessionId:string;revision:number;goals:string[];industries:string[];roles:string[];conditions:{label:string;text:string;strength:string}[];topics:{title:string;priority:string;details:string[];policy:string}[];database:{sourceName:string;sourceFingerprint:string;counts:{companies:number;company_jobs:number};candidateCount:number;referenceCount:number;candidates:Candidate[];references:Candidate[]}};
async function read(url:string){const r=await fetch(url,{cache:'no-store'}),body=await r.json();if(!r.ok)throw Error(body.error?.message??'无法读取已保存的用户侧写');return body;}
export function ProfileResearchWorkspace(){
 const [value,setValue]=useState<Handoff|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const [selected,setSelected]=useState<number[]>([]),[busy,setBusy]=useState(false),[report,setReport]=useState<{reportUrl:string;warnings:string[]}|null>(null);
 const [progress,setProgress]=useState('');const mounted=useRef(true);
 const storageKey=(v:Handoff)=>'xray-agent-run:'+v.sessionId+':'+v.revision;
 function remember(v:Handoff,job:unknown){try{if(job)localStorage.setItem(storageKey(v),JSON.stringify(job));else localStorage.removeItem(storageKey(v));}catch{/* Storage may be disabled; in-page progress still works. */}}
 async function followRun(v:Handoff,id:string){
  while(mounted.current){const job=await read('/api/integration/research/runs/'+encodeURIComponent(id));setProgress(job.message);
   if(job.status==='completed'){remember(v,null);setReport(job);window.location.assign(job.reportUrl);return;}
   if(job.status==='failed'){remember(v,null);throw Error(job.message);}
   await new Promise(resolve=>setTimeout(resolve,1200));
  }
 }
 async function analyze(){if(!value)return;setBusy(true);setError('');setReport(null);try{
  const response=await fetch('/api/integration/research',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId:value.sessionId,revision:value.revision,recordIds:selected})}),body=await response.json();
  if(!response.ok)throw Error(body.error?.message??'分析失败，请重试');
  if(response.status===202&&typeof body.runId==='string'){remember(value,{id:body.runId,selected});await followRun(value,body.runId);return;}
  if(typeof body.reportUrl!=='string'||!body.reportUrl.startsWith('/flow/reports/'))throw Error('报告入口未返回，请重试');
  setReport(body);window.location.assign(body.reportUrl);
 }catch(e){setError(e instanceof Error?e.message:'分析失败');}finally{setBusy(false);}}
 useEffect(()=>{let active=true;mounted.current=true;(async()=>{
  const boot=await read('/api/a/needs/bootstrap'),url=new URL(location.href),requested=url.searchParams.get('sessionId');
  const saved=boot.sessions.filter((s:any)=>s.mode==='manual'&&s.confirmedRevisions.length);
  const session=requested?saved.find((s:any)=>s.id===requested):saved.at(-1);
  if(!session)throw Error('还没有可用于调查的已确认侧写，请先在 A 中确认并保存。');
  const revision=url.searchParams.has('revision')?Number(url.searchParams.get('revision')):Math.max(...session.confirmedRevisions);
  if(!session.confirmedRevisions.includes(revision))throw Error('指定的侧写版本不存在，请从已保存的侧写重新进入。');
  const query=new URLSearchParams({sessionId:session.id,revision:String(revision)});
  const next=await read('/api/integration/research?'+query);
  if(active){setValue(next);url.searchParams.set('sessionId',session.id);url.searchParams.set('revision',String(revision));history.replaceState(null,'',url);
   let stored:any=null;try{stored=JSON.parse(localStorage.getItem(storageKey(next))??'null');}catch{}
   if(stored?.id){setSelected(Array.isArray(stored.selected)?stored.selected:[]);setBusy(true);void followRun(next,stored.id).catch(e=>{if(mounted.current){remember(next,null);setError(e.message);}}).finally(()=>{if(mounted.current)setBusy(false);});}
  }
 })().catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;mounted.current=false;};},[]);
 return <div className="shell b-workspace b-profile-workspace">
  <header className="topbar"><a className="brand" href="/">求职 X-Ray</a><nav className="nav"><a href="/history">继续上次的判断</a></nav><span className="b-stage">B · 公司与岗位调查</span></header>
  <main className="main">
   <div className="eyebrow">已确认需求 → 调查候选 → 判断报告</div>
   <div className="heading-row"><div><h1>公司与岗位调查</h1><p className="sub">从你的求职方向出发，选出值得继续了解的岗位。</p></div>{value&&<span className="tag">侧写版本 {value.revision}</span>}</div>
   {loading&&<section className="panel b-message"><p role="status">正在接收你的用户侧写…</p></section>}
   {error&&!value&&<section className="panel b-message"><p className="b-error" role="alert">{error}</p><a className="button" href="/profile?home=1">返回 A →</a></section>}
   {value&&<div className="layout">
    <aside className="panel filters">
     <div className="eyebrow">你的已确认需求</div><h2 className="panel-title">你的求职方向</h2>
     <div className="b-profile-group"><span className="b-label">求职目标</span><p>{value.goals.join('、')||'未确定'}</p><span className="b-label">行业与岗位</span><p>{value.industries.join('、')||'行业未确定'}<br/>{value.roles.join('、')||'岗位未确定'}</p></div>
     <h3>现实条件</h3><div className="b-conditions">{value.conditions.map(c=><div className="b-condition" key={c.label}><span className="b-label">{c.label}{c.strength==='hard'?<span className="b-strength">必须满足</span>:c.strength==='soft'?<span className="b-strength b-soft">偏好</span>:null}</span><p>{c.text}</p></div>)}</div>
     <a className="button" href={'/profile?sessionId='+encodeURIComponent(value.sessionId)+'&returnTo=/research'}>查看或修改用户侧写</a>
    </aside>
    <section className="results">
     <section className="panel b-topics"><details><summary>你的七主题调查重点</summary><p className="sub">沿用 A 已确认版本，不需要重新填写。</p>{value.topics.map(t=><div className="b-topic" key={t.title}><h3>{t.title.replaceAll('薪酬透明','薪资高低')} <span className="b-detail-label">{t.priority}</span></h3><p>{t.details.join('；')}</p><p className="notice">{t.policy}</p></div>)}</details></section>
     <section className="panel b-candidates">
      <div className="b-section-heading"><h2>候选公司与岗位</h2><span className="b-count">{value.database.candidateCount} 条岗位线索</span></div>
      <p className="sub">选择一至三个岗位，结合你的需求生成判断报告。</p>
      <p className="b-boundary">线索不等于正在招聘，也不代表已满足全部需求；在招状态和签约主体仍需核实。</p>
      {!value.database.candidates.length&&<div className="empty"><h3>本批资料中暂无符合方向的岗位线索</h3><p>不会自动放宽你确认的必须满足条件；可以继续补充数据库，或回 A 修改需求。</p></div>}
      <div className="b-candidate-list">{value.database.candidates.map(c=><article className={'company-block b-candidate'+(selected.includes(c.recordId)?' is-selected':'')} key={c.recordId}>
       <div className="b-candidate-heading"><label className="b-candidate-choice"><input type="checkbox" checked={selected.includes(c.recordId)} disabled={busy||(!selected.includes(c.recordId)&&selected.length>=3)} onChange={()=>{setSelected(xs=>xs.includes(c.recordId)?xs.filter(id=>id!==c.recordId):[...xs,c.recordId]);setReport(null);}}/><span><strong className="b-job-title">{c.title}</strong><span className="b-company-meta">{c.companyName} · {c.city??'工作城市待确认'}</span></span></label>{selected.includes(c.recordId)&&<span className="b-selected-label">已选择</span>}</div>
       <p className="job-desc">{c.excerpt}</p>
       <p className="source-line">{c.sourceType}{c.sourceUrl&&<> · <a href={c.sourceUrl} target="_blank" rel="noreferrer">查看来源 →</a></>}</p>
       {c.notes.map(n=><p className="b-candidate-note" key={n}>{n}</p>)}
       {c.investigation&&<details className="b-candidate-details"><summary>调查资料 · {c.investigation.filter(i=>i.status!=='unknown').length} 项有线索或材料 / {c.investigation.length} 项待比较</summary><p className="sub">逐项对应你的需求。公司评价和集团报道只提供核验方向，不能代替这份岗位的书面承诺。</p>{c.investigation.map(i=><div className="b-investigation-item" key={i.topic+i.label}><h4>{i.topic.replaceAll('薪酬透明','薪资高低')} · {i.label}</h4><p>{i.explanation}</p>{i.materials.map((m,index)=><div className="b-material-excerpt" key={index}><p className="job-desc">资料节选：{m.text}</p>{m.sources.map((s,n)=><p className="source-line" key={n}>{s.title} · {s.scope==='job'?'这份岗位':s.scope==='team'?'团队层面':s.scope==='business'?'业务层面':'公司或集团层面'} · 来源日期：{s.publishedAt??'未记载'} · 采集：{s.collectedAt??'未记载'}{s.dateNote&&<> · {s.dateNote}</>}{s.url&&<> · <a href={s.url} target="_blank" rel="noreferrer">查看来源</a></>}</p>)}</div>)}{i.gaps.map(g=><p className="notice" key={g}>{g}</p>)}<p className="b-next-step">下一步：{i.question}</p></div>)}</details>}
      </article>)}</div>
      <details className="b-database-note"><summary>资料来源与范围</summary><p className="source-line">本地爬虫数据库 · 已接入 {value.database.counts.companies} 家公司、{value.database.counts.company_jobs} 条岗位记录 · 未独立核验</p><p className="source-line">按 A 的城市、行业与岗位方向找到候选，七主题资料用于后续逐项对照。</p></details>
     </section>
     {value.database.references.length>0&&<section className="panel b-references"><details><summary>另有 {value.database.referenceCount} 条薪资统计参考（不当作在招岗位）</summary>{value.database.references.map(c=><div className="b-topic" key={c.recordId}><h3>{c.companyName} · {c.title}</h3><p>{c.excerpt}</p>{c.sourceUrl&&<a href={c.sourceUrl} target="_blank" rel="noreferrer">查看统计来源 →</a>}</div>)}</details></section>}
     {value.database.candidates.length>0&&<section className="panel b-analysis-actions" aria-label="分析所选岗位">
      <div className="b-action-heading"><div><strong>{busy?'调查与分析进行中':selected.length?'已选择 '+selected.length+' 个岗位':'还未选择岗位'}</strong><p className="sub" role="status" aria-live="polite">{busy?(progress||'正在安排补充调查，完成后自动进入 C。'):selected.length?'结合你的侧写，逐项分析这些岗位。':'请勾选上方一至三个岗位。'}</p></div><button className="button primary" disabled={busy||!selected.length} onClick={analyze}>{busy?'正在调查与分析…':'用我的侧写分析所选岗位'}</button></div>
      {value.agent?.enabled&&<p className="notice">点击分析后，将补充调查所选公司的七主题资料。新资料作为待核验线索；调查失败或超时仍使用已有资料生成报告。</p>}{error&&<p className="b-error" role="alert">{error}</p>}
     </section>}
     {report&&<section className="panel b-message"><h2>C 分析已生成</h2>{report.warnings.map(w=><p key={w}>{w}</p>)}<a className="button primary" href={report.reportUrl}>查看分析报告 →</a></section>}
    </section>
   </div>}
  </main>
 </div>;
}
