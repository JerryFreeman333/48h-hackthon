/** Every A detail has a concrete extraction predicate, including questions that were previously generic. */
export const extraPredicates:Record<string,{pattern:RegExp;required:string[]}>={
 'hours.schedule':{pattern:/上下班|轮班|值班|工作时间|工作日/,required:['mechanism','effectiveConditions','period','role']},
 'benefits.basis':{pattern:/缴纳主体|缴纳地点|缴纳基数|缴纳比例|公积金.{0,15}比例/,required:['mechanism','contractingEntity','period','role']},
 'benefits.start':{pattern:/社保.{0,15}(开始|入职|试用期)|(?:开始|入职|试用期).{0,15}(社保|公积金)/,required:['mechanism','effectiveConditions','period','role']},
 'benefits.verification':{pattern:/缴纳记录|社保查询|公积金查询|缴纳凭证/,required:['mechanism','period','role']},
 'recruitment':{pattern:/招聘状态|招聘截止|招聘批次|职位开放|停止招聘/,required:['mechanism','period','role']},
 'opinion.event':{pattern:/指控|回应|澄清|监管处罚|调查中|裁判/,required:['mechanism','eventStage','period']},
 identity:{pattern:/统一社会信用代码|签约主体|法定代表人|注册地址/,required:['legalName','relation','period']},
 'growth.promotion':{pattern:/晋升|职级|评审|升职/,required:['mechanism','eligibility','period','role']},
 'growth.path':{pattern:/职业发展|发展路径|职责变化|技术序列|管理序列/,required:['mechanism','period','role']},
 'growth.pay_growth':{pattern:/调薪|薪酬增长|工资增长|加薪/,required:['mechanism','eligibility','period','role']},
 'pay.formula':{pattern:/奖金|绩效|提成|浮动报酬/,required:['mechanism','effectiveConditions','period','role']},
 'pay.probation':{pattern:/试用期.{0,25}(工资|薪酬|月薪)|转正.{0,25}(工资|薪酬)/,required:['mechanism','period','role']},
 'pay.payment':{pattern:/发薪|发放工资|工资支付|税前|税后/,required:['mechanism','period','role']},
 'hours.overtime':{pattern:/加班|调休|加班补偿/,required:['mechanism','effectiveConditions','period','role']},
 'hours.after_hours':{pattern:/下班后|非工作时间|工作消息|随时响应/,required:['mechanism','period','role']},
 'culture.communication':{pattern:/沟通|反馈|任务分配|会议/,required:['mechanism','period','role']},
 'culture.respect':{pattern:/不同意见|申诉|错误|尊重|个人边界/,required:['mechanism','period','role']},
 'culture.evaluation':{pattern:/绩效评价|考核标准|绩效考核|申诉渠道/,required:['mechanism','period','role']},
 'culture.collaboration':{pattern:/团队协作|协作方式|管理支持|团队氛围/,required:['mechanism','period','role']},
 'company.continuity':{pattern:/重组|业务收缩|业务扩张|业务调整|停产/,required:['mechanism','period']},
 'company.payment_record':{pattern:/欠薪|拖欠工资|履约|工资支付/,required:['mechanism','eventStage','period']},
 'position.hiring_reason':{pattern:/新增岗位|替补岗位|短期项目|招聘原因|岗位编制/,required:['mechanism','period','role']},
 'position.contract':{pattern:/签约主体|劳动合同|劳务派遣|合同期限|外包/,required:['mechanism','contractingEntity','period','role']},
 'position.role_change':{pattern:/岗位变动|职责变化|工作地点变更|团队调整/,required:['mechanism','period','role']},
 'position.probation_rules':{pattern:/试用期考核|试用期.{0,15}标准|转正条件/,required:['mechanism','period','role']}
};
export function specializedFields(predicate:string,quote:string,fields:Record<string,string|number|boolean|null>){
 const stage=quote.match(/已立案|立案|已受理|受理|一审判决|二审判决|终审判决|执行完毕|已履行|申请执行|执行中|已撤诉|撤诉|指控|回应|调查中/)?.[0]??null;
 if(stage)fields.eventStage=stage;
 const entity=quote.match(/(?:签约主体|合同主体|缴纳主体)[：:]?\s*([^，。；;]{2,80}(?:有限公司|有限责任公司))/)?.[1]??null;
 if(entity)fields.contractingEntity=entity;
 if(predicate==='identity'){fields.legalName=quote.match(/[\u4e00-\u9fffA-Za-z（）()]{2,60}?(?:股份有限公司|有限责任公司|有限公司)/)?.[0]??null;fields.relation=/签约主体|合同主体/.test(quote)?'contracting_entity':/法定代表人|统一社会信用代码/.test(quote)?'registry_statement':null;fields.creditCode=quote.match(/\b[0-9A-Z]{18}\b/)?.[0]??null;}
 if(/无附加条件|无条件|自入职起|仅限|参加条件|适用于/.test(quote))fields.effectiveConditions=quote;
 if(predicate==='finance'){
  const number=quote.match(/(?:营业收入|净利润|现金流)[^\d\-−]{0,12}([-−]?\d+(?:,\d{3})*(?:\.\d+)?)[ ]*(亿元|万元|元)/);
  fields.value=number?Number(number[1].replaceAll(',','').replace('−','-')):null;fields.unit=number?.[2]??null;
  fields.currency=/人民币|CNY/.test(quote)?'CNY':null;
  fields.reportingScope=/合并报表|合并口径/.test(quote)?'consolidated':/母公司报表|母公司口径/.test(quote)?'parent_only':null;
  fields.metric=quote.match(/营业收入|净利润|现金流/)?.[0]??null;
 }
}
