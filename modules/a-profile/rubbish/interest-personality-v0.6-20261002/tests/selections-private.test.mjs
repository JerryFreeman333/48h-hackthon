import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,readdirSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ProfileService} from '../src/profile/service.mjs';
import {Service} from '../src/service.mjs';
import {createServer} from '../src/server.mjs';
import {loadState} from '../src/storage.mjs';
import {loadPrivateTranslationDraft} from '../src/instruments/presentation.mjs';
import {tools} from '../src/instruments/battery.mjs';
import {selectionCatalog,selectionVersion} from '../src/profile/selections.mjs';
const privateAvailable=existsSync('.translation-drafts/onet-mini-ip.zh-CN.private-draft.json');

test('choice-only writes and imports reject arbitrary text atomically; selected values export stable IDs',()=>{
 let saves=0;const svc=new ProfileService({},()=>saves++);let s=svc.create('u',{battery:'None'});
 const invalid=[{groups:[['自定义价值']]},{tradeoffs:['随意取舍']},{goals:['AI生成目标']},{jobStage:'自定义阶段'},{constraints:[{key:'custom',value:'x',strength:'hard',confirmed:true,evidenceIds:[]}]},{constraints:[{key:'city',value:['虚构城市'],strength:'soft',confirmed:true,evidenceIds:[]}]},{constraints:[{key:'min_fixed_monthly_salary',value:7654,strength:'hard',confirmed:true,evidenceIds:[]}]},{tradeoffs:[selectionCatalog.tradeoffs[2].text,selectionCatalog.tradeoffs[4].text]}];
 for(const bad of invalid){const before=JSON.stringify(svc.state),n=saves;assert.throws(()=>svc.update('u',s.id,{expectedRevision:s.revision,draft:{...s.draft,...bad}}));assert.equal(JSON.stringify(svc.state),before);assert.equal(saves,n);}
 s=svc.update('u',s.id,{expectedRevision:s.revision,draft:{...s.draft,groups:[['收入','成长']],tradeoffs:[selectionCatalog.tradeoffs[0].text],goals:[selectionCatalog.goals[0].text],jobStage:selectionCatalog.stages[2].text,constraints:[{key:'city',value:['杭州','上海'],strength:'soft',confirmed:true,evidenceIds:[]},{key:'min_fixed_monthly_salary',value:8000,strength:'hard',confirmed:true,evidenceIds:[]}]}});
 s=svc.confirm('u',s.profileId,{expectedRevision:s.revision,confirmed:true}).session;s=svc.intent('u',{expectedRevision:s.revision,profileId:s.profileId,profileRevision:1,selectedCodes:[]}).session;
 const out=svc.export('u',s.profileId);assert.equal(out.SelectionSnapshot.version,selectionVersion);assert.deepEqual(out.SelectionSnapshot.goalIds,['clarify_direction']);assert.deepEqual(out.SelectionSnapshot.tradeoffIds,['growth_over_starting_pay']);assert.equal(out.SelectionSnapshot.stageId,'graduate');assert.equal(out.SearchIntentV2.filters.find(c=>c.key==='min_fixed_monthly_salary').value,8000);
 const bad=structuredClone(out);bad.ProfileBundleV2.goals[0].text='新自由文字';const before=JSON.stringify(svc.state);assert.throws(()=>svc.import('other',bad));assert.equal(JSON.stringify(svc.state),before);
 const old=new Service(),a=old.create('u','manual','not-administered'),unchanged=JSON.stringify(old.state);assert.throws(()=>old.update('u',a.id,{expectedRevision:1,version:'1',answers:{},draft:{goals:'自由目标'}}));assert.equal(JSON.stringify(old.state),unchanged);
 assert.throws(()=>old.confirm('u',a.id,{expectedRevision:1,confirmed:true,goals:[],preferences:[{key:'city',value:['虚构城市'],strength:'hard',confirmed:true}]}));assert.equal(JSON.stringify(old.state),unchanged);
});

