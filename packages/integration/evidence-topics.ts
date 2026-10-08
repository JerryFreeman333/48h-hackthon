import type {CandidateBundle} from '../contracts';
export const EVIDENCE_TOPIC_VERSION='evidence-topics-2';
type Evidence=CandidateBundle['evidence'][number];
export const topicSignals={
 growth:/晋升|升职|职级|内部培训|员工培训|带教|导师|系统学习与实操|轮岗|培养计划/,
 pay:/薪资|薪酬|工资|底薪|固定月薪|月薪|日薪|年薪|提成|发薪|税前|税后/,
 hours:/工时|工作时间|上下班|不打卡|加班|调休|双休|单休|大小周|(?<!\d)996(?!\d)|(?<!\d)995(?!\d)|轮班|下班后/,
 benefits:/五险|六险|社保|公积金|入职即缴|缴纳基数/,
 culture:/团队氛围|管理支持|同事关系|会议较多|注重实效|注重业绩|沟通方式|任务分配|尊重员工|辱骂|个人边界|绩效评价|申诉|工作自主|自主权|不同意见|工作边界|管理压力/,
 position:/裁员|短期项目|替补|新增岗位|劳动合同|签约主体|外包|劳务派遣|岗位调整|团队变动|转正考核/,
 company:/营收|营业收入|净利|亏损|财报|年报|半年度报告|年度报告|融资|业务收缩|重组|欠薪|经营情况|资产总计|总资产|负债合计|货币资金|经营活动产生|短期借款|长期借款/
} as const;
export const needSignals: Record<string, string[]> = {
 'growth.promotion':['晋升','升职','职级','评审'],
 'growth.learning':['内部培训','带教','导师','学习资源','培养计划','系统学习','培训机会','员工培训'],
 'growth.path':['发展路径','职业发展','轮岗','职责变化'],
 'growth.pay_growth':['调薪','涨薪','薪酬增长'],
 'pay.fixed':['底薪','固定工资','固定月薪','基本工资','月薪'],
 'pay.formula':['提成','课时费','奖金','绩效工资','浮动薪酬'],
 'pay.probation':['试用期薪','转正薪','试用工资'],
 'pay.payment':['发薪','发放工资','税前','税后','书面薪酬'],
 'hours.schedule':['上下班','轮班','排班','值班','不打卡','工作时间'],
 'hours.overtime':['加班','调休','加班补偿'],
 'hours.rest':['双休','单休','休假','年假','每周休息'],
 'hours.after_hours':['下班后','工作消息','随时响应','随时待命'],
 'benefits.coverage':['五险','六险','社保','公积金','社会保险'],
 'benefits.basis':['缴纳基数','缴费基数','缴纳比例','缴费比例','缴纳主体','参保地'],
 'benefits.start':['入职即缴','入职缴纳','试用期社保','转正缴纳'],
 'benefits.verification':['缴纳记录','参保记录','社保查询','缴费记录'],
 'culture.communication':['会议较多','任务分配','工作反馈','沟通方式','沟通机制'],
 'culture.respect':['不同意见','个人边界','辱骂','尊重员工','容错'],
 'culture.evaluation':['注重业绩','绩效评价','考核标准','绩效考核','申诉'],
 'culture.collaboration':['团队协作','团队氛围','管理支持','同事关系'],
 'company.business':['主营','营收','业务变化','业务板块','业务覆盖','直播电商业务','经营','产品线'],
 'company.public_finance':['年报','半年度报告','年度报告','净利','财报','财务披露','营收','亏损'],
 'company.continuity':['重组','业务收缩','扩张','裁员','并购','收购','四连亏'],
 'company.payment_record':['欠薪','拖欠工资','欠付工资'],
 'position.hiring_reason':['新增岗位','替补','短期项目','扩招原因'],
 'position.contract':['签约主体','劳动合同','外包','派遣','合同期限'],
 'position.role_change':['岗位调整','职责变化','工作地点变','团队变动'],
 'position.probation_rules':['试用期考核','试用期规则','转正考核'],
};

/** Search topics are provenance, never proof. Classify literal text with one shared rule set. */
export function evidenceTopicLinks(e:Evidence){
 if(e.sourceType==='local_database_field_comparison')return [];
 const out:NonNullable<Evidence['topicLinks']>=[];
 const segments=e.excerpt.split(/(?<=[。；;！!？?\n])/).filter(x=>x.trim());
 for(const topicId of Object.keys(topicSignals) as (keyof typeof topicSignals)[]){
  const quotes:string[]=[],details=new Set<string>();
  for(const quote of segments){
   const customerTraining=/(?:负责|组织|开展|讲授|提供|授课).{0,16}(?:培训|教学)|(?:面向|为|给).{0,12}(?:客户|学员|考生).{0,12}培训/.test(quote)&&!/(?:员工|新人|入职|在职).{0,12}(?:参加|接受|获得|享有|提供|带薪|培训)|带教|带薪内部培训|系统学习与实操/.test(quote);
   const absentTraining=/(?:不|未|没有)(?:提供|安排|设有).{0,8}(?:内部培训|员工培训|带教|学习资源)/.test(quote);
   if(topicId==='growth'&&!absentTraining&&customerTraining&&!/晋升|升职|职级|轮岗/.test(quote))continue;
   const matching=Object.entries(needSignals).filter(([key,words])=>key.startsWith(topicId+'.')&&words.some(word=>quote.includes(word)));
   if(!topicSignals[topicId].test(quote)&&!matching.length)continue;
   quotes.push(quote);matching.forEach(([key])=>details.add(key.split('.')[1]));
  }
  if(quotes.length)out.push({topicId,detailIds:[...details],quotes:[...new Set(quotes)]});
 }
 return out;
}
export function annotateEvidenceTopics(e:Evidence){const links=evidenceTopicLinks(e);if(!links.length&&!e.searchTopics?.length&&!e.topicLinks)return;e.topicLinks=links;e.topicClassifierVersion=EVIDENCE_TOPIC_VERSION;}
