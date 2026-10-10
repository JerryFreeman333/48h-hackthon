import test from 'node:test';
import assert from 'node:assert/strict';
import {xmindCapabilities,executeXmind} from './execution';
import {sources} from './sources';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import type {V3Snapshot,V3Claim} from '../v3-contract';

test('capability API preserves all design nodes/relations while explicitly separating indexed, conditional and deferred capabilities',()=>{
 const cap=xmindCapabilities();assert.equal(cap.nodeCount,441);assert.equal(cap.leafCount,306);assert.equal(cap.relationships.length,13);assert.equal(cap.relationshipCoverage.length,13);assert.equal(cap.allCapabilitiesImplemented,false);assert.equal(cap.individualLeafAcceptance,'not_established');assert.equal(new Set(cap.nodes.map(n=>n.id)).size,441);
 assert.equal(cap.designSha256,createHash('sha256').update(readFileSync('docs/agent-v3/source/一家公司完整Agent运行树.xmind')).digest('hex'));
 assert.equal(cap.executionArchitecture.agentCount,11);assert.equal(cap.executionArchitecture.independentModelProcesses,false);assert.ok(cap.nodes.some(n=>n.status==='deferred_connector'));assert.ok(cap.nodes.some(n=>n.status==='conditional_model'));assert.ok(cap.nodes.every(n=>n.validation==='not_individually_verified'));assert.ok(cap.coverageNotice.includes('不计算'));
});

test('local office/OCR code paths and their real validation boundaries differ from deferred platform crawlers',()=>{
 for(const id of ['docx','xlsx','csv','ocr']){const source=sources.find(s=>s.id===id)!;assert.equal(source.status,'available');assert.equal(source.validation,'controlled_parser_tests');assert.equal(source.cost,'local');assert.ok(source.prerequisite);}
 for(const id of ['wechat','qq','kanzhun','maimai','boss','gsxt']){const source=sources.find(s=>s.id===id)!;assert.equal(source.status,'connector_pending');assert.equal(source.implementation,'deferred_connector');assert.equal(source.validation,'routing_only');}
 assert.equal(sources.find(s=>s.id==='news')?.validation,'not_platform_verified');assert.equal(sources.find(s=>s.id==='official')?.implementation,'public_http');assert.equal(xmindCapabilities().documents.ocrReviewRequired,true);
});

test('model capability never exposes credentials and distinguishes disabled, missing credentials and configured-unverified states',()=>{
 const enabled=process.env.RESEARCH_AGENT_V3_MODEL_ENABLED,credential=process.env.MINIMAX_API_KEY;
 try{
  delete process.env.MINIMAX_API_KEY;process.env.RESEARCH_AGENT_V3_MODEL_ENABLED='false';assert.equal(xmindCapabilities().model.state,'disabled');
  process.env.RESEARCH_AGENT_V3_MODEL_ENABLED='true';assert.equal(xmindCapabilities().model.state,'not_configured');
  process.env.MINIMAX_API_KEY='controlled-secret-never-sent';const cap=xmindCapabilities();assert.equal(cap.model.state,'configured_unverified');assert.equal(cap.model.maxCallsPerInvestigation,1);assert.ok(!JSON.stringify(cap).includes('controlled-secret-never-sent'));
 }finally{if(enabled===undefined)delete process.env.RESEARCH_AGENT_V3_MODEL_ENABLED;else process.env.RESEARCH_AGENT_V3_MODEL_ENABLED=enabled;if(credential===undefined)delete process.env.MINIMAX_API_KEY;else process.env.MINIMAX_API_KEY=credential;}
});

test('team and business source objects have explicit citations and unconfirmed relationships; absent or fabricated departments are not invented',()=>{
 const company={companyId:'c',legalName:'目标股份有限公司',brandName:'目标',creditCode:null,identityStatus:'ambiguous'},job={jobId:'j',companyId:'c',title:'工程师'};
 const text='目标股份有限公司的工程师归属嵌入式研发团队；公司主营业务为视频产品研发。';
 const claim:V3Claim={id:'source-claim',companyId:'c',jobId:'j',subject:company.legalName,subjectMatch:'exact',scope:'job',predicate:'business',quote:text,evidenceId:'e',locator:{paragraph:1},fields:{mechanism:'公司主营业务为视频产品研发。'},period:null,city:null,team:'嵌入式研发团队',role:'工程师',polarity:'positive',conditions:[],answerTarget:'source_statement',verification:'source_claim',reviewRequired:false};
 const bundle:any={companies:[company],jobs:[job],evidence:[{evidenceId:'e',companyId:'c',jobId:'j',scope:'job',sourceType:'agent_v3_user_text',excerpt:text,url:null}],facts:[]};
 const s={taskId:'graph-test',profileRevision:1,questions:[],claims:[claim],sourceAttempts:[],sourceRelations:[],reviews:[],model:{status:'disabled',reason:'本机规则'},semanticChecks:[]} as unknown as V3Snapshot;
 const x=executeXmind(s,bundle);assert.ok(x.entities.some(e=>e.kind==='team'&&e.name==='嵌入式研发团队'));assert.ok(x.entities.some(e=>e.kind==='business'&&text.includes(e.name)));const links=x.relations.filter(r=>['claimed_team','claimed_business'].includes(r.kind));assert.equal(links.length,2);assert.ok(links.every(r=>r.status==='source_claim'&&r.evidenceIds[0]==='e'));
 const uncertain=executeXmind({...s,claims:[{...claim,subjectMatch:'unconfirmed'}]},bundle);assert.ok(uncertain.relations.filter(r=>['claimed_team','claimed_business'].includes(r.kind)).every(r=>r.status==='unconfirmed'));
 const fabricated=executeXmind({...s,claims:[{...claim,team:'未出现的部门'}]},bundle);assert.ok(!fabricated.entities.some(e=>e.kind==='team'));
 const absent=executeXmind({...s,claims:[{...claim,team:null,predicate:'fixed_salary'}]},bundle);assert.ok(!absent.entities.some(e=>['team','business'].includes(e.kind)));
});