test('choice migration archives all original bytes, keeps prior profiles/answers and requires explicit reset confirmation',()=>{
 const dir=mkdtempSync(join(tmpdir(),'a-choice-')),data=join(dir,'data'),archive=join(dir,'archive');mkdirSync(data);const state={attempts:{},profiles:[],intents:[],metadata:{},scopeVersion:'personality-needs-1'};
 const svc=new ProfileService(state,()=>{});let s=svc.create('u',{battery:'None'});const old=svc.confirm('u',s.profileId,{expectedRevision:s.revision,confirmed:true}).profile;
 const rawSession=state.v2.sessions[s.id];delete rawSession.selectionVersion;rawSession.draft.goals=['旧自由目标'];rawSession.draft.constraints=[{key:'custom_worktime',value:'旧硬条件原文',strength:'hard',confirmed:true,evidenceIds:[]}];rawSession.attempts={'onet-mini-ip':{id:'old',answers:{'mini-01':2},instrumentId:'onet-mini-ip',instrumentVersion:tools['onet-mini-ip'].instrumentVersion,scoringVersion:tools['onet-mini-ip'].scoringVersion}};
 const frozen=structuredClone(old),answers=structuredClone(rawSession.attempts),bytes=Buffer.from(JSON.stringify(state));writeFileSync(join(data,'state.json'),bytes);
 const loaded=loadState(data,archive),backup=readdirSync(archive).find(x=>x.startsWith('choice-state-'));assert.deepEqual(readFileSync(join(archive,backup)),bytes);assert.deepEqual(loaded.v2.profiles[0],frozen);assert.deepEqual(loaded.v2.sessions[s.id].attempts,answers);assert.equal(loaded.v2.sessions[s.id].selectionResetRequired,true);assert.deepEqual(loaded.v2.sessions[s.id].draft.goals,[]);
 const upgraded=new ProfileService(loaded,()=>{});s=upgraded.get('u',s.id);assert.throws(()=>upgraded.confirm('u',s.profileId,{expectedRevision:s.revision,confirmed:true}),/旧自由填写/);s=upgraded.confirm('u',s.profileId,{expectedRevision:s.revision,confirmed:true,selectionResetConfirmed:true}).session;assert.equal(s.profileRevision,2);assert.deepEqual(upgraded.profile('u',s.profileId,1),frozen);loadState(data,archive);assert.equal(readdirSync(archive).length,1);
});

test('private Chinese interest uses the original numeric algorithm; public service cannot expose, import or downgrade it',{skip:!privateAvailable?'私有译稿未随公开仓库分发':false},()=>{
 const privateDraft=loadPrivateTranslationDraft(true),svc=new ProfileService({},()=>{},{privateDraft}),t=tools['onet-mini-ip'];
 for(const value of [0,1,2,3,4]){
  let s=svc.create('u',{battery:'Quick'}),a=s.attempts['onet-mini-ip'];assert.equal(a.locale,'zh-CN');const responses=t.items.map(q=>({itemId:q.id,value}));
  s=svc.updateAttempt('u',a.id,{expectedRevision:s.revision,instrumentVersion:a.instrumentVersion,scoringVersion:a.scoringVersion,responses});let result=svc.score('u',a.id,{expectedRevision:s.revision});const zh=result.snapshot;s=result.session;
  s=svc.updateAttempt('u',a.id,{expectedRevision:s.revision,instrumentVersion:a.instrumentVersion,scoringVersion:a.scoringVersion,responses:[],locale:'en',translationVersion:null});result=svc.score('u',a.id,{expectedRevision:s.revision});assert.deepEqual(zh.scores,result.snapshot.scores);assert.equal(zh.answersHash,result.snapshot.answersHash);assert(zh.scores.every(x=>x.raw===value*5));
 }
 let s=svc.create('u',{battery:'Quick'});s=svc.confirm('u',s.profileId,{expectedRevision:s.revision,confirmed:true}).session;s=svc.intent('u',{expectedRevision:s.revision,profileId:s.profileId,profileRevision:1,selectedCodes:[]}).session;const out=svc.export('u',s.profileId);assert.equal(out.privateReviewOnly,true);assert.throws(()=>svc.export('u',s.profileId,1,'v1'),e=>e.code==='private_translation_export');
 const normal=new ProfileService(svc.state,()=>{});assert(!normal.list('u').some(x=>x.id===s.id));assert.throws(()=>normal.get('u',s.id),e=>e.code==='private_preview_disabled');assert.equal(normal.bootstrap('u').instruments.find(x=>x.instrumentId==='onet-mini-ip').chineseDraft,null);assert.throws(()=>new ProfileService({},()=>{}).import('other',out),e=>e.code==='translation_not_released');assert(svc.import('other',out).privateReviewOnly);
});

test('private preview is explicitly opt-in and authenticated; runtime flags cannot be injected by client',{skip:!privateAvailable?'私有译稿未随公开仓库分发':false},async()=>{
 const dir=mkdtempSync(join(tmpdir(),'a-preview-')),servers=[false,true].map((privateTranslationPreview,i)=>createServer({dataDir:join(dir,'data'+i),archiveDir:join(dir,'archive'+i),privateTranslationPreview}));
 try{for(let i=0;i<servers.length;i++){const server=servers[i];await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,r=await fetch(base+'/api/a/v2/bootstrap'),b=await r.json(),cookie=r.headers.get('set-cookie').split(';')[0],t=b.instruments.find(x=>x.instrumentId==='onet-mini-ip');assert.equal(b.privateTranslationPreview,i===1);assert.equal(!!t.chineseDraft,i===1);if(i===1)assert.equal(t.chineseDraft.items.length,30);
  assert.equal((await fetch(base+'/.translation-drafts/onet-mini-ip.zh-CN.private-draft.json')).status,404);const injected=await fetch(base+'/api/a/v2/sessions',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({battery:'Quick',privateTranslationPreview:true})});assert.equal(injected.status,422);
  const noCookie=await fetch(base+'/api/a/v2/instruments');assert.equal(noCookie.status,401);
 }}finally{for(const s of servers)if(s.listening)await new Promise(r=>s.close(r));}
});
