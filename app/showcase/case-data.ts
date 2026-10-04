type CaseReference = {
  sourceId: number;
  pdfPage: number;
  label: string;
};

type CaseSector = {
  id: string;
  title: string;
  tone: 'risk' | 'info';
  status: string;
  need: string;
  material: string;
  judgment: string;
  question: string;
  references: CaseReference[];
};

export const reportDate = '2025 年 3 月 31 日';

export const sources = [
  {
    id: 1,
    date: '2025-03-31',
    title: '万科企业股份有限公司 · 2024 年度报告',
    url: 'https://www.vanke.com/upload/file/2025-03-31/347afc1b-5747-4468-8a7a-9ca6639dc4cb.PDF',
    kind: '公司一手披露 · 含经审计财务报表',
    note: '采用集团合并财务数据、员工情况和风险披露。财务报表获标准无保留审计意见，持续经营能力评估被列为关键审计事项；审计意见不保证未来经营或某份岗位的履约。',
  },
  {
    id: 2,
    date: '2025-03-31',
    title: '万科企业股份有限公司 · 2024 年可持续发展报告',
    url: 'https://vanke.com/upload/file/2025-03-31/a8385d2e-08d7-4e00-8e0d-91e0cd9b85dd.pdf',
    kind: '公司一手披露 · 员工制度与集团统计',
    note: '采用公司披露的培养、薪酬、休假、保障、沟通制度和员工指标。制度与统计均按报告中的集团或业务范围解释，不作为具体团队的独立调查或岗位执行证明。此 PDF 每页包含两页报告印刷内容。',
  },
];

export const metrics = [
  { label: '2024 年归母净亏损', value: '494.8 亿元', sourceId: 1, reference: '年报 · 印刷第 8 页' },
  { label: '2024 年末现金及现金等价物', value: '840 亿元', sourceId: 1, reference: '年报 · 印刷第 140 页' },
  { label: '2025 年内到期有息负债', value: '1,583 亿元', sourceId: 1, reference: '年报 · 印刷第 140 页' },
];

