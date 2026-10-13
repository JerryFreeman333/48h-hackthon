// Original product questions for explicit job needs, not a psychometric instrument.
// Stable topic/detail IDs extend the existing A questionnaire without replacing it.
export const refinementVersion='a-needs-refinement-20261013-1';

export const refinementStrengths=[
 {id:'must',text:'必须满足；不满足时我会放弃这份机会'},
 {id:'prefer',text:'更希望如此；可以结合其他条件考虑'},
 {id:'learn',text:'想先了解实际安排；暂不设接受标准'},
 {id:'unknown',text:'暂不确定，对接受标准还没想清楚'}
];

const unsure={id:'unsure',text:'暂不确定',exclusive:true};
const noPreference={id:'no_preference',text:'这些安排都可以，暂没有特别偏好',exclusive:true};
const option=(id,text)=>({id,text});
const question=(topicId,detailId,text,kind,options,suffix='arrangement',when)=>({
 id:`${topicId}.${detailId}.${suffix}`,topicId,detailId,text,kind,
 options:[...options,unsure],...(when?{when}:{})
});

export const refinementQuestions=[
 question('growth','promotion','下一份工作的成长方向，你目前更希望是哪一种？','single',[
  option('specialist','在专业岗位上承担更复杂的工作'),
  option('management','逐步承担人员或项目管理职责'),
  option('both_paths','先了解专业与管理两条路径，再决定'),noPreference]),
 question('growth','learning','进入新岗位时，你更希望有哪些学习支持？','multiple',[
  option('named_support','有明确可以请教的同事或带教人'),
  option('structured_resources','有岗位资料、培训或操作指引'),
  option('practice_feedback','通过实际任务练习，并得到反馈'),
  option('allocated_time','工作安排中留有学习或培训时间'),noPreference]),
 question('growth','path','关于岗位发展，你最想先确定哪一项？','single',[
  option('deeper_expertise','当前岗位能否持续积累专业经验'),
  option('broader_duties','后续是否可能扩大职责或转到相关岗位'),
  option('clear_levels','不同职级的职责、要求和评审规则'),noPreference]),
 question('growth','pay_growth','关于未来调薪，你目前更希望了解什么？','single',[
  option('scheduled_review','何时评估调薪，以及如何申请'),
  option('criteria','调薪依据与本人可以参与的反馈环节'),
  option('position_changes','职位或职责变化后，报酬如何重新约定'),noPreference]),

 question('pay','fixed','对每期收入的构成，你目前更接受哪种安排？','single',[
  option('fixed_first','主要依靠明确的固定工资，浮动部分作为额外收入'),
  option('fixed_variable','可以接受固定工资加奖金、绩效或提成'),
  option('variable_first','可以考虑收入主要随业绩变化的岗位'),noPreference]),
 question('pay','formula','如果岗位包含奖金、绩效或提成，你希望先核对哪些内容？','multiple',[
  option('calculation','计算依据、计入范围和达成条件'),
  option('payment_timing','发放时间，以及结算延迟如何处理'),
  option('adjustments','扣减、追回或规则变更的条件'),
  option('personal_record','本人如何查询计算明细或提出异议'),
  {id:'none',text:'本次只考虑没有浮动报酬的安排',exclusive:true}]),
 question('pay','probation','试用期与转正后的固定报酬，你目前更接受哪种安排？','single',[
  option('same_fixed','希望两阶段的固定报酬一致'),
  option('conditional_difference','可以考虑阶段差异，但需要先明确金额和持续时间'),
  option('check_difference','先了解差异及转正规则，再决定'),noPreference]),
 question('pay','payment','关于报酬结算，你最想先确认哪一项？','single',[
  option('regular_monthly','每月固定日期发放，工资口径明确'),
  option('stage_payment','可以考虑按阶段结算，但需要明确期限和约定'),
  option('written_breakdown','固定工资、浮动收入和税前税后口径分别写清'),noPreference]),

 question('hours','schedule','工作时段方面，你目前更接受哪种安排？','single',[
  option('stable_day','相对固定的白天工作时段'),
  option('planned_shifts','提前排定的轮班安排'),
  option('flexible_hours','可以调整开始和结束时间，具体边界另行约定'),noPreference]),
 question('hours','overtime','遇到正常安排之外的额外工作，你目前更接受哪种情况？','single',[
  option('no_regular_extra','希望正常工作安排之外没有常规加班'),
  option('occasional_notice','可以考虑偶发、提前沟通的加班'),
  option('limited_busy_period','可以考虑有明确结束时间的阶段性忙碌'),
  option('emergency_only','只考虑事先约定的紧急情况'),noPreference]),
 question('hours','rest','每周休息安排，你目前更希望是哪一种？','single',[
  option('fixed_days','休息日期相对固定，便于安排生活'),
  option('advance_roster','可以轮休，但希望提前知道排班'),
  option('negotiated_dates','可以协商调整休息日期，具体规则需要确认'),noPreference]),
 question('hours','after_hours','离开正常工作时段后，工作消息的响应安排你更接受哪种？','single',[
  option('next_work_period','通常等到下一个工作时段处理'),
  option('defined_urgent','仅响应事先界定的紧急情况'),
  option('scheduled_on_call','可以考虑提前排定的值守或待命'),noPreference]),

 question('benefits','coverage','关于这份工作的保障项目，你希望先了解哪些内容？','multiple',[
  option('applicable_scheme','工作地区与用工形式对应的保障项目'),
  option('coverage_detail','本人有哪些项目、哪些项目还需确认'),
  option('supplementary_support','适用基本保障之外的补充保险或其他支持'),noPreference]),
 question('benefits','basis','关于保障缴纳或安排，你最想先核对哪一项？','single',[
  option('entity_place','实际办理主体、地点与签约主体的关系'),
  option('basis_ratio','基数、比例和个人承担部分的计算口径'),
  option('cross_region','跨地区工作时如何衔接和查询'),noPreference]),
 question('benefits','start','进入岗位后，你希望保障开始时间如何被说明？','single',[
  option('start_in_writing','入职前明确开始日期和办理流程'),
  option('probation_explanation','单独说明试用期或实习阶段的适用安排'),
  option('transition_explanation','说明与原单位或异地保障之间的衔接'),noPreference]),
 question('benefits','verification','关于本人的保障记录，你更希望怎样确认？','single',[
  option('self_query','提供本人可以自行查询的渠道'),
  option('records_explanation','能拿到记录，并有明确联系人解释差异'),
  option('written_arrangement','先取得与本人用工形式对应的书面安排'),noPreference]),

 question('culture','communication','分配任务和反馈进展时，你目前更偏好哪种方式？','single',[
  option('clear_priorities','任务目标、优先级和交付要求事先说清'),
  option('regular_feedback','有固定的沟通机会，可以及时调整'),
  option('agreed_autonomy','先明确目标和边界，再由本人安排执行方式'),noPreference]),
 question('culture','respect','出现不同意见或工作失误时，你希望团队有哪些处理方式？','multiple',[
  option('discuss_reason','可以说明原因和不同意见，并得到回应'),
  option('private_feedback','涉及个人的反馈优先在合适的私下场合沟通'),
  option('clear_boundary','工作与私人安排的边界能够明确协商'),
  option('report_channel','有可以求助或反映问题的渠道'),noPreference]),
 question('culture','evaluation','关于绩效评价，你目前更希望哪种安排？','single',[
  option('clear_measures','可量化的要求、口径与周期说清楚'),
  option('examples_feedback','难量化的工作也有具体例子和反馈依据'),
  option('mixed_review','定量与定性评价结合，并说明各自用途'),noPreference]),
 question('culture','collaboration','协作过程中，你更希望有哪些支持？','multiple',[
  option('clear_responsibility','知道谁负责什么，交接要求明确'),
  option('access_support','遇到困难时能够联系到支持人员'),
  option('cross_team_coordination','跨团队任务有明确的协调方式'),
  option('tools_resources','完成任务所需的工具和资源可以取得'),noPreference]),

 question('company','business','了解企业业务时，你最想先核实哪些信息？','multiple',[
  option('current_offering','现在实际提供什么产品或服务'),
  option('customers_revenue','主要面向哪些客户，业务如何持续运转'),
  option('recent_changes','近期业务方向有哪些可核查变化'),
  option('role_connection','这份岗位与上述业务有什么联系'),noPreference]),
 question('company','public_finance','关于公开财务信息，你目前更希望怎样了解？','single',[
  option('dated_disclosure','查看有日期、口径和来源的公开披露'),
  option('relevant_context','只关注能解释企业当前经营的问题，并保留缺失项'),
  option('ask_when_unavailable','公开信息不足时，整理可向企业询问的问题'),noPreference]),
 question('company','continuity','遇到扩张、收缩或重组消息，你希望先核对哪些内容？','multiple',[
  option('entity_date','消息涉及哪家主体、发生时间和当前状态'),
  option('business_impact','具体影响哪些业务或工作地点'),
  option('role_impact','是否有资料说明与这份岗位有关'),
  option('original_support','能否找到原始公告或其他可定位材料'),noPreference]),
 question('company','payment_record','关于企业履约记录，你最想先了解什么？','single',[
  option('current_relevant_record','是否有与当前签约主体有关、可定位且有日期的履约记录'),
  option('resolved_status','已有争议的范围、后续处理和当前状态'),
  option('personal_payment_terms','先明确本人报酬的书面约定和咨询渠道'),noPreference]),

 question('position','hiring_reason','对岗位的设立原因，你目前更偏好哪种安排？','single',[
  option('ongoing_new_role','为持续业务新增的岗位'),
  option('replacement_role','接替已有岗位，并说明职责和交接'),
  option('bounded_project','可以考虑有明确期限或目标的项目岗位'),
  option('understand_first','先了解招聘原因，再决定'),noPreference]),
 question('position','contract','关于签约和实际工作安排，你目前更接受哪种情况？','single',[
  option('same_entity','签约主体与实际管理、工作主体一致'),
  option('clear_multiple_entities','可以考虑不同主体，但各自责任需要写清'),
  option('compare_forms','先了解劳动、实习或其他合作形式，再决定'),noPreference]),
 question('position','role_change','职责、地点或团队发生变化时，你目前更希望怎样处理？','single',[
  option('confirm_before_change','涉及本人安排的变化，需要先沟通并确认'),
  option('within_agreed_scope','可以接受事先明确范围内的调整'),
  option('conditional_flexibility','可以考虑更大的变化，但需要重新讨论条件'),noPreference]),
 question('position','probation_rules','关于试用或初期考核，你最想先确认哪些内容？','multiple',[
  option('criteria_before_start','开始前明确考核内容和判断依据'),
  option('periodic_feedback','过程中有反馈和改进机会'),
  option('decision_timeline','何时作决定，以及如何通知本人'),
  option('changes_in_writing','考核或岗位安排变化如何形成书面记录'),noPreference]),

 // Conditional follow-ups refine declared choices. They do not infer hard constraints.
 question('pay','fixed','你愿意考虑浮动收入时，希望哪些信息先明确？','multiple',[
  option('minimum_fixed','固定部分单独说明，且不把奖金承诺算进去'),
  option('ordinary_range','通常可达到的收入范围与对应条件'),
  option('low_result_case','业绩不达预期时如何结算'),
  option('no_unwritten_income','尚未书面约定的收入保持未知'),noPreference],
  'variable_conditions',{questionId:'pay.fixed.arrangement',answerIds:['fixed_variable','variable_first']}),
 question('pay','probation','考虑试用阶段报酬差异时，你希望先明确哪些边界？','multiple',[
  option('fixed_amount','两阶段固定金额分别列明'),
  option('duration','差异持续多久，以及延长时如何约定'),
  option('transition_criteria','何时转正、依据是什么及如何通知'),noPreference],
  'difference_conditions',{questionId:'pay.probation.arrangement',answerIds:['conditional_difference','check_difference']}),
 question('pay','payment','考虑按阶段结算时，你希望哪些内容写清？','multiple',[
  option('milestones','阶段如何划分、验收依据是什么'),
  option('payment_deadline','各阶段金额和最迟结算时间'),
  option('delays_disputes','延迟、任务变化或争议时如何处理'),noPreference],
  'stage_conditions',{questionId:'pay.payment.arrangement',answerIds:['stage_payment']}),
 question('hours','schedule','考虑轮班时，你更接受哪种安排？','single',[
  option('daytime_roster','可以轮换白天班次，但不考虑夜班'),
  option('limited_nights','可以考虑夜班，但需要先讨论频次与恢复时间'),
  option('advance_rotation','可以轮换不同时段，但排班和休息规则需提前明确'),noPreference],
  'shift_conditions',{questionId:'hours.schedule.arrangement',answerIds:['planned_shifts']}),
 question('hours','overtime','考虑额外工作时，你希望哪些边界先明确？','multiple',[
  option('frequency_duration','频次、持续时间和阶段结束条件'),
  option('advance_notice','提前多久沟通，临时情况如何协商'),
  option('compensation_rest','适用补偿及休息安排分别说明'),
  option('decline_channel','有其他安排时可以怎样提出并得到答复'),noPreference],
  'extra_conditions',{questionId:'hours.overtime.arrangement',answerIds:['occasional_notice','limited_busy_period','emergency_only']}),
 question('hours','after_hours','考虑紧急响应或待命时，你希望哪些内容先约定？','multiple',[
  option('urgent_scope','哪些情况属于紧急事项'),
  option('response_window','响应时段、时限和轮换人员'),
  option('rest_compensation','占用本人时间时的适用补偿与休息安排'),
  option('backup','本人无法响应时的替代联系人'),noPreference],
  'response_conditions',{questionId:'hours.after_hours.arrangement',answerIds:['defined_urgent','scheduled_on_call']}),
 question('culture','communication','希望自主安排工作时，你想先明确哪些边界？','multiple',[
  option('decision_scope','哪些事项本人可以决定，哪些需要协商'),
  option('outcomes','交付结果、质量要求和期限'),
  option('support_escalation','资源不足或目标冲突时向谁求助'),
  option('feedback_frequency','怎样同步进展以及多久反馈一次'),noPreference],
  'autonomy_conditions',{questionId:'culture.communication.arrangement',answerIds:['agreed_autonomy']}),
 question('position','hiring_reason','考虑有期限的项目岗位时，你希望先确认哪些信息？','multiple',[
  option('project_end','项目期限、结束条件和变化如何通知'),
  option('work_terms','项目期间的职责、用工形式和报酬约定'),
  option('after_project','项目结束后的安排；没有明确约定时保持未知'),
  option('early_end','提前结束时的书面规则与咨询渠道'),noPreference],
  'project_conditions',{questionId:'position.hiring_reason.arrangement',answerIds:['bounded_project']})
];

