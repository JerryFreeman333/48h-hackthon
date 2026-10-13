export const taxonomyVersion='a-taxonomy-1';
export const refinementTaxonomyVersion='a-taxonomy-2';
export const industrySource='https://www.stats.gov.cn/sj/tjbz/gmjjhyfl/';
// Tags are product labels. Fine-grained codes remain pending verification.
export const industries=[
 {id:'software_it',name:'软件 / IT / 互联网',codes:['I'],description:'软件、信息技术服务等；互联网业务也可能属于其他行业。'},
 {id:'manufacturing',name:'制造与硬件',codes:['C'],description:'设备、硬件与实体产品制造。'},
 {id:'healthcare',name:'医疗与医药',codes:['C','M','F','Q'],description:'可能涉及制造、研发、流通与医疗服务；需按实际业务核实。'},
 {id:'education',name:'教育',codes:['P'],description:'教学、培训及相关服务。'},
 {id:'professional_services',name:'专业服务与科研',codes:['L','M'],description:'咨询、商务服务、研究及技术服务。'},
 {id:'commerce',name:'消费与商贸',codes:['F'],description:'批发、零售及相关业务。'},
 {id:'finance',name:'金融 / 银行',codes:['J'],description:'银行、保险、证券等金融机构；宽行业归类，具体业务仍需核实。'}
].map(x=>({...x,version:taxonomyVersion,source:industrySource,mappingStatus:'broad_section_only'})).concat([
 {id:'agriculture',name:'农林牧渔与生产服务',codes:['A'],description:'农业、林业、畜牧、渔业及相关生产辅助业务；食品制造另按实际业务核实。'},
 {id:'mining_resources',name:'矿产与资源开采',codes:['B'],description:'矿产开采与相关辅助活动；材料加工或设备制造不自动归入此项。'},
 {id:'energy_utilities',name:'能源供应与水务',codes:['D'],description:'电力、热力、燃气及水的生产或供应；具体运营业务需核实。'},
 {id:'construction',name:'建筑与工程施工',codes:['E'],description:'房屋、土木工程、安装与建筑装饰施工；工程设计也可能属于专业服务。'},
 {id:'transport_logistics',name:'运输、仓储与邮政物流',codes:['G'],description:'交通运输、仓储及邮政业务；销售运输设备不自动归入此项。'},
 {id:'hospitality_food',name:'住宿与餐饮服务',codes:['H'],description:'住宿、餐饮及相关现场服务；食品生产和零售另按实际业务核实。'},
 {id:'real_estate',name:'房地产与物业相关业务',codes:['K'],description:'房地产开发经营、物业管理及相关房地产服务；建筑施工另行核实。'},
 {id:'environment_public_facilities',name:'水利、环境与公共设施服务',codes:['N'],description:'水利管理、生态保护、环境治理及公共设施管理；设备制造属于不同业务。'},
 {id:'resident_repair_services',name:'生活服务、维修与其他服务',codes:['O'],description:'面向居民的生活服务、修理和其他服务；不作为所有未分类业务的兜底。'},
 {id:'culture_sports_entertainment',name:'文化、体育与娱乐',codes:['R'],description:'文化艺术、体育、娱乐及相关活动；内容制作的具体业务仍需核实。'},
 {id:'public_social_organizations',name:'公共管理与社会组织',codes:['S'],description:'公共管理、社会保障和社会组织活动；不凭岗位名称判断单位性质。'},
 {id:'international_organizations',name:'国际组织相关工作',codes:['T'],description:'国际组织活动；境外企业或跨国公司不自动属于国际组织。'}
].map(x=>({...x,version:refinementTaxonomyVersion,source:industrySource,mappingStatus:'broad_section_only'})));
export const roles=[['engineering','技术工程','开发、系统维护与工程实施；可出现在软件、制造等行业。'],['research','研发科研','实验、研究与技术探索。'],['product_design','产品设计','理解需求、规划产品与设计体验。'],['product_operations','运营内容','产品运营、内容制作与用户活动；保留公共样例ID。'],['sales_business','销售商务','拓展客户、协商合作与销售；具体指标需查看JD。'],['customer_delivery','客户交付','实施、培训、支持与交付。'],['production_quality','生产质量','生产流程、测试与质量管理。'],['functions','职能管理','财务、人力、行政与组织支持。'],['professional','专业服务','法律、咨询等专业服务。']].map(([id,name,description])=>({id,name,description,version:taxonomyVersion,officialCode:null,mappingStatus:'pending_verification'})).concat([
 ['healthcare_care','医疗照护','诊疗支持、护理、康复或照护服务；执业资格和具体职责由真实岗位核实。'],
 ['teaching_training','教学培训','教学、培训、课程支持与学习服务；不代表本人已具备教师或培训资格。'],
 ['hospitality_service','餐饮住宿与现场服务','餐饮、住宿、接待及其他现场服务；具体班次、地点与职责需查看岗位。'],
 ['logistics_transport','物流运输与仓储','运输、配送、仓储、调度或供应链执行；操作资质和出行范围需核实。'],
 ['construction_civil','建筑施工与工程现场','施工、安装、工程现场与项目协调；不自动判断资格或工作环境。'],
 ['agriculture_field','农林牧渔与现场生产','种植、养殖、林业、渔业或相关现场支持；生产周期和劳动安排需核实。'],
 ['arts_sports','文艺体育与活动','文化艺术、体育、娱乐或活动服务；可以涉及创作、执行与现场支持。'],
 ['repair_maintenance','维修与生活服务','设备或物品维修、设施维护及面向居民的服务；具体服务对象需查看岗位。'],
 ['environment_utilities','环境水务与运行服务','环境、水务、能源或公共设施的运行、监测及现场支持；行业与职责分别核实。'],
 ['public_community','公共事务与社区服务','公共事务、社区和社会组织服务；单位性质、岗位条件和用工形式需核实。']
].map(([id,name,description])=>({id,name,description,version:refinementTaxonomyVersion,officialCode:null,mappingStatus:'pending_verification'})));
