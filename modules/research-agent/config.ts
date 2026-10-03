import {existsSync} from 'node:fs';
import {join} from 'node:path';

export function agentConfiguration(env:NodeJS.ProcessEnv=process.env){
 const enabled=env.RESEARCH_AGENT_ENABLED==='true';
 const baseUrl=(env.MINIMAX_BASE_URL??'https://api.minimax.cn/v1').replace(/\/$/,'');
 const url=new URL(baseUrl);
 if(url.protocol!=='https:'||url.port||!['api.minimax.cn','api.minimax.io','api.minimaxi.com'].includes(url.hostname)||url.username||url.password||url.pathname!=='/v1'||url.search||url.hash)throw Error('MiniMax 地址必须是官方 HTTPS v1 接口');
 const localPython=join(process.cwd(),'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
 return {enabled,key:env.MINIMAX_API_KEY??'',baseUrl,model:env.MINIMAX_MODEL??'MiniMax-M2.7',python:env.RESEARCH_AGENT_PYTHON||(existsSync(localPython)?localPython:'python'),maxModelCalls:3,maxToolCalls:2,maxCompletionTokens:4096,deadlineMs:240000,cacheMs:24*3600000};
}
