"use client";
import {useEffect,useState} from 'react';
import './workspace.css';
type Handoff={sessionId:string;revision:number;goals:string[];industries:string[];roles:string[];conditions:{label:string;text:string;strength:string}[];topics:{title:string;priority:string;details:string[];policy:string}[];candidateCount:number;coverage:{topic:string;status:string;reason:string}[]};
async function read(url:string){const r=await fetch(url,{cache:'no-store'}),body=await r.json();if(!r.ok)throw Error(body.error?.message??'无法读取已保存的用户侧写');return body;}
export function ProfileResearchWorkspace(){
 const [value,setValue]=useState<Handoff|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 useEffect(()=>{let active=true;(async()=>{
  const boot=await read('/api/a/needs/bootstrap'),url=new URL(location.href),requested=url.searchParams.get('sessionId');
  const saved=boot.sessions.filter((s:any)=>s.mode==='manual'&&s.confirmedRevisions.length);
  const session=requested?saved.find((s:any)=>s.id===requested):saved.at(-1);
  if(!session)throw Error('还没有可用于调查的已确认侧写，请先在 A 中确认并保存。');
  const revision=url.searchParams.has('revision')?Number(url.searchParams.get('revision')):Math.max(...session.confirmedRevisions);
  if(!session.confirmedRevisions.includes(revision))throw Error('指定的侧写版本不存在，请从已保存的侧写重新进入。');
  const query=new URLSearchParams({sessionId:session.id,revision:String(revision)});
  const next=await read('/api/integration/research?'+query);
  if(active){setValue(next);url.searchParams.set('sessionId',session.id);url.searchParams.set('revision',String(revision));history.replaceState(null,'',url);}
 })().catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
 return <div className="shell b-workspace"><header className="topbar"><a className="brand" href="/">求职 X-Ray</a><nav className="nav"><a href="/history">继续上次的判断</a></nav></header><main className="main">
  <div className="eyebrow">B · 公司与岗位调查</div><div className="heading-row"><div><h1>公司与岗位调查</h1><p className="sub">根据你已确认的用户侧写，寻找并调查公司与岗位。</p></div>{value&&<span className="tag">侧写版本 {value.revision}</span>}</div>
  {loading&&<p role="status">正在接收你的用户侧写…</p>}{error&&<section className="panel"><p role="alert">{error}</p><a href="/profile?home=1">返回 A →</a></section>}
  {value&&<div className="layout"><aside className="panel filters"><h2 className="panel-title">你的求职方向</h2><p>行业：{value.industries.join('、')||'未确定'}</p><p>岗位：{value.roles.join('、')||'未确定'}</p><h3>现实条件</h3>{value.conditions.map(c=><p key={c.label}>{c.label}：{c.text}{c.strength==='hard'?'（必须满足）':c.strength==='soft'?'（偏好）':''}</p>)}<a className="button" href={'/profile?sessionId='+encodeURIComponent(value.sessionId)+'&returnTo=/research'}>查看或修改用户侧写</a></aside>
   <section className="results"><section className="panel"><h2>已接收你的用户侧写</h2><p>以下调查重点沿用 A 的选择，不需要重新填写需求或招聘原文。</p>{value.topics.map(t=><div key={t.title}><h3>{t.title} · {t.priority}</h3><p>{t.details.join('；')}</p><p className="notice">{t.policy}</p></div>)}</section>
    <section className="panel"><h2>候选公司与岗位</h2><div className="empty"><h3>岗位数据源尚未接入</h3><p>你的侧写已经传入 B。接入岗位数据后，候选将在这里展示；目前尚未执行实际岗位检索，不代表没有符合需求的岗位。</p><p>当前没有候选资料可交给 C，不生成虚构判断。</p></div><p className="notice">资料状态：未接入 · 未使用合成演示数据</p></section>
   </section></div>}
 </main></div>;
}
