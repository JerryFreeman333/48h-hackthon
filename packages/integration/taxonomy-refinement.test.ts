import test from 'node:test';
import assert from 'node:assert/strict';
import {industries,roles} from '../../modules/a-profile/src/taxonomy.mjs';
import {matchesDatabaseIndustry,matchesDatabaseRole} from './local-database';

// These are classification examples, not real vacancies or verified company records.
const industryExamples:Record<string,string>={
 software_it:'软件与信息技术服务',manufacturing:'装备制造',healthcare:'医疗服务',
 education:'教育服务',professional_services:'科研与专业服务',commerce:'商贸零售',finance:'商业银行',
 agriculture:'农林牧渔生产',mining_resources:'矿产开采',energy_utilities:'电力供应与供热',
 construction:'建筑施工',transport_logistics:'交通运输与仓储',hospitality_food:'住宿与餐饮服务',
 real_estate:'房地产与物业管理',environment_public_facilities:'环境治理与公共设施管理',
 resident_repair_services:'居民服务与修理服务',culture_sports_entertainment:'文化艺术与体育',
 public_social_organizations:'公共管理与社会组织',international_organizations:'政府间国际组织'
};
const roleExamples:Record<string,string>={
 engineering:'系统开发工程师',research:'研究员',product_design:'产品经理',product_operations:'内容运营',
 sales_business:'销售经理',customer_delivery:'实施顾问',production_quality:'质量管理',functions:'行政专员',professional:'法律顾问',
 healthcare_care:'康复治疗师',teaching_training:'教师',hospitality_service:'酒店前台接待',logistics_transport:'物流调度专员',
 construction_civil:'土建施工员',agriculture_field:'林业巡护员',arts_sports:'体育教练',repair_maintenance:'设备维修员',
 environment_utilities:'燃气运行巡检员',public_community:'社区服务专员'
};

test('every current industry and role direction has an executable database clue, including all twenty broad industry sections',()=>{
 assert.deepEqual(Object.keys(industryExamples).sort(),industries.map(i=>i.id).sort());
 assert.deepEqual(Object.keys(roleExamples).sort(),roles.map(r=>r.id).sort());
 assert.deepEqual([...new Set(industries.flatMap(i=>i.codes))].sort(),Array.from({length:20},(_,i)=>String.fromCharCode(65+i)));
 for(const [id,domain] of Object.entries(industryExamples))assert.equal(matchesDatabaseIndustry([id],domain),true,id+' / '+domain);
 for(const [id,title] of Object.entries(roleExamples))assert.equal(matchesDatabaseRole([id],title),true,id+' / '+title);
});

test('sector words in a name do not automatically become another industry activity',()=>{
 for(const [tag,domain] of [
  ['agriculture','农业银行'],['transport_logistics','物流科技'],
  ['energy_utilities','能源设备制造'],['construction','建筑设计咨询'],
  ['hospitality_food','餐饮设备制造'],['environment_public_facilities','环保设备制造'],
  ['international_organizations','国际贸易公司'],['public_social_organizations','教育事业单位']
 ])assert.equal(matchesDatabaseIndustry([tag],domain),false,tag+' / '+domain);
 assert.equal(matchesDatabaseIndustry(['finance'],'农业银行'),true);
 assert.equal(matchesDatabaseIndustry(['software_it'],'物流科技'),true);
 assert.equal(matchesDatabaseIndustry(['transport_logistics'],'物流配送服务'),true);
 assert.equal(matchesDatabaseIndustry(['energy_utilities'],'燃气供应'),true);
});

test('new role directions depend on activity clues rather than a company sector or claimed qualification',()=>{
 for(const [tag,title] of [
  ['healthcare_care','医疗器械销售经理'],['teaching_training','教育产品经理'],
  ['logistics_transport','物流算法工程师'],['construction_civil','智慧建筑软件开发工程师'],
  ['agriculture_field','农业投资顾问'],['arts_sports','文化平台运维工程师'],
  ['environment_utilities','环境监测平台软件开发工程师'],['public_community','公益平台产品经理']
 ])assert.equal(matchesDatabaseRole([tag],title),false,tag+' / '+title);
 assert.equal(matchesDatabaseRole(['sales_business'],'医疗器械销售经理'),true);
 assert.equal(matchesDatabaseRole(['engineering'],'物流算法工程师'),true);
 assert.equal(matchesDatabaseRole(['healthcare_care'],'注册护士'),true);
 assert.equal(matchesDatabaseRole(['teaching_training'],'岗位培训师'),true);
});

test('direction clues preserve unknown records and union selection without mutating the caller choices',()=>{
 const industryTags=['agriculture','finance'],roleTypes=['teaching_training','healthcare_care'];
 Object.freeze(industryTags);Object.freeze(roleTypes);
 assert.equal(matchesDatabaseIndustry(industryTags,'商业银行'),true);
 assert.equal(matchesDatabaseRole(roleTypes,'护理岗位'),true);
 assert.equal(matchesDatabaseIndustry(['agriculture'],null),true);
 assert.equal(matchesDatabaseRole(['healthcare_care'],null),true);
 assert.equal(matchesDatabaseIndustry([],'软件'),true);assert.equal(matchesDatabaseRole([],'开发工程师'),true);
 assert.equal(matchesDatabaseIndustry(['not_a_catalog_id'],'软件'),false);
 assert.equal(matchesDatabaseRole(['not_a_catalog_id'],'开发工程师'),false);
 assert.deepEqual(industryTags,['agriculture','finance']);assert.deepEqual(roleTypes,['teaching_training','healthcare_care']);
});
