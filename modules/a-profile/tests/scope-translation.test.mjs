import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,readdirSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {tools,assess} from '../src/instruments/battery.mjs';
import {miniIpipChinese,presentation} from '../src/instruments/presentation.mjs';
import {ProfileService} from '../src/profile/service.mjs';
import {Service} from '../src/service.mjs';
import {publicProfile,emptyBackground,FLOW_VERSION} from '../src/profile/scope.mjs';
import {loadState} from '../src/storage.mjs';
import {createServer} from '../src/server.mjs';
import {buildReport} from '../src/report/template.mjs';
import {fit} from '../src/occupation-fit/index.mjs';

test('original 50 items and both v0.3 scoring files are byte-identical to submitted Git blobs',()=>{
 const original={'src/instruments/battery.mjs':'b940bca7c3f1186c4967948e9a72c06008de97bb','src/instruments/scoring.mjs':'d63a6934d099e5cb1df5473f66cc8d96ff0dfef9','src/instruments/onet-mini-ip.json':'f040f8a33fcffbe925eb9cba6fd8a3fd1bb2c44c','src/instruments/mini-ipip.json':'dadbc2b8bec9402785021aeb4d3289d1efbdc96e'};
 for(const [path,sha] of Object.entries(original)){const b=readFileSync(path);assert.equal(createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${b.length}\0`),b])).digest('hex'),sha,path);}
});
test('20 Chinese items retain identity, source, five options and reverse key; difficulty differs from dislike',()=>{
 const t=tools['mini-ipip'],z=miniIpipChinese;assert.equal(z.items.length,20);assert.equal(z.officialChineseVersion,false);
 assert.deepEqual(z.responseScale.map(c=>[c.value,c.originalText]),t.responseScale.map(c=>[c.value,c.text]));
 for(const q of z.items){const src=t.items.find(s=>s.id===q.id);assert.equal(q.originalText,src.originalText);assert.equal(q.dimension,src.dimension);assert.equal(q.reverseScored,!!src.reverseScored);assert(q.chineseText&&q.translationVersion===z.translationVersion&&q.validationStatus==='not-validated');assert.equal(q.source,src.source);}
 assert.equal(z.items.find(q=>q.id==='mipip-18').chineseText,'我理解抽象概念有困难。');assert.equal(z.items.find(q=>q.id==='mipip-19').chineseText,'我对抽象概念不感兴趣。');
 assert(z.items.find(q=>q.id==='mipip-03').chineseText.includes('说话不多'));assert(z.items.find(q=>q.id==='mipip-16').chineseText.includes('情绪低落'));
 assert.throws(()=>presentation('onet-mini-ip','zh-CN'),e=>e.code==='translation_not_released');assert.throws(()=>presentation('mini-ipip','zh-CN','unsupported'));
});
test('English/Chinese presentation yields exactly equal scores, coverage and answer hashes including reverse extrema',()=>{
 for(const pattern of ['min','max','mixed','all-low','all-high']){
  const svc=new ProfileService({},()=>{});let s=svc.create('u',{battery:'Standard'});const a=s.attempts['mini-ipip'],t=tools['mini-ipip'];
  const responses=t.items.map((q,i)=>({itemId:q.id,value:pattern==='min'?(q.reverseScored?5:1):pattern==='max'?(q.reverseScored?1:5):pattern==='mixed'?i%5+1:pattern==='all-low'?1:5}));
  s=svc.updateAttempt('u',a.id,{expectedRevision:s.revision,instrumentVersion:a.instrumentVersion,scoringVersion:a.scoringVersion,responses});let result=svc.score('u',a.id,{expectedRevision:s.revision});s=result.session;const zh=result.snapshot;
  const zhEvidence=s.attempts['mini-ipip'].scoreEvidenceId;
  s=svc.updateAttempt('u',a.id,{expectedRevision:s.revision,instrumentVersion:a.instrumentVersion,scoringVersion:a.scoringVersion,responses:[],locale:'en',translationVersion:null});const rescored=svc.score('u',a.id,{expectedRevision:s.revision}),en=rescored.snapshot;
  const enEvidence=rescored.session.attempts['mini-ipip'].scoreEvidenceId;assert.notEqual(zhEvidence,enEvidence);assert.equal(rescored.session.evidence.find(e=>e.evidenceId===zhEvidence).status,'superseded');assert.equal(rescored.session.evidence.find(e=>e.evidenceId===enEvidence).locale,'en');
  for(const key of ['scores','complete','completeness','answersHash','norms','thresholds','confidence','displayTransform','missingPolicy'])assert.deepEqual(zh[key],en[key],pattern+':'+key);
  assert.equal(zh.locale,'zh-CN');assert.equal(zh.chineseValidation,'not-validated');assert.equal(en.locale,'en');assert.equal(en.translationVersion,null);
  if(pattern==='min')assert(zh.scores.every(s=>s.raw===4));if(pattern==='max')assert(zh.scores.every(s=>s.raw===20));
 }
});
const privateDraftPath='.translation-drafts/onet-mini-ip.zh-CN.private-draft.json';
test('local private O*NET draft keeps all 30 original identities/options and scores; is not a released presentation',{skip:!existsSync(privateDraftPath)?'私有审校译稿不随Git分发':false},()=>{
 const d=JSON.parse(readFileSync(privateDraftPath,'utf8')),t=tools['onet-mini-ip'];assert.equal(d.runtimeEnabled,false);assert.equal(d.distributionAllowed,false);assert.equal(d.items.length,30);
 assert.deepEqual(d.responseScale.map(x=>[x.value,x.originalText]),t.responseScale.map(x=>[x.value,x.text]));
 for(const q of d.items){const src=t.items.find(s=>s.id===q.id);assert.equal(q.originalText,src.originalText);assert.equal(q.dimension,src.dimension);assert.equal(q.itemNumber,src.itemNumber);assert.equal(q.reverseScored,false);assert(q.chineseText);}
 for(const value of [0,1,2,3,4]){const en=Object.fromEntries(t.items.map(q=>[q.id,value])),zh=Object.fromEntries(d.items.map(q=>[q.id,value]));assert.deepEqual(assess(t.instrumentId,en),assess(t.instrumentId,zh));}
});
test('scope upgrade archives exact bytes, preserves original immutable profiles/files/answers and restores old step safely',()=>{
 const dir=mkdtempSync(join(tmpdir(),'a-scope-')),data=join(dir,'data'),archive=join(dir,'private');mkdirSync(data);const state={attempts:{},profiles:[],intents:[],metadata:{},sessions:['u']};const svc=new ProfileService(state,()=>{});
 let s=svc.create('u',{battery:'None'});const p=svc.confirm('u',s.profileId,{expectedRevision:s.revision,confirmed:true}).profile;
 const secret='历史经历隐私原句';const e={evidenceId:'private-e',kind:'resume',sourceRef:'old-job',locator:'page1',instrumentId:null,instrumentVersion:null,locale:'zh-CN',collectedAt:s.createdAt,text:secret,status:'confirmed'};
 const cap={claimId:'private-c',kind:'experience',skill:'',description:secret,evidenceIds:[e.evidenceId],status:'confirmed'};const insight={insightId:'private-i',text:secret,evidenceIds:[e.evidenceId],status:'confirmed',userEditedText:null,limitations:[]};
 state.v2.profiles[0].capabilities=[cap];state.v2.profiles[0].evidence.push(e);state.v2.profiles[0].insights.push(insight);state.v2.profiles[0].uncertainties.push({code:'no_confirmed_experience',message:'旧提示',evidenceIds:[]});
 const rawSession=state.v2.sessions[s.id];delete rawSession.flowVersion;rawSession.step=4;rawSession.claims=[cap];rawSession.evidence.push(e);rawSession.insights.push(insight);rawSession.draft.statementBuffer=secret;rawSession.attempts={'onet-mini-ip':{id:'old-a',answers:{'mini-01':3,'mini-02':2},instrumentVersion:tools['onet-mini-ip'].instrumentVersion,scoringVersion:tools['onet-mini-ip'].scoringVersion}};const originalAnswers=structuredClone(rawSession.attempts);
 const oldFile=join(data,'historical-upload.private');writeFileSync(oldFile,secret);state.v2.jobs={'old-job':{id:'old-job',sessionId:s.id,path:oldFile,status:'processing'}};
 const frozen=structuredClone(state.v2.profiles[0]),bytes=Buffer.from(JSON.stringify(state,null,2));writeFileSync(join(data,'state.json'),bytes);
 const loaded=loadState(data,archive),backup=readdirSync(archive).find(x=>x.startsWith('scope-state-'));assert.deepEqual(readFileSync(join(archive,backup)),bytes);assert.equal(readFileSync(oldFile,'utf8'),secret);
 assert.deepEqual(loaded.v2.profiles[0],frozen);assert.deepEqual(loaded.v2.sessions[s.id].attempts,originalAnswers);assert.equal(loaded.v2.jobs,undefined);assert.equal(loaded.v2.sessions[s.id].step,4);assert.equal(loaded.v2.sessions[s.id].flowVersion,FLOW_VERSION);assert(!JSON.stringify(loaded.v2.sessions[s.id]).includes(secret));
 const upgraded=new ProfileService(loaded,()=>{}),view=upgraded.profile('u',p.profileId);assert.deepEqual(view.capabilities,[]);assert(!JSON.stringify(view).includes(secret));assert(!JSON.stringify(buildReport(frozen,fit(frozen))).includes(secret));assert.equal(view.revision,frozen.revision);
 assert.deepEqual(loadState(data,archive).v2.profiles[0],frozen);assert.equal(readdirSync(archive).length,1);
 const complete=structuredClone(rawSession);delete complete.flowVersion;complete.step=7;loaded.v2.sessions['old-final']={...complete,id:'old-final',profileId:'other'};assert.equal(upgraded.get('u','old-final').step,6);
});
test('v1/v2 reject new capability payloads without saving; compatibility placeholders do not mean low ability',()=>{
 const svc=new ProfileService({},()=>{}),s=svc.create('u',{battery:'None'});const before=JSON.stringify(svc.state);assert.throws(()=>svc.update('u',s.id,{expectedRevision:s.revision,draft:{...s.draft,statementBuffer:'new resume'}}));assert.equal(JSON.stringify(svc.state),before);
 const {profile:p,session:ready}=svc.confirm('u',s.profileId,{expectedRevision:s.revision,confirmed:true});svc.intent('u',{expectedRevision:ready.revision,profileId:p.profileId,profileRevision:1,selectedCodes:[]});const out=svc.export('u',p.profileId);
 const bad=structuredClone(out);bad.ProfileBundleV2.capabilities=[{claimId:'fake'}];const count=Object.keys(svc.db.sessions).length;assert.throws(()=>svc.import('u',bad));assert.equal(Object.keys(svc.db.sessions).length,count);
 const compatible=svc.export('u',p.profileId,1,'v1');assert.deepEqual(compatible.UserProfile.background,emptyBackground());assert(compatible.compatibilityWarnings.some(s=>s.includes('未评估')));assert(!out.Report.sections.some(s=>/经历|技能/.test(s.title)));
 const old=new Service(),a=old.create('u','manual','not-administered');assert.throws(()=>old.update('u',a.id,{expectedRevision:1,version:'1',draft:{skills:'new'}}));assert.throws(()=>old.confirm('u',a.id,{expectedRevision:1,confirmed:true,background:{...emptyBackground(),education:'本科'},goals:[],preferences:[]}));assert(!old.state.profiles.length);
});
test('removed HTTP endpoints return 410 before parsing materials; private draft/archive files unavailable',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'a-no-experience-')),server=createServer({dataDir:join(dir,'data'),archiveDir:join(dir,'private')});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 try{const boot=await fetch(origin+'/api/a/v2/bootstrap'),cookie=boot.headers.get('set-cookie').split(';')[0],b=await boot.json();assert(!Object.hasOwn(b,'ocrConnected'));assert.equal(b.instruments.find(t=>t.instrumentId==='onet-mini-ip').chineseDraft,null);
  for(const path of ['/api/a/v2/resume-imports','/api/a/v2/claims/old','/api/a/v2/sessions/old/statements','/api/a/profiles/extract']){const r=await fetch(origin+path,{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:'THIS IS NOT JSON OR A RESUME'});assert.equal(r.status,410);assert.equal((await r.json()).error.code,'feature_removed');}
  for(const path of ['/.translation-drafts/onet-mini-ip.zh-CN.private-draft.json','/rubbish/experience-flow-v0.3-20261002/src/resume/extract.mjs'])assert.equal((await fetch(origin+path)).status,404);
  const saved=JSON.parse(readFileSync(join(dir,'data/state.json')));assert.deepEqual(saved.v2.sessions,{});assert.equal(saved.v2.jobs,undefined);assert.equal(saved.profiles.length,0);
 }finally{await new Promise(r=>server.close(r));}
});
