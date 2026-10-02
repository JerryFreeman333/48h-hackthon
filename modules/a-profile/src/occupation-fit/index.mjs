import {readFileSync} from 'node:fs';
export const catalog=JSON.parse(readFileSync(new URL('../../data/onet-31.0.json',import.meta.url),'utf8'));
export const domesticSeeds=JSON.parse(readFileSync(new URL('../../data/domestic-seeds.json',import.meta.url),'utf8'));
for(const seed of domesticSeeds.entries){const o=catalog.entries.find(o=>o.onetCode===seed.onetCode);if(!o)throw new Error('浏览别名引用未知职业：'+seed.onetCode);Object.assign(o,{titleZh:seed.titleZh,aliases:seed.aliases,mappingVersion:domesticSeeds.version,reviewStatus:domesticSeeds.reviewStatus});}
export const strategyVersion='interest-pearson-complete-1';
export function pearson(u,o){
 if(!Array.isArray(u)||!Array.isArray(o)||u.length!==6||o.length!==6||![...u,...o].every(Number.isFinite))return {r:null,flag:'insufficient_data'};
 const center=a=>{const mean=a.reduce((s,v)=>s+v,0)/6;return a.map(v=>v-mean);};
 const a=center(u),b=center(o),aa=a.reduce((s,v)=>s+v*v,0),bb=b.reduce((s,v)=>s+v*v,0);
 // Numerical tolerance, not a psychological threshold.
 if(aa<=1e-12||bb<=1e-12)return {r:null,flag:'undifferentiated_profile'};
 return {r:Math.max(-1,Math.min(1,a.reduce((s,v,i)=>s+v*b[i],0)/Math.sqrt(aa*bb))),flag:null};
}
export function fit(profile){
 const a=profile.assessments.find(a=>a.instrumentId==='onet-mini-ip'&&a.complete);
 const u=catalog.dimensions.map(d=>a?.scores.find(s=>s.dimension===d)?.raw??null);
 const status=pearson(u,[1,2,3,4,5,6]).flag;
 const candidates=catalog.entries.map(o=>{const {r,flag}=pearson(u,o.interestVector);return {onetCode:o.onetCode,title:o.title,titleZh:o.titleZh??null,description:o.description,pearsonR:r,interestIndex:r===null?null:(r+1)/2,workFitExperimental:null,missingDataFlags:flag?[flag]:[],evidenceIds:[...(a?[a.evidenceId]:[]),'onet:'+o.onetCode],sourceUrl:o.sourceUrl};});
 candidates.sort((x,y)=>(y.pearsonR??-2)-(x.pearsonR??-2)||x.onetCode.localeCompare(y.onetCode,'en'));
 let rank=0,prev=null;for(let i=0;i<candidates.length;i++){const c=candidates[i];if(c.pearsonR===null){c.rank=null;continue;}if(prev===null||Math.abs(prev-c.pearsonR)>1e-12)rank=i+1;c.rank=rank;prev=c.pearsonR;}
 return {schemaVersion:'2.0.0',profileId:profile.profileId,profileRevision:profile.revision,catalogVersion:catalog.catalogVersion,strategyVersion,status:status??'ranked',numericalTolerance:1e-12,catalogCounts:{loaded:catalog.loadedCount,complete:catalog.completeCount},candidates:status?[]:candidates.slice(0,10),limitations:['仅比较六维兴趣形状，不表示能力、录用概率或国内岗位匹配。','职业数据覆盖美国职业；国内名称与任务映射仍需逐项核查。','工作方式、价值、市场和公司风险未混入此兴趣排序。']};
}
