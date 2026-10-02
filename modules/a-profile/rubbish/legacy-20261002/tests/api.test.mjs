import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from '../src/server.mjs';
test('HTTP flow, auth, conflict, persistence, extraction failure and foreign export',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'xray-a-'));let server=createServer({dataDir:dir});await new Promise(r=>server.listen(0,'127.0.0.1',r));let base=`http://127.0.0.1:${server.address().port}`;let cookie='';
 const call=async(path,method='GET',body,own=cookie)=>{const r=await fetch(base+'/api/a/'+path,{method,headers:{cookie:own,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')};};
 const verifyConfirmation=async(a)=>{const input={assessmentId:a.id,expectedRevision:2,confirmed:true,background:{education:'本科',major:null,skills:['需求访谈'],experiences:[]},goals:[],preferences:[{key:'accept_sales_kpi',value:false,strength:'hard',confirmed:true}]};const p=await call(`profiles/${a.profileId}/confirm`,'PUT',input);assert.equal(p.status,200);assert.equal((await call(`profiles/${a.profileId}/confirm`,'PUT',input)).status,409);assert.equal((await call('intents','POST',{assessmentId:a.id,profileRevision:1,industryTags:['software_it'],roleTypes:['product_operations']})).status,200);const x=await call(`export/${a.projectId}`);assert.equal(x.data.UserProfile.background.education,'本科');assert.equal(x.data.SearchIntent.filters[0].value,false);};
 try{assert.equal((await call('assessments','POST',{})).status,401);cookie=(await call('bootstrap')).cookie.split(';')[0];const a=(await call('assessments','POST',{mode:'manual'})).data;assert.equal((await call(`assessments/${a.id}/answers`,'PATCH',{expectedRevision:1,version:'1',answers:{q01:5}})).status,200);assert.equal((await call(`assessments/${a.id}/answers`,'PATCH',{expectedRevision:1,version:'1',answers:{}})).status,409);assert.equal((await call('profiles/extract','POST',{text:'test'})).status,503);const foreign=(await call('bootstrap','GET',undefined,'')).cookie.split(';')[0];assert.equal((await call(`export/${a.projectId}`,'GET',undefined,foreign)).status,403);await new Promise(r=>server.close(r));server=createServer({dataDir:dir});await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;assert.equal((await call(`assessments/${a.id}`)).data.answers.q01,5);assert.equal((await fetch(base+'/demo/a')).status,200);
 const restored=(await call('bootstrap')).data.attempts[0];await verifyConfirmation(restored);
 }finally{await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true});}
});
