// Product-authored requirements, NOT items from a validated psychometric instrument.
export const version='job-needs-20261002-1';
export const evidenceRelation='topic-support-only-not-item-validation';
export const sources=[
 {id:'weng2010',titleZh:'职业成长与组织承诺',authors:'Weng, McElroy, Morrow & Liu',year:2010,doi:'10.1016/j.jvb.2010.05.003',url:'https://bs.ustc.edu.cn/UserFiles/Editor/file/20130403/20130403212479297929.pdf',locator:'期刊页391–394：摘要、职业成长与测量；PDF第3–6页',scope:'中国在职员工；摘要称10城，方法列出9城；961份可用问卷。职业成长包含职业目标进展、专业发展、晋升和薪酬增长。',limit:'研究的是在职员工成长感受与组织承诺，不是我们的求职需求题；不证明当前岗位能晋升。',access:'original-paper-accessed'},
 {id:'stofberg2022',titleZh:'薪酬透明、离职意向与组织支持及公平',authors:'Stofberg, Bussin & Mabaso',year:2022,doi:'10.1108/ER-02-2022-0077',url:'https://pure.uj.ac.za/en/publications/pay-transparency-job-turnover-intentions-and-the-mediating-role-o/',locator:'原研究机构摘要；Employee Relations 44(7),162–182',scope:'南非4家组织299名员工；研究薪酬信息透明与组织支持、公平及离职意向。',limit:'不能将不透明直接判成违法或诈骗；原研究的在职感知测量不能直接当成求职偏好题。',access:'author-institution-abstract'},
 {id:'pega2021',titleZh:'长工时相关疾病负担的WHO／ILO联合估计',authors:'Pega et al.',year:2021,doi:'10.1016/j.envint.2021.106595',url:'https://pmc.ncbi.nlm.nih.gov/articles/PMC8204267/',locator:'摘要；Environment International 154,106595',scope:'194个国家2000–2016年群体负担分析；研究长工时的健康关联。',limit:'不用于个人健康预测、法律工时阈值或个人风险承受评分。',access:'original-article-indexed-abstract'},
 {id:'tremblay1998',titleZh:'员工福利满意度的决定因素与福利灵活性的影响',authors:'Tremblay, Sire & Pelchat',year:1998,doi:'10.1177/001872679805100505',url:'https://journals.sagepub.com/doi/10.1177/001872679805100505',locator:'出版社摘要；Human Relations 51(5)',scope:'研究员工福利满意度及福利灵活性。',limit:'不是中国五险一金量表；五险一金的合规要求应另按适用法域及用工形式核实。样本细节本次未核实。',access:'publisher-abstract'},
 {id:'cable2002',titleZh:'主观适配感受的聚合与区分效度',authors:'Cable & DeRue',year:2002,doi:'10.1037/0021-9010.87.5.875',url:'https://doi.org/10.1037/0021-9010.87.5.875',locator:'原论文摘要；Journal of Applied Psychology 87(5),875–884',scope:'区分价值观适配、需求供给适配与要求能力适配；两组样本，其中纵向样本187名经理。',limit:'本产品只记录需求及团队工作方式偏好，不据此评估能力或推断整家公司文化。原文完整题本与复制许可本次未确认。',access:'original-paper-indexed-abstract-full-fetch-unavailable'},
 {id:'campello2010',titleZh:'金融危机中融资约束对企业经营的实际影响',authors:'Campello, Graham & Harvey',year:2010,doi:'10.1016/j.jfineco.2010.02.009',url:'https://scholars.duke.edu/publication/774061',locator:'作者所在大学摘要；Journal of Financial Economics 97(3),470–487',scope:'金融危机中的企业融资约束与就业、投资等决策。',limit:'不是公司倒闭预测量表；公开财务不可得、公司小或注册资本低不能直接解释成不稳定。',access:'author-institution-abstract'},
 {id:'sverke2002',titleZh:'工作不安全感及其后果的元分析',authors:'Sverke, Hellgren & Näswall',year:2002,doi:'10.1037/1076-8998.7.3.242',url:'https://pubmed.ncbi.nlm.nih.gov/12148956/',locator:'原论文摘要；Journal of Occupational Health Psychology 7(3),242–264',scope:'工作不安全感与工作态度、健康和行为关系的元分析。',limit:'不能用于预测某岗位裁员概率，不能把求稳偏好解释成人格或能力不足。',access:'original-paper-indexed-abstract'}
];
export const priorities=[{id:'priority',text:'这是我的求职重点'},{id:'secondary',text:'会考虑，但不是当前重点'},{id:'unsure',text:'暂不确定'}];
export const policies=[{id:'verify_first',text:'先核实我关心的项目，再作决定'},{id:'continue_with_unknown',text:'可以继续了解，但保留未知'},{id:'unsure',text:'暂不确定'}];
const topic=(id,title,sourceIds,description,details)=>({id,title,sourceIds,description,details:details.map(([id,text])=>({id,text})),questions:[
 {id:id+'.priority',text:'选择下一份工作时，'+title+'对你有多重要？',kind:'single',options:priorities},
 {id:id+'.details',text:'关于'+title+'，你希望进一步了解哪些具体信息？',kind:'multiple',options:details.map(([id,text])=>({id,text})).concat([{id:'unsure',text:'暂不确定'}])},
 {id:id+'.policy',text:'如果你关心的'+title+'信息还不清楚，你希望如何继续？',kind:'single',options:policies}
]});
export const topics=[
 topic('growth','晋升与成长',['weng2010'],'了解机会和规则，不预测晋升概率，也不评估你的能力。',[
  ['promotion','晋升条件、评审流程与评审周期'],['learning','带教、培训与学习资源'],['path','岗位的发展路径与职责变化'],['pay_growth','调薪条件和规则']]),
 topic('pay','薪酬透明',['stofberg2022'],'关注自己的报酬口径与兑现规则，不要求公开其他员工的私人薪资。',[
  ['fixed','固定工资和浮动报酬分别是多少'],['formula','奖金、绩效或提成的计算与发放规则'],['probation','试用期与转正后的报酬差异'],['payment','发薪时间、税前税后口径及书面约定']]),
 topic('hours','工时与休息',['pega2021'],'了解实际安排和休息边界，不把任何偏好视为放弃依法应有的权益。',[
  ['schedule','正常上下班、轮班或值班安排'],['overtime','加班频率、提前告知与补偿安排'],['rest','每周休息及休假安排'],['after_hours','下班后响应工作消息的要求']]),
 topic('benefits','五险一金与保障',['tremblay1998'],'按工作地区及用工形式核验适用保障。这里选择的是关注重点，不能豁免法定义务。',[
  ['coverage','适用的社保与公积金项目'],['basis','缴纳主体、地点、基数与比例'],['start','从何时开始缴纳及试用期安排'],['verification','如何查询自己的缴纳记录与书面约定']]),
 topic('culture','团队文化与工作方式',['cable2002'],'关注具体团队行为；公司口号或单条匿名评价不能证明实际文化。',[
  ['communication','任务分配、沟通和反馈方式'],['respect','对不同意见、错误和个人边界的处理'],['evaluation','绩效评价标准与申诉渠道'],['collaboration','协作方式、管理支持与团队氛围']]),
 topic('company','企业经营稳定',['campello2010'],'企业持续经营与一个职位是否持续是两件事；资料不公开时保持未知。',[
  ['business','当前主营业务、产品和经营变化'],['public_finance','可获得的公开财务信息及披露日期'],['continuity','业务收缩、扩张或重组的可核查信息'],['payment_record','欠薪等与持续履约有关的可核查记录']]),
 topic('position','职位与用工稳定',['sverke2002'],'关注这份岗位和具体用工安排，不从企业规模推断岗位安全。',[
  ['hiring_reason','新增岗位、替补岗位还是短期项目'],['contract','签约主体、用工形式与合同期限'],['role_change','职责、工作地点或团队可能如何变化'],['probation_rules','试用期考核及岗位变动的书面规则']])
];
export const questions=topics.flatMap(t=>t.questions.map(q=>({...q,topicId:t.id,provenance:{author:'求职 X-Ray A 产品需求采集',version,originalInstrument:null,originalItemNumber:null,itemOrigin:'product-authored',sourceIds:t.sourceIds,evidenceRelation,validationStatus:'not-validated',scoring:'none',reverseScored:null,licenseStatus:'original-product-text-not-copied-scale'}})));
export const catalog={version,measurement:'user-declared-job-needs-not-psychometric-assessment',questionCount:questions.length,topics,questions,sources,priorities,policies};
