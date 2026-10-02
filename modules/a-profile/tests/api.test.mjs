import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from '../src/server.mjs';
import {loadState} from '../src/storage.mjs';
test('legacy state archived byte-for-byte and isolated; startup idempotent',()=>{
 const root=mkdtempSync(join(tmpdir(),'xray-archive-'));const data=join(root,'data'),archive=join(root,'rubbish/private');loadState(data,archive);
 const old={attempts:{old:{id:'old',owner:'u',projectId:'project-old',profileId:'profile-old',version:'1',answers:{q01:5}},new:{id:'new',instrumentId:'not-administered',projectId:'project-new'}},profiles:[{profileId:'profile-old',projectId:'project-old',assessment:{instrumentId:'career-prototype-48'}}],intents:[{projectId:'project-old'}],metadata:{'profile-old:1':{secret:true}},sessions:['u']};
 const bytes=Buffer.from(JSON.stringify(old,null,2));writeFileSync(join(data,'state.json'),bytes);
 const state=loadState(data,archive);assert.deepEqual(readFileSync(join(archive,readdirSync(archive)[0])),bytes);assert.equal(state.attempts.old,undefined);assert.ok(state.attempts.new);assert.deepEqual(state.profiles,[]);assert.deepEqual(state.intents,[]);assert.deepEqual(state.metadata,{});
 assert.equal(loadState(data,archive).archivedLegacyProjects,1);assert.equal(readdirSync(archive).length,1);
});
test('HTTP persistence, auth, vendor assets and full A export',async()=>{
 const root=mkdtempSync(join(tmpdir(),'xray-api-'));const config={dataDir:join(root,'data'),archiveDir:join(root,'rubbish/private')};let server=createServer(config);
 const start=async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));return `http://127.0.0.1:${server.address().port}`;};let base=await start(),cookie='';
 const call=async(path,method='GET',body,own=cookie)=>{const r=await fetch(base+'/api/a/'+path,{method,headers:{cookie:own,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')};};
 try{
 assert.equal((await call('assessments','POST',{})).status,401);const boot=await call('bootstrap');cookie=boot.cookie.split(';')[0];assert.equal(boot.data.questions.length,30);
 assert.equal((await call('assessments','POST',{instrumentId:'career-prototype-48'})).status,422);
 const a=(await call('assessments','POST',{mode:'manual',instrumentId:'onet-mini-ip'})).data;
 const answers=Object.fromEntries(boot.data.questions.map(q=>[q.id,2]));assert.equal((await call(`assessments/${a.id}/answers`,'PATCH',{expectedRevision:1,version:a.version,answers,draft:{questionPage:4},step:1})).status,200);
 assert.equal((await call(`assessments/${a.id}/answers`,'PATCH',{expectedRevision:1,version:a.version,answers:{}})).status,409);
 assert.equal((await call(`assessments/${a.id}/score`,'POST',{})).data.rawScores.social,10);
 assert.equal((await call('profiles/extract','POST',{text:'test'})).status,503);
 const foreign=(await call('bootstrap','GET',undefined,'')).cookie.split(';')[0];assert.equal((await call(`assessments/${a.id}`,'GET',undefined,foreign)).status,403);
 await new Promise(r=>server.close(r));server=createServer(config);base=await start();assert.equal((await call(`assessments/${a.id}`)).data.draft.questionPage,4);
 for(const path of ['/demo/a','/vendor/survey.core.min.js','/vendor/survey-js-ui.min.js','/vendor/survey-core.fontless.min.css'])assert.equal((await fetch(base+path)).status,200);
 assert.equal((await fetch(base+'/rubbish/legacy-20261002/src/questionnaire.mjs')).status,404);
 const input={assessmentId:a.id,expectedRevision:2,confirmed:true,background:{education:'本科',major:null,skills:[],experiences:[]},goals:[],preferences:[{key:'accept_sales_kpi',value:false,strength:'hard',confirmed:true}]};
 assert.equal((await call(`profiles/${a.profileId}/confirm`,'PUT',input)).status,200);assert.equal((await call(`profiles/${a.profileId}/confirm`,'PUT',input)).status,409);
 assert.equal((await call('intents','POST',{assessmentId:a.id,profileRevision:1,industryTags:['software_it'],roleTypes:['product_operations']})).status,200);
 const x=(await call(`export/${a.projectId}`)).data;assert.equal(x.UserProfile.assessment.scores.social,50);assert.equal(x.SearchIntent.filters[0].value,false);
 const imported=await call('import','POST',x);assert.equal(imported.status,200);assert.equal(imported.data.attempt.owner,undefined);assert.equal((await call(`assessments/${imported.data.attempt.id}/score`,'POST',{})).status,422);
 }finally{await new Promise(r=>server.close(r));}
});
