import type {CandidateBundle, MatchReport, UserProfile} from '../contracts';
import {escapeHtml} from '../../modules/c-report/ui/render-html';
import {SECTOR_REPORT_CSS} from './sector-report-style';
import type {NeedsResponse, NeedsSourceMetadata} from './job-needs';
import {respondToJobNeeds} from './job-needs';
import {compareFixedMonthlySalary} from '../../modules/c-report/domain/constraints';

export const SECTOR_REPORT_VERSION = 'c-sector-report-20261003-2';
const definitions = [
  {id:'growth', title:'晋升与成长', signal:/晋升|升职|职级|内部培训|员工培训|带教|导师|系统学习与实操/},
  {id:'pay', title:'薪资高低', signal:/薪资|薪酬|工资|底薪|固定月薪|月薪|日薪|年薪|提成|发薪|税前|税后/},
  {id:'hours', title:'工时与休息', signal:/工时|工作时间|上下班|不打卡|加班|调休|双休|单休|大小周|996|995|轮班|下班后/},
  {id:'benefits', title:'五险一金', signal:/五险|六险|社保|公积金|入职即缴|缴纳基数/},
  {id:'culture', title:'团队文化与工作方式', signal:/团队氛围|管理支持|同事关系|沟通方式|任务分配|尊重员工|辱骂|个人边界|绩效评价|申诉/},
  {id:'position', title:'职位与用工稳定', signal:/裁员|短期项目|替补|新增岗位|劳动合同|签约主体|外包|劳务派遣|岗位调整|团队变动|转正考核/},
  {id:'company', title:'企业经营状况', signal:/营收|净利|亏损|财报|年报|融资|业务收缩|重组|欠薪|经营情况/},
] as const;
type SectorId = typeof definitions[number]['id'];
type Material = {evidenceId:string; text:string; title:string; url:string|null; scope:string; date:string|null; collectedAt:string|null; verified:boolean};
type Sector = {id:SectorId; title:string; need:string; priority:string; situation:string; conclusion:string; status:'material'|'lead'|'missing'|'conflict'|'difference'; materials:Material[]; question:string};
const preferenceLabels:Record<string,string>={city:'工作城市',min_fixed_monthly_salary:'最低固定月薪',accept_sales_kpi:'销售签单考核',accept_travel:'出差',accept_outsourcing:'外包用工',work_schedule:'工作时段'};
const short=(s:string,n=180)=>s.replace(/\s+/g,' ').trim().slice(0,n)+(s.replace(/\s+/g,' ').trim().length>n?'…':'');
const questions:Record<SectorId,string>={growth:'这份岗位的晋升通道和实际培训安排是什么？',pay:'这份岗位的固定月薪、浮动部分和发放口径是什么？',hours:'实际每天工作多久、每周休息几天，加班如何安排？',benefits:'这份岗位是否执行所述社保及公积金安排，由谁缴纳？',culture:'实际团队如何分配任务、沟通反馈和处理分歧？',position:'签约及实际用工主体是谁，合同期限和岗位变动安排是什么？',company:'经营资料对应哪个主体和期间，近期业务及履约情况如何？'};

