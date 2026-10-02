import http from 'node:http';
import {readFileSync,writeFileSync,mkdirSync,renameSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {Service,ServiceError} from './service.mjs';
import {mini,labels,describeInstruments,itemProvenance} from './instruments/registry.mjs';
import {loadState,persistState} from './storage.mjs';
import {industries,roles,taxonomyVersion} from './taxonomy.mjs';
import {ProfileService} from './profile/service.mjs';
import {handleV2} from './profile/routes.mjs';
import {publicV1Attempt} from './profile/scope.mjs';
const root=dirname(fileURLToPath(import.meta.url));
export function createServer({dataDir=join(root,'../.data'),archiveDir=join(dataDir,'../rubbish/private')}={}){
 const path=join(dataDir,'state.json');const state=loadState(dataDir,archiveDir);
 const service=new Service(state,()=>persistState(path,service.state));
 const v2=new ProfileService(service.state,()=>service.save());
 return http.createServer(async(req,res)=>{
 const requestId=randomUUID();const url=new URL(req.url,'http://localhost');
 const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 try{
 if(!['127.0.0.1','localhost','[::1]'].includes((req.headers.host??'').replace(/:\d+$/,'')))throw new ServiceError(403,'只允许本机地址访问');
 if(req.method==='GET'&&!url.pathname.startsWith('/api/')){const files={'/':'ui/v2.html','/demo/a':'ui/v2.html','/demo/a/v2':'ui/v2.html','/demo/a/v1':'ui/index.html','/profile':'ui/v2.html','/v2-app.mjs':'ui/v2-app.mjs','/battery-survey.mjs':'ui/battery-survey.mjs','/app.mjs':'ui/app.mjs','/survey-adapter.mjs':'ui/survey-adapter.mjs','/style.css':'ui/style.css','/vendor/survey.core.min.js':'../node_modules/survey-core/survey.core.min.js','/vendor/survey-js-ui.min.js':'../node_modules/survey-js-ui/survey-js-ui.min.js','/vendor/survey-core.fontless.min.css':'../node_modules/survey-core/survey-core.fontless.min.css','/vendor/survey-core.min.css':'../node_modules/survey-core/survey-core.min.css'};const f=files[url.pathname];if(!f)throw new ServiceError(404,'页面不存在');res.writeHead(200,{'Content-Type':f.endsWith('.css')?'text/css':/\.(mjs|js)$/.test(f)?'text/javascript':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});res.end(readFileSync(join(root,f)));return;}
 if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)throw new ServiceError(403,'拒绝跨站请求');
 const cookies=Object.fromEntries((req.headers.cookie??'').split(';').map(x=>x.trim().split('=')));
 let owner=cookies.a_session;if(!owner||!service.state.sessions?.includes(owner)){if(req.method==='GET'&&['/api/a/bootstrap','/api/a/v2/bootstrap'].includes(url.pathname)){owner=randomUUID();service.state.sessions??=[];service.state.sessions.push(owner);service.save();res.setHeader('Set-Cookie',`a_session=${owner}; HttpOnly; SameSite=Strict; Path=/`);}else throw new ServiceError(401,'请先打开页面建立本地演示会话');}
 if(/^\/api\/a\/v2\/(resume-imports|claims)(?:\/|$)/.test(url.pathname)||/^\/api\/a\/v2\/sessions\/[^/]+\/statements$/.test(url.pathname)||url.pathname==='/api/a/profiles/extract'){const e=new ServiceError(410,'经历与能力资料采集已停用，此接口不接收材料');e.code='feature_removed';throw e;}
 let body={};if(req.method!=='GET'){const chunks=[];let size=0;const limit=url.pathname==='/api/a/v2/import'?6000000:256000;for await(const chunk of req){size+=chunk.length;if(size>limit)throw new ServiceError(422,'输入过大');chunks.push(chunk);}const raw=Buffer.concat(chunks).toString('utf8');try{body=raw?JSON.parse(raw):{};}catch{throw new ServiceError(422,'JSON格式错误');}if(!body||typeof body!=='object'||Array.isArray(body))throw new ServiceError(422,'请求体必须为对象');}
 if(url.pathname.startsWith('/api/a/v2/')){json(200,await handleV2(v2,owner,req,url,body));return;}
 let result;let status=200;const p=url.pathname;const match=p.match(/^\/api\/a\/assessments\/([^/]+)(?:\/(answers|score))?$/);
 if(req.method==='GET'&&p==='/api/a/bootstrap')result={questions:mini.items.map(q=>({...q,text:q.originalText,options:mini.responseScale})),labels,instruments:describeInstruments(),industries,roles,taxonomyVersion,archivedLegacyProjects:service.state.archivedLegacyProjects??0,attempts:Object.values(service.state.attempts).filter(a=>a.owner===owner).map(publicV1Attempt)};
 else if(req.method==='GET'&&p==='/api/a/instruments')result={items:describeInstruments()};
 else if(req.method==='GET'&&p==='/api/a/instruments/onet-mini-ip/provenance')result={items:itemProvenance()};
 else if(req.method==='POST'&&p==='/api/a/assessments'){result=service.create(owner,body.mode,body.instrumentId);status=201;}
 else if(match&&!match[2]&&req.method==='GET')result=publicV1Attempt(service.owned(owner,match[1]));
 else if(match&&match[2]==='answers'&&req.method==='PATCH')result=service.update(owner,match[1],body);
 else if(match&&match[2]==='score'&&req.method==='POST')result=service.result(owner,match[1]);
 else if(req.method==='PUT'&&/^\/api\/a\/profiles\/[^/]+\/confirm$/.test(p)){const a=service.owned(owner,body.assessmentId);if(a.profileId!==p.split('/')[4])throw new ServiceError(422,'画像ID与答题记录不一致');result=service.confirm(owner,body.assessmentId,body);}
 else if(req.method==='GET'&&p==='/api/a/taxonomy/industries')result={version:taxonomyVersion,items:industries};
 else if(req.method==='GET'&&p==='/api/a/taxonomy/roles')result={version:taxonomyVersion,items:roles};
 else if(req.method==='POST'&&p==='/api/a/intents')result=service.intent(owner,body);
 else if(req.method==='GET'&&p.startsWith('/api/a/export/')){const projectId=p.split('/').at(-1);if(!Object.values(service.state.attempts).some(a=>a.owner===owner&&a.projectId===projectId))throw new ServiceError(403,'没有项目访问权限');result=service.export(owner,projectId);}
 else if(req.method==='POST'&&p==='/api/a/import')result=service.import(owner,body);
 else throw new ServiceError(404,'接口不存在');
 // Never expose the local session capability in response data.
 if(result?.owner){result={...result};delete result.owner;}if(result?.attempt?.owner){result={...result,attempt:{...result.attempt}};delete result.attempt.owner;}json(status,result);
 }catch(e){const status=e.status??422;json(status,{error:{code:e.code??{401:'UNAUTHENTICATED',403:'FORBIDDEN',404:'NOT_FOUND',409:'REVISION_CONFLICT',503:'NOT_CONNECTED'}[status]??'validation_error',message:e.message,retryable:status===409,requestId}});}
 });
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const port=Number(process.env.PORT??3100);createServer().listen(port,'127.0.0.1',()=>console.log(`A module: http://127.0.0.1:${port}/demo/a`));}

