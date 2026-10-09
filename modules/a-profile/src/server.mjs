import http from 'node:http';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {Service,ServiceError} from './service.mjs';
import {loadState,persistState} from './storage.mjs';
import {ProfileService} from './profile/service.mjs';
import {handleV2} from './profile/routes.mjs';
import {NeedsService,handleNeeds} from './needs/service.mjs';
import {archivePreviousFlow} from './needs/archive.mjs';
const root=dirname(fileURLToPath(import.meta.url));
export function createServer({dataDir=join(root,'../.data'),archiveDir=join(dataDir,'../rubbish/private'),privateTranslationPreview=false}={}){
 archivePreviousFlow(dataDir,archiveDir);
 const path=join(dataDir,'state.json'),state=loadState(dataDir,archiveDir);
 const service=new Service(state,()=>persistState(path,service.state));
 const v2=new ProfileService(service.state,()=>service.save());
 const needs=new NeedsService(service.state,next=>persistState(path,next));
 return http.createServer(async(req,res)=>{
 const requestId=randomUUID(),url=new URL(req.url,'http://localhost');
 const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 try{
 if(privateTranslationPreview&&!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))throw new ServiceError(403,'私有译稿审校仅供本机访问');
 if(!['127.0.0.1','localhost','[::1]'].includes((req.headers.host??'').replace(/:\d+$/,'')))throw new ServiceError(403,'只允许本机地址访问');
 if(/^\/api\/a\/v2\/(resume-imports|claims)(?:\/|$)/.test(url.pathname)||/^\/api\/a\/v2\/sessions\/[^/]+\/statements$/.test(url.pathname)||url.pathname==='/api/a/profiles/extract'){const e=new ServiceError(410,'经历与能力资料采集已停用，此接口不接收材料');e.code='feature_removed';throw e;}
 if(['/demo/a/v1','/app.mjs','/survey-adapter.mjs','/v2-app.mjs','/battery-survey.mjs'].includes(url.pathname)||(url.pathname.startsWith('/api/a/')&&!url.pathname.startsWith('/api/a/v2/')&&!url.pathname.startsWith('/api/a/needs/'))){const e=new ServiceError(410,'旧答题入口已停用；原题、算法和历史资料保留存档。请使用中文求职需求入口。');e.code='english_entry_removed';throw e;}
 if(url.pathname.startsWith('/api/a/v2/')&&req.method!=='GET'){const e=new ServiceError(410,'旧兴趣与人格流程仅保留历史读取，不再接收答题、计分、删除或修改。');e.code='assessment_flow_retired';throw e;}
 if(req.method==='GET'&&!url.pathname.startsWith('/api/')){
 const files={'/':'ui/needs.html','/demo/a':'ui/needs.html','/demo/a/v2':'ui/needs.html','/profile':'ui/needs.html','/needs-app.mjs':'ui/needs-app.mjs','/quick-unsure.mjs':'ui/quick-unsure.mjs','/style.css':'ui/style.css'};
 const f=files[url.pathname];if(!f)throw new ServiceError(404,'页面不存在');res.writeHead(200,{'Content-Type':f.endsWith('.css')?'text/css':/\.(mjs|js)$/.test(f)?'text/javascript':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});res.end(readFileSync(join(root,f)));return;
 }
 if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)throw new ServiceError(403,'拒绝跨站请求');
 const cookies=Object.fromEntries((req.headers.cookie??'').split(';').map(x=>x.trim().split('=')));
 let owner=cookies.a_session;if(!owner||!service.state.sessions?.includes(owner)){if(req.method==='GET'&&['/api/a/v2/bootstrap','/api/a/needs/bootstrap'].includes(url.pathname)){owner=randomUUID();service.state.sessions??=[];service.state.sessions.push(owner);service.save();res.setHeader('Set-Cookie',`a_session=${owner}; HttpOnly; SameSite=Strict; Path=/`);}else throw new ServiceError(401,'请先打开页面建立本地会话');}
 let body={};if(req.method!=='GET'){const chunks=[];let size=0,limit=url.pathname==='/api/a/needs/import'?6000000:256000;for await(const chunk of req){size+=chunk.length;if(size>limit)throw new ServiceError(422,'输入过大');chunks.push(chunk);}try{body=Buffer.concat(chunks).length?JSON.parse(Buffer.concat(chunks).toString('utf8')):{};}catch{throw new ServiceError(422,'JSON格式错误');}if(!body||typeof body!=='object'||Array.isArray(body))throw new ServiceError(422,'请求体必须为对象');}
 if(url.pathname.startsWith('/api/a/needs/')){json(200,handleNeeds(needs,owner,req,url,body));return;}
 if(url.pathname.startsWith('/api/a/v2/')){json(200,await handleV2(v2,owner,req,url,body));return;}
 throw new ServiceError(404,'接口不存在');
 }catch(e){const status=e.status??422;json(status,{error:{code:e.code??{401:'UNAUTHENTICATED',403:'FORBIDDEN',404:'NOT_FOUND',409:'REVISION_CONFLICT',503:'NOT_CONNECTED'}[status]??'validation_error',message:e.message,retryable:status===409,requestId}});}
 });
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const port=Number(process.env.PORT??3100);createServer().listen(port,'127.0.0.1',()=>console.log(`A 求职需求侧写: http://127.0.0.1:${port}/demo/a`));}
