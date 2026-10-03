import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseSourceDeclaration,reportDataStatus} from './data-status';
import {createAHost} from './a-host';
import {createDemoFlow} from './demo-flow';

test('recording method does not assert authenticity; presentation requires declared actual materials and a source',()=>{
 const saved=(mode:string,sourceDeclarations:any[]=[])=>({inputs:{bundle:{mode,jobs:[{jobId:'j'}]},sourceDeclarations}});
 assert.equal(reportDataStatus(saved('manual')).authenticityLabel,'真实性未声明');
 assert.equal(reportDataStatus(saved('manual')).presentationEligible,false);
 assert.equal(reportDataStatus(saved('demo')).sourceLabel,'合成测试样例');
 assert.equal(reportDataStatus(saved('manual',[{jobId:'j',kind:'synthetic',actualMaterialConfirmed:true,sourceUrl:'https://example.com'}])).presentationEligible,false);
 assert.equal(reportDataStatus(saved('manual',[{jobId:'j',kind:'user_provided',actualMaterialConfirmed:true,sourceUrl:'https://example.com'}])).verificationLabel,'未独立核验');
 assert.equal(reportDataStatus(saved('manual',[{jobId:'j',kind:'user_provided',actualMaterialConfirmed:true,sourceUrl:'https://example.com'}])).presentationEligible,true);
 assert.throws(()=>parseSourceDeclaration({kind:'synthetic',actualMaterialConfirmed:true},'https://example.com'),/合成/);
 assert.throws(()=>parseSourceDeclaration({actualMaterialConfirmed:true},null),/来源链接/);
 assert.throws(()=>parseSourceDeclaration({kind:'source_connected'},'https://example.com'));
});

test('source labels survive restart and needs revisions; changed materials need a new actual-material declaration',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'xray-labels-')),a=createAHost(join(dir,'a')),owner='label-owner';
 const s=a.service.create(owner,{mode:'manual'}),input=a.service.confirm(owner,s.id,{expectedRevision:s.revision,confirmed:true}).export;
 let flow=createDemoFlow({dataDir:join(dir,'reports')});
 // This is a deliberately synthetic test fixture. The flag tests a user declaration, not real-world truth.
 const first=await flow.runManual(owner,input,{title:'合成测试：来源声明验收',rawJd:'虚构单元测试资料，无销售KPI。',sourceUrl:'https://example.com/source'},{kind:'user_provided',actualMaterialConfirmed:true});
 const before=flow.list(owner)[0];assert.equal(before.dataStatus.presentationEligible,true);
 assert.match(await(await flow.read(owner,first.reportId)).text(),/资料来源：用户提供资料/);
 assert.match(await(await flow.read(owner,first.reportId)).text(),/核验状态：未独立核验/);
 flow=createDemoFlow({dataDir:join(dir,'reports')});assert.deepEqual(flow.list(owner)[0].dataStatus,before.dataStatus);
 const resumed=a.service.get(owner,s.id),next=a.service.confirm(owner,s.id,{expectedRevision:resumed.revision,confirmed:true}).export;
 const revised=await flow.reanalyze(owner,first.reportId,next);assert.equal(flow.list(owner).find(r=>r.reportId===revised.reportId)!.dataStatus.presentationEligible,true);
 const changed=await flow.updateMaterial(owner,first.reportId,{sameJobConfirmed:true,title:'合成测试：修订资料',rawJd:'虚构更新资料，无销售KPI。',sourceUrl:'https://example.com/new'});
 assert.equal(flow.list(owner).find(r=>r.reportId===changed.reportId)!.dataStatus.presentationEligible,false);
 assert.deepEqual(flow.list(owner).find(r=>r.reportId===first.reportId)!.dataStatus,before.dataStatus);
 const fake=await flow.runManual(owner,input,{title:'明确虚构测试',rawJd:'虚构测试资料。'},{kind:'synthetic'});
 assert.equal(flow.list(owner).find(r=>r.reportId===fake.reportId)!.dataStatus.sourceLabel,'合成测试样例');
 assert.equal(flow.list('other-owner').length,0);
 const comparison=await flow.compare(owner,[first.reportId,fake.reportId]);
 assert.equal(flow.list(owner).find(r=>r.reportId===comparison.reportId)!.dataStatus.presentationEligible,false);
});
