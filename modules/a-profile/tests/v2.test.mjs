import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {tools,assess,canonicalResponses} from '../src/instruments/battery.mjs';
import {pearson,catalog,fit,domesticSeeds} from '../src/occupation-fit/index.mjs';
import {ProfileService} from '../src/profile/service.mjs';
import {validateHandoff} from '../src/profile/schemas.mjs';
import {buildReport,validateReport} from '../src/report/template.mjs';
import {checkFile,candidatesFromText} from '../src/resume/extract.mjs';
import {createServer} from '../src/server.mjs';

const service=()=>new ProfileService({},()=>{}, {dataDir:mkdtempSync(join(tmpdir(),'a-v2-'))});
function fill(svc,s,id,kind='shape'){
 const t=tools[id],a=s.attempts[id];const responses=t.items.map(q=>({itemId:q.id,value:kind==='middle'?(id==='mini-ipip'?3:2):id==='mini-ipip'?(q.reverseScored?1:5):t.dimensions.indexOf(q.dimension)%5}));
 s=svc.updateAttempt('u',a.id,{expectedRevision:s.revision,instrumentVersion:a.instrumentVersion,scoringVersion:a.scoringVersion,responses});
 return svc.score('u',a.id,{expectedRevision:s.revision}).session;
}
function acknowledge(svc,s){for(const i of s.insights)s=svc.claim('u',i.insightId,{expectedRevision:s.revision,status:'confirmed'});return s;}
function confirmed(svc,battery='Quick',kind='shape'){let s=svc.create('u',{battery,mode:'demo'});for(const id of Object.keys(s.attempts))s=fill(svc,s,id,kind);s=acknowledge(svc,s);const x=svc.confirm('u',s.profileId,{expectedRevision:s.revision,confirmed:true});return {s:x.session,p:x.profile};}

