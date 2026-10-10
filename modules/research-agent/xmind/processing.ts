import {createHash} from 'node:crypto';
import type {CandidateBundle} from '../../../packages/contracts';
import type {XmindExecution} from './schema';
/** Chinese character shingles: bounded, explainable candidate grouping, not accuracy claims. */
export function textSimilarity(a:string,b:string){
 const grams=(text:string)=>{const t=text.normalize('NFKC').toLowerCase().replace(/\s+/g,'').slice(0,4000);return new Set(Array.from({length:Math.max(0,t.length-2)},(_,i)=>t.slice(i,i+3)));};
 const left=grams(a),right=grams(b);if(left.size<12||right.size<12)return 0;
 const intersection=[...left].filter(v=>right.has(v)).length;return intersection/(left.size+right.size-intersection);
}
export function groupSources(bundle:CandidateBundle,x:XmindExecution){
 const items=bundle.evidence.filter(e=>e.sourceType.startsWith('agent_v3')).slice(0,100);let comparisons=0;
 for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length&&comparisons++<2000;j++){
  const a=items[i],b=items[j];if(a.companyId!==b.companyId||a.excerpt.length<40||b.excerpt.length<40||x.lineage.some(r=>r.from===a.evidenceId&&r.to===b.evidenceId||r.to===a.evidenceId&&r.from===b.evidenceId)||x.lineage.length>=1000)continue;
  const score=textSimilarity(a.excerpt,b.excerpt);if(score>=0.85)x.lineage.push({from:a.evidenceId,to:b.evidenceId,kind:'near_duplicate',score,reason:'中文字符三元组重合≥0.85；仅标待核同源，不删除原文、不判断真假'});
 }
 // Opt-in, explicitly structured user text. Free prose is never treated as account metadata.
 for(const e of items.filter(e=>e.sourceType==='agent_v3_user_text')){
  for(const line of e.excerpt.split('\n')){
   const match=line.match(/^\[群聊元数据\] 账号=([^\s]{1,80}) 时间=(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:Z|[+-]\d\d:\d\d)) 外链=(https?:\/\/[^\s]+)$/);
   if(match&&Number.isFinite(Date.parse(match[2]))&&x.propagation.observations.length<1000)x.propagation.observations.push({evidenceId:e.evidenceId,account:'declared-'+createHash('sha256').update(match[1]).digest('hex').slice(0,20),at:match[2],outboundUrls:[match[3]]});
  }
 }
 const observations=x.propagation.observations;
 if(!observations.length)return;
 x.propagation.status='signals_only';x.propagation.reason='仅使用主动导入的显式账号、时区时间和外链；不认定机器人、水军、协调意图或内容虚假';
 for(let i=0;i<observations.length;i++)for(let j=i+1;j<observations.length&&x.propagation.signals.length<1000;j++){
  const a=observations[i],b=observations[j];if(a.account===b.account||a.evidenceId===b.evidenceId)continue;
  if(a.outboundUrls.some(u=>b.outboundUrls.includes(u))&&Math.abs(Date.parse(a.at!)-Date.parse(b.at!))<=300000)x.propagation.signals.push({kind:'short_time_same_link',evidenceIds:[a.evidenceId,b.evidenceId],reason:'不同声明账号在五分钟内分享同一外链；账号真实性、样本完整性及分享原因未知'});
 }
}
