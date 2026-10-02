import {keys,validateProfile,validateIntent} from '../contracts.mjs';
export function exportV1(profile,intent){
 const omitted=profile.constraints.filter(c=>!keys.includes(c.key));
 if(omitted.some(c=>c.confirmed&&c.strength==='hard')){const e=new Error('v1无法表达全部已确认硬条件，请使用v2；禁止静默裁掉条件');e.code='incompatible_hard_constraints';e.status=422;throw e;}
 const a=profile.assessments.find(a=>a.instrumentId==='onet-mini-ip'&&a.complete);
 const scores=Object.fromEntries(['realistic','investigative','artistic','social','enterprising','conventional'].map(d=>[d,a?a.scores.find(s=>s.dimension===d).normalized*100:null]));
 const claims=profile.capabilities.filter(c=>c.status==='confirmed');
 const preferences=profile.constraints.filter(c=>keys.includes(c.key)).map(({evidenceIds,...c})=>c.confirmed?c:{...c,value:null,strength:'unknown'});
 const p={schemaVersion:'1.0.0',profileId:profile.profileId,projectId:profile.projectId,revision:profile.revision,mode:profile.mode,confirmedAt:profile.confirmedAt,
  assessment:{instrumentId:a?.instrumentId??'not-administered',version:a?.instrumentVersion??'1',scores,interpretation:'兴趣原始分0–20，scores仅为量程展示分。多量表及证据没有投影到v1；不代表能力或匹配概率。',status:'confirmed',validation:'prototype'},
  background:{education:claims.find(c=>c.kind==='education')?.description??null,major:claims.find(c=>c.kind==='major')?.description??null,skills:claims.filter(c=>c.kind==='skill').map(c=>c.description),experiences:claims.filter(c=>c.kind==='experience').map(c=>({text:c.description,source:c.evidenceIds.some(id=>profile.evidence.some(e=>e.evidenceId===id&&e.kind==='resume'))?'resume':'user',confirmed:true}))},
  goals:profile.goals.map(g=>g.text),preferences};
 const i={schemaVersion:'1.0.0',intentId:intent.intentId,revision:intent.revision,projectId:p.projectId,profileId:p.profileId,profileRevision:p.revision,mode:p.mode,industryTags:[],industryCodes:[],roleTypes:[],cities:preferences.find(c=>c.key==='city'&&c.confirmed)?.value??[],filters:preferences.map(({confirmed,...c})=>c),maxCandidates:intent.maxCandidates};
 validateProfile(p);validateIntent(i,p);
 return {UserProfile:p,SearchIntent:i,compatibilityWarnings:['v1未传递Mini-IPIP、逐条证据、价值偏好与职业映射；不是等价的完整v2交接。',...omitted.map(c=>'未传递软条件或未知条件：'+c.key),...(intent.selectedDirections.length?['所选O*NET方向没有公共roleTypes映射；v1岗位类型留空，请使用v2保留方向。']:[])]};
}
