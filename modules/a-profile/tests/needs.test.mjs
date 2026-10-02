import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {NeedsService,deriveNeeds,describe,digest} from '../src/needs/service.mjs';
import {catalog,version,topics,questions} from '../src/needs/catalog.mjs';
import {validateExport} from '../src/contracts.mjs';
import {createServer} from '../src/server.mjs';
import {Service} from '../src/service.mjs';
import {ProfileService} from '../src/profile/service.mjs';

const sample=s=>{const d=structuredClone(s.data);for(const t of topics){d.answers[t.id+'.priority']='priority';d.answers[t.id+'.details']=[t.details[0].id];d.answers[t.id+'.policy']='verify_first';}d.conditions.find(c=>c.key==='city').value=['杭州'];d.conditions.find(c=>c.key==='city').strength='hard';d.conditions.find(c=>c.key==='min_fixed_monthly_salary').value=8000;d.conditions.find(c=>c.key==='min_fixed_monthly_salary').strength='hard';d.goalIds=['find_first_job'];d.stageId='graduate';d.industryTags=['software_it'];d.roleTypes=['engineering'];return d;};
test('seven topics have traceable topic evidence; 21 product items have no fake scale provenance or numerical scoring',()=>{
 assert.equal(topics.length,7);assert.equal(questions.length,21);assert.equal(new Set(questions.map(q=>q.id)).size,21);
 for(const q of questions){assert.equal(q.provenance.originalInstrument,null);assert.equal(q.provenance.itemOrigin,'product-authored');assert.equal(q.provenance.validationStatus,'not-validated');assert.equal(q.provenance.scoring,'none');assert.equal(q.provenance.reverseScored,null);for(const id of q.provenance.sourceIds)assert(catalog.sources.some(s=>s.id===id&&s.doi&&s.url&&s.limit));}
});
test('unknown remains unknown; seven selected priorities cannot create RIASEC, capability, company facts or hard filters',()=>{
 const state={},svc=new NeedsService(state),s=svc.create('u',{}),p=svc.preview('u',s.id);assert(p.snapshot.topics.every(t=>t.priority==='unknown'&&t.unknownHandling==='unknown'&&t.verificationSelectionStatus==='unknown'));assert.equal(p.snapshot.scores,null);assert(p.snapshot.topics.every(t=>!t.userConfirmed));
 const confirmed=svc.confirm('u',s.id,{expectedRevision:s.revision,confirmed:true}).export;validateExport(confirmed);assert(Object.values(confirmed.UserProfile.assessment.scores).every(x=>x===null));assert.deepEqual(confirmed.UserProfile.background,{education:null,major:null,skills:[],experiences:[]});assert(confirmed.SearchIntent.filters.every(c=>c.strength==='unknown'&&c.value===null));assert.equal(confirmed.JobNeedsSnapshot.handoff.status,'requires-bc-needs-mapping');
});
test('server validates preset responses/conditions/version and rejects free text, contradictory choices and stale revisions without mutation',()=>{
 const state={},svc=new NeedsService(state);let s=svc.create('u',{});
 const badData=[];for(const change of [d=>d.answers['growth.priority']='high',d=>d.answers['pay.details']=['unsure','fixed'],d=>d.answers['hours.details']=['overtime','overtime'],d=>d.conditions[0].value=['虚构城市'],d=>d.conditions[1]={key:'min_fixed_monthly_salary',value:7654,strength:'hard'},d=>d.conditions.push({key:'skills',value:'JS',strength:'hard'}),d=>d.resume='new material',d=>d.roleTypes=['invented'],d=>d.conditions[2].strength='hard']){const d=structuredClone(s.data);change(d);badData.push(d);}
 for(const d of badData){const before=JSON.stringify(state);assert.throws(()=>svc.update('u',s.id,{expectedRevision:s.revision,questionnaireVersion:version,step:0,data:d}));assert.equal(JSON.stringify(state),before);}
 assert.throws(()=>svc.update('u',s.id,{expectedRevision:s.revision,questionnaireVersion:'old',step:0,data:s.data}));assert.throws(()=>svc.confirm('u',s.id,{expectedRevision:s.revision,confirmed:false}));
 s=svc.update('u',s.id,{expectedRevision:s.revision,questionnaireVersion:version,step:7,data:sample(s)});const before=JSON.stringify(state);assert.throws(()=>svc.update('u',s.id,{expectedRevision:1,questionnaireVersion:version,step:0,data:s.data}),e=>e.status===409);assert.equal(JSON.stringify(state),before);assert.throws(()=>svc.get('other',s.id),e=>e.status===403);
});
test('canonical answers drive profile, text, report and export; revisions stay immutable and import remaps ownership',()=>{
 const state={},svc=new NeedsService(state);let s=svc.create('u',{});s=svc.update('u',s.id,{expectedRevision:s.revision,questionnaireVersion:version,step:8,data:sample(s)});
 const first=svc.confirm('u',s.id,{expectedRevision:s.revision,confirmed:true});s=first.session;const out=first.export;validateExport(out);assert.equal(out.UserProfile.assessment.version,'1');assert(out.UserProfile.preferences.filter(c=>c.strength==='hard').every(c=>c.confirmed));assert.equal(out.SearchIntent.filters.find(c=>c.key==='min_fixed_monthly_salary').value,8000);assert.deepEqual(out.SearchIntent.industryCodes,['I']);assert.deepEqual(out.SearchIntent.roleTypes,['engineering']);assert.equal(out.questionProvenance.length,21);
 const readable=describe(out.JobNeedsSnapshot);for(const topic of readable){assert(out.Report.markdown.includes(topic.title));for(const text of topic.details)assert(out.Report.markdown.includes(text));}assert(out.Report.markdown.includes('尚未接入B/C'));
 const d=structuredClone(s.data);d.answers['pay.priority']='secondary';s=svc.update('u',s.id,{expectedRevision:s.revision,questionnaireVersion:version,step:8,data:d});s=svc.confirm('u',s.id,{expectedRevision:s.revision,confirmed:true}).session;assert.equal(s.confirmedRevisions.at(-1),2);assert.deepEqual(svc.export('u',s.id,1),out);assert.equal(svc.export('u',s.id,2).JobNeedsSnapshot.topics.find(t=>t.topicId==='pay').priority,'secondary');
 const other=svc.import('other',out),imported=svc.export('other',other.id);assert.notEqual(other.profileId,s.profileId);assert.deepEqual(imported.JobNeedsSnapshot.answers,out.JobNeedsSnapshot.answers);assert.equal(imported.UserProfile.revision,1);assert.throws(()=>svc.export('u',other.id),e=>e.status===403);
 for(const change of [x=>x.JobNeedsSnapshot.topics[0].priority='secondary',x=>x.UserProfile.assessment.scores.R=80,x=>x.SearchIntent.filters[0].strength='soft',x=>x.questionProvenance[0].itemOrigin='validated',x=>x.UserProfile.background.skills=['JS'],x=>delete x.JobNeedsSnapshot]){const x=structuredClone(out);change(x);delete x.checksum;x.checksum=digest(x);const before=JSON.stringify(state);assert.throws(()=>svc.import('other',x));assert.equal(JSON.stringify(state),before);}
 const before=JSON.stringify(state);assert.throws(()=>svc.import('other',{UserProfile:out.UserProfile,SearchIntent:out.SearchIntent}));assert.equal(JSON.stringify(state),before);
});
test('failed persistence cannot commit an in-memory needs mutation',()=>{
 const state={},svc=new NeedsService(state,()=>{throw new Error('disk unavailable');});assert.throws(()=>svc.create('u',{}),/disk unavailable/);assert.equal(state.needs,undefined);
});
test('HTTP persists/restores, enforces owner/origin, exports and imports; old writes/English/material endpoints retired',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'a-needs-http-')),options={dataDir:join(dir,'data'),archiveDir:join(dir,'archive')};let server=createServer(options),base;const start=async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;};await start();
 const boot=await fetch(base+'/api/a/needs/bootstrap'),cookie=boot.headers.get('set-cookie').split(';')[0];assert.match(boot.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
 const call=async(path,method='GET',body,c=cookie,extra={})=>{const r=await fetch(base+path,{method,headers:{cookie:c,'content-type':'application/json',...extra},...(body!==undefined?{body:typeof body==='string'?body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};};
 try{
  assert.equal((await call('/api/a/needs/sessions','POST',{})).status,200);let s=(await call('/api/a/needs/bootstrap')).body.latestSessionId;s=(await call('/api/a/needs/sessions/'+s)).body;s=(await call('/api/a/needs/sessions/'+s.id,'PATCH',{expectedRevision:s.revision,questionnaireVersion:version,step:7,data:sample(s)})).body;
  await new Promise(r=>server.close(r));server=createServer(options);await start();assert.deepEqual((await call('/api/a/needs/sessions/'+s.id)).body,s);
  const second=await fetch(base+'/api/a/needs/bootstrap'),other=second.headers.get('set-cookie').split(';')[0];assert.equal((await call('/api/a/needs/sessions/'+s.id,'GET',undefined,other)).status,403);assert.equal((await call('/api/a/needs/sessions/'+s.id,'GET',undefined,'')).status,401);
  assert.equal((await call('/api/a/needs/sessions/'+s.id,'PATCH',{},cookie,{origin:'https://evil.example'})).status,403);
  assert.equal((await call('/api/a/needs/sessions','POST','not json')).status,422);
  const confirmed=await call('/api/a/needs/sessions/'+s.id+'/confirm','POST',{expectedRevision:s.revision,confirmed:true});assert.equal(confirmed.status,200);const out=(await call('/api/a/needs/sessions/'+s.id+'/export')).body;validateExport(out);assert.deepEqual(out,confirmed.body.export);assert.equal((await call('/api/a/needs/import','POST',out,other)).status,200);
  for(const path of ['/demo/a/v1','/app.mjs','/survey-adapter.mjs','/v2-app.mjs','/battery-survey.mjs'])assert.equal((await fetch(base+path)).status,410);
  for(const [path,method] of [['/api/a/v2/sessions','POST'],['/api/a/v2/attempts/old','PATCH'],['/api/a/v2/attempts/old/score','POST'],['/api/a/v2/profiles/old','DELETE']])assert.equal((await call(path,method,'invalid body')).status,410);
  for(const path of ['/api/a/v2/resume-imports','/api/a/v2/claims/old','/api/a/v2/sessions/old/statements'])assert.equal((await call(path,'POST','invalid materials')).body.error.code,'feature_removed');
  for(const path of ['/.data/state.json','/.translation-drafts/onet-mini-ip.zh-CN.private-draft.json','/rubbish/private/state.json'])assert.equal((await fetch(base+path)).status,404);
  const state=JSON.parse(readFileSync(join(options.dataDir,'state.json')));assert.equal(state.needs.snapshots[s.id+':1'].checksum,out.checksum);
 }finally{await new Promise(r=>server.close(r));}
});
test('transition archives exact previous state/answers/profiles before any needs save; legacy HTTP is read-only',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'a-needs-archive-')),dataDir=join(dir,'data'),archiveDir=join(dir,'archive');mkdirSync(dataDir);const old=new Service();old.state.sessions=['u'];const attempt=old.create('u','manual','onet-mini-ip');old.update('u',attempt.id,{expectedRevision:1,version:attempt.version,answers:{'mini-01':2}});const previous=new ProfileService(old.state,()=>{});const s=previous.create('u',{battery:'None'});const frozen=previous.confirm('u',s.profileId,{expectedRevision:s.revision,confirmed:true}).profile;const bytes=Buffer.from(JSON.stringify(old.state));writeFileSync(join(dataDir,'state.json'),bytes);
 const server=createServer({dataDir,archiveDir});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{const backup=readdirSync(archiveDir).find(p=>p.startsWith('needs-transition-'));assert.deepEqual(readFileSync(join(archiveDir,backup)),bytes);assert(backup.includes(createHash('sha256').update(bytes).digest('hex')));
  const r=await fetch(base+'/api/a/v2/profiles/'+s.profileId+'?revision=1',{headers:{cookie:'a_session=u'}});assert.equal(r.status,200);assert.deepEqual(await r.json(),frozen);
  const saved=JSON.parse(readFileSync(join(dataDir,'state.json')));assert.deepEqual(saved.attempts[attempt.id].answers,{'mini-01':2});assert.deepEqual(saved.v2.profiles[0],frozen);assert.equal(saved.needs,undefined);
 }finally{await new Promise(r=>server.close(r));}
});
