import {catalog} from '../occupation-fit/index.mjs';
import {markdown} from '../report/template.mjs';
import {V2Error} from './service.mjs';
const chineseOnly=()=>{throw new V2Error(410,'english_entry_removed','英语答题入口已停用，请使用中文审校；原始答案保留。');};
export async function handleV2(service,owner,req,url,body){
 const p=url.pathname.replace('/api/a/v2','');let m;
 if(req.method==='GET'&&p==='/bootstrap')return service.bootstrap(owner);
 if(req.method==='GET'&&p==='/instruments')return {items:service.bootstrap(owner).instruments};
 if(req.method==='GET'&&p==='/catalog'){const q=(url.searchParams.get('q')??'').slice(0,200).toLowerCase();const list=catalog.entries.filter(o=>!q||[o.title,o.onetCode,o.titleZh,...(o.aliases??[])].filter(Boolean).some(t=>t.toLowerCase().includes(q)));if(!q)list.sort((a,b)=>Number(!!b.titleZh)-Number(!!a.titleZh)||a.onetCode.localeCompare(b.onetCode));return {version:catalog.catalogVersion,loaded:catalog.loadedCount,complete:catalog.completeCount,items:list.slice(0,50).map(({ratings,interestVector,...o})=>o)};}
 if(req.method==='POST'&&p==='/sessions'){
  if(!service.privateDraft&&['Quick','Standard'].includes(body.battery))throw new V2Error(422,'chinese_interest_unavailable','中文兴趣题本尚未公开发布，请使用本机中文审校入口；当前可以先完成选择式需求。');
  return service.create(owner,body);
 }
 if((m=p.match(/^\/sessions\/([^/]+)$/))){if(req.method==='GET')return service.get(owner,m[1]);if(req.method==='PATCH')return service.update(owner,m[1],body);}
 if((m=p.match(/^\/sessions\/([^/]+)\/insights$/))&&req.method==='POST')return service.addInsight(owner,m[1],body);
 if((m=p.match(/^\/attempts\/([^/]+)(\/score)?$/))){
  const {a}=service.attempt(owner,m[1]);
  if(req.method==='PATCH'&&!m[2]){if((body.locale??a.locale)!=='zh-CN')chineseOnly();return service.updateAttempt(owner,m[1],body);}
  if(req.method==='POST'&&m[2]){if(a.locale!=='zh-CN')chineseOnly();return service.score(owner,m[1],body);}
 }
 if((m=p.match(/^\/insights\/([^/]+)$/))&&req.method==='PATCH')return service.reviewInsight(owner,m[1],body);
 if((m=p.match(/^\/profiles\/([^/]+)(?:\/(confirm|occupation-fit|export|report))?$/))){
  if(req.method==='POST'&&m[2]==='confirm'){const s=service.byProfile(owner,m[1]);if(Object.values(s.attempts).some(a=>a.locale!=='zh-CN'))chineseOnly();return service.confirm(owner,m[1],body);}
  if(req.method==='POST'&&m[2]==='occupation-fit')return service.occupationFit(owner,m[1],body.profileRevision);
  if(req.method==='GET'&&m[2]==='export')return service.export(owner,m[1],url.searchParams.get('revision')??undefined,url.searchParams.get('format')??'v2');
  if(req.method==='GET'&&m[2]==='report'){const report=service.report(owner,m[1],url.searchParams.get('revision')??undefined);return url.searchParams.get('format')==='markdown'?{markdown:markdown(report)}:report;}
  if(req.method==='GET'&&!m[2])return service.profile(owner,m[1],url.searchParams.get('revision')??undefined);
  if(req.method==='DELETE'&&!m[2])return service.delete(owner,m[1]);
 }
 if(req.method==='POST'&&p==='/search-intents')return service.intent(owner,body);
 if(req.method==='POST'&&p==='/import')return service.import(owner,body);
 const error=new Error('V2接口不存在');error.status=404;error.code='not_found';throw error;
}