/** A supplies preferences; B supplies statements. Missing details never veto an entire sector. */
export function buildSectorAnalysis(profile:UserProfile, bundle:CandidateBundle, needs:NeedsResponse, report:MatchReport, metadata:NeedsSourceMetadata & {topics?:{topicId:string;priority:string}[]}={}) {
  const priorities = definitions.map(d=>({id:d.id,title:d.title,priority:metadata.topics?.find(t=>t.topicId===d.id)?.priority??needs.plan.items.find(i=>i.topicId===d.id)?.priority??'unknown'}));
  const conditions=profile.preferences.filter(p=>p.confirmed&&p.value!==null).map(p=>({key:p.key,label:preferenceLabels[p.key]??'其他条件',value:Array.isArray(p.value)?p.value.join('、'):typeof p.value==='boolean'?(p.value?'接受':'不接受'):String(p.value),strength:p.strength}));
  const candidates=bundle.jobs.map(job=>{
    const company=bundle.companies.find(c=>c.companyId===job.companyId);
    const response=needs.candidates.find(c=>c.jobId===job.jobId);
    const result=report.results.find(r=>r.jobId===job.jobId);
    const sectors:Sector[]=definitions.map(d=>{
      const items=response?.items.filter(i=>i.topicId===d.id)??[];
      const relevantIds=new Set(items.flatMap(i=>i.evidenceIds));
      const evidence=bundle.evidence.filter(e=>e.companyId===job.companyId && (e.jobId===null||e.jobId===job.jobId) && (e.jobId!==null?e.scope==='job':e.scope!=='job') && e.sourceType!=='local_database_field_comparison' && (relevantIds.has(e.evidenceId)||d.signal.test(e.excerpt)));
      // A teaching duty is not an employee's learning opportunity.
      const usable=d.id==='growth'?evidence.filter(e=>relevantIds.has(e.evidenceId)||/晋升|升职|职级/.test(e.excerpt)||/内部培训|员工培训|带教|导师|系统学习与实操/.test(e.excerpt)&&(!/(?:负责|组织|开展|讲授|提供|授课).{0,16}(?:培训|教学)/.test(e.excerpt)||/带薪内部培训|系统学习与实操|(?:新人|员工|入职).{0,8}(?:参加|接受|享有)/.test(e.excerpt))):evidence;
      const materials:Material[]=usable.slice(0,4).map(e=>{
        const dates=metadata.sourceDates?.find(s=>s.evidenceId===e.evidenceId);
        const parts=e.excerpt.split(/(?<=[。；;！!？?\n，])/).filter(s=>d.signal.test(s));
        return {evidenceId:e.evidenceId,text:short(parts.join(' ')||e.excerpt),title:e.title,url:e.url,scope:e.scope==='job'?'当前岗位':e.scope==='team'?'团队资料':'公司或集团资料',date:e.publishedAt,collectedAt:dates?typeof dates.retrievedAtRaw==='string'?dates.retrievedAtRaw:null:e.retrievedAt,verified:e.verification==='verified'};
      });
      const priority=priorities.find(p=>p.id===d.id)!.priority;
      const priorityText=priority==='priority'?'重点关注':priority==='secondary'?'会考虑':'重视程度未明确';
      const labels=items.filter(i=>i.itemId!=='clarify').map(i=>i.label);
      let need=priorityText+(labels.length?'；关注'+labels.slice(0,2).join('、')+(labels.length>2?'等安排':''):'；具体偏好未明确');
      if(d.id==='hours')need+='。本流程未采集每天可接受的最大小时数，不推断八小时上限';
      const salary=conditions.find(p=>p.key==='min_fixed_monthly_salary');
      if(d.id==='pay'&&salary)need+='；固定月薪期望 '+salary.value+' 元（'+(salary.strength==='hard'?'必须满足':'偏好')+'）';
      if(d.id==='pay')need+='。高低以你的收入期望为参照，不代表市场排名';
      const outsource=conditions.find(p=>p.key==='accept_outsourcing');
      if(d.id==='position'&&outsource)need+='；'+outsource.value+'外包（'+(outsource.strength==='hard'?'必须满足':'偏好')+'）';
      const conflict=items.some(i=>i.status==='conflicting')||usable.some(e=>e.verification==='disputed');
      const hardKeys=d.id==='pay'?['min_fixed_monthly_salary']:d.id==='position'?['accept_outsourcing']:d.id==='hours'?['work_schedule']:[];
      const hardFail=result?.constraints.some(c=>hardKeys.includes(c.key)&&c.result==='fail');
      const verified=items.some(i=>i.status==='available');
      const status:Sector['status']=hardFail?'difference':conflict?'conflict':verified?'material':materials.length?'lead':'missing';
      let conclusion=status==='difference'?'岗位资料与已确认的必须满足条件有差异，需优先核对。':status==='conflict'?'相关资料存在冲突或争议，不能任选一条作结论。':status==='material'?'已有对应范围资料回应部分需求；是否满足具体预期仍需对照。':status==='lead'?'已有相关记载，可用于继续考虑；尚未独立核验。': '现有资料不足以判断本板块，不据此认定好或坏。';
      if(status==='lead'&&usable.some(e=>e.jobId===null))conclusion+='公司层面的记载是否适用于这份岗位仍待确认。';
      if(d.id==='pay'){
        const threshold=profile.preferences.find(p=>p.key==='min_fixed_monthly_salary'&&p.confirmed&&typeof p.value==='number');
        const ownSalaryEvidence=usable.filter(e=>e.jobId===job.jobId&&e.scope==='job');
        // A structured amount alone has no provenance. Require the same job's
        // source to explicitly record the amount and comparable salary basis.
        const backed=ownSalaryEvidence.some(e=>/税前/.test(e.excerpt)&&/固定月薪|月固定工资|每月固定工资/.test(e.excerpt)&&[job.salary.min,job.salary.max].filter(n=>n!==null).every(n=>new RegExp('(?<![\\d.])'+n+'(?![\\d.])').test(e.excerpt)))&&(job.salary.min!==null||job.salary.max!==null);
        if(status==='conflict')conclusion+='薪资高低也需先解决同岗位资料的冲突。';
        else if(threshold&&backed){
          const comparison=compareFixedMonthlySalary(job.salary,threshold.value as number);
          const label=threshold.strength==='hard'?'必须满足的最低固定月薪':'固定月薪偏好';
          if(comparison.result==='pass')conclusion+='按该岗位资料记载的税前固定月薪区间，不低于你的'+label+'；这是资料对照，实际报价与兑现仍待确认。';
          else if(comparison.result==='fail')conclusion+='按该岗位资料记载的税前固定月薪区间，低于你的'+label+(threshold.strength==='soft'?'；属于软偏好差异，不自动排除。':'；属于必须满足条件的差异，应优先核实。');
          else conclusion+='薪资区间跨越期望或口径不可比，不能确定高低是否符合你的期望。';
        }else conclusion+=threshold?'尚无可与期望比较的同岗位税前固定月薪资料；薪资高低待确认。':'你未确认收入期望，暂不把岗位薪资评为高或低。';
      }
      if(d.id==='benefits'&&materials.length&&status==='lead')conclusion+='资料提及保障安排，可回应你对保障的关注，仍需核对执行情况。';
      if(d.id==='growth'&&materials.length&&!materials.some(m=>/晋升|升职|职级/.test(m.text)))conclusion+='已有培训线索，晋升难易及是否存在晋升通道仍缺资料。';
      if(d.id==='hours'&&materials.some(m=>/不打卡/.test(m.text))&&!materials.some(m=>/\d+\s*小时|双休|单休|996|995/.test(m.text)))conclusion+='不打卡不能推出工时短或每周双休。';
      if(d.id==='company'&&materials.length){
        if(materials.some(m=>/(?:净亏损|净利润为负)/.test(m.text)))conclusion+='所述报告期存在亏损线索，需关注经营压力及后续变化。';
        conclusion+='经营表现仅针对资料注明的主体和报告期，不直接证明当前岗位稳定。';
      }
      return {id:d.id,title:d.title,need,priority,situation:materials.length?materials.map(m=>m.text).join('；'):'本次资料中没有可引用的具体记载。',conclusion,status,materials,question:questions[d.id]};
    });
    const unknownHard=result?.constraints.filter(c=>c.result==='unknown')??[];
    const hardFailures=result?.constraints.filter(c=>c.result==='fail')??[];
    const keyQuestions:string[]=[];
    for(const c of [...hardFailures,...unknownHard]){
      const q=c.key==='city'?'这份岗位的实际工作地点能否满足已确认城市要求？':c.key==='min_fixed_monthly_salary'?questions.pay:c.key==='accept_outsourcing'?questions.position:c.key==='accept_sales_kpi'?'该岗位是否有销售签单考核？':c.key==='accept_travel'?'该岗位的实际出差安排是什么？':'请核对已确认必要条件的实际执行安排。';
      if(!keyQuestions.includes(q))keyQuestions.push(q);
    }
    if(!company||company.identityStatus!=='confirmed')keyQuestions.push(questions.position);
    if(salaryPreference(profile)&&!keyQuestions.includes(questions.pay))keyQuestions.push(questions.pay);
    for(const sector of sectors.filter(s=>s.status==='conflict'||s.priority==='priority'&&s.status!=='material'))if(!keyQuestions.includes(sector.question))keyQuestions.push(sector.question);
    const leads=sectors.filter(s=>s.materials.length).map(s=>s.title);
    const summary=hardFailures.length?'已有必须满足条件的差异，优先核对后再决定是否继续。':leads.length?'已有'+leads.join('、')+'资料可帮助继续调查；暂不能直接认定符合全部需求。':'当前资料不足以形成板块对照，需要补充公司与岗位资料。';
    const identityConflict=bundle.facts.some(f=>f.companyId===job.companyId&&f.key==='company.identity_conflict'&&f.status==='conflicting'&&f.evidenceIds.length>0);
    const cityCondition=profile.preferences.find(p=>p.key==='city'&&p.confirmed&&p.value!==null);
    const cities=Array.isArray(cityCondition?.value)?cityCondition.value:typeof cityCondition?.value==='string'?[cityCondition.value]:[];
    const cityComparison=job.city&&cities.length?(cities.includes(job.city)?'城市线索在你的意向范围内，实际办公地点仍待确认。':cityCondition?.strength==='soft'?'城市线索与软偏好不同，需要你权衡；未因此自动排除。':'城市线索与必须满足的范围不同，应优先核对岗位地点。'):'实际办公地点尚需核对。';
    const conditionComparison=result?.dimensions.find(d=>d.key==='personal_fit')?.summary??'';
    return {jobId:job.jobId,title:job.title,companyName:company?.brandName??company?.legalName??'公司未明确',city:job.city,cityComparison,conditionComparison,salary:job.salary,identity:company?company.legalName+(company.creditCode?'（信用代码 '+company.creditCode+'）':'')+'；'+(company.identityStatus==='confirmed'?'主体资料已对应，岗位签约关系仍应核对':'仅为主体线索，岗位签约关系待确认')+(identityConflict?'；主体资料还存在口径冲突，需核对品牌、法人及集团关系。':''):'岗位签约主体尚未提供',sectors,summary,keyQuestions:keyQuestions.slice(0,3),hardFailures:hardFailures.map(c=>preferenceLabels[c.key]??'其他必要条件')};
  });
  return {version:SECTOR_REPORT_VERSION,profileRevision:profile.revision,goals:profile.goals,conditions,priorities,candidates};
}
function salaryPreference(profile:UserProfile){return profile.preferences.some(p=>p.key==='min_fixed_monthly_salary'&&p.confirmed&&p.value!==null);}
export type SectorAnalysis=ReturnType<typeof buildSectorAnalysis>;

