import {explainXmindQuestion} from './semantic';
import type {CandidateBundle} from '../../../packages/contracts';
import type {V3Snapshot} from '../v3-contract';
import {xmindSchema,roles,type XmindExecution} from './schema';
import {groupSources} from './processing';
import tree from './tree.json';
import {category,routeSources,sources} from './sources';

/** Specialist rule workers share the frozen evidence store. None assert independent verification. */
export function executeXmind(s:V3Snapshot,bundle:CandidateBundle):XmindExecution {
 const at=new Date().toISOString();
 const x:XmindExecution={schemaVersion:'xmind-execution/1',designSha256:tree.designSha256,revision:s.profileRevision,runs:[],routes:[],documents:[],entities:[],relations:[],lineage:[],comparisons:[],translations:[],followups:[],propagation:{status:'disabled',reason:'缺少经过校验的账号与精确时间；不运行协调行为推断',observations:[],signals:[]},reviews:[],updates:[]};
 const run=(role:typeof roles[number],inputIds:string[],outputIds:string[],reason:string,status:XmindExecution['runs'][number]['status']='completed')=>x.runs.push({id:`${s.taskId}:${role}`,role,engine:'rules',status,inputIds:inputIds.slice(0,1000),outputIds:outputIds.slice(0,1000),reason,at});
 run('planner',s.questions.flatMap(q=>q.needRefs),s.questions.map(q=>q.id),'按已确认需求拆分具体问题；硬约束未知保留未知');
 for(const q of s.questions)x.routes.push({questionId:q.id,category:category(q.predicate,q.topic),sourceIds:routeSources(q.predicate,q.topic,q.missingFields),missingFields:q.missingFields,reason:'按问题类别和缺失字段排序；仅表示候选来源，未取得材料不计成功'});
 run('router',s.questions.map(q=>q.id),x.routes.map(r=>r.questionId),'可用通用正文入口优先；专用平台适配器等待下一阶段', 'partial');
 for(const company of bundle.companies){
  x.entities.push({id:company.companyId,kind:'legal_entity',name:company.legalName,companyId:company.companyId,jobId:null});
  if(company.brandName){const id=company.companyId+':brand';x.entities.push({id,kind:'brand',name:company.brandName,companyId:company.companyId,jobId:null});x.relations.push({from:id,to:company.companyId,kind:'candidate_brand',evidenceIds:[],status:'unconfirmed',reason:'候选库品牌关系为线索，不自动认定同一法人'});}
 }
 for(const j of bundle.jobs)if(j.companyId){x.entities.push({id:j.jobId,kind:'job',name:j.title,companyId:j.companyId,jobId:j.jobId});x.relations.push({from:j.jobId,to:j.companyId,kind:'job_context',evidenceIds:[],status:'unconfirmed',reason:'候选岗位上下文；公司证据不能自动代替该岗位证据'});}
 for(const c of s.claims)if(typeof c.fields.contractingEntity==='string'){
  const id=c.id+':contract';x.entities.push({id,kind:'contracting_entity',name:c.fields.contractingEntity,companyId:c.companyId,jobId:c.jobId});x.relations.push({from:id,to:c.companyId,kind:'claimed_contract',evidenceIds:[c.evidenceId],status:'source_claim',reason:'正文声明的签约主体关系，需原件核验'});
 }
 // Team/business objects are explicit source assertions, never inferred from a company name or a salary signal.
 for(const c of s.claims){
  const evidence=bundle.evidence.find(e=>e.evidenceId===c.evidenceId&&e.companyId===c.companyId);
  if(!evidence||!evidence.excerpt.includes(c.quote)||c.scope!==evidence.scope||c.jobId!==evidence.jobId||c.subjectMatch==='unrelated')continue;
  const status=c.subjectMatch==='exact'?'source_claim' as const:'unconfirmed' as const;
  if(c.team&&c.quote.includes(c.team)&&x.entities.length<1000&&x.relations.length<1000){
   const id=c.id+':team';x.entities.push({id,kind:'team',name:c.team,companyId:c.companyId,jobId:c.jobId});
   x.relations.push({from:id,to:c.jobId&&bundle.jobs.some(j=>j.jobId===c.jobId&&j.companyId===c.companyId)?c.jobId:c.companyId,kind:'claimed_team',evidenceIds:[c.evidenceId],status,reason:'原句明示的团队名称及关联，仅为来源声称；缺少名称时不推造部门。'});
  }
  if(c.predicate==='business'&&x.entities.length<1000&&x.relations.length<1000){
   const candidates=[c.fields.businessName,c.fields.mechanism].filter((v):v is string=>typeof v==='string'&&v.length>0&&c.quote.includes(v));
   const id=c.id+':business';x.entities.push({id,kind:'business',name:(candidates[0]??c.quote).slice(0,300),companyId:c.companyId,jobId:c.jobId});
   x.relations.push({from:id,to:c.companyId,kind:'claimed_business',evidenceIds:[c.evidenceId],status,reason:'业务原文主题节点，与法人/品牌/岗位分别记录；来源陈述不自动认证业务归属或岗位稳定。'});
  }
 }
 run('identity',bundle.companies.map(c=>c.companyId),x.entities.map(e=>e.id),'法人、品牌、岗位和合同主体分别建图；不跨主体继承结论');
 for(const a of s.sourceAttempts)x.documents.push({id:a.sourceId+':'+a.questionId,evidenceIds:a.evidenceIds,url:a.url,hash:a.rawHash,sourceNature:a.acquisitionMode.startsWith('user_')?'user_supplied':a.sourceClass.includes('official')?'official_statement':'unknown',quality:a.accessState!=='ok'?'unusable':['full_text','document'].includes(a.contentState)?'full':'excerpt',period:a.publishedAt,rawRef:a.rawRef});
 for(const r of s.sourceRelations)x.lineage.push({from:r.from,to:r.to,kind:r.kind==='confirmed_repost'?'explicit_origin':r.kind==='suspected_common_origin'?'near_duplicate':'independence_unknown',score:null,reason:r.reason});
 // Same saved document is one origin even when it contains several useful paragraphs.
 for(const a of s.sourceAttempts)for(const id of a.evidenceIds.slice(1))if(x.lineage.length<1000)x.lineage.push({from:a.evidenceIds[0],to:id,kind:'same_document',score:1,reason:'同一保存文档；不是新增独立来源'});
 groupSources(bundle,x);
 run('provenance',bundle.evidence.map(e=>e.evidenceId),x.documents.map(d=>d.id),'正文、摘录、访问失败及用户提供分开；保存来源谱系，不推定来源独立');
 run('extractor',bundle.evidence.map(e=>e.evidenceId),s.claims.map(c=>c.id),'提取保留否定、条件、口径、时期、原文位置；未覆盖语义保留未知',s.claims.length?'partial':'blocked');
 run('propagation',x.propagation.observations.map(o=>o.evidenceId),x.propagation.signals.flatMap(o=>o.evidenceIds),x.propagation.reason,x.propagation.status==='disabled'?'skipped':'completed');
 for(const q of s.questions){
  const cs=s.claims.filter(c=>q.supportingClaimIds.includes(c.id));
  for(let i=0;i<cs.length;i++)for(let j=i+1;j<cs.length&&x.comparisons.length<1200;j++){
   const a=cs[i],b=cs[j];
   const sameOrigin=a.evidenceId===b.evidenceId||x.lineage.some(r=>['same_document','explicit_origin'].includes(r.kind)&&((r.from===a.evidenceId&&r.to===b.evidenceId)||(r.to===a.evidenceId&&r.from===b.evidenceId)));
   const comparable=a.subjectMatch==='exact'&&b.subjectMatch==='exact'&&a.companyId===b.companyId&&a.jobId===b.jobId&&a.scope===b.scope&&a.period===b.period&&a.city===b.city&&a.team===b.team&&a.role===b.role&&JSON.stringify(a.conditions)===JSON.stringify(b.conditions)&&['currency','reportingScope','metric','taxBasis','basis'].every(f=>a.fields[f]===b.fields[f]);
   const normalized=(c:typeof a)=>c.predicate==='fixed_salary'?JSON.stringify([c.fields.min,c.fields.max,c.polarity]):c.predicate==='finance'?JSON.stringify([Number(c.fields.value)*(c.fields.unit==='亿元'?1e8:c.fields.unit==='万元'?1e4:1),c.polarity]):JSON.stringify([c.fields.mechanism??c.fields.frequency,c.polarity]);
   const identical=normalized(a)===normalized(b), numeric=['fixed_salary','finance'].includes(a.predicate)&&['value','min'].some(f=>typeof a.fields[f]==='number'&&typeof b.fields[f]==='number');
   const result=sameOrigin?'same_origin':!comparable?'not_comparable':identical?'supports':numeric||a.fields.mechanism===b.fields.mechanism&&a.polarity!==b.polarity?'contradicts':'not_comparable';
   x.comparisons.push({questionId:q.id,left:a.id,right:b.id,result,reason:sameOrigin?'同源不可重复计支持':!comparable||result==='not_comparable'?'主体、时期、范围、条件、指标或非结构化语义不可比':result==='contradicts'?'可比命题的极性相反；进入复核':'同范围陈述；不代表独立证实'});
  }
  const translation=explainXmindQuestion(q,s.claims,bundle),modelExplanation=s.xmindSemantic?.explanations.find(e=>e.state==='accepted'&&e.explanation.questionId===q.id)?.explanation;
  if(modelExplanation){translation.language+='\n语义解释（推断，未独立证实）：'+modelExplanation.meaning+'\n对应来源原句：“'+modelExplanation.quote+'”';translation.context+=' '+modelExplanation.context;translation.evidenceIds=[...new Set([...translation.evidenceIds,modelExplanation.evidenceId])];}
  x.translations.push(translation);
  x.followups.push({questionId:q.id,action:q.nextAction,untriedSourceIds:q.nextAction==='investigate'?x.routes.find(r=>r.questionId===q.id)!.sourceIds:[],reason:q.stopReason??'按缺失字段补查；受原问题预算约束'});
 }
 x.reviews=s.reviews.map(r=>({id:r.id,claimIds:r.claimIds,reason:r.reason,state:r.state==='auto_checked'?'pending':r.state,decision:r.decision,at:r.updatedAt}));
 run('verifier',s.claims.map(c=>c.id),s.questions.map(q=>q.id),'语义支持、范围、来源独立性和字段完整性分别检查；机器检查不冒充人工复核',x.reviews.length?'partial':'completed');
 if(['completed','failed'].includes(s.model.status))x.runs.push({id:s.taskId+':semantic-model',role:'verifier',engine:'model',status:s.model.status==='completed'?(s.xmindSemantic?.status==='partial'?'partial':'completed'):'blocked',inputIds:s.xmindSemantic?.sourceEvidenceIds??s.semanticChecks.map(c=>c.evidenceId),outputIds:s.xmindSemantic?[...new Set([...s.xmindSemantic.acceptedClaimIds,...s.xmindSemantic.explanations.filter(e=>e.state==='accepted').map(e=>e.explanation.questionId)])]:s.semanticChecks.map(c=>c.questionId),reason:s.model.reason,at});
 run('interpreter',s.questions.map(q=>q.id),x.translations.map(t=>t.questionId),'原句、适用范围、个人需求判断分三层呈现');
 run('followup',s.questions.map(q=>q.id),x.followups.map(f=>f.questionId),'复用问题级预算与退出条件；关键外部追问最多三项');
 x.updates.push({kind:s.questions.some(q=>q.stopReason==='reused_frozen_sources')?'needs_revision':'new_material',evidenceIds:bundle.evidence.slice(0,1000).map(e=>e.evidenceId),reason:'冻结当前材料和判断；需求修订复用原文，不重复付费获取',at});
 run('archive',s.questions.map(q=>q.id),[s.taskId],'执行结果进入显式校验、检查点和实际历史报告；旧报告不强制补字段');
 return xmindSchema.parse(x);
}