export const refinementReferences=[
 {id:'original-product-refinement',title:'求职 X-Ray A 具体需求采集',version:refinementVersion,
  usage:'本文件全部题干和选项为产品原创；复用既有七主题及28个明细ID。选择表达本人需求，不评价能力、人格或公司事实。',
  validationStatus:'not-validated',licenseBoundary:'未复制、翻译或改写受限量表题本，不移植评分、常模、心理分类或适合概率。'},
 {id:'careeronestop-work-values',title:'CareerOneStop Work Values Matcher',
  url:'https://cloudfront.careeronestop.org/Toolkit/Careers/work-values-matcher-help.aspx',
  usage:'只参考让本人比较具体工作安排、可修改选择的交互思路；不复制20张题卡或职业匹配算法。',
  licenseBoundary:'帮助页注明相关O*NET工作价值数据使用CC BY 4.0；数据许可不自动证明所有页面、题卡或中文改编均可复制。',
  checkedAt:'2026-10-13',validationStatus:'concept-reference-only'},
 {id:'miq',title:'University of Minnesota Minnesota Importance Questionnaire',
  url:'https://vpr.psych.umn.edu/miq',
  usage:'只参考工作需要可以细分为具体环境与安排；不复制题文、成对比较题、职业强化表或计分。',
  licenseBoundary:'官方表格CC BY-NC 4.0，不允许商业使用或销售复制品。本产品不接入该量表。',
  checkedAt:'2026-10-13',validationStatus:'concept-reference-only'},
 {id:'wdq',title:'Frederick Morgeson Work Design Questionnaire',
  url:'https://www.morgeson.com/wdq.html',
  usage:'只参考将工作特征拆为任务安排、协作与环境的维度；原创问题问未来偏好，不按WDQ评价现职工作。',
  licenseBoundary:'作者网站提供原文及译本限研究用途；英文题本标注版权所有。未复制题文或现有中文译本。',
  checkedAt:'2026-10-13',validationStatus:'concept-reference-only'}
];
