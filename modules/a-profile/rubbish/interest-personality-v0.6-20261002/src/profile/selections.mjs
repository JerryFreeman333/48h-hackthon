// Product choices express user declarations. They are not a psychometric scale.
export const selectionVersion='a-choice-catalog-20261002-1';
export const valueOptions=['收入','稳定','成长','自主','创造','帮助他人','团队支持','认可','生活平衡','地点灵活性'];
export const tradeoffOptions=[
 {id:'growth_over_starting_pay',text:'愿意以较低起薪换取成长机会'},
 {id:'balance_over_pay',text:'愿意以较低收入换取更规律的生活'},
 {id:'stability_over_autonomy',text:'愿意以较少自主空间换取更稳定的工作'},
 {id:'location_over_pay',text:'愿意以较低收入换取在目标城市工作'},
 {id:'autonomy_over_stability',text:'愿意接受收入或工作变化以换取更多自主空间'}
];
export const goalOptions=[
 {id:'clarify_direction',text:'明确职业方向'},
 {id:'find_internship',text:'寻找实习机会'},
 {id:'find_first_job',text:'寻找第一份全职工作'},
 {id:'change_job',text:'寻找新的全职工作'},
 {id:'transition_role',text:'探索转岗机会'},
 {id:'increase_income',text:'提高固定收入'},
 {id:'better_balance',text:'改善工作与生活平衡'}
];
export const stageOptions=[
 {id:'exploring',text:'探索方向'}, {id:'internship',text:'寻找实习'},
 {id:'graduate',text:'应届求职'}, {id:'changing',text:'转岗 / 换工作'}
];
export const cityOptions=['北京','上海','广州','深圳','杭州','南京','苏州','无锡','宁波','温州','合肥','济南','青岛','厦门','福州','武汉','长沙','成都','重庆','西安','郑州','天津','沈阳','大连','长春','哈尔滨','石家庄','太原','南昌','南宁','贵阳','昆明','海口','兰州','银川','西宁','乌鲁木齐','拉萨','呼和浩特','香港','澳门'];
export const salaryOptions=[3000,5000,6000,8000,10000,12000,15000,20000,30000];
export const scheduleOptions=[{value:'daytime',text:'只接受白天工作'},{value:'accept_shifts',text:'可以接受轮班或夜班'}];
export const constraintKeys=['city','min_fixed_monthly_salary','accept_sales_kpi','accept_travel','accept_outsourcing','work_schedule'];
export const conditionLabels={city:'工作城市',min_fixed_monthly_salary:'最低固定月薪',accept_sales_kpi:'销售KPI',accept_travel:'出差',accept_outsourcing:'外包用工',work_schedule:'工作时段'};
export const selectionCatalog={version:selectionVersion,values:valueOptions.map((text,i)=>({id:'value-'+i,text})),tradeoffs:tradeoffOptions,goals:goalOptions,stages:stageOptions,cities:cityOptions,salaries:salaryOptions,schedules:scheduleOptions,conditionLabels};
export function conditionText(c){if(!c.confirmed||c.value===null)return '未知';if(c.key==='work_schedule')return scheduleOptions.find(x=>x.value===c.value)?.text??String(c.value);if(typeof c.value==='boolean')return c.value?'接受':'不接受';if(Array.isArray(c.value))return c.value.join('、');if(c.key==='min_fixed_monthly_salary')return '至少 '+c.value+' 元 / 月（人民币税前固定部分）';return String(c.value);}
const texts=items=>items.map(x=>x.text);
const requireChoices=(xs,allowed,name)=>{if(!Array.isArray(xs)||xs.some(x=>!allowed.includes(x))||new Set(xs).size!==xs.length)throw new Error(name+'只接受当前选项，不接收自由填写');};
export function validateChosenConstraints(xs){
 if(!Array.isArray(xs)||new Set(xs.map(c=>c.key)).size!==xs.length)throw new Error('条件必须为数组且不能重复');
 for(const c of xs){
  if(!constraintKeys.includes(c.key))throw new Error('条件名称只接受预设选项');
  if(c.value===null){if(c.strength!=='unknown')throw new Error('未选择的条件必须保持未知');continue;}
  if(c.key==='city'){requireChoices(c.value,cityOptions,'城市');if(!c.value.length)throw new Error('未选择城市时请使用未知');}
  else if(c.key==='min_fixed_monthly_salary'){if(!salaryOptions.includes(c.value))throw new Error('薪资只接受预设的最低固定月薪');}
  else if(c.key==='work_schedule'){if(!scheduleOptions.some(x=>x.value===c.value))throw new Error('工作时段只接受预设选项');}
  else if(typeof c.value!=='boolean')throw new Error('接受条件只能选择接受、不接受或未知');
 }
}
export function validateChosenGoals(goals,{withStage=false}={}){
 requireChoices(goals,[...texts(goalOptions),...(withStage?texts(stageOptions).map(x=>'当前求职阶段：'+x):[])],'目标');
}
export function validateSelectionDraft(d){
 if(!Array.isArray(d.groups)||d.groups.some(g=>!Array.isArray(g)||!g.length))throw new Error('偏好分组错误');
 requireChoices(d.groups.flat(),valueOptions,'价值偏好');requireChoices(d.tradeoffs,texts(tradeoffOptions),'取舍');
 if(d.tradeoffs.includes(tradeoffOptions[2].text)&&d.tradeoffs.includes(tradeoffOptions[4].text))throw new Error('稳定优先与自主优先两项取舍不能同时选择');
 validateChosenGoals(d.goals);if(d.jobStage!==null&&!texts(stageOptions).includes(d.jobStage))throw new Error('求职阶段只接受预设选项');
 validateChosenConstraints(d.constraints);
 return d;
}
export function validateSelectionProfile(p){
 validateSelectionDraft({groups:p.values.groups,tradeoffs:p.values.tradeoffs,goals:p.goals.filter(g=>!g.text.startsWith('当前求职阶段：')).map(g=>g.text),jobStage:null,constraints:p.constraints});
 validateChosenGoals(p.goals.map(g=>g.text),{withStage:true});
}
// History stays intact; only editable drafts are projected to the current choices.
export function projectSelectionDraft(d={}){
 const groups=(Array.isArray(d.groups)?d.groups:[]).map(g=>(Array.isArray(g)?g:[]).filter(x=>valueOptions.includes(x))).filter(g=>g.length);
 const flat=new Set();const uniqueGroups=groups.map(g=>g.filter(x=>{if(flat.has(x))return false;flat.add(x);return true;})).filter(g=>g.length);
 const tradeoffs=[...new Set((d.tradeoffs??[]).filter(x=>texts(tradeoffOptions).includes(x)))];
 if(tradeoffs.includes(tradeoffOptions[2].text)&&tradeoffs.includes(tradeoffOptions[4].text))tradeoffs.splice(0,tradeoffs.length);
 const constraints=(d.constraints??[]).filter(c=>{try{validateChosenConstraints([c]);return true;}catch{return false;}});
 return {groups:uniqueGroups,tradeoffs,constraints,goals:[...new Set((d.goals??[]).filter(x=>texts(goalOptions).includes(x)))],jobStage:texts(stageOptions).includes(d.jobStage)?d.jobStage:null};
}
export function projectV1Choices(d={}){
 const out={...d};delete out.correction;
 out.goals=(Array.isArray(d.goals)?d.goals:[]).filter(x=>texts(goalOptions).includes(x));
 out.cities=(Array.isArray(d.cities)?d.cities:[]).filter(x=>cityOptions.includes(x));
 out.salary=salaryOptions.includes(d.salary)?d.salary:null;
 out.preferences=(d.preferences??[]).filter(c=>{try{validateChosenConstraints([c]);return true;}catch{return false;}});
 return out;
}
export function selectionSnapshot(p){
 return {version:selectionVersion,values:p.values.groups.flatMap((group,i)=>group.map(text=>({id:selectionCatalog.values.find(v=>v.text===text)?.id??null,priorityGroup:i+1}))),tradeoffIds:p.values.tradeoffs.map(text=>tradeoffOptions.find(x=>x.text===text)?.id??null),goalIds:p.goals.filter(g=>!g.text.startsWith('当前求职阶段：')).map(g=>goalOptions.find(x=>x.text===g.text)?.id??null),stageId:stageOptions.find(x=>p.goals.some(g=>g.text==='当前求职阶段：'+x.text))?.id??null,conditions:p.constraints.map(c=>({key:c.key,value:c.confirmed?c.value:null,strength:c.confirmed?c.strength:'unknown',confirmed:c.confirmed})),measurement:'user-declared-choices-not-psychometric-scores'};
}
