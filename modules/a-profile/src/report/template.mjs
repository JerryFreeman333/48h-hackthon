import {hash,bigLabels} from '../instruments/battery.mjs';
import {labels} from '../instruments/registry.mjs';
import {publicProfile} from '../profile/scope.mjs';
import {conditionLabels,conditionText} from '../profile/selections.mjs';
function sectionsFor(profile,fit){
 const sections=[],claim=(text,evidenceIds)=>({text,evidenceIds});
 for(const a of profile.assessments){
  const isInterest=a.instrumentId==='onet-mini-ip',names=isInterest?labels:{...bigLabels,intellect_imagination:'思维与想象倾向'};
  sections.push({title:isInterest?'自报职业兴趣':'人格自报倾向',claims:[claim(a.complete?a.scores.map(s=>`${names[s.dimension]}：${s.raw}/20；量程展示 ${(s.normalized*100).toFixed(1)}`).join('；'):'尚未完成，正式解释保持未知。',[a.evidenceId]),claim(`源工具有研究依据；本次呈现为${a.locale==='zh-CN'?'中文审校稿':'历史原文记录'}，翻译与计分版本保留在数据文件。中文译稿未验证，本产品不提供常模、高低阈值、能力判断或测评准确率。`,[a.evidenceId])]});
 }
 if(!profile.assessments.length)sections.push({title:'测评状态',claims:[claim('本次未测评，兴趣与人格倾向保持未知。',[])]});
 sections.push({title:'由你声明的价值与取舍',claims:profile.values.groups.length?[claim(profile.values.groups.map((g,i)=>`${i+1}级（同级并列）：${g.join('、')}`).join('；'),profile.values.evidenceIds),...profile.values.tradeoffs.map(t=>claim(t,profile.values.evidenceIds))]:[claim('尚未声明；这里不生成价值观分数。',[])]});
 sections.push({title:'现实条件与目标',claims:[...profile.constraints.map(c=>claim(`${conditionLabels[c.key]??'历史条件'}：${conditionText(c)}；${c.confirmed?({hard:'硬条件',soft:'软偏好',unknown:'未知'}[c.strength]):'尚未确认'}`,c.evidenceIds)),...profile.goals.map(g=>claim(g.text,g.evidenceIds))]});
 sections.push({title:'职业方向探索',claims:fit.status==='ranked'?fit.candidates.map(c=>claim(`${c.titleZh??('职业代码 '+c.onetCode+'（中文名称待核查）')}：兴趣形状相关 ${c.pearsonR.toFixed(4)}，展示指数=${c.interestIndex.toFixed(4)}；同分排序位次 ${c.rank}。`,c.evidenceIds)):[claim(fit.status==='undifferentiated_profile'?'目前六维兴趣尚未区分，不输出方向排名；可以自行浏览职业。':'兴趣资料不完整，不输出方向排名；可以自行浏览职业。',[])]});
 sections.push({title:'已确认的解释',claims:profile.insights.filter(i=>i.status==='confirmed').map(i=>claim(i.userEditedText??i.text,i.evidenceIds))});
 sections.push({title:'还需要了解',claims:[...profile.uncertainties.map(u=>claim(u.message,u.evidenceIds)),claim('职业方向是探索参考。国内JD、入门准备、招聘状态和公司风险需要B/C结合真实材料核查。',[])]});
 return sections;
}
export function buildReport(profile,fit){
 profile=publicProfile(profile);
 const sections=sectionsFor(profile,fit);
 const report={schemaVersion:'2.0.0',profileId:profile.profileId,profileRevision:profile.revision,reportVersion:'template-zh-3-chinese-interface',provider:'none',model:null,promptVersion:null,contextHash:hash({profile,fit}),sections,evidence:profile.evidence,
  occupationSources:fit.candidates.map(c=>({evidenceId:'onet:'+c.onetCode,url:c.sourceUrl,catalogVersion:fit.catalogVersion})),limitations:fit.limitations};
 validateReport(report,profile,fit);return report;
}
export function validateReport(report,profile,fit){
 profile=publicProfile(profile);
 if(report.contextHash!==hash({profile,fit}))throw new Error('报告contextHash不一致');
 if(report.profileId!==profile.profileId||report.profileRevision!==profile.revision)throw new Error('报告引用了错误画像版本');
 const allowed=new Set([...profile.evidence.filter(e=>e.status!=='rejected'&&e.status!=='superseded').map(e=>e.evidenceId),...fit.candidates.map(c=>'onet:'+c.onetCode)]);
 for(const s of report.sections)for(const c of s.claims)if(!Array.isArray(c.evidenceIds)||c.evidenceIds.some(id=>!allowed.has(id)))throw new Error('报告引用无效或已拒绝证据');
 if(hash(report.sections)!==hash(sectionsFor(profile,fit)))throw new Error('报告数字或文字偏离冻结模板');
 return report;
}
export function markdown(report){return `# 求职 X-Ray · A 职业画像\n\n画像版本：${report.profileRevision}\n\n`+report.sections.map(s=>`## ${s.title}\n\n`+s.claims.map(c=>`- ${c.text}${c.evidenceIds.length?' [依据：'+c.evidenceIds.join(', ')+']':''}`).join('\n')).join('\n\n')+'\n\n'+report.limitations.join('\n');}