test('Mini-IPIP complete official key: exact dimensions, 1 positive/3 negative O, extrema',()=>{
 const t=tools['mini-ipip'];assert.equal(t.items.length,20);assert.equal(t.items.filter(q=>q.dimension==='intellect_imagination'&&q.reverseScored).length,3);
 assert(t.items.every(q=>q.originalText&&q.source==='https://ipip.ori.org/MiniIPIPKey.htm'&&q.chineseText===null));
 const answers=Object.fromEntries(t.items.map(q=>[q.id,q.reverseScored?1:5]));assert(assess('mini-ipip',answers).scores.every(s=>s.raw===20&&s.normalized===1));
 for(const q of t.items)answers[q.id]=q.reverseScored?5:1;assert(assess('mini-ipip',answers).scores.every(s=>s.raw===4&&s.normalized===0));
 const n=assess('mini-ipip',Object.fromEntries(t.items.map(q=>[q.id,q.reverseScored?1:5]))).scores.find(s=>s.dimension==='neuroticism');assert.equal(n.normalized,1);assert.equal(1-n.normalized,0);
});
test('battery missing/null, repeated IDs, fractions, invalid range and mixed instruments rejected',()=>{
 assert(assess('onet-mini-ip',{}).scores.every(s=>s.raw===null));assert.equal(assess('mini-ipip',{'mipip-01':3}).scores[0].raw,null);
 const t=tools['mini-ipip'];for(const responses of [[{itemId:t.items[0].id,value:6}],[{itemId:t.items[0].id,value:1.5}],[{itemId:t.items[0].id,value:NaN}],[{itemId:'mini-01',value:3}],[{itemId:t.items[0].id,value:3},{itemId:t.items[0].id,value:4}]])assert.throws(()=>canonicalResponses(responses,t));
});
test('Pearson shape equivalence, opposite shape, equal constant and missing never imply perfect fit',()=>{
 assert.equal(pearson([0,1,2,3,4,5],[0,1,2,3,4,5]).r,1);assert.equal(pearson([2,3,4,5,6,7],[0,1,2,3,4,5]).r,1);
 assert.equal(pearson([0,1,2,3,4,5],[5,4,3,2,1,0]).r,-1);
 for(const v of [0,2,4])assert.equal(pearson(Array(6).fill(v),Array(6).fill(v)).r,null);
 assert.equal(pearson([null,1,2,3,4,5],[0,1,2,3,4,5]).flag,'insufficient_data');assert.equal(pearson([0,1,2,3,4,5],[1,1,1,1,1,1]).flag,'undifferentiated_profile');
});
test('real official catalog coverage and source metadata; seed aliases do not generate new profiles',()=>{
 assert.equal(catalog.loadedCount,catalog.entries.length+catalog.excluded.length);assert.equal(catalog.completeCount,catalog.entries.length);assert(catalog.completeCount>900);
 assert.deepEqual(catalog.scaleRange,{minimum:1,maximum:7});assert(catalog.entries.every(o=>o.interestVector.every(v=>v>=1&&v<=7)));
 assert(catalog.sources.every(x=>/^[a-f0-9]{64}$/.test(x.sha256)));assert(catalog.entries.every(o=>o.interestVector.length===6&&o.ratings.every(r=>r.scaleId==='OI'&&r.updatedAt&&r.elementId)));
 assert(domesticSeeds.entries.every(s=>catalog.entries.some(o=>o.onetCode===s.onetCode)));assert.equal(domesticSeeds.reviewStatus,'requires_domestic_jd_review');
});
test('owner/revision/version guards and explicit profile confirmation',()=>{
 const svc=service(),s=svc.create('u',{battery:'Quick'}),a=s.attempts['onet-mini-ip'];assert.throws(()=>svc.get('other',s.id),/访问权限/);
 assert.throws(()=>svc.update('u',s.id,{expectedRevision:0}),/刷新/);
 assert.throws(()=>svc.updateAttempt('u',a.id,{expectedRevision:s.revision,instrumentVersion:'other',scoringVersion:a.scoringVersion,responses:[]}),/版本不一致/);
 assert.throws(()=>svc.confirm('u',s.profileId,{expectedRevision:s.revision,confirmed:false}),/本人确认/);
});
test('confirmed scores, readable report and interest comparison share facts; N never enters interest rank',()=>{
 const svc=service();const {s,p}=confirmed(svc,'Standard');const f=fit(p),r=buildReport(p,f);assert.equal(p.assessments.length,2);assert.equal(f.status,'ranked');assert.equal(f.candidates.length,10);
 assert.deepEqual(buildReport(p,f),r);const edited=structuredClone(p);edited.assessments[1].scores.forEach(sc=>{sc.raw=4;sc.normalized=0;});assert.deepEqual(fit(edited),f);
 assert(r.sections[0].claims[0].text.includes(p.assessments[0].scores[0].raw+'/20'));assert(r.sections.flatMap(s=>s.claims).every(c=>c.evidenceIds.every(id=>p.evidence.some(e=>e.evidenceId===id)||id.startsWith('onet:'))));
 assert(s.profileRevision===p.revision);
});
test('rejected insight excluded; scores retained; changed answers invalidate old explanations',()=>{
 const svc=service();let s=svc.create('u',{battery:'Quick'});s=fill(svc,s,'onet-mini-ip');const old=s.insights[0];s=svc.claim('u',old.insightId,{expectedRevision:s.revision,status:'rejected'});
 const {profile:p}=svc.confirm('u',s.profileId,{expectedRevision:s.revision,confirmed:true});const r=buildReport(p,fit(p));assert(p.assessments[0].complete);assert(!r.sections.find(s=>s.title==='已确认的解释').claims.length);
 const bad=structuredClone(r);bad.sections[0].claims[0].evidenceIds=['fake'];assert.throws(()=>validateReport(bad,p,fit(p)),/引用无效/);
 const numeric=structuredClone(r);numeric.sections[0].claims[0].text='职业兴趣匹配100%，适合创业';assert.throws(()=>validateReport(numeric,p,fit(p)),/偏离冻结/);
 s=svc.get('u',s.id);const a=s.attempts['onet-mini-ip'];s=svc.updateAttempt('u',a.id,{expectedRevision:s.revision,instrumentVersion:a.instrumentVersion,scoringVersion:a.scoringVersion,responses:[{itemId:'mini-01',value:4}]});assert.equal(s.evidence.find(e=>e.evidenceId===old.evidenceIds[0]).status,'superseded');assert.equal(s.insights[0].status,'rejected');
});
test('resume candidates preserve literal participation/limited skill and are pending until confirmation',()=>{
 const rows=candidatesFromText([{locator:'page1',text:'本科\n专业：计算机\n技能：了解Python\n参与项目，完成测试\n电话：12345678901'}]);assert.equal(rows.length,4);assert(rows.some(r=>r.description==='参与项目，完成测试'));assert(!JSON.stringify(rows).includes('负责人'));
 const svc=service();let s=svc.create('u',{battery:'None'});s=svc.statement('u',s.id,{expectedRevision:s.revision,text:'参与项目，完成测试'});assert.equal(s.claims[0].status,'pending');assert.throws(()=>svc.confirm('u',s.profileId,{expectedRevision:s.revision,confirmed:true}),/逐条/);
 const c=s.claims[0];s=svc.claim('u',c.claimId,{expectedRevision:s.revision,status:'confirmed',description:'参与项目，完成手工测试'});const {profile:p}=svc.confirm('u',s.profileId,{expectedRevision:s.revision,confirmed:true});assert(p.evidence.some(e=>e.text==='参与项目，完成测试'));assert(p.evidence.some(e=>e.kind==='user_edit'));assert(p.capabilities[0].description==='参与项目，完成手工测试');
});
test('immutable revisions, constraints unknown/hard semantics, hard v2 downgrade blocked',()=>{
 const svc=service();let {s,p}=confirmed(svc,'None');s=svc.update('u',s.id,{expectedRevision:s.revision,draft:{...s.draft,constraints:[{key:'work_schedule',value:'不接受夜班',strength:'hard',confirmed:true,evidenceIds:[]}],groups:[['收入','成长']],tradeoffs:[],goals:[],jobStage:null}});
 const x=svc.confirm('u',s.profileId,{expectedRevision:s.revision,confirmed:true});s=x.session;const i=svc.intent('u',{expectedRevision:s.revision,profileId:s.profileId,profileRevision:2,selectedCodes:[],maxCandidates:3});s=i.session;
 assert.deepEqual(svc.profile('u',s.profileId,1),p);assert.throws(()=>svc.export('u',s.profileId,2,'v1'),/硬条件/);assert.equal(svc.export('u',s.profileId,2).SearchIntentV2.filters[0].value,'不接受夜班');
});
test('v2 handoff import validates facts/ranges, isolates identity and never recalculates absent answers',()=>{
 const svc=service();let {s}=confirmed(svc);s=svc.intent('u',{expectedRevision:s.revision,profileId:s.profileId,profileRevision:1,selectedCodes:['15-1252.00'],maxCandidates:3}).session;
 const out=svc.export('u',s.profileId,1);validateHandoff(out);const imported=svc.import('other',out);assert.notEqual(imported.profileId,s.profileId);assert.throws(()=>svc.confirm('other',imported.profileId,{expectedRevision:imported.revision,confirmed:true}),/不可重算/);
 const bad=structuredClone(out);bad.ProfileBundleV2.assessments[0].scores[0].normalized=.99;assert.throws(()=>svc.import('other',bad),/量程/);
 assert.throws(()=>svc.get('u',imported.id),/访问权限/);
});
test('upload signature and size checks reject disguised files and zip bombs',()=>{
 assert.throws(()=>checkFile('resume.pdf',Buffer.from('not pdf')));assert.throws(()=>checkFile('resume.docx',Buffer.from([80,75,3,4])));
 assert.throws(()=>checkFile('resume.png',Buffer.alloc(10*1024*1024+1)));
});
test('V2 HTTP save/restart, ownership, import, report and private deletion',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'v2-http-')),options={dataDir:join(dir,'data'),archiveDir:join(dir,'archive'),modelsDir:join(dir,'absent')};let server=createServer(options);
 async function start(){await new Promise(r=>server.listen(0,'127.0.0.1',r));return 'http://127.0.0.1:'+server.address().port;}
 let origin=await start();const bootstrap=await fetch(origin+'/api/a/v2/bootstrap');const cookie=bootstrap.headers.get('set-cookie').split(';')[0];
 const request=async(p,method='GET',body,c=cookie)=>{const r=await fetch(origin+'/api/a/v2/'+p,{method,headers:{cookie:c,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,x:await r.json()};};
 try{
  let {x:s}=await request('sessions','POST',{battery:'None',mode:'demo'});s=(await request('sessions/'+s.id,'PATCH',{expectedRevision:s.revision,step:4})).x;
  await new Promise(r=>server.close(r));server=createServer(options);origin=await start();assert.equal((await request('sessions/'+s.id)).x.step,4);
  const second=await fetch(origin+'/api/a/v2/bootstrap'),other=second.headers.get('set-cookie').split(';')[0];assert.equal((await request('sessions/'+s.id,'GET',undefined,other)).status,403);
  const confirmed=(await request('profiles/'+s.profileId+'/confirm','POST',{expectedRevision:s.revision,confirmed:true})).x;s=confirmed.session;
  const intent=(await request('search-intents','POST',{expectedRevision:s.revision,profileId:s.profileId,profileRevision:1,selectedCodes:[],maxCandidates:3})).x;s=intent.session;
  const exported=(await request('profiles/'+s.profileId+'/export')).x;validateHandoff(exported);assert(exported.Report.sections.length);
  assert.equal((await fetch(origin+'/.data/state.json')).status,404);assert.equal((await fetch(origin+'/rubbish/private/state.json')).status,404);
  assert.equal((await request('profiles/'+s.profileId,'DELETE',{})).status,200);assert.equal((await request('profiles/'+s.profileId)).status,404);
  assert(!JSON.parse(readFileSync(join(options.dataDir,'state.json'))).v2.profiles.length);
 }finally{await new Promise(r=>server.close(r));}
});