/** Only new reports freeze this model. Legacy archives retain their recorded analysis. */
export function analysisFromInputs(inputs:Record<string,any>,report:MatchReport):SectorAnalysis {
  const needs=inputs.needsResponse??respondToJobNeeds(inputs.aExport.JobNeedsSnapshot,inputs.bundle,{sourceDates:inputs.databaseSource?.sourceDates});
  return buildSectorAnalysis(inputs.aExport.UserProfile,inputs.bundle,needs,report,{sourceDates:inputs.databaseSource?.sourceDates,topics:inputs.aExport.JobNeedsSnapshot.topics});
}
const statusLabels={material:'有对应资料',lead:'有线索，适用性待确认',missing:'资料不足',conflict:'资料冲突',difference:'存在条件差异'};
export function renderSectorBody(analysis:SectorAnalysis,links:{reportId:string;salaryNotes?:string;extras?:string}){
  const e=escapeHtml;
  const overview='<section class="card"><h2 id="overview">公司与岗位概况</h2>'+analysis.candidates.map(c=>'<div class="overview-candidate"><h3>'+e(c.companyName+' · '+c.title)+'</h3><p class="overview-meta">工作城市线索：'+e(c.city??'未记载')+'；'+e(c.cityComparison)+'当前在招状态仍待核实。</p><div class="overview-summary"><strong>当前判断</strong>'+e(c.summary)+'</div>'+(c.hardFailures.length?'<p class="priority-alert">必须满足条件的差异：'+e(c.hardFailures.join('、'))+'。</p>':'')+'<details><summary>'+e(/冲突/.test(c.identity)?'主体关系含冲突 · 查看资料':/待确认|尚未提供/.test(c.identity)?'主体关系待确认 · 查看资料':'查看主体资料与签约关系')+'</summary><p>'+e(c.identity)+'</p></details></div>').join('')+(links.salaryNotes??'')+'</section>';
  const profile='<section class="card"><h2 id="profile-h">用户需求摘要</h2><p class="profile-goals">'+e(analysis.goals.join('、')||'目标尚未明确')+'</p><p class="muted">沿用侧写版本 '+analysis.profileRevision+'，对照你已确认的条件。</p><details><summary>查看已确认条件与关注重点</summary><dl class="profile-conditions">'+analysis.conditions.map(p=>'<div class="profile-condition"><dt>'+e(p.label)+'</dt><dd>'+e(p.value+(p.key==='min_fixed_monthly_salary'?' 元':''))+'<span class="condition-strength">'+e(p.strength==='hard'?'必须满足':p.strength==='soft'?'偏好':'未确认为必须满足')+'</span></dd></div>').join('')+'</dl><p>关注重点：'+e(analysis.priorities.filter(p=>p.priority==='priority').map(p=>p.title).join('、')||'尚未明确')+'。</p><p class="muted">本流程未采集经历，不据此推断没有经历。</p></details></section>';
  const candidates=analysis.candidates.map((c,index)=>'<section class="card"><h2 id="sector-'+index+'">'+e(c.title)+' · 七板块对照</h2><p class="muted card-intro">先看资料，再对照需求。未提及不代表不存在。</p>'+c.sectors.map(s=>'<section class="sector"><div class="sector-heading"><h3>'+e(s.title)+'</h3><span class="sector-status '+s.status+'">'+e(statusLabels[s.status])+'</span></div><dl class="sector-rows"><div class="sector-row"><dt>用户需求</dt><dd>'+e(s.need)+'</dd></div><div class="sector-row"><dt>公司／岗位情况</dt><dd>'+e(s.situation)+'</dd></div><div class="sector-row judgment"><dt>对照结论</dt><dd>'+e(s.conclusion)+'</dd></div></dl><a class="sector-question-link" href="#source-'+index+'-'+s.id+'">查看本板块来源与待确认事项</a></section>').join('')+'</section><section class="card"><h2 id="conclusion-'+index+'">综合结论与下一步</h2><p>'+e(c.summary)+'</p>'+(c.hardFailures.length?'<p class="priority-alert">必须满足条件的差异：'+e(c.hardFailures.join('、'))+'。</p>':'')+'<p class="muted">优先核实以下关键事项，其他细项保留在补充资料中：</p><ol class="next-questions">'+c.keyQuestions.map(q=>'<li>'+e(q)+'</li>').join('')+'</ol></section>').join('');
  const sources='<section class="card"><h2 id="sources">来源与补充资料</h2><p class="muted card-intro">展开查看原始记载、适用范围、日期和剩余问题。</p>'+analysis.candidates.map((c,index)=>'<h3 class="source-heading">'+e(c.companyName+' · '+c.title)+'</h3><details><summary>现实条件对照</summary><p>'+e(c.conditionComparison)+'</p></details>'+c.sectors.map(s=>'<details id="source-'+index+'-'+s.id+'"><summary>'+e(s.title)+' · '+e(statusLabels[s.status])+'</summary>'+(s.materials.length?s.materials.map(m=>'<div class="source-material"><p>'+e(m.title)+'</p><p class="source-metadata">'+e(m.scope)+'；'+(m.verified?'来源标为已核验，当前适用性仍应核对':'未独立核验')+'；发布：'+e(m.date??'未记录')+'；原采集：'+e(m.collectedAt??'未记录')+'</p><blockquote>'+e(m.text)+'</blockquote>'+(m.url&&/^https?:\/\//i.test(m.url)?'<p><a href="'+e(m.url)+'" target="_blank" rel="noopener noreferrer">查看来源</a></p>':'<p class="muted">未记录原文链接。</p>')+'</div>').join(''):'<p>暂无可引用的具体资料。</p>')+'<p>补充核实：'+e(s.question)+'</p></details>').join('')).join('')+(links.extras??'')+'</section><nav class="report-actions" aria-label="报告操作"><a class="primary" href="/revise/'+e(links.reportId)+'">修改需求后重新分析</a><a href="/history">我的报告</a></nav>';
  return overview+profile+(analysis.candidates.length>1?'<p class="muted">各候选分别对照同一份需求，不产生排名、冠军或综合分。</p>':'')+candidates+sources;
}
export function renderSectorReport(analysis:SectorAnalysis,report:MatchReport,labels:{sourceLabel:string;authenticityLabel:string;verificationLabel:string},options:{salaryNotes?:string;extras?:string}={}){
  const e=escapeHtml;
  return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>求职 X-Ray · 七板块分析</title><style>'+SECTOR_REPORT_CSS+'</style></head><body><a class="skip-link" href="#main">跳到主要内容</a><div class="page"><header class="report-topbar"><a class="report-brand" href="/">求职 X-Ray<span>看清公司，也看清适合自己的方向</span></a><nav class="report-topnav" aria-label="主导航"><a href="/research">候选岗位</a><a href="/history">我的报告</a><span class="report-badge">判断报告 · C</span></nav></header><main class="report-layout" id="main"><aside class="report-intro"><div class="eyebrow">C · 需求与资料对照</div><h1>你的岗位<br>判断报告</h1><p>把你的需求与现有资料放在一起，逐项看清线索、差异和下一步。</p><p class="muted" role="note">'+e(labels.authenticityLabel)+' · 核验状态：'+e(labels.verificationLabel)+'</p><nav class="anchor-nav" aria-label="页面目录"><a href="#overview">公司与岗位</a><a href="#profile-h">用户需求</a>'+analysis.candidates.map((c,i)=>'<a href="#sector-'+i+'">'+e(c.title)+'</a>').join('')+'<a href="#conclusion-0">综合结论</a><a href="#sources">来源与补充资料</a></nav><details><summary>报告与资料信息</summary><p class="report-meta">资料来源：'+e(labels.sourceLabel)+'</p><p class="report-meta">报告 '+e(report.reportId)+'</p><p class="report-meta">生成时间 '+e(report.generatedAt)+'</p></details></aside><div class="report-content">'+renderSectorBody(analysis,{reportId:report.reportId,...options})+'</div></main><footer class="page-foot"><p>分析基于保存的资料快照。公司或集团资料不等于岗位承诺，历史经营表现不代表未来稳定，不产生匹配百分比或排名。</p></footer></div></body></html>';
}