export const sectors: CaseSector[] = [
  {
    id: 'growth',
    title: '晋升与成长',
    tone: 'info',
    status: '培养体系与统计',
    need: '希望有学习资源、清晰的专业成长路径和内部发展机会。',
    material: '报告披露「3+1」培训体系、岗位学习地图及内部人才流动平台；2024 年集团员工平均受训 28.33 小时。',
    judgment: '培养体系有具体内容，值得进一步了解。集团平均受训时长不等于目标岗位的培训安排，也不承诺晋升结果。',
    question: '这个团队能使用哪些课程，谁负责带教，专业晋升与内部转岗分别需要达到什么条件？',
    references: [
      { sourceId: 2, pdfPage: 81, label: '印刷第 158–159 页' },
      { sourceId: 2, pdfPage: 83, label: '印刷第 162 页' },
      { sourceId: 2, pdfPage: 109, label: '印刷第 214 页' },
    ],
  },
  {
    id: 'salary',
    title: '薪资高低',
    tone: 'info',
    status: '薪酬制度披露',
    need: '希望报酬规则清楚，固定收入和浮动奖金能够分别比较。',
    material: '公司披露薪级工资表、城市调节系数，薪酬与个人、团队绩效及公司业绩挂钩；年报记录集团计提职工薪酬福利 190.25 亿元。',
    judgment: '这里能看见薪酬管理方式。集团计提总额不代表个人工资或已发金额，绩效与业绩条件也会影响浮动报酬。',
    question: '书面报价中的固定与浮动部分各是多少，奖金与哪些指标挂钩，发薪日和对应城市薪级如何确定？',
    references: [
      { sourceId: 2, pdfPage: 75, label: '印刷第 147 页' },
      { sourceId: 1, pdfPage: 93, label: '印刷第 90 页' },
    ],
  },
  {
    id: 'hours',
    title: '工时与休息',
    tone: 'info',
    status: '休假与弹性制度',
    need: '希望休假能够落实，工作时间有边界。',
    material: '公司披露弹性工作选择、额外带薪休假，以及婚假、产假、育儿假等休假制度。',
    judgment: '休息安排有制度依据，但报告没有给出目标团队的实际排班与加班频次。需要把制度对应到具体业务和岗位。',
    question: '这个岗位适用什么工时制度，休息日与值班怎么安排，弹性工作、调休和额外带薪假如何申请？',
    references: [
      { sourceId: 2, pdfPage: 74, label: '印刷第 144 页' },
      { sourceId: 2, pdfPage: 85, label: '印刷第 166 页' },
    ],
  },
  {
    id: 'benefits',
    title: '五险一金',
    tone: 'info',
    status: '保障制度与财务披露',
    need: '希望社会保险和住房公积金安排明确，能够核对个人缴纳记录。',
    material: '公司披露 2024 年员工社会保险覆盖率 100%；审计财务附注分别列示养老、失业、医疗、工伤、生育保险及住房公积金项目。',
    judgment: '集团层面的保障披露较完整。社保覆盖率不等于公积金覆盖率，也不说明这个岗位的缴纳基数、比例和起缴时间。',
    question: '签约主体、社保与公积金缴纳主体分别是谁，起缴月份、缴纳基数及双方比例能否书面确认？',
    references: [
      { sourceId: 2, pdfPage: 75, label: '印刷第 147 页' },
      { sourceId: 1, pdfPage: 240, label: '印刷第 237–238 页' },
    ],
  },
  {
    id: 'culture',
    title: '团队文化与工作方式',
    tone: 'info',
    status: '沟通渠道披露',
    need: '希望反馈渠道明确，遇到问题能够沟通并得到回应。',
    material: '公司披露十二条员工沟通渠道，并新增关怀热线和邮箱；员工权益管理程序规定员工关系专员在正常工作日 36 小时内答复。',
    judgment: '有明确的沟通和申诉入口，能作为了解团队的切入点。这是公司制度披露，团队是否及时回应还需结合实际经历核对。',
    question: '团队平时如何反馈工作和绩效，出现分歧时向谁申诉，最近一次员工建议是怎样被处理的？',
    references: [
      { sourceId: 2, pdfPage: 75, label: '印刷第 146 页' },
      { sourceId: 2, pdfPage: 83, label: '印刷第 163 页' },
    ],
  },
  {
    id: 'stability',
    title: '职位与用工稳定',
    tone: 'risk',
    status: '人数变动与人才风险',
    need: '希望业务和岗位预算能够持续，发生调整时有清晰的沟通安排。',
    material: '集团年末在册员工由 2023 年的 131,097 人变为 2024 年的 127,638 人；年报同时披露骨干人才保有承压、人才梯队建设面临挑战。',
    judgment: '人数变动与人才风险应一起看。集团期末人数减少不等于裁员人数，也不能直接推出目标岗位将被取消。',
    question: '岗位属于哪条业务，预算是否落实，近期组织调整对团队有什么影响，新增岗位还是人员替补？',
    references: [
      { sourceId: 2, pdfPage: 109, label: '印刷第 214 页' },
      { sourceId: 1, pdfPage: 97, label: '印刷第 94 页' },
    ],
  },
  {
    id: 'business',
    title: '企业经营状况',
    tone: 'risk',
    status: '亏损与流动性风险',
    need: '希望企业能持续经营，支持团队预算并兑现用工承诺。',
    material: '2024 年归母净亏损 494.8 亿元、营收同比下降 26.32%。审计报告列示年末现金及现金等价物 840 亿元，2025 年内到期有息负债 1,583 亿元，并将持续经营评估列为关键审计事项。',
    judgment: '报告期存在明确的经营与资金压力，应优先核对目标业务的持续安排。期末现金低于次年到期负债不意味着必然倒闭，也不直接证明某个团队欠薪。',
    question: '这些经营压力是否影响目标业务、岗位预算或奖金安排，团队依靠什么业务收入与资金计划持续运行？',
    references: [
      { sourceId: 1, pdfPage: 11, label: '印刷第 8 页' },
      { sourceId: 1, pdfPage: 96, label: '印刷第 93 页' },
      { sourceId: 1, pdfPage: 143, label: '印刷第 140–141 页' },
    ],
  },
];
