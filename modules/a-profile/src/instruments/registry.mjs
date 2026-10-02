import {readFileSync} from 'node:fs';
const bank=JSON.parse(readFileSync(new URL('./onet-mini-ip.json',import.meta.url),'utf8'));
export const labels={realistic:'实践活动兴趣',investigative:'研究活动兴趣',artistic:'创作活动兴趣',social:'助人活动兴趣',enterprising:'经营与推动活动兴趣',conventional:'组织与记录活动兴趣'};
export const dimensions=Object.keys(labels);
export const mini=Object.freeze({...bank,name:'O*NET® Mini Interest Profiler',enabled:true,
 responseScale:[{value:0,text:'Strongly dislike'},{value:1,text:'Dislike'},{value:2,text:'Unsure'},{value:3,text:'Like'},{value:4,text:'Strongly like'}],
 evidence:{originalTool:'official-development-and-validation',chineseVersion:'unknown',thisImplementation:'not-independently-validated'},
 license:{id:'CC-BY-ND-4.0',url:'https://www.onetcenter.org/license_tools.html',translation:'not-performed'},
 scoringSource:{url:'https://www.onetcenter.org/dl_files/Mini-IP.pdf',printedPage:13,pdfPage:12},
 interpretationSource:{url:'https://www.onetcenter.org/dl_files/IP_Manual.pdf',printedPage:33,pdfPage:33},
 missingRule:null,thresholds:null,norms:null,
 limitations:['仅提供官方英文完整30题；没有可用的经验证中文题本。','Unsure=2，是有效答案；缺答不是Unsure。','只解释六个兴趣领域的相对排序，不推断能力、创业适合度、风险承受力或公司适配。']});
export const skipped=Object.freeze({instrument:'not-administered',version:'1',language:null,name:'暂不测评',enabled:true,items:[]});
const registry=new Map([[mini.instrument,mini],[skipped.instrument,skipped]]);
export function getInstrument(id){const instrument=registry.get(id);if(!instrument?.enabled)throw new Error('工具未启用或已封存');return instrument;}
export function describeInstruments(){return [...registry.values()].map(({items,...x})=>({...x,itemCount:items.length}));}
export function itemProvenance(){return mini.items.map(x=>({...x,instrument:mini.instrument,version:mini.version,responseScale:mini.responseScale,reverseScored:false,source:mini.source,licenseStatus:mini.license.id,chineseSource:null,translationStatus:'original-English-unmodified',validationStatus:mini.evidence,dimensionScore:'sum of 5 responses, range 0–20',missingRule:null,thresholds:null,norms:null}));}
