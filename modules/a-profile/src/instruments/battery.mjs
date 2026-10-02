import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {mini,dimensions} from './registry.mjs';
const big=JSON.parse(readFileSync(new URL('./mini-ipip.json',import.meta.url),'utf8'));
export const bigLabels={extraversion:'外向表达',agreeableness:'合作与体谅',conscientiousness:'条理与尽责',neuroticism:'情绪波动（神经质方向）',intellect_imagination:'智力／想象倾向'};
export const tools={
 'onet-mini-ip':{...mini,instrumentId:mini.instrument,instrumentVersion:mini.version,scoringVersion:'mini-sum-0-4-1',locale:'en',dimensions,min:0,max:4,rawMin:0,rawMax:20,sourceHash:mini.sourceSHA256,validationStatus:'source_supported',translationVersion:null,licenseRoute:'CC-BY-ND-4.0',enabled:true},
 'mini-ipip':{...big,instrumentId:big.instrument,instrumentVersion:big.version,name:'Mini-IPIP · 官方英文20题',dimensions:Object.keys(bigLabels),min:1,max:5,rawMin:4,rawMax:20,validationStatus:'source_supported',translationVersion:null,licenseRoute:'public-domain',enabled:true,responseScale:['Very Inaccurate','Moderately Inaccurate','Neither Inaccurate nor Accurate','Moderately Accurate','Very Accurate'].map((text,i)=>({value:i+1,text}))}
};
export const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
export const hash=x=>createHash('sha256').update(JSON.stringify(canonical(x))).digest('hex');
export function instrument(id){const t=tools[id];if(!t?.enabled)throw new Error('工具未连接或未启用');return t;}
export function publicTools(){return Object.values(tools).map(t=>({...t,itemCount:t.items.length,originalValidation:'source-tool-research',chineseValidation:'unknown',implementationValidation:'engineering-tests-only',norms:null,thresholds:null,confidence:null}));}
export function canonicalResponses(responses,tool){
 if(!Array.isArray(responses))throw new Error('responses必须为数组，避免重复题号被JSON对象覆盖');
 const out={};for(const r of responses){if(!r||typeof r.itemId!=='string'||Object.hasOwn(out,r.itemId))throw new Error('重复或非法题号');
  if(!tool.items.some(q=>q.id===r.itemId)||!(r.value===null||Number.isInteger(r.value)&&r.value>=tool.min&&r.value<=tool.max))throw new Error('未知题号或非法答案');out[r.itemId]=r.value;
 }return out;
}
export function assess(id,answers){
 const t=instrument(id);canonicalResponses(Object.entries(answers).map(([itemId,value])=>({itemId,value})),t);
 const answered=t.items.filter(q=>Number.isInteger(answers[q.id])).length,complete=answered===t.items.length;
 const scores=t.dimensions.map(d=>{const qs=t.items.filter(q=>q.dimension===d),n=qs.filter(q=>Number.isInteger(answers[q.id])).length;
  const raw=n===qs.length?qs.reduce((s,q)=>s+(q.reverseScored?t.max+t.min-answers[q.id]:answers[q.id]),0):null;
  return {dimension:d,raw,normalized:raw===null?null:(raw-t.rawMin)/(t.rawMax-t.rawMin),answeredItems:n,totalItems:qs.length};});
 return {instrumentId:id,instrumentVersion:t.instrumentVersion,scoringVersion:t.scoringVersion,locale:t.locale,validationStatus:t.validationStatus,
  translationVersion:null,chineseValidation:'unknown',complete,completeness:answered/t.items.length,scores,answersHash:hash(Object.fromEntries(t.items.map(q=>[q.id,answers[q.id]??null]))),confidence:null,
  displayTransform:'normalized * 100; range display, not percentile',missingPolicy:'product rule: no imputation; incomplete battery not interpreted',thresholds:null,norms:null};
}
