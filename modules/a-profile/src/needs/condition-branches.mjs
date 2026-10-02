// Existing goal IDs are reused. Historical stage/task snapshots stay readable.
export const opportunities=[
 {id:'find_internship',text:'实习机会'},
 {id:'find_first_job',text:'第一份全职工作'},
 {id:'change_job',text:'新的全职工作（已有全职工作经历）'}
];
export const expectationIds=['increase_income','better_balance'];
export const primaryGoalIds=opportunities.map(x=>x.id);
export function validateOpportunityDraft(stageId,goalIds){
 if(stageId!==null)throw new Error('请选择本次工作机会，不再使用旧求职阶段');
 if(goalIds.some(id=>!primaryGoalIds.includes(id)&&!expectationIds.includes(id)))throw new Error('请重新选择本次工作机会，旧求职任务仅保留在历史版本');
 if(goalIds.filter(id=>primaryGoalIds.includes(id)).length>1)throw new Error('请只选择一种本次主要寻找的工作机会');
}
export function validateHandoff(data){
 validateOpportunityDraft(data.stageId,data.goalIds);
 if(!data.goalIds.some(id=>primaryGoalIds.includes(id)))throw new Error('请选择本次主要寻找的工作机会；未确定时可保存，暂不能确认输出');
 if(!data.industryTags.length)throw new Error('请至少选择一个目标行业；未确定时可保存，暂不能确认输出');
 if(!data.roleTypes.length)throw new Error('请至少选择一种岗位类型；未确定时可保存，暂不能确认输出');
}
