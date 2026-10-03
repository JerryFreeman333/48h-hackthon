import {join} from 'node:path';
import {createAHost} from './a-host';
import {createDemoFlow} from './demo-flow';

export const showcaseSource='https://rokid.zhiye.com/jobs?LocId=%5B%7B%22id%22%3A%223301%22%2C%22label%22%3A%22%E6%9D%AD%E5%B7%9E%E5%B8%82%22%7D%5D';
// Public recruitment summary, not a copied full JD or a claim of current vacancy.
const job={title:'B端市场营销策划',companyName:'Rokid（招聘页面品牌名，签约主体待核实）',city:'杭州',sourceUrl:showcaseSource,sourceTitle:'Rokid 官方招聘页面 · 岗位摘要',rawJd:'公开招聘页面摘要，非完整JD：岗位为B端市场营销策划，工作地点杭州。职责包括获客及客户分层、渠道投放与效果评估、品牌内容传播、数据分析，并与销售团队协作。要求五年以上相关数字营销或市场推广经验。摘要未提供固定薪资、工时及晋升安排；当前在招状态需要向招聘方确认。'};

async function createCase(){
 const owner='public-recruitment-showcase-v1';
 const a=createAHost(join(process.cwd(),'.data','showcase-a'));
 const flow=createDemoFlow({dataDir:join(process.cwd(),'.data','showcase-reports')});
 const existing=flow.list(owner)[0];
 if(existing)return {flow,owner,reportId:existing.reportId};
 const s=a.service.create(owner,{mode:'manual'}),data=structuredClone(s.data);
 for(const topic of ['growth','pay','hours']){
  data.answers[topic+'.priority']='priority';data.answers[topic+'.policy']='verify_first';
 }
 data.answers['growth.details']=['promotion','learning'];
 data.answers['pay.details']=['fixed','formula'];
 data.answers['hours.details']=['schedule','overtime'];
 data.conditions=data.conditions.map((c:any)=>c.key==='city'?{...c,value:['杭州'],strength:'hard'}:c);
 const saved=a.service.update(owner,s.id,{expectedRevision:s.revision,questionnaireVersion:s.questionnaireVersion,step:8,data});
 const input=a.service.confirm(owner,s.id,{expectedRevision:saved.revision,confirmed:true}).export;
 const report=await flow.runManual(owner,input,job,{kind:'user_provided',actualMaterialConfirmed:true});
 return {flow,owner,reportId:report.reportId};
}
const globalCase=globalThis as unknown as {__xrayRealShowcase?:ReturnType<typeof createCase>};
export async function realShowcaseHtml(){
 const value=await (globalCase.__xrayRealShowcase??=createCase().catch(error=>{delete globalCase.__xrayRealShowcase;throw error;}));
 const html=await (await value.flow.read(value.owner,value.reportId)).text();
 return html.replace('资料来源：用户提供资料','资料来源：官方公开招聘页面摘要')
  .replace('用户声明为实际岗位资料','岗位来自实际公开招聘页面；求职偏好为展示示例')
  .replace('用户提交 JD：来源尚未独立核验，企业身份及未提供事实保持未知。','真实岗位案例：Rokid 官方招聘页面摘要。求职偏好为展示示例，不是你的答案；岗位当前状态及实际待遇待核验。')
  .replace(/<p><a href="\/materials\/[\s\S]*?<h2 id="coverage">/,'<p><a href="'+showcaseSource+'" target="_blank" rel="noopener noreferrer">查看官方招聘来源</a> · <a href="/showcase">返回展示案例</a></p><h2 id="coverage">')
  .replace(/href="\/flow\/reports\/[^"?]+\?angle=/g,'href="/showcase/rokid-marketing?angle=');
}
