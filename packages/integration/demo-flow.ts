import {parseSourceDeclaration,reportDataStatus,type SourceDeclaration} from './data-status';
import {databaseBundle} from './local-database';
import {manualMaterialContext,parseMaterialUpdate,bindUpdatedMaterial,describeMaterialUpdate,materialUpdateHtml,materialUpdateMarkdown} from "./material-revisions";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { describeRevision, renderRevisionHtml, revisionMarkdown } from "./report-revisions";
import { productActions, applyProductActions, productActionMarkdown } from "./product-action";
import { mergeComparison } from "./compare-reports";
import {feedbackQuestions,createVerificationNote,feedbackHtml,feedbackMarkdown,type VerificationNote} from "./verification-feedback";
import { ReportArchive } from "./report-archive";
import { ResearchService } from "../../modules/b-research/research-service";
import { userProfileSchema, searchIntentSchema } from "../contracts";
import { createCApiContext } from "../../modules/c-report/adapters/memory/context";
import { FakeIdentityProvider } from "../../modules/c-report/adapters/memory/in-memory";
import { handleCreateMatch, handleGetReport, handleExportReport } from "../../modules/c-report/application/api/handlers";
import { buildReportViewModel } from "../../modules/c-report/ui/report-view-model";
import { renderReportMarkdown } from "../../modules/c-report/application/markdown";
import { renderReportHtml,escapeHtml } from "../../modules/c-report/ui/render-html";
import { respondToJobNeeds, renderNeedsHtml, needsMarkdown } from "./job-needs";
import { manualJobSchema } from "../../modules/b-research/inputs";
import {analysisFromInputs,renderSectorReport} from './sector-report';

function databaseFieldNotes(inputs:Record<string,any>):string{
 if(!inputs.databaseSource)return '';
 const warnings=(inputs.databaseSource.sourceDates??[]).flatMap((s:any)=>{
  if(!s.salaryRaw||s.salaryRaw.min===null)return [];
  const job=inputs.bundle.jobs.find((j:any)=>j.jobId===s.jobId||s.evidenceId.endsWith('-jd-'+j.jobId.split('-job-').at(-1)));
  if(!job||job.salary.min!==null)return [];
  return ['<p><strong>'+escapeHtml(job.title)+'：</strong>数据库待遇栏记为 '+escapeHtml(String(s.salaryRaw.min))+'–'+escapeHtml(String(s.salaryRaw.max??'未记载'))+'；但这份岗位摘录未能支持同一薪资口径。不能将它当成固定月薪，也不能用其他岗位或公司平均替代。需招聘方提供固定部分、浮动部分、发放周期及税前税后的书面说明。</p>'];
 });
 return warnings.length?'<section class="card"><h3>岗位待遇字段的核对结果</h3>'+warnings.join('')+'</section>':'';
}

