import {escapeHtml as e} from '../../c-report/ui/render-html';
import type {XmindExecution} from './schema';
import type {V3Snapshot} from '../v3-contract';
import {sources} from './sources';
const names:Record<string,string>={planner:'问题规划',router:'来源分配',collector:'材料获取',identity:'主体与岗位关系',provenance:'原文与来源关系',extractor:'陈述抽取',propagation:'传播线索',verifier:'可比性与复核',interpreter:'三层解释',followup:'补查与退出',archive:'归档与更新'};
const states:Record<string,string>={completed:'已运行',partial:'部分可判断',blocked:'未完成',skipped:'缺少条件，未运行',failed:'执行失败',queued:'待处理',running:'处理中'};
function renderAgents(s?:V3Snapshot){
 const runtime=s?.xmindCollaboration;if(!runtime)return '';
 const rows=[...new Set(runtime.tasks.map(t=>t.agent))].map(name=>{
  const tasks=runtime.tasks.filter(t=>t.agent===name),completed=tasks.filter(t=>t.status==='completed').length;
  return '<tr><td>'+e(names[name]??name)+'</td><td>'+completed+'/'+tasks.length+'</td><td>'+e(tasks.every(t=>t.engine==='rules')?'规则 Agent':'含模型 Agent')+'</td><td>'+e(tasks.some(t=>['failed','blocked'].includes(t.status))?'保留失败与未知':'已保存结果')+'</td></tr>';
 }).join('');
 return '<details open><summary>本次 Agent 协作结果</summary><p>任务轮次 '+runtime.rounds+'；结构化交接 '+runtime.messages.length+' 次；工具执行记录 '+runtime.tools.length+' 条。各 Agent 按自己的输入、输出和工具权限执行；可选模型的实际状态另列。</p><div style="overflow:auto"><table><thead><tr><th>调查职责</th><th>已完成任务</th><th>执行方式</th><th>结果</th></tr></thead><tbody>'+rows+'</tbody></table></div><p>模型工具记录 '+runtime.tools.filter(t=>t.engine==='model').length+' 条；未确认结果 '+runtime.tools.filter(t=>t.status==='pending').length+' 条。未确认的外部调用不会自动重复。</p></details>';
}
function renderLifecycle(s?:V3Snapshot){
 const lifecycle=s?.xmindLifecycle;if(!lifecycle)return '';
 return '<details><summary>材料时效与复核积压</summary><p>检查时间 '+e(lifecycle.evaluatedAt)+'；明确过期 '+lifecycle.sources.filter(x=>x.status==='expired').length+' 条；没有日期 '+lifecycle.sources.filter(x=>x.status==='undated').length+' 条。获取缓存时间不代表内容仍然有效，历史财报按其原期间使用。</p>'+lifecycle.refreshQuestions.map(q=>'<p>'+e(q.reason)+'；可接受材料：'+e(q.acceptableMaterials)+'</p>').join('')+'<p>待处理复核 '+lifecycle.reviewSummary.pending+'；暂缓 '+lifecycle.reviewSummary.deferred+'；用户记录已审阅 '+lifecycle.reviewSummary.humanReviewed+'。'+e(lifecycle.reviewSummary.reason)+'</p></details>';
}
export function renderXmind(x:XmindExecution|undefined,reportId:string,s?:V3Snapshot){
 if(!x)return '';
 const sourceIds=[...new Set(x.routes.flatMap(r=>r.sourceIds))];
 return '<section class="card" id="xmind-execution"><h2>XMind 调查流程</h2><p>问题规划 → 来源分配 → 证据处理 → 比较与解释 → 补查或停止 → 归档。来源陈述、独立证实和需求满足分别判断。</p>'+renderAgents(s)+
  '<details><summary>查看各模块实际运行状态</summary>'+x.runs.map(r=>'<p>'+e(names[r.role])+'：'+e(states[r.status])+'；'+e(r.reason)+'</p>').join('')+'</details>'+
  '<details><summary>来源分配与采集能力</summary>'+sourceIds.map(id=>{const source=sources.find(s=>s.id===id);return '<p>'+e(source?.label??id)+'：'+e(source?.status==='available'?'已有通用正文或导入能力；是否取得以本次来源记录为准':'专用平台采集在后续阶段接入')+'</p>';}).join('')+'</details>'+
  x.translations.map(t=>'<details><summary>'+e(s?.questions.find(q=>q.id===t.questionId)?.text??'原句 → 适用情境 → 需求判断')+'</summary><blockquote>'+e(t.language)+'</blockquote><p>'+e(t.context)+'</p><p>'+e(t.decision)+'</p>'+(s?.keyQuestionIds.includes(t.questionId)?'<p>关键核实问题：'+e(t.followupQuestion??'')+'</p><p>可接受材料：'+e(t.acceptableMaterials??'')+'</p>':'')+t.evidenceIds.slice(0,5).map(id=>'<a href="/api/integration/reports/'+e(reportId)+'/sources/'+e(id)+'">回读原文</a> ').join('')+'</details>').join('')+
  '<p>主体节点 '+x.entities.length+'；来源关系 '+x.lineage.length+'；陈述比较 '+x.comparisons.length+'；待人工复核 '+x.reviews.filter(r=>['pending','deferred'].includes(r.state)).length+'。</p>'+
  '<details><summary>人工复核记录</summary>'+x.reviews.map(r=>'<p>'+e(r.state)+'：'+e(r.decision??r.reason)+'</p>').join('')+'</details>'+renderLifecycle(s)+
  (reportId.startsWith('report-')?'<p><a href="/evidence/'+e(reportId)+'">补充材料或更新调查</a>'+(x.reviews.length?' · <a href="/reviews/'+e(reportId)+'">记录人工复核</a>':'')+'</p>':'')+'<p>'+e(x.propagation.reason)+'</p></section>';
}
