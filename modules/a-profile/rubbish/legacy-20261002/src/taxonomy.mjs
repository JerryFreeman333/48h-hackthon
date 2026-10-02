export const taxonomyVersion='a-taxonomy-1';
export const industrySource='https://www.stats.gov.cn/sj/tjbz/gmjjhyfl/';
// Tags are product labels. Fine-grained codes remain pending verification.
export const industries=[
 {id:'software_it',name:'软件 / IT / 互联网',codes:['I'],description:'软件、信息技术服务等；互联网业务也可能属于其他行业。'},
 {id:'manufacturing',name:'制造与硬件',codes:['C'],description:'设备、硬件与实体产品制造。'},
 {id:'healthcare',name:'医疗与医药',codes:['C','M','F','Q'],description:'可能涉及制造、研发、流通与医疗服务；需按实际业务核实。'},
 {id:'education',name:'教育',codes:['P'],description:'教学、培训及相关服务。'},
 {id:'professional_services',name:'专业服务与科研',codes:['L','M'],description:'咨询、商务服务、研究及技术服务。'},
 {id:'commerce',name:'消费与商贸',codes:['F'],description:'批发、零售及相关业务。'}
].map(x=>({...x,version:taxonomyVersion,source:industrySource,mappingStatus:'broad_section_only'}));
export const roles=[['engineering','技术工程','开发、系统维护与工程实施；可出现在软件、制造等行业。'],['research','研发科研','实验、研究与技术探索。'],['product_design','产品设计','理解需求、规划产品与设计体验。'],['product_operations','运营内容','产品运营、内容制作与用户活动；保留公共样例ID。'],['sales_business','销售商务','拓展客户、协商合作与销售；具体指标需查看JD。'],['customer_delivery','客户交付','实施、培训、支持与交付。'],['production_quality','生产质量','生产流程、测试与质量管理。'],['functions','职能管理','财务、人力、行政与组织支持。'],['professional','专业服务','法律、咨询等专业服务。']].map(([id,name,description])=>({id,name,description,version:taxonomyVersion,officialCode:null,mappingStatus:'pending_verification'}));
