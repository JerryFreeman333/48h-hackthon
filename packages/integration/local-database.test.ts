import test from 'node:test';
import assert from 'node:assert/strict';
import {industries} from '../../modules/a-profile/src/taxonomy.mjs';
import {topics} from '../../modules/a-profile/src/needs/catalog.mjs';
import {matchesDatabaseIndustry} from './local-database';

test('the selectable finance industry admits bank domains without giving a named bank special treatment',()=>{
 assert.ok(industries.some(i=>i.id==='finance'));
 for(const domain of ['金融','城商行','股份制银行','农商行','保险','证券'])assert.equal(matchesDatabaseIndustry(['finance'],domain),true,domain);
 assert.equal(matchesDatabaseIndustry(['finance'],'软件与互联网'),false);
 assert.equal(matchesDatabaseIndustry(['software_it'],'城商行'),false);
 assert.equal(matchesDatabaseIndustry(['software_it'],'金融科技'),true);
 assert.equal(matchesDatabaseIndustry(['finance'],null),true);
 assert.equal(matchesDatabaseIndustry([],'城商行'),true);
});
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {databaseBundle,findDatabaseCandidates,relatedCompanyRecords,relevantCompanyExcerpt} from './local-database';
import {respondToJobNeeds} from './job-needs';
test('company association uses exact legal names and rejects conflicting codes without borrowing jobs',()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE companies(id INTEGER,full_name TEXT,credit_code_collab TEXT); CREATE TABLE company_business(company_id INTEGER,credit_code TEXT);');
 db.prepare('INSERT INTO companies VALUES(?,?,?)').run(1,'示例银行股份有限公司','ABC');db.prepare('INSERT INTO companies VALUES(?,?,?)').run(2,'示例银行股份有限公司',null);db.prepare('INSERT INTO companies VALUES(?,?,?)').run(3,'示例银行股份有限公司','OTHER');db.prepare('INSERT INTO companies VALUES(?,?,?)').run(4,'示例银行子公司','ABC');
 assert.deepEqual(relatedCompanyRecords(db,{company_id:1,full_name:'示例银行股份有限公司',credit_code_collab:'ABC'}),[1,2]);db.close();
});
test('company material admits named recruitment and excludes city noise and empty descriptions',()=>{
 assert.equal(relevantCompanyExcerpt({title:'杭州最值得去的15个景点',excerpt:'杭州文化'},'杭州银行股份有限公司','杭州银行 BANK OF HANGZHOU'),false);
 assert.equal(relevantCompanyExcerpt({title:'杭州银行招聘',excerpt:'杭州银行提供员工培训'},'杭州银行股份有限公司','杭州银行 BANK OF HANGZHOU'),true);
 assert.equal(relevantCompanyExcerpt({title:'杭州银行',excerpt:'由于此网站的设置，我们无法提供该页面的具体描述。'},'杭州银行股份有限公司','杭州银行'),false);
});

