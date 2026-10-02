// Product navigation rules. Existing IDs and shared contracts stay unchanged.
export const goalBranches={
 exploring:['clarify_direction'],
 internship:['find_internship'],
 graduate:['find_first_job','find_internship','clarify_direction'],
 changing:['change_job','transition_role','clarify_direction']
};
export const expectationIds=['increase_income','better_balance'];
export const primaryGoalIds=['clarify_direction','find_internship','find_first_job','change_job','transition_role'];
export function validateGoalBranch(stageId,goalIds){
 const tasks=goalIds.filter(id=>primaryGoalIds.includes(id));
 if(tasks.length>1)throw new Error('请只选择一个当前求职任务；收入和生活平衡可另外多选');
 if(tasks.length&&(!stageId||!goalBranches[stageId]?.includes(tasks[0])))throw new Error('当前求职任务与求职阶段不一致，请重新选择');
 return goalIds;
}