export function createDemoFlow(options?: { dataDir?: string }) {
  const archive = new ReportArchive(options?.dataDir);
  const research = new ResearchService();
  const users = new Map<string, { ctx: ReturnType<typeof createCApiContext>; token: string; projects: Map<string, { projectId: string; ownerId: string; mode: "demo" | "manual" }> }>();
  function user(owner: string) {
    let value = users.get(owner);
    if (!value) {
      const token = randomUUID(), projects = new Map<string, { projectId: string; ownerId: string; mode: "demo" | "manual" }>();
      const identity = new FakeIdentityProvider(new Map([[token, owner]]), projects);
      const ctx = createCApiContext(); ctx.identity = identity;
      ctx.readableProjectIds = async principal => identity.projectsOf(principal.userId);
      ctx.newId = prefix => `${prefix}-${randomUUID()}`;
      value = { ctx, token, projects }; users.set(owner, value);
    }
    return value;
  }
  function requestFor(token: string, path: string, body?: unknown) {
    return new Request(`http://127.0.0.1${path}`, { method: body ? "POST" : "GET", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  }
  async function freeze(owner: string, reportId: string, input: Record<string, any>, run: unknown, bundle: any, u: ReturnType<typeof user>, previous?: NonNullable<ReturnType<ReportArchive["read"]>>) {
    const response = await handleGetReport(u.ctx, requestFor(u.token, "/api/c/reports/" + reportId), reportId);
    if (!response.ok) throw new Error("生成的报告不可读取");
    const { report } = await response.json();
    const snapshot = await u.ctx.stores.reportSnapshots.read(report.projectId, reportId + ":v" + report.version);
    if (!snapshot) throw new Error("生成的报告快照缺失");
    const databaseSource=(run as any)?.databaseSource??previous?.inputs.databaseSource??null;
    const needsResponse=respondToJobNeeds(input.JobNeedsSnapshot, bundle,{sourceDates:databaseSource?.sourceDates});
    const actions=productActions(report,needsResponse);
    const changes = previous ? describeRevision(previous.inputs.aExport,input,previous.report,report,previous.inputs.actions,actions) : null;
    const verificationNotes:VerificationNote[]=(run as any)?.verificationNotes??previous?.inputs.verificationNotes??[];
    const feedbackPreviousReportId=(run as any)?.kind==="verification_feedback"?(run as any).previousReportId:null;
    const materialChanges=structuredClone((run as any)?.materialChanges??previous?.inputs.materialChanges??null);
    if(materialChanges&&(run as any)?.kind==="manual_jd_update")materialChanges.afterRecommendation=actions.find(a=>a.jobId===materialChanges.jobId)?.recommendation??null;
      const sourceDeclarations:SourceDeclaration[]=structuredClone((run as any)?.sourceDeclarations??previous?.inputs.sourceDeclarations??[]);
    const inputs = structuredClone({ databaseSource, sourceDeclarations, materialChanges, verificationNotes, feedbackPreviousReportId, actions, changes, aExport: input, researchRun: run, bundle, needsResponse });
    const sectorAnalysis=analysisFromInputs(inputs,report);
    const exportUrl = new URL("http://127.0.0.1/api/c/reports/" + reportId + "/export?format=md");
    const md = await handleExportReport(u.ctx, requestFor(u.token, exportUrl.pathname + exportUrl.search), reportId, exportUrl);
    exportUrl.searchParams.set("format", "json");
    const json = await handleExportReport(u.ctx, requestFor(u.token, exportUrl.pathname + exportUrl.search), reportId, exportUrl);
    if (!md.ok || !json.ok) throw new Error("报告导出快照生成失败");
    const displayVm=applyProductActions(buildReportViewModel({report,snapshot}),actions,needsResponse);
    const displayReport=structuredClone(report);
    for(const result of displayReport.results){const action=actions.find(a=>a.jobId===result.jobId);if(action)result.recommendation=action.recommendation;}
    if(displayReport.results[0] && displayVm.summary.primaryQuestion){const q=displayVm.summary.primaryQuestion;displayReport.results[0].questions=[{...q,priority:"must"},...displayReport.results[0].questions.filter((item:any)=>item.text!==q.text)];}
    archive.save({ archiveVersion: 1, ownerId: owner, report, snapshot, inputs:{...inputs,sectorAnalysis}, markdown: materialUpdateMarkdown(materialChanges,report.ruleVersion) + productActionMarkdown(actions) + feedbackMarkdown(verificationNotes) + revisionMarkdown(changes) + needsMarkdown(inputs.needsResponse,bundle) + renderReportMarkdown(displayReport,snapshot), jsonExport: { ...await json.json(), sectorAnalysis, productMaterialRevision:materialChanges, productNeeds: inputs.needsResponse, productRevision: changes, productActions: actions, verificationNotes } });
  }
  return {
    async runDatabase(owner:string,input:Record<string,any>,recordIds:number[]){
      const profile=userProfileSchema.parse(input.UserProfile),intent=searchIntentSchema.parse(input.SearchIntent);
      if(profile.mode!=='manual'||intent.mode!==profile.mode||!profile.confirmedAt||profile.projectId!==intent.projectId||profile.profileId!==intent.profileId||profile.revision!==intent.profileRevision)throw Error('请使用同一已确认的用户侧写版本');
      if(input.JobNeedsSnapshot?.profileId!==profile.profileId||input.JobNeedsSnapshot?.profileRevision!==profile.revision)throw Error('七主题侧写与用户版本不一致');
      const {bundle,databaseSource}=databaseBundle(input,recordIds),u=user(owner);
      u.projects.set(profile.projectId,{projectId:profile.projectId,ownerId:owner,mode:profile.mode});
      const created=await handleCreateMatch(u.ctx,requestFor(u.token,'/api/c/matches',{profile,intentContext:intent,bundle,idempotencyKey:bundle.bundleId}));
      const result=await created.json();if(!created.ok)throw Object.assign(Error(result.error?.message??'数据库岗位报告生成失败'),{status:created.status});
      await freeze(owner,result.reportId,input,{kind:'local_database',databaseSource},bundle,u);
      return {...result,reportUrl:'/flow/reports/'+result.reportId,warnings:['沿用 A 已确认侧写，分析本地数据库中的所选岗位资料。','岗位原文完整性、当前在招状态与签约主体仍需核验；数据库记录不等于已确认适合你。']};
    },
    list(owner: string) { return archive.list(owner); },
    feedbackContext(owner:string,reportId:string){const saved=archive.read(owner,reportId);if(!saved)throw Object.assign(Error("本会话无该报告"),{status:404});return {reportId,mode:saved.report.mode,questions:feedbackQuestions(saved),notes:saved.inputs.verificationNotes??[]};},
    async addFeedback(owner:string,reportId:string,raw:unknown){
      const saved=archive.read(owner,reportId);if(!saved)throw Object.assign(Error("本会话无该报告"),{status:404});
      const note=createVerificationNote(saved,raw),existing:VerificationNote[]=saved.inputs.verificationNotes??[];
      if(existing.length>=100)throw Object.assign(Error("此报告核验记录已达100条，请整理后再继续"),{status:409});
      const bundle=structuredClone(saved.inputs.bundle);bundle.bundleId="bundle-"+randomUUID();
      const input=saved.inputs.aExport,profile=userProfileSchema.parse(input.UserProfile),intent=searchIntentSchema.parse(input.SearchIntent);
      if(profile.mode!=="demo"&&profile.mode!=="manual")throw Error("当前资料模式不支持本机核验记录");
      const u=user(owner);u.projects.set(profile.projectId,{projectId:profile.projectId,ownerId:owner,mode:profile.mode});
      const response=await handleCreateMatch(u.ctx,requestFor(u.token,"/api/c/matches",{profile,intentContext:intent,bundle,idempotencyKey:bundle.bundleId}));
      const result=await response.json();if(!response.ok)throw Object.assign(Error(result.error?.message??"补充报告生成失败"),{status:response.status});
      await freeze(owner,result.reportId,input,{kind:"verification_feedback",previousReportId:reportId,databaseSource:saved.inputs.databaseSource??null,sourceDeclarations:saved.inputs.sourceDeclarations??[],materialChanges:saved.inputs.materialChanges??null,verificationNotes:[...existing,note],materialPolicy:"user-notes-unverified-original-evidence-unchanged"},bundle,u);
      return {...result,reportUrl:"/flow/reports/"+result.reportId,warnings:["补充记录已保存为新报告，原报告不变。","回复仅为用户提供材料，尚未独立核验；原始事实及未知判断保持不变。"]};
    },
    async compare(owner: string, reportIds: string[]) {
      if(!Array.isArray(reportIds)||reportIds.some(id=>typeof id!=="string")) throw new Error("请选择岗位报告");
      const records=reportIds.map(id=>archive.read(owner,id));
      if(records.some(r=>!r))throw Object.assign(new Error("本会话无所选报告"),{status:404});
      const selected=records as NonNullable<typeof records[number]>[];
      const bundle=mergeComparison(selected),input=selected[0].inputs.aExport;
      const profile=userProfileSchema.parse(input.UserProfile),intent=searchIntentSchema.parse(input.SearchIntent);
      if(profile.mode!=="demo"&&profile.mode!=="manual")throw new Error("当前资料模式不支持比较");
      const u=user(owner);u.projects.set(profile.projectId,{projectId:profile.projectId,ownerId:owner,mode:profile.mode});
      const response=await handleCreateMatch(u.ctx,requestFor(u.token,"/api/c/matches",{profile,intentContext:intent,bundle,idempotencyKey:bundle.bundleId}));
      const result=await response.json();if(!response.ok)throw Object.assign(new Error(result.error?.message??"比较报告生成失败"),{status:response.status});
      await freeze(owner,result.reportId,input,{kind:"candidate_comparison",databaseSource:selected.every(r=>r.inputs.databaseSource)?{...selected[0].inputs.databaseSource,recordIds:selected.flatMap(r=>r.inputs.databaseSource.recordIds??[]),sourceDates:selected.flatMap(r=>r.inputs.databaseSource.sourceDates??[])}:null,sourceReportIds:reportIds,sourceDeclarations:selected.flatMap(r=>r.inputs.sourceDeclarations??[]),verificationNotes:[...new Map(selected.flatMap(r=>r.inputs.verificationNotes??[]).map((n:VerificationNote)=>[n.noteId,n])).values()],materialPolicy:"reuse-original-frozen-evidence-no-new-research"},bundle,u);
      return {...result,reportUrl:"/flow/reports/"+result.reportId,warnings:["按同一需求版本逐项比较；不生成匹配总分、排名或最佳候选。","资料仍是各报告原始快照，没有重新调查。"]};
    },
    revisionContext(owner: string, reportId: string) {
      const saved = archive.read(owner, reportId);
      if (!saved) throw Object.assign(new Error("本会话无该报告"), { status: 404 });
      return { reportId, profileId: saved.report.profileId, projectId: saved.report.projectId, mode: saved.report.mode, profileRevision: saved.report.profileRevision, jobTitles: saved.inputs.bundle.jobs.map((j:any)=>j.title) };
    },
    async reanalyze(owner: string, reportId: string, input: Record<string, any>) {
      const previous = archive.read(owner, reportId);
      if (!previous) throw Object.assign(new Error("本会话无该报告"), { status: 404 });
      const profile=userProfileSchema.parse(input.UserProfile), intent=searchIntentSchema.parse(input.SearchIntent);
      if (!profile.confirmedAt || profile.profileId!==previous.report.profileId || profile.projectId!==previous.report.projectId || profile.mode!==previous.report.mode || profile.revision<=previous.report.profileRevision || intent.profileId!==profile.profileId || intent.profileRevision!==profile.revision || intent.projectId!==profile.projectId || intent.mode!==profile.mode || input.JobNeedsSnapshot?.profileId!==profile.profileId || input.JobNeedsSnapshot?.profileRevision!==profile.revision) throw Object.assign(new Error("请使用同一需求记录的更新确认版本；旧版本及其他记录不能替代"),{status:409});
      if(profile.mode!=="demo"&&profile.mode!=="manual") throw new Error("当前只支持已归档的演示或人工资料");
      const bundle=structuredClone(previous.inputs.bundle);
      bundle.bundleId="bundle-"+randomUUID();bundle.intentId=intent.intentId;bundle.intentRevision=intent.revision;
      respondToJobNeeds(input.JobNeedsSnapshot,bundle);
      const u=user(owner);u.projects.set(profile.projectId,{projectId:profile.projectId,ownerId:owner,mode:profile.mode});
      const response=await handleCreateMatch(u.ctx,requestFor(u.token,"/api/c/matches",{profile,intentContext:intent,bundle,idempotencyKey:bundle.bundleId}));
      const result=await response.json();if(!response.ok)throw Object.assign(new Error(result.error?.message??"重新分析失败"),{status:response.status});
      await freeze(owner,result.reportId,input,{kind:"needs_revision",previousReportId:reportId,materialPolicy:"reuse-original-frozen-evidence-no-new-research"},bundle,u,previous);
      return {...result,reportUrl:"/flow/reports/"+result.reportId,previousReportUrl:"/flow/reports/"+reportId,warnings:["新报告已另存，旧报告保持不变。","使用原始岗位与证据快照；没有重新调查或更新材料日期。"]};
    },
    materialContext(owner:string,reportId:string){const saved=archive.read(owner,reportId);if(!saved)throw Object.assign(Error("本会话无该报告"),{status:404});return manualMaterialContext(saved);},
    async updateMaterial(owner:string,reportId:string,raw:unknown){
      const saved=archive.read(owner,reportId);if(!saved)throw Object.assign(Error("本会话无该报告"),{status:404});
      const jobInput=parseMaterialUpdate(saved,raw),input=saved.inputs.aExport,profile=userProfileSchema.parse(input.UserProfile),intent=searchIntentSchema.parse(input.SearchIntent);
      const freshResearch=new ResearchService(),added=freshResearch.addManualJob(jobInput),fresh=freshResearch.createResearchRun(intent,{selectedJobIds:[added.job.jobId]});
      const bundle=bindUpdatedMaterial(saved,fresh.bundle),materialChanges=describeMaterialUpdate(saved,bundle);
      fresh.run.decisions=fresh.run.decisions.map(d=>({...d,jobId:d.jobId===added.job.jobId?bundle.jobs[0].jobId:d.jobId}));
      const u=user(owner);u.projects.set(profile.projectId,{projectId:profile.projectId,ownerId:owner,mode:"manual"});
      const response=await handleCreateMatch(u.ctx,requestFor(u.token,"/api/c/matches",{profile,intentContext:intent,bundle,idempotencyKey:bundle.bundleId}));
      const result=await response.json();if(!response.ok)throw Object.assign(Error(result.error?.message??"材料更新报告生成失败"),{status:response.status});
      await freeze(owner,result.reportId,input,{kind:"manual_jd_update",previousReportId:reportId,materialChanges,sourceDeclarations:(saved.inputs.sourceDeclarations??[]).map((d:SourceDeclaration)=>({...d,actualMaterialConfirmed:false,sourceUrl:bundle.jobs.find((j:any)=>j.jobId===d.jobId)?.sourceUrl??null})),verificationNotes:saved.inputs.verificationNotes??[],researchRun:fresh.run},bundle,u);
      return {...result,reportUrl:"/flow/reports/"+result.reportId,warnings:["新岗位材料已另存报告，原报告保持不变。","仍使用原需求版本；企业未重新调查，新增JD及旧回复不代表独立核实。"]};
    },
    async runManual(owner: string, input: Record<string, any>, rawJob: unknown, declaration?:unknown) {
      const profile = userProfileSchema.parse(input.UserProfile), intent = searchIntentSchema.parse(input.SearchIntent);
      if (profile.mode !== "manual" || intent.mode !== "manual" || !profile.confirmedAt || profile.projectId !== intent.projectId || profile.profileId !== intent.profileId || profile.revision !== intent.profileRevision) throw Object.assign(new Error("直接分析须使用同一已确认的人工需求版本"), { status: 409 });
      const jobInput = manualJobSchema.parse({ ...(rawJob as object), projectId: profile.projectId });
      const sourceDeclaration=parseSourceDeclaration(declaration,jobInput.sourceUrl);
      if (input.JobNeedsSnapshot?.profileId !== profile.profileId || input.JobNeedsSnapshot?.profileRevision !== profile.revision) throw Object.assign(new Error("七主题与需求版本不一致"), { status: 409 });
      const u = user(owner); u.projects.set(profile.projectId, { projectId: profile.projectId, ownerId: owner, mode: "manual" });
      const added = research.addManualJob(jobInput);
      const { run, bundle } = research.createResearchRun(intent, { selectedJobIds: [added.job.jobId] });
      const created = await handleCreateMatch(u.ctx, requestFor(u.token, "/api/c/matches", { profile, intentContext: intent, bundle, idempotencyKey: bundle.bundleId }));
      const result = await created.json();
      if (!created.ok) throw Object.assign(new Error(result.error?.message ?? "C 生成失败"), { status: created.status });
      await freeze(owner, result.reportId, input, {...run,sourceDeclarations:[{...sourceDeclaration,jobId:added.job.jobId,sourceUrl:jobInput.sourceUrl}]}, bundle, u);
      return { ...result, jobCount: bundle.jobs.length, reportUrl: `/flow/reports/${encodeURIComponent(result.reportId)}`, warnings: [...run.warnings, "此报告分析用户提供的 JD；来源未经独立核验，公司身份尚待确认。", "报告与输入快照已归档本机，可从历史报告重新打开。"] };
    },
    async run(owner: string, input: Record<string, any>) {
      const profile = userProfileSchema.parse(input.UserProfile), intent = searchIntentSchema.parse(input.SearchIntent);
      if (profile.mode !== "demo" || intent.mode !== "demo") throw Object.assign(new Error("当前闭环仅连接演示模式。请在 A 新建演示需求；真实需求不会转换成演示结果。"), { status: 409 });
      if (!profile.confirmedAt || profile.projectId !== intent.projectId || profile.profileId !== intent.profileId || profile.revision !== intent.profileRevision) throw Object.assign(new Error("请使用同一已确认的画像与意向版本"), { status: 409 });
      if (input.JobNeedsSnapshot?.profileId !== profile.profileId || input.JobNeedsSnapshot?.profileRevision !== profile.revision) throw Object.assign(new Error("七主题与需求版本不一致"), { status: 409 });
      const u = user(owner); u.projects.set(profile.projectId, { projectId: profile.projectId, ownerId: owner, mode: "demo" });
      const { run, bundle } = research.createResearchRun(intent);
      const created = await handleCreateMatch(u.ctx, requestFor(u.token, "/api/c/matches", { profile, intentContext: intent, bundle, idempotencyKey: bundle.bundleId }));
      const result = await created.json();
      if (!created.ok) throw Object.assign(new Error(result.error?.message ?? "C 生成失败"), { status: created.status });
      const reportId = result.reportId as string;
      await freeze(owner, reportId, input, run, bundle, u);
      return { ...result, jobCount: bundle.jobs.length, reportUrl: `/flow/reports/${encodeURIComponent(reportId)}`, warnings: [...run.warnings, "七主题关注事项已生成调查计划和报告回应；不计算匹配分。", "报告与输入快照已归档本机，可从历史报告重新打开。"] };
    },
    async read(owner: string, reportId: string, format = "html", angle?: string | null): Promise<Response> {
      const saved = archive.read(owner, reportId);
      if (!saved) return Response.json({ error: { message: "本会话无该报告" } }, { status: 404 });
      const { report, snapshot, inputs } = saved;
      const download = (type: string, filename: string) => ({ "content-type": type + "; charset=utf-8", "content-disposition": "attachment; filename=" + filename, "cache-control": "no-store" });
      if (format === "md") return new Response(saved.markdown, { headers: download("text/markdown", reportId + ".md") });
      if (format === "json") return Response.json(saved.jsonExport, { headers: download("application/json", reportId + ".json") });
      if (format === "handoff") return new Response(JSON.stringify({ artifactType: "abc-handoff-v1", ...inputs, report }, null, 2), { headers: download("application/json", "abc-handoff.json") });
      const manual = inputs.bundle.mode === "manual",dataStatus=reportDataStatus(saved);
      if(inputs.sectorAnalysis){
        const originalMaterial='<details><summary>查看岗位原文与考核说明</summary>'+inputs.bundle.jobs.map((j:any)=>'<h3>'+escapeHtml(j.title)+'</h3><blockquote>'+escapeHtml(j.rawJd)+'</blockquote><p>'+escapeHtml(report.results.find(r=>r.jobId===j.jobId)?.dimensions.find(d=>d.key==='role_clarity')?.summary??'')+'</p>').join('')+'</details><details><summary>主体线索与口径核对</summary>'+report.results.map(r=>'<p>'+escapeHtml(r.dimensions.find(d=>d.key==='identity_credit')?.summary??'')+'</p>').join('')+'</details>';
        const extras=originalMaterial+'<details><summary>查看具体关注事项与原始调查明细</summary>'+renderNeedsHtml(inputs.needsResponse,report,inputs.bundle).replace('href="/profile"','href="/revise/'+reportId+'"')+'</details>'+(inputs.changes?renderRevisionHtml(inputs.changes):'')+(inputs.materialChanges?materialUpdateHtml(inputs.materialChanges,report.ruleVersion):'')+feedbackHtml(inputs.verificationNotes??[],inputs.feedbackPreviousReportId)+(manual&&!inputs.databaseSource&&inputs.bundle.jobs.length===1?'<p><a href="/materials/'+reportId+'">更新这份岗位JD →</a></p>':'');
        return new Response(renderSectorReport(inputs.sectorAnalysis,report,dataStatus,{salaryNotes:databaseFieldNotes(inputs),extras}),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
      }
      const baseVm=buildReportViewModel({ report, snapshot, comparisonAngle: angle ?? null });
      const html = renderReportHtml(inputs.actions ? applyProductActions(baseVm,productActions(report,inputs.needsResponse),inputs.needsResponse) : baseVm, {
        compactCoverage:true,
        sourceDates:inputs.databaseSource?.sourceDates,
        dataLabels:dataStatus,
        title: dataStatus.sourceLabel.includes("合成") ? "求职 X-Ray · 合成测试报告" : "求职 X-Ray · 岗位分析", demoBadge: dataStatus.sourceLabel.includes("合成") ? "报告包含虚构测试资料，仅用于开发验证，不用于判断真实公司或岗位。" : inputs.databaseSource ? '本地数据库资料：沿用你确认的侧写；招聘状态、资料适用范围及签约主体尚未独立核验。' : manual ? "用户提交 JD：来源尚未独立核验，企业身份及未提供事实保持未知。" : "ABC 演示闭环：A 确认需求 → B 合成岗位检索 → C 规则报告；公司和岗位均为合成样例。",
        angleUrlPattern: `/flow/reports/${reportId}?angle={key}`,
        footerNote: (inputs.databaseSource?"本地数据库摘录已接入；页面保留原始发布及采集日期；缺少时区时不补造，接入时间不代表重新爬取或独立核验。":"")+"七主题回应与需求行动门槛独立保留，原始规则结论及证据快照不被改写。未完成独立企业核验；未知保留。"
      });
      return new Response(html.replace('<a href="#comparison">', '<a href="#your-needs">你的关注事项</a>\n<a href="#comparison">').replace('<h2 id="coverage">', (inputs.changes ? renderRevisionHtml(inputs.changes) : '') + (inputs.materialChanges?materialUpdateHtml(inputs.materialChanges,report.ruleVersion):'') + (manual&&!inputs.databaseSource&&inputs.bundle.jobs.length===1?'<p><a href="/materials/'+reportId+'">更新这份岗位JD →</a></p>':'') + '<p><a href="/revise/' + reportId + '">修改需求后重新分析此岗位 →</a> · <a href="/feedback/' + reportId + '">补充核验回复 →</a> · <a href="/history">我的报告</a></p>' + databaseFieldNotes(inputs) + renderNeedsHtml(inputs.needsResponse, report,inputs.bundle).replace('href="/profile"','href="/revise/'+reportId+'"') + feedbackHtml(inputs.verificationNotes??[],inputs.feedbackPreviousReportId) + '<h2 id="coverage">'), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    }
  };
}
const globalFlow = globalThis as unknown as { __xrayDemoFlow?: ReturnType<typeof createDemoFlow> };
export function getDemoFlow() { return globalFlow.__xrayDemoFlow ??= createDemoFlow({ dataDir: join(process.cwd(), ".data", "integration-reports") }); }
