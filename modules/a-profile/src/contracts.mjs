export function assert(condition,message){if(!condition)throw new Error(message);}
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
const strings=x=>Array.isArray(x)&&x.every(v=>typeof v==='string'&&v.trim().length>0);
const nullableString=x=>x===null||typeof x==='string'&&x.trim().length>0;
const value=x=>x===null||typeof x==='boolean'||typeof x==='number'&&Number.isFinite(x)||typeof x==='string'&&x.trim().length>0||strings(x);
export const keys=['city','min_fixed_monthly_salary','accept_sales_kpi','accept_travel','accept_outsourcing'];
export function validatePreference(p,confirmed=true){
 assert(object(p)&&keys.includes(p.key)&&['hard','soft','unknown'].includes(p.strength)&&value(p.value),'偏好字段非法');
 if(confirmed)assert(typeof p.confirmed==='boolean','缺少偏好确认状态');
 assert(p.strength!=='unknown'||p.value===null,'未知偏好必须为null');
 assert(p.strength==='unknown'||p.value!==null,'已知偏好不能使用null');
 if(p.value!==null){if(p.key==='city')assert(strings(p.value)&&p.value.length>0,'已知城市必须为非空数组');else if(p.key==='min_fixed_monthly_salary')assert(Number.isFinite(p.value)&&p.value>=0,'月薪必须为非负数');else assert(typeof p.value==='boolean','接受条件必须为布尔值');}
}
export function validateProfile(p){
 assert(object(p)&&p.schemaVersion==='1.0.0','画像契约版本错误');
 for(const k of ['profileId','projectId'])assert(typeof p[k]==='string'&&p[k].length>0,`缺少${k}`);
 assert(Number.isInteger(p.revision)&&p.revision>0&&['demo','manual','live'].includes(p.mode),'画像版本或模式错误');
 assert(p.confirmedAt===null||typeof p.confirmedAt==='string'&&Number.isFinite(Date.parse(p.confirmedAt)),'确认时间错误');
 const a=p.assessment;assert(object(a)&&typeof a.instrumentId==='string'&&typeof a.version==='string'&&object(a.scores)&&typeof a.interpretation==='string'&&['draft','confirmed'].includes(a.status)&&['prototype','validated'].includes(a.validation),'测评字段错误');
 assert(Object.values(a.scores).every(v=>v===null||Number.isFinite(v)&&v>=0&&v<=100),'分数错误');
 assert((a.status==='confirmed')===(p.confirmedAt!==null),'确认状态不一致');
 const b=p.background;assert(object(b)&&nullableString(b.education)&&nullableString(b.major)&&strings(b.skills)&&Array.isArray(b.experiences),'经历字段错误');
 b.experiences.forEach(e=>assert(object(e)&&typeof e.text==='string'&&e.text.trim()&&['user','resume'].includes(e.source)&&typeof e.confirmed==='boolean','经历条目错误'));
 assert(strings(p.goals)&&Array.isArray(p.preferences),'目标或偏好错误');p.preferences.forEach(x=>validatePreference(x));
 assert(new Set(p.preferences.map(x=>x.key)).size===p.preferences.length,'重复偏好');return p;
}
export function validateIntent(i,p){
 assert(object(i)&&i.schemaVersion==='1.0.0'&&typeof i.intentId==='string'&&i.intentId&&Number.isInteger(i.revision)&&i.revision>0,'意向版本错误');
 assert(i.projectId===p.projectId&&i.profileId===p.profileId&&i.profileRevision===p.revision&&i.mode===p.mode,'意向与画像引用不一致');
 assert(p.assessment.status==='confirmed','画像尚未确认');
 ['industryTags','industryCodes','roleTypes','cities'].forEach(k=>assert(strings(i[k]),`${k}必须为字符串数组`));
 assert(Array.isArray(i.filters)&&Number.isInteger(i.maxCandidates)&&i.maxCandidates>=1&&i.maxCandidates<=20,'候选数量或筛选条件错误');
 i.filters.forEach(f=>{validatePreference(f,false);assert(f.strength!=='hard'||p.preferences.some(x=>x.key===f.key&&x.confirmed&&x.strength==='hard'&&JSON.stringify(x.value)===JSON.stringify(f.value)),'硬筛选缺少已确认依据');});
 assert(new Set(i.filters.map(x=>x.key)).size===i.filters.length,'重复筛选');
 for(const pref of p.preferences){const f=i.filters.find(x=>x.key===pref.key);assert(f,'意向遗漏画像中的偏好');assert(f.strength===(pref.confirmed?pref.strength:'unknown')&&JSON.stringify(f.value)===JSON.stringify(pref.confirmed?pref.value:null),'筛选与确认后的画像不一致');}
 const city=p.preferences.find(x=>x.key==='city'&&x.confirmed);if(city)assert(JSON.stringify(i.cities)===JSON.stringify(city.value??[]),'意向城市与已确认画像不一致');return i;
}
export function validateExport(x){assert(object(x),'导入必须为对象');validateProfile(x.UserProfile);validateIntent(x.SearchIntent,x.UserProfile);return x;}
