// Public HTTP black-box validation. Binary fixtures are synthetic, never company evidence.
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const base=process.env.V3_BASE_URL??'http://127.0.0.1:3220',dir='.data/xmind-structure-acceptance';mkdirSync(dir,{recursive:true});
const session=JSON.parse(readFileSync('.data/xmind-acceptance/session.json','utf8'));
async function req(path,body,owner=session.cookie){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{cookie:owner,...(body?{origin:base,'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const t=await r.text();let data;try{data=JSON.parse(t);}catch{data=t;}if(!r.ok)throw Error(path+' '+r.status+' '+JSON.stringify(data).slice(0,700));return data;}
const investigation=id=>req('/api/integration/reports/'+id+'/investigation').then(d=>d.agentV3);
let current=session.reportId,s=await investigation(current);const initial=s,oldHtml=await req(session.reportUrl);
assert.equal(new Set(s.xmindCollaboration.tasks.map(t=>t.agent)).size,11);assert.equal(s.xmindCollaboration.status,'completed');assert.equal(s.xmindCollaboration.tools.filter(t=>t.engine==='model').length,0);
assert.ok(s.xmindLifecycle);assert.ok(['disabled','not_configured'].includes(s.xmindSemantic.status));
if(!s.xmindLifecycle.refreshQuestions.length){const r=await fetch(base+'/api/integration/reports/'+current+'/sources-update',{method:'POST',headers:{cookie:session.cookie,origin:base,'content-type':'application/json'},body:JSON.stringify({reason:'expired_source',v3:{discovery:'supplied_only'}})});assert.equal(r.status,422);assert.deepEqual(await investigation(current),initial);}
const label=new Date().toISOString(),fixtures=JSON.parse(readFileSync(dir+'/document-fixtures/controlled-inputs.json','utf8')).map(f=>({...f,title:f.title+' [验收 '+label+']'})),results=[];
for(let offset=0;offset<fixtures.length;offset+=3){
 const group=fixtures.slice(offset,offset+3),ids=[];for(const fixture of group)ids.push((await req('/api/integration/materials',fixture)).importId);
 const body={reason:'new_material',v3:{discovery:'supplied_only',importIds:ids}},previous=current,previousSnapshot=s;
 // Concurrent duplicate submissions must return one frozen result.
 const [a,b]=await Promise.all([req('/api/integration/reports/'+previous+'/sources-update',body),req('/api/integration/reports/'+previous+'/sources-update',body)]);assert.equal(a.reportId,b.reportId);assert.notEqual(a.reportId,previous);
 current=a.reportId;s=await investigation(current);writeFileSync(dir+'/architecture-checkpoint.json',JSON.stringify({reportId:current,snapshot:s},null,2));assert.notEqual(s.taskId,previousSnapshot.taskId);assert.equal(s.budget.usedRequests,0);assert.equal(s.budget.modelCalls,0);
 for(const old of previousSnapshot.sourceAttempts)assert.ok(s.sourceAttempts.some(n=>n.sourceId===old.sourceId&&n.rawHash===old.rawHash),'prior original retained');
 for(const fixture of group){const hash=createHash('sha256').update(Buffer.from(fixture.content,'base64')).digest('hex'),attempt=s.sourceAttempts.find(a=>a.rawRef?.includes('/'+s.taskId+'/')&&a.rawHash===hash&&a.acquisitionMode==='user_'+fixture.kind&&a.accessState==='ok'&&a.evidenceIds.length);assert.ok(attempt,fixture.title+' must have located body: '+JSON.stringify(s.sourceAttempts.filter(a=>a.rawRef?.includes('/'+s.taskId+'/')).map(a=>({mode:a.acquisitionMode,state:a.accessState,reason:a.failureReason}))));
  const source=await req('/api/integration/reports/'+current+'/sources/'+attempt.evidenceIds[0]);assert.equal(source.originalAvailable,true);assert.ok(source.text.length);assert.equal(source.rawHash,attempt.rawHash);
  if(fixture.kind==='xlsx')assert.ok(attempt.locators.some(l=>l.sheet&&l.cell));if(fixture.kind==='csv')assert.ok(attempt.locators.some(l=>l.row&&l.column));if(fixture.kind==='image')assert.ok(attempt.locators.some(l=>l.bbox?.length&&typeof l.ocr_confidence==='number'));
  if(fixture.kind==='image'||fixture.kind==='pdf'){assert.equal(attempt.reviewRequired,true);assert.ok(s.reviews.length);}
  results.push({title:fixture.title,kind:fixture.kind,syntheticFixture:true,rawHash:attempt.rawHash,locators:attempt.locators.length,reviewRequired:!!attempt.reviewRequired});
 }
 assert.equal((await req('/api/integration/reports/'+previous+'/sources-update',body)).reportId,current);assert.deepEqual(await investigation(previous),previousSnapshot);
}
// Reject wrong company, distinguish annual package from fixed monthly amount.
for(const [title,content,expectReject] of [
 ['合成错误主体','其他企业有限公司\n岗位：嵌入式软件工程师\n固定月薪：税前20000元。',true],
 ['合成年度口径','浙江大华技术股份有限公司\n岗位：嵌入式软件工程师\n年薪30万元，包含绩效与奖金。',false],
]){
 const m=await req('/api/integration/materials',{kind:'text',title,content,syntheticFixture:true});const update=await req('/api/integration/reports/'+current+'/sources-update',{reason:'new_material',v3:{discovery:'supplied_only',importIds:[m.importId]}});current=update.reportId;s=await investigation(current);
 const attempts=s.sourceAttempts.filter(a=>a.rawRef?.includes('/'+s.taskId+'/'));
 if(expectReject){assert.ok(attempts.some(a=>['quarantined','rejected'].includes(a.analysisState)));assert.equal(attempts.flatMap(a=>a.evidenceIds).length,0);}else{const evidenceIds=attempts.flatMap(a=>a.evidenceIds);assert.ok(evidenceIds.length);assert.equal(s.claims.filter(c=>evidenceIds.includes(c.evidenceId)&&c.predicate==='fixed_salary'&&c.fields.basis==='fixed_monthly').length,0);}
}
assert.equal(await req(session.reportUrl),oldHtml);assert.ok((await req('/flow/reports/'+current)).includes('本次 Agent 协作结果'));assert.ok(s.keyQuestionIds.length<=3);assert.ok(s.questions.every(q=>q.conclusion==='unknown'));
const foreign=await fetch(base+'/api/integration/reports/'+current+'/sources-update',{method:'POST',headers:{cookie:'a_session=foreign-owner',origin:base,'content-type':'application/json'},body:JSON.stringify({reason:'expired_source',v3:{discovery:'supplied_only'}})});assert.ok([400,401,404].includes(foreign.status));
const summary={result:'pass',initialReportId:session.reportId,finalReportId:current,agents:11,initialTaskCount:initial.xmindCollaboration.tasks.length,files:results,networkRequests:0,modelCalls:0,checks:['actual A/B/C report','binary body and locators','OCR review','concurrent/replayed update deduplication','seed generation isolation','prior sources retained','immutable old report','wrong subject quarantined','annual pay not monthly fixed','owner isolation'],synthetic:'All six binary documents and two boundary texts are explicitly synthetic acceptance material; prior official HTML/PDF remain separately marked real.'};
writeFileSync(dir+'/architecture-http.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