export function xmindCapabilities(){
 const modelEnabled=process.env.RESEARCH_AGENT_V3_MODEL_ENABLED==='true',credentialConfigured=Boolean(process.env.MINIMAX_API_KEY?.trim());
 const executionAgents=['planner','router','collector','identity','provenance','extractor','propagation','verifier','interpreter','followup','archive'];
 const aliases:Record<string,string[]>={gsxt:['国家企业信用信息公示系统'],tianyancha:['天眼查'],qixin:['启信宝'],qcc:['企查查'],aiqicha:['爱企查'],boss:['BOSS直聘'],liepin:['猎聘'],zhaopin:['智联'], '51job':['前程无忧'],lagou:['拉勾'],shixiseng:['实习僧'],yingjiesheng:['应届生'],maimai:['脉脉'],kanzhun:['看准'],zhihu:['知乎'],nowcoder:['牛客'],xiaohongshu:['小红书'],weibo:['微博'],douban:['豆瓣'],tieba:['贴吧'],bilibili:['B站'],douyin:['抖音'],wechat:['微信'],qq:['QQ']};
 const nodes=tree.nodes.map(n=>{
  const implementation=n.stage==='planning'?'planner':n.stage==='routing'?'router/collector':n.stage==='processing'?'identity/provenance/extractor/verifier':n.stage==='interpretation'?'interpreter':n.stage==='followup'?'followup':n.stage==='archive'?'archive/lifecycle':n.stage==='groups'?'controlled_import':n.stage==='tools'?'source_registry':'design_reference';
  let status='implemented_with_limits',reason='已有实际规则或流程入口；此节点未单独完成真实材料验收，不能推定整项能力全部完成。';
  const sourcePath=n.path.slice(4).join(' / '),deferredSourceIds=Object.entries(aliases).filter(([,names])=>names.some(name=>sourcePath.includes(name))).map(([id])=>id);
  if(!n.leaf||['legend','root'].includes(n.stage)){status='design_reference';reason='原图结构或说明节点，登记和关系保真不等于业务能力验收。';}
  else if(/用户材料导入|PDF \/ DOCX \/ 表格|文件与 OCR|T4｜|T8｜|自动读取不可用.*导入回退/.test(n.title)){status='implemented_alternative';reason='本机原件导入、文本PDF、python-docx、openpyxl/CSV、RapidOCR 已有实际解析路径；未接 Docling，不支持其全部版面功能，OCR结果须复核。';}
  else if(/动态网页|平台接口|本人登录客户端|QQ 官方机器人|Python-UIAutomation|wxauto|BotGo|脉脉群组/.test(n.title)){status='deferred_connector';reason='本轮按用户安排延后平台专用爬虫、授权API、客户端/群聊自动采集；Playwright仅用于页面验收。';}
  else if(/MediaCrawler/.test(n.title)){status='reference_not_adopted';reason='原图列为架构参考；没有安装或复制 MediaCrawler，相关平台采集延期。';}
  else if(/DataTrove|dedupe/.test(n.title)){status='partial_alternative';reason='采用自有精确主体规则与中文三字片段相似分组；未采用 DataTrove MinHash 或 dedupe 模型，中文阈值与实体消歧效果未做真实评估。';}
  else if(/Langfuse/.test(n.title)){status='implemented_alternative';reason='使用本机运行审计、规则/模型版本、预算和检查点；未部署 Langfuse 或上传材料。';}
  else if(/DeepCandidate|Career Application Advisor/.test(n.title)){status='reference_not_adopted';reason='仅为原图参考方向；问题契约和引用校验由本项目实现，未声称运行该开源项目。';}
  else if(/结构化模型|语义/.test(n.title)){status='conditional_model';reason='一次共享模型批次的抽取/比较/中性解释有实际入口和严格校验；只有配置且开启时才调用，真实服务效果未验收。';}
  else if(/同外链|短时集中|近似去重|账号字段|可疑组/.test(n.title)){status='partial_signals';reason='只有符合字段门槛的可解释信号；受控中文样例通过，不推断水军/真假，真实账号网络与中文准确率未验证。';}
  else if(n.stage==='groups'){status='controlled_import_only';reason='文字、文件、截图可主动导入并留本机；自动读取群、历史覆盖和附件全集均未实现。';}
  else if(n.stage==='routing'&&deferredSourceIds.length){status='deferred_connector';reason='此平台分支仅登记为候选；可主动提供原文进入通用处理链，专用平台自动获取延期。';}
  else if(/静态网页/.test(n.title)){status='generic_http_only';reason='复用V2有界公共HTTP、正文与定位保存；未引入 Scrapy 批量扫库或动态采集。';}
  else if(n.stage==='routing'){status='generic_path_with_limits';reason='问题路由、通用公共正文或本机导入可运行；没有逐平台自动采集或全字段覆盖的成功宣称。';}
  return {...n,implementation,status,reason,deferredSourceIds,validation:'not_individually_verified'};
 });
 return {schemaVersion:'xmind-capabilities/2',designSha256:tree.designSha256,nodeCount:tree.nodes.length,leafCount:tree.nodes.filter(n=>n.leaf).length,
  relationships:tree.relationships,relationshipCoverage:tree.relationships.map(r=>({id:r.id,status:r.title.includes('群聊')?'controlled_import_only':'implemented_task_flow',reason:r.title.includes('群聊')?'主动导入可进入同一证据链；群聊自动采集延期。':'真实B任务链已有对应汇入/比较/补查/归档路径；不代表所有来源平台已接通。'})),roles,sources,nodes,
  allCapabilitiesImplemented:false,individualLeafAcceptance:'not_established',
  executionArchitecture:{mode:'durable_agent_task_graph',agents:executionAgents,agentCount:executionAgents.length,independentModelProcesses:false,sharedEvidenceStore:true,modelStrategy:'one_shared_bounded_batch',reason:'专职Agent经显式任务、依赖、工具白名单与补查消息联动；各角色不等于各自启动独立模型。'},
  model:{enabled:modelEnabled,credentialConfigured,state:!modelEnabled?'disabled':!credentialConfigured?'not_configured':'configured_unverified',maxCallsPerInvestigation:1,validation:'controlled_response_tests_only',reason:'真实调用与结果只认每份报告的预算/语义记录；配置存在不代表服务或中文效果已验证。'},
  documents:{formats:['text','pdf','docx','xlsx','csv','image'],imageFormats:['png','jpeg'],localOnly:true,ocr:'rapidocr-onnxruntime/1.4.4',ocrMaxPages:12,ocrReviewRequired:true,validation:'controlled_local_parser_tests',limits:['DOCX不推断排版页码/页眉页脚/批注/嵌入图片','XLSX公式只保存不计算，外链不跟随','扫描OCR需要固定本机依赖和模型，缺失明确not_configured','真实复杂扫描件与中文总体准确率尚未验证']},
  lifecycle:{sourceExpiry:'explicit_windows_and_scoped_refresh',cacheIsValidity:false,reviewQueue:'claim_fingerprint_and_question_scope',humanReviewCertifiesFacts:false},
  deferred:['platform_specific_crawlers','authorized_platform_apis','automatic_wechat_qq_group_collection','real_account_network_validation','real_model_service_acceptance','independent_human_fact_certification'],
  coverageNotice:'441节点和13关系线保真登记；状态说明实际路径、替代实现、条件与延期项，不计算“全叶节点完成率”。'};
}
