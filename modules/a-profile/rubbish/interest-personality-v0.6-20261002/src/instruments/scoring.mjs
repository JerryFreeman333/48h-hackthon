import {mini,dimensions,labels,getInstrument} from './registry.mjs';
export function validateAnswers(answers,instrumentId=mini.instrument){
 const instrument=getInstrument(instrumentId);
 if(!answers||typeof answers!=='object'||Array.isArray(answers))throw new Error('答案必须为对象');
 for(const [id,v] of Object.entries(answers))if(!instrument.items.some(x=>x.id===id)||!(v===null||Number.isInteger(v)&&v>=0&&v<=4))throw new Error(`非法答案 ${id}`);
}
export function score(answers,instrumentId=mini.instrument){
 const instrument=getInstrument(instrumentId);validateAnswers(answers,instrumentId);
 const complete=instrument.items.length>0&&instrument.items.every(q=>Number.isInteger(answers[q.id]));
 const coverage=Object.fromEntries(dimensions.map(d=>{const qs=instrument.items.filter(x=>x.dimension===d);return [d,{answered:qs.filter(x=>Number.isInteger(answers[x.id])).length,total:qs.length}];}));
 const rawScores=Object.fromEntries(dimensions.map(d=>[d,complete?instrument.items.filter(x=>x.dimension===d).reduce((sum,x)=>sum+answers[x.id],0):null]));
 // UI conversion only. This is neither an official raw score nor a percentile.
 const scores=Object.fromEntries(dimensions.map(d=>[d,rawScores[d]===null?null:rawScores[d]*5]));
 const ranked=complete?[...new Set(Object.values(rawScores))].sort((a,b)=>b-a).map(v=>({rawScore:v,dimensions:dimensions.filter(d=>rawScores[d]===v)})):[];
 const interpretation=complete?`本次自报兴趣按原始分从高到低：${ranked.map(g=>g.dimensions.map(d=>labels[d]).join(' / ')+'（'+g.rawScore+'/20）').join('；')}。同分并列，不强制生成唯一Top 3。兴趣不代表能力或职业成功概率。`:instrument.items.length?'问卷尚未完成，职业兴趣保持未知；不对缺答补值或按比例估算。':'未进行职业兴趣测评；兴趣保持未知。';
 const portrait={instrumentId:instrument.instrument,version:instrument.version,language:instrument.language,validation:'prototype',basis:complete?'官方英文题本与正式原始分规则；本产品实现尚未独立验证。':'没有可解释的完整测评结果。',complete,rawScores,displayScores:scores,displayTransform:'raw / 20 * 100; UI linear conversion, not percentile',ranking:ranked,coverage,interpretation,limitations:mini.limitations,missingPolicy:'产品处理：缺答时不出分，不冒充原工具缺失值规则',evidence:mini.evidence};
 return {scores,rawScores,coverage,interpretation,portrait};
}
