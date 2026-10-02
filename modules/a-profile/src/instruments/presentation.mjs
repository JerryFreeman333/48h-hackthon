import {readFileSync} from 'node:fs';
import {tools} from './battery.mjs';
const chinese=JSON.parse(readFileSync(new URL('./mini-ipip.zh-CN.draft.json',import.meta.url),'utf8'));
const original=tools['mini-ipip'];
if(chinese.items.length!==original.items.length||chinese.sourceHash!==original.sourceHash)throw new Error('译稿来源或题数不一致');
for(const q of chinese.items){const src=original.items.find(x=>x.id===q.id);if(!src||src.originalText!==q.originalText||src.dimension!==q.dimension||!!src.reverseScored!==q.reverseScored||!q.chineseText)throw new Error('译稿修改了题目身份或计分key');}
if(JSON.stringify(chinese.responseScale.map(c=>c.value))!==JSON.stringify(original.responseScale.map(c=>c.value)))throw new Error('译稿修改了选项编码');
export function presentation(id,locale='en',version=null){
 const t=tools[id];if(!t)throw new Error('未知工具');
 if(locale==='en'){if(version!==null)throw new Error('英文呈现不能带中文翻译版本');return {locale:'en',translationVersion:null,chineseValidation:'unknown'};}
 if(id!=='mini-ipip'||locale!=='zh-CN'){const e=new Error('O*NET中文译稿未完成开发者许可要求的验证，未发布或启用；请使用原英文题本');e.code='translation_not_released';e.status=422;throw e;}
 if(version!==null&&version!==chinese.translationVersion)throw new Error('翻译版本不支持');
 return {locale:'zh-CN',translationVersion:chinese.translationVersion,chineseValidation:'not-validated'};
}
export function decorateTools(items){return items.map(t=>({...t,defaultLocale:t.instrumentId==='mini-ipip'?'zh-CN':'en',availableLocales:t.instrumentId==='mini-ipip'?['en','zh-CN']:['en'],chineseDraft:t.instrumentId==='mini-ipip'?chinese:null}));}
export function defaultPresentation(id){return presentation(id,id==='mini-ipip'?'zh-CN':'en');}
export {chinese as miniIpipChinese};
