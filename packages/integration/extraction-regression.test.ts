import {createSelectedNeeds} from './test-needs-fixture';
import test from 'node:test';
import assert from 'node:assert/strict';
import {ResearchService,demoSample} from '../../modules/b-research/research-service';
import {createAHost} from './a-host';
import {createDemoFlow} from './demo-flow';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
function facts(rawJd:string){const service=new ResearchService(),intent={...demoSample().intent,mode:'manual' as const},j=service.addManualJob({projectId:intent.projectId,title:'否定表达回归',rawJd});return service.createResearchRun(intent,{selectedJobIds:[j.job.jobId]}).bundle.facts;}
test('常见否定表达得到false，疑问、条件句、不完整否定与正反矛盾保持未知',()=>{
 for(const text of ['无销售KPI，无陌生客户开发。负责产品运营。','没有销售指标。','本岗位不设置销售KPI。','销售KPI：无。负责产品运营。','黑箱虚构资料，修订：销售KPI：无。无客户签单责任。'])assert.equal(facts(text)[0]?.value,false,text);
 for(const text of ['是否有销售KPI？','如果无销售KPI，可以考虑。','无销售KPI经验要求。','并非无销售KPI。','不保证无销售KPI。'])assert.equal(facts(text).length,0,text);
 const conflict=facts('销售KPI：有。销售KPI：无。')[0];assert.equal(conflict.value,null);assert.equal(conflict.status,'conflicting');assert.equal(facts('承担销售KPI。')[0].value,true);
});
test('false事实的职责说明不再声称缺失事实，仍保留实际考核待核实',async()=>{const dir=mkdtempSync(join(tmpdir(),'xray-negation-')),a=createAHost(join(dir,'a')),flow=createDemoFlow({dataDir:join(dir,'reports')}),s=createSelectedNeeds(a.service,'u',{mode:'manual'}),input=a.service.confirm('u',s.id,{expectedRevision:s.revision,confirmed:true}).export,r=await flow.runManual('u',input,{title:'否定回归岗位',rawJd:'无销售KPI，无陌生客户开发。负责产品运营。'}),snapshot=await (await flow.read('u',r.reportId,'handoff')).json(),dimension=snapshot.report.results[0].dimensions.find((d:any)=>d.key==='role_clarity');assert.match(dimension.summary,/声明无销售KPI/);assert(!dimension.summary.includes('没有已协调'));assert.equal(dimension.status,'unknown');});
