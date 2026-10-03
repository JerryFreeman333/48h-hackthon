import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createAHost} from './a-host';
import {GET as bExport} from '../../app/api/b/bundles/[id]/export/route';
import {GET as cExport} from '../../app/api/c/reports/[id]/export/route';
import {GET as cSnapshot} from '../../app/api/c/reports/[id]/snapshot/route';
import {GET as reportExport} from '../../app/reports/export/route';
import {GET as demoExport} from '../../app/demo/c/export/route';
import {GET as productReport} from '../../app/api/integration/reports/[id]/route';
import {GET as flowReport} from '../../app/flow/reports/[id]/route';

test('download routes and format aliases reject every export format without attachment',async()=>{
 for(const get of [bExport,cExport,cSnapshot,reportExport,demoExport]){
  const response=await get(new Request('http://127.0.0.1/export?format=json'));
  assert.equal(response.status,403);assert.equal(response.headers.get('content-disposition'),null);
  assert.equal((await response.json()).error.code,'EXPORT_DISABLED');
 }
 const a=createAHost(mkdtempSync(join(tmpdir(),'xray-export-'))),globals=globalThis as any,previous=globals.__xrayAHost;
 globals.__xrayAHost=a;
 try{
  for(const get of [productReport,flowReport])for(const format of ['md','json','handoff','pdf']){
   const response=await get(new Request('http://127.0.0.1/flow/reports/report-example?format='+format),{params:Promise.resolve({id:'report-example'})});
   assert.equal(response.status,403);assert.equal(response.headers.get('content-disposition'),null);
  }
 }finally{globals.__xrayAHost=previous;}
});

test('saved needs stay readable by their owner without returning an export package',async()=>{
 const a=createAHost(mkdtempSync(join(tmpdir(),'xray-view-')));
 const boot=await a.handle(new Request('http://127.0.0.1/api/a/needs/bootstrap'));
 const cookie=boot.headers.get('set-cookie')!.split(';')[0];
 const request=(p:string,body?:unknown)=>new Request('http://127.0.0.1/api/a/needs'+p,{method:body?'POST':'GET',headers:{cookie,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const created=await (await a.handle(request('/sessions',{mode:'manual'}))).json();
 const response=await a.handle(request('/sessions/'+created.id+'/confirm',{expectedRevision:created.revision,confirmed:true}));
 assert.equal(response.status,200);const confirmation=await response.json();
 assert.ok(!('export' in confirmation));assert.ok(confirmation.view.JobNeedsSnapshot.topics.length===7);
 const view=await a.handle(request('/sessions/'+created.id+'/view?revision=1'));
 assert.equal(view.status,200);const body=await view.json();
 assert.ok(!('checksum' in body));assert.ok(!('Report' in body));assert.ok(!('questionProvenance' in body));
 assert.equal(body.UserProfile.revision,1);
 for(const suffix of ['export','report'])assert.equal((await a.handle(request('/sessions/'+created.id+'/'+suffix))).status,403);
 const other=await a.handle(new Request('http://127.0.0.1/api/a/needs/bootstrap'));
 assert.equal((await a.handle(new Request('http://127.0.0.1/api/a/needs/sessions/'+created.id+'/view',{headers:{cookie:other.headers.get('set-cookie')!.split(';')[0]}}))).status,403);
 const saved=await (await a.handle(request('/bootstrap'))).json();
 assert.equal(saved.sessions[0].step,9);assert.ok(saved.sessions[0].createdAt);
 assert.equal(a.service.export(a.owner(request('/bootstrap')),created.id,1).schemaVersion,'a-job-needs-export-1');
});
