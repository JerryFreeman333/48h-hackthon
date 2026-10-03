import {createSelectedNeeds} from './test-needs-fixture';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createAHost} from './a-host';
import {createDemoFlow} from './demo-flow';

test('withdrawn location drafts remain stored; ordinary needs can resume and confirm without extra fields',()=>{
 const dir=mkdtempSync(join(tmpdir(),'xray-rollback-a-')),owner='rollback-owner';
 let a=createAHost(dir);const session=createSelectedNeeds(a.service,owner,{mode:'manual'});
 const first=a.service.confirm(owner,session.id,{expectedRevision:session.revision,confirmed:true}).export;
 const file=join(dir,'state.json'),state=JSON.parse(readFileSync(file,'utf8'));
 state.needs.sessions[session.id].data.location={areas:['滨江区'],strength:'hard',origin:'虚构出发点',maxMinutes:45,transport:'public',relocation:'no'};
 writeFileSync(file,JSON.stringify(state));const before=readFileSync(file,'utf8');
 a=createAHost(dir);const resumed=a.service.get(owner,session.id);
 assert.ok(!('location' in resumed.data));assert.ok(!('location' in a.service.preview(owner,session.id).snapshot.selectionData));
 assert.equal(readFileSync(file,'utf8'),before);
 const next=a.service.confirm(owner,session.id,{expectedRevision:resumed.revision,confirmed:true}).export;
 assert.ok(!('location' in next.JobNeedsSnapshot.selectionData));
 assert.deepEqual(a.service.export(owner,session.id,1),first);
 assert.deepEqual(JSON.parse(readFileSync(file,'utf8')).needs.sessions[session.id].data.location,state.needs.sessions[session.id].data.location);
});

test('original report UI remains and public download links are removed; location overlays cannot continue deciding new reports',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'xray-rollback-flow-')),owner='rollback-owner',a=createAHost(join(dir,'a'));
 const session=createSelectedNeeds(a.service,owner,{mode:'manual'}),input=a.service.confirm(owner,session.id,{expectedRevision:session.revision,confirmed:true}).export;
 const flow=createDemoFlow({dataDir:join(dir,'reports')}),tail='这是超过400字之后保留的原始材料结尾',rawJd='回退测试。'+('原文材料'.repeat(150))+tail+'。无销售KPI，无陌生客户开发。';
 const result=await flow.runManual(owner,input,{title:'回退测试岗位',city:'成都',rawJd});
 assert.ok(!("handoffUrl" in result));
 const html=await (await flow.read(owner,result.reportId)).text();
 assert.ok(!html.includes('工作地点与杭州通勤'));assert.ok(!html.includes('href="#workplace"'));assert.ok(html.includes(tail));
 assert.ok(!html.includes('导出 Markdown'));assert.ok(!html.includes('导出私有 JSON'));assert.ok(html.includes('声明无销售KPI'));
 const handoff=await (await flow.read(owner,result.reportId,'handoff')).json();
 assert.ok(!('workplace' in handoff));assert.ok(!('productRules' in handoff));
 assert.equal(handoff.actions[0].ruleVersion,'product-action-1');assert.ok(!handoff.actions[0].unknownHard.includes('workplace'));
 const questionIds=flow.feedbackContext(owner,result.reportId).questions.map(q=>q.id);assert.ok(!questionIds.some(id=>id.includes('|workplace.')));
 for(const format of ['md','json','handoff']){const response=await flow.read(owner,result.reportId,format);assert.equal(response.status,200);assert.match(response.headers.get('content-disposition')??'',/attachment/);}
 assert.equal((await flow.read('another-owner',result.reportId,'json')).status,404);
});
