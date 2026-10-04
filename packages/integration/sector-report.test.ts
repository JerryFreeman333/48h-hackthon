import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createAHost} from './a-host';
import {createSelectedNeeds} from './test-needs-fixture';
import {createDemoFlow} from './demo-flow';
import {ReportArchive} from './report-archive';
import {analysisFromInputs,renderSectorReport} from './sector-report';
import {extractNeedLeads} from './database-investigation';
import {respondToJobNeeds} from './job-needs';

async function fixture(rawJd='不打卡；入职即缴六险一金；周期性带薪内部培训。'){
 const dir=mkdtempSync(join(tmpdir(),'xray-sectors-')),owner='sector-test-owner',a=createAHost(join(dir,'a'));
 const s=createSelectedNeeds(a.service,owner,{mode:'manual'}),input=a.service.confirm(owner,s.id,{expectedRevision:s.revision,confirmed:true}).export;
 const flow=createDemoFlow({dataDir:join(dir,'reports')});
 const created=await flow.runManual(owner,input,{title:'虚构测试运营岗位',companyName:'虚构测试公司',rawJd},{kind:'synthetic',actualMaterialConfirmed:false});
 const saved=new ReportArchive(join(dir,'reports')).read(owner,created.reportId)!;
 return {saved,flow,owner,created};
}
test('company clues become seven sector comparisons without promotion or eight-hour guesses',async()=>{
 const {saved}=await fixture(),inputs=structuredClone(saved.inputs);
 for(const e of inputs.bundle.evidence){e.jobId=null;e.scope='company';}
 inputs.bundle.facts=[];extractNeedLeads(inputs.bundle);
 inputs.needsResponse=respondToJobNeeds(inputs.aExport.JobNeedsSnapshot,inputs.bundle);
 const sectors=analysisFromInputs(inputs,saved.report).candidates[0].sectors;
 assert.equal(sectors.length,7);
 const growth=sectors.find(s=>s.id==='growth')!,hours=sectors.find(s=>s.id==='hours')!,benefits=sectors.find(s=>s.id==='benefits')!;
 assert.match(growth.situation,/内部培训/);assert.match(growth.conclusion,/晋升难易.*缺资料/);
 assert.match(growth.conclusion,/公司层面.*岗位/);
 assert.match(hours.situation,/不打卡/);assert.match(hours.conclusion,/不能推出工时短或每周双休/);
 assert.match(hours.need,/未采集.*最大小时数/);
 assert.match(benefits.situation,/六险一金/);assert.equal(benefits.status,'lead');
 assert.equal(sectors.find(s=>s.id==='company')!.status,'missing');
});
test('new report freezes compact model, legacy report remains legacy, feedback retains sector evidence',async()=>{
 const {saved,flow,owner,created}=await fixture();
 assert.equal(saved.inputs.sectorAnalysis.candidates[0].sectors.length,7);
 const html=await (await flow.read(owner,created.reportId)).text();
 assert.match(html,/七板块对照/);assert.match(html,/用户需求摘要/);assert.match(html,/综合结论与下一步/);
 assert.doesNotMatch(html,/补充核验回复|href="\/feedback\//);
 assert.ok(!html.includes('五维判断'));assert.match(html,/<details><summary>查看具体关注事项/);
 assert.ok(saved.inputs.sectorAnalysis.candidates[0].keyQuestions.length<=3);
 const q=flow.feedbackContext(owner,created.reportId).questions[0];
 const added=await flow.addFeedback(owner,created.reportId,{questionId:q.id,answer:'测试回复，等待书面材料'});
 const next=await (await flow.read(owner,added.reportId,'handoff')).json();
 assert.deepEqual(next.sectorAnalysis,saved.inputs.sectorAnalysis);
 assert.equal(next.verificationNotes[0].verification,'user_provided_unverified');
 const rendered=renderSectorReport(saved.inputs.sectorAnalysis,saved.report,{sourceLabel:'合成测试样例',authenticityLabel:'虚构测试',verificationLabel:'未核验'});
 assert.match(rendered,/合成测试样例/);
});
test('same-sector dispute is explicit and customer teaching is not employee growth',async()=>{
 const {saved}=await fixture('负责面向客户开展考试培训；每周双休。'),inputs=structuredClone(saved.inputs);
 let analysis=analysisFromInputs(inputs,saved.report);
 assert.equal(analysis.candidates[0].sectors.find(s=>s.id==='growth')!.status,'missing');
 assert.match(analysis.candidates[0].sectors.find(s=>s.id==='hours')!.situation,/双休/);
 inputs.bundle.evidence[0].verification='disputed';
 analysis=analysisFromInputs(inputs,saved.report);
 assert.equal(analysis.candidates[0].sectors.find(s=>s.id==='hours')!.status,'conflict');
 assert.match(analysis.candidates[0].sectors.find(s=>s.id==='hours')!.conclusion,/不能任选/);
});

test('pay compares only source-backed same-job fixed monthly amounts with personal expectations',async()=>{
 const {saved}=await fixture('税前固定月薪 12000–15000 元。'),inputs=structuredClone(saved.inputs);
 const job=inputs.bundle.jobs[0];
 job.salary={currency:'CNY',min:12000,max:15000,period:'month',basis:'fixed',taxBasis:'pre_tax',months:null};
 inputs.aExport.UserProfile.preferences.push({key:'min_fixed_monthly_salary',value:10000,strength:'soft',confirmed:true});
 const pay=()=>analysisFromInputs(inputs,saved.report).candidates[0].sectors.find(s=>s.id==='pay')!;
 assert.equal(pay().title,'薪资高低');assert.match(pay().conclusion,/不低于你的固定月薪偏好/);
 inputs.aExport.UserProfile.preferences.at(-1).value=16000;
 assert.match(pay().conclusion,/低于你的固定月薪偏好.*软偏好差异，不自动排除/);
 inputs.aExport.UserProfile.preferences.at(-1).value=13000;
 assert.match(pay().conclusion,/区间跨越期望/);
 inputs.bundle.evidence.forEach((e:any)=>{e.jobId=null;e.scope='company';});
 assert.match(pay().conclusion,/薪资高低待确认/);
});
test('founding years cannot become 996 hours and half-year disclosure remains a financial lead',async()=>{
 const {saved}=await fixture('公司成立于1996年9月，2026年半年度报告全文。');
 const sectors=analysisFromInputs(saved.inputs,saved.report).candidates[0].sectors;
 assert.equal(sectors.find(s=>s.id==='hours')!.status,'missing');
 assert.equal(sectors.find(s=>s.id==='company')!.status,'lead');
});

test('salary reference keeps its type through the frozen report and never claims a job quote or vacancy',async()=>{
 const {saved}=await fixture('公司薪资统计：平均月薪 15000 元。'),inputs=structuredClone(saved.inputs);
 const job=inputs.bundle.jobs[0];
 job.title='薪资统计参考 · 公司工资分布';
 job.city=null;
 job.salary={currency:'CNY',min:null,max:null,period:'unknown',basis:'unknown',taxBasis:'unknown',months:null};
 inputs.bundle.evidence.forEach((e:any)=>{e.jobId=null;e.scope='company';e.sourceType='local_database_salary_reference';});
 inputs.databaseSource={selectionRecords:[{jobId:job.jobId,recordId:1,recordKind:'salary_reference'}]};
 inputs.needsResponse=respondToJobNeeds(inputs.aExport.JobNeedsSnapshot,inputs.bundle);
 inputs.aExport.UserProfile.preferences.push({key:'min_fixed_monthly_salary',value:10000,strength:'hard',confirmed:true});
 const analysis=analysisFromInputs(inputs,saved.report),candidate=analysis.candidates[0];
 assert.equal(candidate.recordKind,'salary_reference');
 assert.match(candidate.summary,/没有选定具体招聘岗位/);
 const pay=candidate.sectors.find(s=>s.id==='pay')!;
 assert.match(pay.conclusion,/统计均值.*不等于.*固定月薪/);
 assert.doesNotMatch(pay.conclusion,/不低于你的|低于你的.*必须满足/);
 const html=renderSectorReport(analysis,saved.report,{sourceLabel:'测试数据库',authenticityLabel:'测试资料',verificationLabel:'未核验'});
 assert.match(html,/薪资统计参考 · 公司层面资料；未选择具体招聘岗位/);
 assert.doesNotMatch(html,/当前在招状态仍待核实/);
});
