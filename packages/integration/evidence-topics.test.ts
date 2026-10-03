import test from 'node:test';
import assert from 'node:assert/strict';
import {demoSample} from '../../modules/b-research/research-service';
import {topics} from '../../modules/a-profile/src/needs/catalog.mjs';
import {candidateBundleSchema,type CandidateBundle} from '../contracts';
import {evidenceSchema} from '../../modules/c-report/domain/schema';
import {evidenceTopicLinks} from './evidence-topics';
import {extractNeedLeads} from './database-investigation';
import {respondToJobNeeds} from './job-needs';
import {mergeAgentMaterials} from '../../modules/research-agent/research';
function fixture(){const b=demoSample().bundle;const e:CandidateBundle['evidence'][number]={...b.evidence[0],evidenceId:'direct',companyId:b.jobs[0].companyId,jobId:null,scope:'company' as const,sourceType:'franklin_search',searchTopics:['pay' as const],excerpt:'员工每周双休；提供五险一金；团队氛围开放。',verification:'unverified' as const};b.evidence=[e];b.facts=[];const s={schemaVersion:'a-job-needs-1',projectId:b.projectId,profileId:'p',profileRevision:b.intentRevision,mode:b.mode,confirmedAt:b.retrievedAt,topics:topics.map(t=>({topicId:t.id,title:t.title,priority:'priority',verificationItemIds:t.details.map((d:{id:string})=>d.id),unknownHandling:'verify_first',userConfirmed:true}))};return {b,e,s};}
test('one Agent passage directly answers multiple themes without generated facts and keeps provenance through both contracts',()=>{
 const {b,e,s}=fixture();extractNeedLeads(b);assert.equal(b.facts.length,0);assert.deepEqual(e.topicLinks?.map(l=>l.topicId),['hours','benefits','culture']);
 const parsed=candidateBundleSchema.parse(JSON.parse(JSON.stringify(b)));assert.deepEqual(parsed.evidence[0].searchTopics,['pay']);assert.deepEqual(evidenceSchema.parse(parsed.evidence[0]).topicLinks,e.topicLinks);
 const items=respondToJobNeeds(s,parsed).candidates[0].items;for(const [topic,item] of [['hours','rest'],['benefits','coverage'],['culture','collaboration']]){const r=items.find(i=>i.topicId===topic&&i.itemId===item)!;assert.equal(r.status,'lead');assert.deepEqual(r.factIds,[]);assert.deepEqual(r.evidenceIds,['direct']);assert.equal(r.materials[0].factId,null);}
 assert.equal(items.find(i=>i.topicId==='benefits'&&i.itemId==='basis')!.status,'unknown');assert.match(items.find(i=>i.topicId==='benefits'&&i.itemId==='basis')!.explanation,/主题已有一般线索/);
});
test('search label cannot override unrelated text, years, customer teaching, negative wording or other-job scope',()=>{
 const {b,e,s}=fixture();e.excerpt='成立于1996年，负责为客户提供培训。';assert.deepEqual(evidenceTopicLinks(e),[]);
 e.excerpt='不提供五险一金；不提供内部培训。';assert.ok(evidenceTopicLinks(e).find(l=>l.topicId==='benefits')!.quotes[0].includes('不提供'));
 const r=respondToJobNeeds(s,b).candidates[0].items;assert.equal(r.find(i=>i.topicId==='benefits'&&i.itemId==='coverage')!.status,'lead');
 b.evidence[0]={...e,jobId:'another-job',scope:'job'};assert.ok(respondToJobNeeds(s,b).candidates[0].items.every(i=>i.status==='unknown'));
});
test('identical Agent sources merge search topics without counting a second independent material',()=>{
 const {b}=fixture();b.evidence=[];const target={recordId:450,companyId:b.jobs[0].companyId!,name:'测试公司'},source:any={};
 const raw={id:'one',company_id:450,topic:'benefits' as const,title:'员工保障',excerpt:'每周双休，提供五险一金',url:'https://example.com/a',source_type:'search',published_at:null,collected_at:'2026-10-03T11:00:00Z',verification_original:'unverified'};
 mergeAgentMaterials(b,source,target,{company_id:450,topics:['benefits'],facts:[],evidence:[raw]});mergeAgentMaterials(b,source,target,{company_id:450,topics:['hours'],facts:[],evidence:[{...raw,id:'two',topic:'hours'}]});
 assert.equal(b.evidence.length,1);assert.deepEqual(b.evidence[0].searchTopics,['benefits','hours']);assert.equal(source.agentTransfer.accepted,1);assert.equal(source.agentTransfer.reused,1);
});
