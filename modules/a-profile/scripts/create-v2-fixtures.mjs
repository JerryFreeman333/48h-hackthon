import {writeFileSync} from 'node:fs';
import {ProfileService} from '../src/profile/service.mjs';
import {tools} from '../src/instruments/battery.mjs';
const svc=new ProfileService({},()=>{});let s=svc.create('synthetic-owner',{battery:'Standard',mode:'demo'});
for(const [id,a] of Object.entries(s.attempts)){const t=tools[id];s=svc.updateAttempt('synthetic-owner',a.id,{expectedRevision:s.revision,instrumentVersion:a.instrumentVersion,scoringVersion:a.scoringVersion,responses:t.items.map(q=>({itemId:q.id,value:id==='onet-mini-ip'?t.dimensions.indexOf(q.dimension)%5:3}))});s=svc.score('synthetic-owner',a.id,{expectedRevision:s.revision}).session;}
for(const i of s.insights)s=svc.reviewInsight('synthetic-owner',i.insightId,{expectedRevision:s.revision,status:'confirmed'});
s=svc.update('synthetic-owner',s.id,{expectedRevision:s.revision,draft:{groups:[['成长','收入']],tradeoffs:['愿意先了解岗位职责再明确其他条件'],goals:['探索软件开发方向'],jobStage:'应届求职',constraints:[{key:'accept_sales_kpi',value:false,strength:'hard',confirmed:true,evidenceIds:[]}]}});
const x=svc.confirm('synthetic-owner',s.profileId,{expectedRevision:s.revision,confirmed:true});s=x.session;
s=svc.intent('synthetic-owner',{expectedRevision:s.revision,profileId:s.profileId,profileRevision:1,selectedCodes:['15-1252.00'],maxCandidates:3}).session;
writeFileSync('fixtures/ProfileHandoffV2.demo.json',JSON.stringify(svc.export('synthetic-owner',s.profileId,1),null,2));
console.log('纯合成V2交接样例已生成；不代表真实用户或实际招聘。');
