'use client';
import {use,useEffect,useState} from 'react';
import {readMaterialFile} from '@/modules/research-agent/xmind/file-import';
export default function EvidenceUpdate({params}:{params:Promise<{id:string}>}){
 const {id}=use(params),[text,setText]=useState(''),[file,setFile]=useState<File|null>(null),[urls,setUrls]=useState(''),[busy,setBusy]=useState(true),[message,setMessage]=useState(''),[next,setNext]=useState(''),[refresh,setRefresh]=useState<any[]>([]);
 async function request(path:string,body?:unknown){const r=await fetch(path,{method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();if(!r.ok)throw Error(data.error?.message??'无法读取报告');return data;}
 useEffect(()=>{request('/api/integration/reports/'+id+'/investigation').then(d=>setRefresh(d.agentV3?.xmindLifecycle?.refreshQuestions??[])).catch(e=>setMessage(String(e))).finally(()=>setBusy(false));},[id]);
 async function update(reason:'new_material'|'expired_source'){
  setBusy(true);setMessage('正在核对新材料、更新问题判断并保存新报告…');try{
   const importIds:string[]=[];
   if(text.trim())importIds.push((await request('/api/integration/materials',{kind:'text',title:'用户主动补充材料',content:text})).importId);
   if(file)importIds.push((await request('/api/integration/materials',await readMaterialFile(file))).importId);
   const sourceUrls=urls.split('\n').map(v=>v.trim()).filter(Boolean);
   const result=await request('/api/integration/reports/'+id+'/sources-update',{reason,v3:{discovery:sourceUrls.length||reason==='expired_source'?'bounded':'supplied_only',importIds,sourceUrls}});
   setNext(result.reportUrl);setMessage('已保存新报告，原报告仍可打开。新材料仍按来源陈述处理。');
  }catch(e){setMessage(String(e));}finally{setBusy(false);}
 }
 return <main style={{maxWidth:860,margin:'32px auto',padding:20,fontFamily:'system-ui'}}><h1>补充材料并更新调查</h1><p>沿用本报告的候选和已确认需求。原件保存在本机，新旧报告分别归档。</p><p><label>文字或面试反馈<textarea style={{display:'block',width:'100%',minHeight:140}} value={text} onChange={e=>setText(e.target.value)} disabled={busy}/></label></p><p><label>文件或截图（最多18MB）<input type="file" accept=".pdf,.docx,.xlsx,.csv,.png,.jpg,.jpeg,.txt,.md" onChange={e=>setFile(e.target.files?.[0]??null)} disabled={busy}/></label></p><p><label>可访问公共原文链接（每行一个，最多四个）<textarea style={{display:'block',width:'100%'}} value={urls} onChange={e=>setUrls(e.target.value)} disabled={busy}/></label></p><button disabled={busy||!text.trim()&&!file&&!urls.trim()} onClick={()=>update('new_material')}>核对材料并生成新报告</button>{refresh.length>0&&<section><h2>需要更新的材料</h2>{refresh.map(q=><p key={q.questionId}>{q.reason} 可接受材料：{q.acceptableMaterials}</p>)}<button disabled={busy} onClick={()=>update('expired_source')}>对过期问题做有界补查</button></section>}<p role="status">{message}</p>{next&&<p><a href={next}>打开更新后的报告</a></p>}<p><a href={'/flow/reports/'+id}>返回原报告</a></p></main>;
}
