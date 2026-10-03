import test from 'node:test';
import assert from 'node:assert/strict';
import {industries} from '../../modules/a-profile/src/taxonomy.mjs';
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
import {relatedCompanyRecords,relevantCompanyExcerpt} from './local-database';
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