// Deliberately tempting statistics columns and job-scoped imports must remain references.
function withSelectionFixture(run:(input:Record<string,any>)=>void){
 const original=process.cwd(),root=mkdtempSync(join(tmpdir(),'xray-statistics-selection-')),data=join(root,'.data','company-database');
 mkdirSync(data,{recursive:true});
 const db=new DatabaseSync(join(data,'xray-v3-20261003.sqlite'));
 try{
  db.exec(`
   CREATE TABLE companies(id INTEGER,name TEXT,full_name TEXT,domain TEXT,credit_code_collab TEXT,identity_status_collab TEXT,notes TEXT);
   CREATE TABLE company_jobs(id INTEGER,company_id INTEGER,title TEXT,raw_jd TEXT,city TEXT,source_url TEXT,source_type TEXT,published_at TEXT,retrieved_at TEXT,salary_min REAL,salary_max REAL,salary_currency TEXT,salary_period TEXT,salary_basis TEXT,salary_tax_basis TEXT,salary_months INTEGER);
   CREATE TABLE company_business(id INTEGER,company_id INTEGER,legal_name TEXT,credit_code TEXT,is_listed INTEGER,listing_market TEXT,retrieved_at TEXT);
   CREATE TABLE evidence(id INTEGER,evidence_id TEXT,company_id INTEGER,job_id INTEGER,scope TEXT,source_type TEXT,title TEXT,url TEXT,published_at TEXT,retrieved_at TEXT,excerpt TEXT,verification TEXT,raw_meta TEXT,is_stale INTEGER,stale_reason TEXT);
   CREATE TABLE facts(id INTEGER,fact_id TEXT,company_id INTEGER,job_id INTEGER,fact_key TEXT,fact_value TEXT,status TEXT,evidence_ids TEXT,n_verified INTEGER,as_of TEXT);
   CREATE TABLE coverage(id INTEGER,company_id INTEGER,job_id INTEGER,topic TEXT,status TEXT,reason TEXT,checked_at TEXT);
   INSERT INTO companies VALUES(1,'示例软件公司','示例软件有限公司','软件','ABC','unresolved',NULL);
   INSERT INTO company_jobs VALUES(1,1,'Java开发工程师','杭州 Java 开发，税前固定月薪15-25K，每月发薪。','杭州','https://example.com/jobs/1','招聘摘录','2026-09-01','2026-10-01T00:00:00Z',15000,25000,'CNY','month','fixed','pre_tax',14);
   INSERT INTO company_jobs VALUES(2,1,'Java工程师薪资统计','杭州 Java 工程师薪酬分布统计：税前固定月薪20-40K，每月口径。','杭州','https://example.com/salary/2','薪资统计','2026-09-01','2026-10-01T00:00:00Z',20000,40000,'CNY','month','fixed','pre_tax',14);
   INSERT INTO company_jobs VALUES(3,1,'Java开发薪资分布','Java开发薪资分布统计，按全公司月薪口径整理。','杭州','https://example.com/salary/3','薪资统计','2026-09-01','2026-10-01T00:00:00Z',22000,35000,'CNY','month','fixed','pre_tax',14);
   INSERT INTO company_jobs VALUES(4,1,'销售经理','杭州销售经理招聘。','杭州','https://example.com/jobs/4','招聘摘录','2026-09-01','2026-10-01T00:00:00Z',10000,30000,'CNY','month','fixed','pre_tax',12);
   INSERT INTO evidence VALUES(1,'stats-job-evidence',1,2,'job','official','示例软件公司招聘','https://example.com/jobs/imported','2026-09-01','2026-10-01T00:00:00Z','杭州税前固定月薪20000元，双休，五险一金，正在招聘。','verified',NULL,0,NULL);
   INSERT INTO evidence VALUES(2,'company-evidence',1,NULL,'company','official','示例软件公司员工培训','https://example.com/company','2026-09-01','2026-10-01T00:00:00Z','示例软件公司为员工提供内部培训。','verified',NULL,0,NULL);
   INSERT INTO evidence VALUES(3,'stale-evidence',1,NULL,'company','official','示例软件公司已撤销薪资','https://example.com/stale','2026-09-01','2026-10-01T00:00:00Z','已撤销的固定月薪99999元，公司保障五险一金。','unverified',NULL,1,'上游核对后撤销');
   INSERT INTO evidence VALUES(4,'contradicted-evidence',1,NULL,'company','official','示例软件公司已否定晋升','https://example.com/contradicted','2026-09-01','2026-10-01T00:00:00Z','已否定的保证晋升和双休记录。','contradicted',NULL,0,NULL);
   INSERT INTO facts VALUES(1,'stats-job-fact',1,2,'job.salary','20000','supported','["stats-job-evidence"]',1,'2026-09-01');
   INSERT INTO facts VALUES(2,'stats-pay-fact',1,2,'needs.pay.fixed','税前固定月薪20000元','supported','["stats-job-evidence"]',1,'2026-09-01');
   INSERT INTO facts VALUES(3,'withdrawn-fact',1,NULL,'company.revenue','已否定的123亿元','contradicted','["company-evidence"]',1,'2026-09-01');
   INSERT INTO facts VALUES(4,'stale-pay-fact',1,NULL,'needs.pay.fixed','已撤销的固定月薪99999元','supported','["stale-evidence"]',1,'2026-09-01');
   INSERT INTO facts VALUES(5,'stale-legacy-fact',1,NULL,'B2.salary','已撤销的固定月薪99999元','supported','["stale-evidence"]',1,'2026-09-01');
   INSERT INTO facts VALUES(6,'contradicted-legacy-fact',1,NULL,'B4.promotion','已否定的保证晋升','contradicted','["contradicted-evidence"]',1,'2026-09-01');
   INSERT INTO coverage VALUES(1,1,2,'job_description','available','原采集记录将统计当作招聘。','2026-10-01T00:00:00Z');
  `);
  writeFileSync(join(data,'manifest.json'),JSON.stringify({sha256:'a'.repeat(64),importedAt:'2026-10-01T00:00:00Z',counts:{companies:1,company_jobs:4}}));
 }finally{db.close();}
 const input={SearchIntent:{projectId:'test-project',intentId:'test-intent',revision:1,mode:'manual',cities:['杭州'],filters:[],industryTags:['software_it'],roleTypes:['engineering']},JobNeedsSnapshot:{schemaVersion:'a-job-needs-1',projectId:'test-project',profileId:'test-profile',profileRevision:1,mode:'manual',confirmedAt:'2026-10-01T00:00:00Z',selectionData:{goalIds:['find_job']},topics:topics.map(t=>({topicId:t.id,title:t.title,priority:t.id==='pay'?'priority':'secondary',verificationItemIds:t.id==='pay'?['fixed']:[],unknownHandling:'verify_first',userConfirmed:true}))}};
 try{process.chdir(root);run(input);}finally{
  process.chdir(original);
  assert.equal(resolve(dirname(root)),resolve(tmpdir()));
  rmSync(root,{recursive:true,force:true});
 }
}

