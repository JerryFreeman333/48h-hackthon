export const instrumentId = 'career-prototype-48';
export const version = '1';
const groups = [
 ['职业兴趣','realistic',['我愿意动手安装或修理设备。','我喜欢操作工具或制作实物。','我愿意在现场解决具体技术问题。']],
 ['职业兴趣','investigative',['我喜欢寻找现象背后的原因。','我愿意通过数据验证一个猜想。','我喜欢阅读资料并比较不同解释。']],
 ['职业兴趣','artistic',['我喜欢用文字或图像表达想法。','我愿意尝试没有固定答案的创作。','我喜欢为作品寻找新的表现方式。']],
 ['职业兴趣','social',['我愿意耐心了解他人的需要。','我喜欢帮助别人学习新知识。','我愿意通过沟通解决分歧。']],
 ['职业兴趣','enterprising',['我喜欢向他人介绍并推动一个方案。','我愿意组织资源推进一项活动。','我喜欢在协商中争取支持。']],
 ['职业兴趣','conventional',['我喜欢整理记录并检查准确性。','我愿意按照清晰流程完成任务。','我喜欢维护有条理的数据或文件。']],
 ['工作价值','growth',['我看重能学到新技能的工作。','我看重能获得具体反馈的环境。','我看重有机会承担更复杂的任务。','我看重能积累可迁移的经验。','我看重能持续了解专业领域。']],
 ['工作价值','stability',['我看重收入的可预期性。','我看重清晰且稳定的工作安排。','我看重明确的劳动保障。','我看重长期稳定的团队关系。','我看重职责变化前能充分沟通。']],
 ['工作方式','autonomy',['我希望能自己安排完成任务的方法。','我喜欢独立推进一个明确的任务。','我希望对自己的工作节奏有决定空间。','我喜欢先自行探索再寻求帮助。']],
 ['工作方式','collaboration',['我喜欢和同事共同拆解问题。','我愿意频繁交流任务进展。','我喜欢与不同专业的人合作。','我愿意协助同事完成共同目标。']],
 ['情境权衡','balance',['两份工作内容相似时，即使收入更低，我也更倾向选择工时更可控的一份。','高收入伴随频繁临时加班时，我更倾向保留个人时间。','需要长期跨城市奔波的机会，即使成长更快，我也更倾向留在熟悉城市。','品牌知名但日常节奏紧张时，我更倾向节奏可持续的普通公司。']],
 ['情境权衡','responsibility',['大公司职责很窄与小团队承担完整任务之间，我更倾向后者。','成熟流程与探索新业务之间，我更倾向探索新业务。','明确执行任务与自主决定方案之间，我更倾向自主决定方案。','稳定熟悉任务与有学习成本的新任务之间，我更倾向新任务。']],
 ['风险与边界','risk_tolerance',['在基本生活有保障时，我愿意接受业务方向可能调整的工作。','在了解具体条件后，我愿意考虑处于早期阶段的团队。','在有基本保障的情况下，我愿意接受一部分收入随业绩变化。','在有退出选择的情况下，我愿意尝试结果不确定的项目。']]
];
export const labels = {realistic:'动手实践',investigative:'研究探索',artistic:'创作表达',social:'助人沟通',enterprising:'推动协商',conventional:'组织整理',growth:'学习成长',stability:'稳定保障',autonomy:'自主工作',collaboration:'协作交流',balance:'生活边界',responsibility:'探索与责任',risk_tolerance:'接受不确定性'};
export const options = [1,2,3,4,5].map((value,i)=>({id:String(value),text:['很不符合','较不符合','一般','较符合','很符合'][i],value})).concat({id:'unknown',text:'不确定 / 缺少体验',value:null});
export const questions = groups.flatMap(([group,dimension,texts])=>texts.map(text=>({group,dimension,text,options,version,reverse:false,required:false,rationale:'描述本人当前偏好，不证明能力，不直接产生硬约束。'}))).map((q,i)=>({id:`q${String(i+1).padStart(2,'0')}`,...q}));
export function validateAnswers(answers){
 if(!answers || typeof answers!=='object' || Array.isArray(answers)) throw new Error('答案必须为对象');
 for(const [id,v] of Object.entries(answers)) if(!questions.some(q=>q.id===id) || !(v===null || Number.isInteger(v)&&v>=1&&v<=5)) throw new Error(`非法答案 ${id}`);
}
export function score(answers,bank=questions){
 validateAnswers(answers); const scores={},coverage={};
 for(const d of new Set(bank.map(q=>q.dimension))){const qs=bank.filter(q=>q.dimension===d);const values=qs.filter(q=>answers[q.id]!=null).map(q=>q.reverse?6-answers[q.id]:answers[q.id]);coverage[d]={answered:values.length,total:qs.length};scores[d]=values.length/qs.length<.75?null:Math.round((values.reduce((a,b)=>a+b,0)/values.length-1)*25);}
 const interpretation=Object.entries(scores).map(([d,v])=>`${labels[d]}：${v===null?'信息不足':v>=65?'目前自报偏好较明显':v<=35?'目前自报偏好较少':'目前偏好居中'}`).join('；')+'。这是原型问卷结果，不代表能力或职业成功概率。';
 const portrait={instrumentId,version,validation:'prototype',basis:'自编题及原型规则；无常模、信效度或中文验证证据',sections:[...new Set(bank.map(q=>q.group))].map(group=>({group,dimensions:[...new Set(bank.filter(q=>q.group===group).map(q=>q.dimension))].map(d=>({key:d,label:labels[d],score:scores[d],coverage:coverage[d],questionIds:bank.filter(q=>q.dimension===d).map(q=>q.id),unknown:scores[d]===null}))})),interpretation,limitations:['75%覆盖阈值及35/65解释分界为产品原型规则，尚未验证。','分数是回答的描述性汇总，不是能力、概率、常模百分位或硬约束。']};
 return {scores,coverage,interpretation,portrait};
}
