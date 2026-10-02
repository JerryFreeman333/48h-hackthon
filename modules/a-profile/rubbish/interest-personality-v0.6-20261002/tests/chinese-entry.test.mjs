import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from '../src/server.mjs';
import {Service} from '../src/service.mjs';
import {ProfileService} from '../src/profile/service.mjs';

test('English entry and old assets return 410; public mode never creates an English fallback or deletes source answers',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'a-chinese-entry-')),dataDir=join(dir,'data');mkdirSync(dataDir);const old=new Service(),a=old.create('u','manual','onet-mini-ip');old.update('u',a.id,{expectedRevision:1,version:a.version,answers:{'mini-01':2}});const answers=structuredClone(old.state.attempts[a.id].answers);writeFileSync(join(dataDir,'state.json'),JSON.stringify(old.state));
 const server=createServer({dataDir,archiveDir:join(dir,'archive')});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{
  for(const path of ['/demo/a/v1','/app.mjs','/survey-adapter.mjs','/api/a/bootstrap','/api/a/assessments']){const r=await fetch(base+path);assert.equal(r.status,410);assert.equal((await r.json()).error.code,'english_entry_removed');}
  const b=await fetch(base+'/api/a/v2/bootstrap'),boot=await b.json(),cookie=b.headers.get('set-cookie').split(';')[0];assert(boot.instruments.every(t=>!t.availableLocales.includes('en')));assert.equal(boot.instruments[0].defaultLocale,null);
  for(const battery of ['Quick','Standard']){const r=await fetch(base+'/api/a/v2/sessions',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({battery})});assert.equal(r.status,422);assert.equal((await r.json()).error.code,'chinese_interest_unavailable');}
  for(const path of ['/demo/a','/vendor/survey.i18n.min.js','/selection-labels.mjs'])assert.equal((await fetch(base+path)).status,200);
  for(const path of ['/rubbish/english-entry-v0.5-20261002/src/ui/index.html','/.translation-drafts/题目审查_50题_20261002.md'])assert.equal((await fetch(base+path)).status,404);
  const saved=JSON.parse(readFileSync(join(dataDir,'state.json'),'utf8'));assert.deepEqual(saved.attempts[a.id].answers,answers);assert.equal(Object.keys(saved.v2.sessions).length,0);
 }finally{await new Promise(r=>server.close(r));}
});

test('legacy English drafts can explicitly switch to Chinese preserving answers and immutable versions; switch back rejected',{skip:!existsSync('.translation-drafts/onet-mini-ip.zh-CN.private-draft.json')?'本机私有译稿未分发':false},async()=>{
 const dir=mkdtempSync(join(tmpdir(),'a-chinese-migrate-')),dataDir=join(dir,'data');mkdirSync(dataDir);const state={sessions:['u']},svc=new ProfileService(state,()=>{});let s=svc.create('u',{battery:'Quick'}),frozen=svc.confirm('u',s.profileId,{expectedRevision:s.revision,confirmed:true}).profile;s=svc.get('u',s.id);let a=s.attempts['onet-mini-ip'];s=svc.updateAttempt('u',a.id,{expectedRevision:s.revision,instrumentVersion:a.instrumentVersion,scoringVersion:a.scoringVersion,responses:[{itemId:'mini-01',value:2}]});s=svc.update('u',s.id,{expectedRevision:s.revision,step:3});writeFileSync(join(dataDir,'state.json'),JSON.stringify(state));
 const server=createServer({dataDir,archiveDir:join(dir,'archive'),privateTranslationPreview:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const call=async(path,method='GET',body)=>{const r=await fetch(base+'/api/a/v2/'+path,{method,headers:{cookie:'a_session=u','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};};
 try{
  const boot=(await call('bootstrap')).body,draft=boot.instruments.find(t=>t.instrumentId==='onet-mini-ip').chineseDraft;
  const x=await call('attempts/'+a.id,'PATCH',{expectedRevision:s.revision,instrumentVersion:a.instrumentVersion,scoringVersion:a.scoringVersion,responses:[],locale:'zh-CN',translationVersion:draft.translationVersion});assert.equal(x.status,200);s=x.body;assert.equal(s.attempts['onet-mini-ip'].locale,'zh-CN');assert.equal(s.attempts['onet-mini-ip'].answers['mini-01'],2);
  const before=JSON.stringify(s),bad=await call('attempts/'+a.id,'PATCH',{expectedRevision:s.revision,instrumentVersion:a.instrumentVersion,scoringVersion:a.scoringVersion,responses:[{itemId:'mini-01',value:4}],locale:'en',translationVersion:null});assert.equal(bad.status,410);assert.equal(bad.body.error.code,'english_entry_removed');assert.equal(JSON.stringify((await call('sessions/'+s.id)).body),before);assert.deepEqual((await call('profiles/'+s.profileId+'?revision=1')).body,frozen);
 }finally{await new Promise(r=>server.close(r));}
});