test('salary references alone can be selected while statistics never become a vacancy, city, salary or job fact',()=>withSelectionFixture(input=>{
 const found=findDatabaseCandidates(input);
 assert.deepEqual(found.candidates.map((c:Record<string,any>)=>c.recordId),[1]);
 assert.deepEqual(found.references.map(c=>c.recordId),[2,3]);
 const {bundle,databaseSource}=databaseBundle(input,[2,3]);
 assert.deepEqual(databaseSource.selectionRecords,bundle.jobs.map((job,index)=>({jobId:job.jobId,recordId:index+2,recordKind:'salary_reference'})));
 for(const job of bundle.jobs){
  assert.match(job.title,/^薪资统计参考 · /);
  assert.match(job.rawJd,/不是岗位 JD/);
  assert.equal(job.rawJd.includes('20-40K'),false);
  assert.equal(job.city,null);
  assert.equal(job.vacancyStatus,'unknown');
  assert.deepEqual(job.salary,{currency:'CNY',min:null,max:null,period:'unknown',basis:'unknown',taxBasis:'unknown',months:null});
  const coverage=bundle.coverage.find(c=>c.jobId===job.jobId&&c.topic==='job_description')!;
  assert.equal(coverage.status,'unavailable');assert.match(coverage.reason,/薪资统计参考.*不是招聘 JD/);
 }
 assert.ok(bundle.evidence.every(e=>e.jobId===null&&e.scope!=='job'));
 assert.equal(bundle.evidence.filter(e=>e.sourceType==='local_database_salary_reference').length,2);
 assert.ok(!bundle.evidence.some(e=>e.excerpt.includes('正在招聘')));
 assert.ok(bundle.facts.every(f=>f.jobId===null&&!f.key.startsWith('job.')));
 assert.ok(bundle.evidence.some(e=>e.excerpt.includes('员工提供内部培训')));
 assert.equal(databaseSource.coverageRecords.length,0);
 const pay=respondToJobNeeds(input.JobNeedsSnapshot,bundle).candidates[0].items[0];
 assert.equal(pay.status,'lead');
 assert.ok(pay.materials.every(m=>m.jobId===null&&m.sources.every(s=>s.scope==='company')));
 assert.ok(pay.gaps.some(g=>g.includes('不能证明这份岗位')));
}));

test('mixed job and salary-reference selections preserve each kind and share the current-shortlist selection limit',()=>withSelectionFixture(input=>{
 const {bundle,databaseSource}=databaseBundle(input,[2,1,3]);
 assert.deepEqual(databaseSource.selectionRecords.map(r=>[r.recordId,r.recordKind]),[[2,'salary_reference'],[1,'job_lead'],[3,'salary_reference']]);
 const actual=bundle.jobs[1],statistics=bundle.jobs[0];
 assert.equal(actual.city,'杭州');assert.equal(actual.salary.min,15000);
 assert.ok(bundle.facts.some(f=>f.jobId===actual.jobId&&f.key==='job.description'));
 assert.ok(bundle.facts.some(f=>f.jobId===actual.jobId&&f.key==='job.city'));
 assert.equal(statistics.salary.min,null);
 assert.ok(!bundle.facts.some(f=>f.jobId===statistics.jobId));
 assert.ok(!bundle.evidence.some(e=>e.jobId===statistics.jobId));
 for(const selection of [[],[2,2],[1,2,3,4],[4],[999],[2.5]])assert.throws(()=>databaseBundle(input,selection),/一至三条候选或薪资统计参考/);
}));

test('withdrawn company evidence and contradicted facts stay traceable but never enter analysis through normal or legacy references',()=>withSelectionFixture(input=>{
 const {bundle,databaseSource}=databaseBundle(input,[1,2]);
 assert.ok(bundle.evidence.some(e=>e.excerpt.includes('员工提供内部培训')));
 assert.ok(bundle.evidence.every(e=>!e.excerpt.includes('已撤销')&&!e.excerpt.includes('已否定')));
 assert.ok(bundle.facts.every(f=>!String(f.value).includes('已撤销')&&!String(f.value).includes('已否定')));
 assert.deepEqual(databaseSource.withdrawnEvidenceRecords.map(e=>e.recordId),[3,4]);
 assert.equal(databaseSource.withdrawnEvidenceRecords[0].staleReasonOriginal,'上游核对后撤销');
 assert.equal(databaseSource.withdrawnEvidenceRecords[1].verificationOriginal,'contradicted');
 const withdrawnFact=databaseSource.factRecords.find(f=>f.originalFactId==='withdrawn-fact')!;
 assert.equal(withdrawnFact.included,false);assert.match(withdrawnFact.note,/已标记否定或撤销/);
 const staleFact=databaseSource.factRecords.find(f=>f.originalFactId==='stale-pay-fact')!;
 assert.equal(staleFact.included,false);assert.deepEqual(staleFact.withdrawnEvidenceIds,['stale-evidence']);
 assert.ok(!databaseSource.sourceDates.some(e=>e.recordId===3||e.recordId===4));
}));
