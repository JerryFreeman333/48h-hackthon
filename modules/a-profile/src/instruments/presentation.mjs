import {readFileSync} from 'node:fs';
import {tools} from './battery.mjs';
const chinese=JSON.parse(readFileSync(new URL('./mini-ipip.zh-CN.draft.json',import.meta.url),'utf8'));
const original=tools['mini-ipip'];
if(chinese.items.length!==original.items.length||chinese.sourceHash!==original.sourceHash)throw new Error('译稿来源或题数不一致');
for(const q of chinese.items){const src=original.items.find(x=>x.id===q.id);if(!src||src.originalText!==q.originalText||src.dimension!==q.dimension||!!src.reverseScored!==q.reverseScored||!q.chineseText)throw new Error('译稿修改了题目身份或计分key');}
if(JSON.stringify(chinese.responseScale.map(c=>c.value))!==JSON.stringify(original.responseScale.map(c=>c.value)))throw new Error('译稿修改了选项编码');
export function loadPrivateTranslationDraft(enabled=false){
 if(!enabled)return null;
 const draft=JSON.parse(readFileSync(new URL('../../.translation-drafts/onet-mini-ip.zh-CN.private-draft.json',import.meta.url),'utf8')),t=tools['onet-mini-ip'];
 if(draft.distributionAllowed!==false||draft.releaseStatus!=='blocked-pending-validation-study'||draft.items.length!==30||draft.instrumentVersion!==t.instrumentVersion)throw new Error('私有审校稿状态或题数不正确');
 for(const q of draft.items){const src=t.items.find(x=>x.id===q.id);if(!src||q.originalText!==src.originalText||q.itemNumber!==src.itemNumber||q.dimension!==src.dimension||q.reverseScored!==false||!q.chineseText||q.sourceHash!==t.sourceHash)throw new Error('私有审校稿改变了题目身份或计分');}
 if(JSON.stringify(draft.responseScale.map(c=>[c.value,c.originalText]))!==JSON.stringify(t.responseScale.map(c=>[c.value,c.text])))throw new Error('私有审校稿改变了选项编码');
 return draft;
}
export function presentation(id,locale='en',version=null,privateDraft=null){
 const t=tools[id];if(!t)throw new Error('未知工具');
 if(locale==='en'){if(version!==null)throw new Error('英文呈现不能带中文翻译版本');return {locale:'en',translationVersion:null,chineseValidation:'unknown'};}
 if(id==='onet-mini-ip'&&locale==='zh-CN'&&privateDraft){if(version!==null&&version!==privateDraft.translationVersion)throw new Error('私有审校稿版本不支持');return {locale:'zh-CN',translationVersion:privateDraft.translationVersion,chineseValidation:'not-validated'};}
 if(id!=='mini-ipip'||locale!=='zh-CN'){const e=new Error('O*NET中文仅允许显式开启的本机私有审校预览；公开版本尚未发布');e.code='translation_not_released';e.status=422;throw e;}
 if(version!==null&&version!==chinese.translationVersion)throw new Error('翻译版本不支持');
 return {locale:'zh-CN',translationVersion:chinese.translationVersion,chineseValidation:'not-validated'};
}
export function decorateTools(items,privateDraft=null){return items.map(t=>({...t,defaultLocale:t.instrumentId==='mini-ipip'||privateDraft?'zh-CN':'en',availableLocales:t.instrumentId==='mini-ipip'||privateDraft?['en','zh-CN']:['en'],chineseDraft:t.instrumentId==='mini-ipip'?chinese:privateDraft,privateReviewOnly:t.instrumentId==='onet-mini-ip'&&!!privateDraft}));}
export function defaultPresentation(id,privateDraft=null){return presentation(id,id==='mini-ipip'||privateDraft?'zh-CN':'en',null,privateDraft);}
export {chinese as miniIpipChinese};
