import {agentConfiguration} from './config';

export type ModelMessage={role:string;content:any;tool_calls?:any[];tool_call_id?:string;reasoning_content?:string};
export type ModelReply={message:ModelMessage;requestId:string;tokens:number|null};
export async function callMiniMax(messages:ModelMessage[],tools:any[],timeoutMs=45000,config=agentConfiguration()):Promise<ModelReply>{
 if(!config.key)throw Error('未配置 MiniMax 密钥，使用已有数据库资料');
 const response=await fetch(config.baseUrl+'/chat/completions',{method:'POST',redirect:'error',headers:{authorization:'Bearer '+config.key,'content-type':'application/json'},body:JSON.stringify({model:config.model,messages,tools,tool_choice:'auto',max_completion_tokens:config.maxCompletionTokens,temperature:0.2,reasoning_split:true}),signal:AbortSignal.timeout(timeoutMs)});
 if(!response.ok)throw Error(response.status===401||response.status===403?'MiniMax 密钥或模型权限不可用，使用已有资料':response.status===429?'MiniMax 调用达到限额，使用已有资料':'MiniMax 服务未完成请求，使用已有资料');
 const body=await response.json();
 if(body.base_resp?.status_code&&body.base_resp.status_code!==0)throw Error('MiniMax 服务返回错误，使用已有资料');
 const choice=body.choices?.[0];
 if(!choice?.message||choice.finish_reason==='length')throw Error('MiniMax 调查计划未完整返回，使用已有资料');
 // Preserve complete assistant messages during tool calling; never archive reasoning.
 return {message:choice.message,requestId:typeof body.id==='string'?body.id:'not_recorded',tokens:typeof body.usage?.total_tokens==='number'?body.usage.total_tokens:null};
}
