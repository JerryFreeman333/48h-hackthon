import {writeFileSync,mkdirSync} from 'node:fs';
import {NeedsService} from '../src/needs/service.mjs';
import {catalog,version,topics,questions} from '../src/needs/catalog.mjs';
const service=new NeedsService({}),s=service.create('fixture-only',{mode:'demo'}),data=structuredClone(s.data);
for(const t of topics){data.answers[t.id+'.priority']='priority';data.answers[t.id+'.details']=[t.details[0].id];data.answers[t.id+'.policy']='verify_first';}
data.goalIds=['find_first_job'];data.stageId=null;data.industryTags=['software_it'];data.roleTypes=['product_operations'];
data.conditions.find(c=>c.key==='city').value=['杭州'];data.conditions.find(c=>c.key==='city').strength='soft';data.conditions.find(c=>c.key==='accept_sales_kpi').value=false;data.conditions.find(c=>c.key==='accept_sales_kpi').strength='hard';
const next=service.update('fixture-only',s.id,{expectedRevision:s.revision,questionnaireVersion:version,step:8,data}),out=service.confirm('fixture-only',s.id,{expectedRevision:next.revision,confirmed:true}).export;
mkdirSync('fixtures',{recursive:true});writeFileSync('fixtures/AJobNeedsExport.demo.json',JSON.stringify(out,null,2)+'\n');writeFileSync('fixtures/UserProfile.json',JSON.stringify(out.UserProfile,null,2)+'\n');writeFileSync('fixtures/SearchIntent.json',JSON.stringify(out.SearchIntent,null,2)+'\n');
writeFileSync('docs/JOB_NEEDS_ITEM_PROVENANCE.json',JSON.stringify({version,measurement:catalog.measurement,validationStatus:'not-validated',sources:catalog.sources,questions},null,2)+'\n');
const rows=questions.map((q,i)=>'| '+(i+1)+' | `'+q.id+'` | '+q.text+' | '+(q.kind==='single'?'单选':'多选，暂不确定互斥')+' | '+q.provenance.sourceIds.join('、')+' |');
writeFileSync('docs/JOB_NEEDS_21_QUESTIONS.md','# 七主题需求问题 · 逐题审阅\n\n版本：`'+version+'`。21题由本产品新写，用于采集求职需求。论文只支持主题，不是题目原文来源；无正式量表题号、反向计分、总分、阈值或常模。尚未完成认知访谈或验证研究。原50题与算法保持历史存档。\n\n| 序号 | 稳定题号 | 中文问题 | 回答形式 | 主题依据ID |\n| --- | --- | --- | --- | --- |\n'+rows.join('\n')+'\n\n## 统一选项\n\n每个主题第一题：这是我的求职重点／会考虑，但不是当前重点／暂不确定。\n\n第二题：选择该主题的具体核验项目，可多选；“暂不确定”与具体项目互斥。完整选项在[JOB_NEEDS_ITEM_PROVENANCE.json](JOB_NEEDS_ITEM_PROVENANCE.json)中，编码为稳定字符串，无数值分。\n\n第三题：先核实我关心的项目，再作决定／可以继续了解，但保留未知／暂不确定。\n\n缺答、空多选及暂不确定都保留unknown，不按低分处理。本人确认只确认选择，不证明任何企业事实。\n\n论文台账见[JOB_NEEDS_EVIDENCE.md](JOB_NEEDS_EVIDENCE.md)。\n');
console.log('Generated explicit demo needs export and 21-item provenance; no real company or assessment score created.');
