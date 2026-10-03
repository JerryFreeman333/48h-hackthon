import type {CandidateBundle} from '../contracts';

// These rules retrieve passages about a question. They never infer that a benefit
// exists, applies to a job, or satisfies the applicant from a keyword hit.
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
 'culture.communication':['任务分配','工作反馈','沟通方式','沟通机制'],
 'culture.respect':['不同意见','个人边界','辱骂','尊重员工','容错'],
 'culture.evaluation':['绩效评价','考核标准','绩效考核','申诉'],
 'culture.collaboration':['团队协作','团队氛围','管理支持','同事关系'],
 'company.business':['主营','营收','业务变化','业务板块','业务覆盖','直播电商业务','经营','产品线'],
 'company.public_finance':['年报','净利','财报','财务披露','营收','亏损'],
 'company.continuity':['重组','业务收缩','扩张','裁员','并购','收购','四连亏'],
 'company.payment_record':['欠薪','拖欠工资','欠付工资'],
 'position.hiring_reason':['新增岗位','替补','短期项目','扩招原因'],
 'position.contract':['签约主体','劳动合同','外包','派遣','合同期限'],
 'position.role_change':['岗位调整','职责变化','工作地点变','团队变动'],
 'position.probation_rules':['试用期考核','试用期规则','转正考核'],
};

export function extractNeedLeads(bundle:CandidateBundle) {
 for(const evidence of bundle.evidence){
  if(evidence.sourceType==='local_database_field_comparison')continue;
  for(const [detail,signals] of Object.entries(needSignals)){
   if(!signals.some(signal=>evidence.excerpt.includes(signal)))continue;
   const explicitlyAbsentLearning=/(?:不|未|没有)(?:提供|安排|设有).{0,8}(?:内部培训|员工培训|带教|学习资源)/.test(evidence.excerpt);
   if(detail==='growth.learning' && !explicitlyAbsentLearning && /(?:负责|组织|开展|讲授|提供|授课).{0,16}(?:培训|教学)|(?:面向|为|给).{0,12}(?:客户|学员|考生).{0,12}培训/.test(evidence.excerpt) && !/(?:员工|新人|入职|在职).{0,12}(?:参加|接受|获得|享有|提供|带薪|培训)|(?:参加|接受|获得|享有).{0,12}(?:内部培训|培训机会)|带薪内部培训|系统学习与实操/.test(evidence.excerpt))continue;
   const factId=evidence.evidenceId+'-needs-'+detail.replace('.','-');
   if(bundle.facts.some(f=>f.factId===factId))continue;
   bundle.facts.push({factId,companyId:evidence.companyId,jobId:evidence.jobId,key:'needs.'+detail,value:evidence.excerpt,status:evidence.verification==='disputed'?'conflicting':'unknown',evidenceIds:[evidence.evidenceId],asOf:evidence.publishedAt});
  }
 }
}
