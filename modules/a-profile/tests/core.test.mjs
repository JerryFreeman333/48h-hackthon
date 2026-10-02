import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mini,itemProvenance,dimensions,getInstrument} from '../src/instruments/registry.mjs';
import {score,validateAnswers} from '../src/instruments/scoring.mjs';
import {Service} from '../src/service.mjs';
import {validateExport} from '../src/contracts.mjs';
const background={education:null,major:null,skills:[],experiences:[]};
const all=value=>Object.fromEntries(mini.items.map(q=>[q.id,value]));
const confirm=(s,a,extra={})=>s.confirm('u',a.id,{expectedRevision:a.revision,confirmed:true,background,goals:[],preferences:[],...extra});
test('official complete instrument, item numbers, dimension keys and provenance',()=>{
 assert.equal(mini.items.length,30);assert.deepEqual(mini.items.map(q=>q.itemNumber),Array.from({length:30},(_,i)=>i+1));
 for(const d of dimensions)assert.equal(mini.items.filter(q=>q.dimension===d).length,5);
 for(const p of itemProvenance()){assert.equal(p.reverseScored,false);assert.equal(p.chineseSource,null);assert.equal(p.translationStatus,'original-English-unmodified');assert.ok([18,19].includes(p.sourcePage.pdfPage));assert.equal(p.missingRule,null);}
 assert.throws(()=>getInstrument('career-prototype-48'));
});
test('0–4 anchors, Unsure valid, raw sums, display conversion and ties',()=>{
 assert.deepEqual(Object.values(score(all(0)).rawScores),[0,0,0,0,0,0]);
 assert.deepEqual(Object.values(score(all(2)).rawScores),[10,10,10,10,10,10]);
 assert.deepEqual(Object.values(score(all(4)).scores),[100,100,100,100,100,100]);
 const mixed=all(0);for(const [i,q] of mini.items.filter(q=>q.dimension==='realistic').entries())mixed[q.id]=i;
 assert.equal(score(mixed).rawScores.realistic,10);assert.equal(score(mixed).scores.realistic,50);
 assert.equal(score(all(2)).portrait.ranking.length,1);assert.equal(score(all(2)).portrait.ranking[0].dimensions.length,6);
});
test('missing, invalid values and old IDs never fabricate results',()=>{
 const x=all(4);x['mini-01']=null;assert.equal(score(x).scores.realistic,null);assert.equal(score(x).scores.social,null);
 assert.equal(score(x).portrait.complete,false);assert.equal(score(x).coverage.realistic.answered,4);
 for(const input of [{'mini-01':5},{'mini-01':1.5},{'mini-01':'2'},{q01:4}])assert.throws(()=>validateAnswers(input));
 assert.deepEqual(Object.values(score({},'not-administered').scores),[null,null,null,null,null,null]);
});
test('portrait and export share score; confirmation never invents constraints',()=>{
 const s=new Service();const a=s.create('u');s.update('u',a.id,{expectedRevision:1,version:a.version,answers:all(2)});
 const p=confirm(s,a,{preferences:[{key:'accept_sales_kpi',value:false,strength:'hard',confirmed:true},{key:'accept_travel',value:false,strength:'hard',confirmed:false}]});
 const meta=s.state.metadata[`${p.profileId}:1`];assert.deepEqual(p.assessment.scores,meta.portrait.displayScores);assert.equal(p.assessment.interpretation,meta.portrait.interpretation);
 s.intent('u',{assessmentId:a.id,profileRevision:1,industryTags:['software_it'],roleTypes:['product_operations']});
 const x=s.export('u',a.projectId);validateExport(x);assert.equal(x.SearchIntent.filters[1].value,null);assert.equal(x.SearchIntent.filters[1].strength,'unknown');
 confirm(s,a,{goals:['新目标']});assert.equal(s.export('u',a.projectId).UserProfile.revision,1);assert.deepEqual(meta.answersSnapshot,all(2));
});
test('ownership, conflicts, version and incomplete confirmation',()=>{
 const s=new Service();const a=s.create('u');assert.throws(()=>s.owned('v',a.id),e=>e.status===403);assert.throws(()=>confirm(s,a));
 s.update('u',a.id,{expectedRevision:1,version:a.version,answers:{'mini-01':0}});
 assert.throws(()=>s.update('u',a.id,{expectedRevision:1,version:a.version,answers:{}}),e=>e.status===409);
 assert.throws(()=>s.update('u',a.id,{expectedRevision:2,version:'future',answers:{}}));
 a.version='future';assert.throws(()=>s.result('u',a.id));
});
test('skipped assessment supports A flow; import never recomputes absent answers',()=>{
 const s=new Service();const a=s.create('u','demo','not-administered');const p=confirm(s,a);s.intent('u',{assessmentId:a.id,profileRevision:p.revision,industryTags:[],roleTypes:[]});
 const exported=s.export('u',a.projectId);const imported=s.import('v',exported);assert.notEqual(imported.attempt.projectId,a.projectId);
 validateExport(s.export('v',imported.attempt.projectId));assert.throws(()=>s.result('v',imported.attempt.id));
 s.update('v',imported.attempt.id,{expectedRevision:1,version:'1',draft:{imported:false}});assert.throws(()=>s.result('v',imported.attempt.id));
});
test('legacy exports rejected without mutation',()=>{
 const s=new Service();const x={UserProfile:JSON.parse(readFileSync(new URL('../rubbish/legacy-20261002/fixtures/UserProfile.json',import.meta.url))),SearchIntent:JSON.parse(readFileSync(new URL('../rubbish/legacy-20261002/fixtures/SearchIntent.json',import.meta.url)))};
 assert.throws(()=>s.import('u',x));assert.equal(Object.keys(s.state.attempts).length,0);
});
