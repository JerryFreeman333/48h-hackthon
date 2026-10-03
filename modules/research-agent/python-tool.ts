import {spawn} from 'node:child_process';
import {join} from 'node:path';
import {z} from 'zod';
import {agentConfiguration} from './config';

export const topicIds=['growth','pay','hours','benefits','culture','position','company'] as const;
export const toolArguments=z.object({company_id:z.number().int().positive(),topics:z.array(z.enum(topicIds)).min(1).max(7)}).strict();
const evidence=z.object({id:z.string().min(1).max(120),company_id:z.number().int(),topic:z.enum(topicIds),title:z.string().max(1000),excerpt:z.string().max(10000),url:z.string().url().nullable(),source_type:z.string().max(100),published_at:z.string().nullable(),collected_at:z.string(),verification_original:z.string()});
export const toolResultSchema=z.object({company_id:z.number().int(),topics:z.array(z.enum(topicIds)),evidence:z.array(evidence).max(28),facts:z.array(z.object({id:z.string(),evidence_id:z.string(),company_id:z.number().int(),fact_key:z.string(),value:z.string()})).max(300),attempted_sources:z.number().optional(),empty_or_failed_sources:z.number().optional(),accepted_hits:z.number().optional(),collected_at:z.string().optional()});
export type ToolResult=z.infer<typeof toolResultSchema>;
export function runPythonTool(action:string,args:z.infer<typeof toolArguments>,timeoutMs=65000):Promise<ToolResult>{
 if(!['read_company_materials','investigate_company_topics'].includes(action))throw Error('不支持的调查工具');
 const parsed=toolArguments.parse(args),config=agentConfiguration();
 return new Promise((resolve,reject)=>{
  // No shell, arbitrary paths/commands, inherited API keys or personal records.
  const child=spawn(config.python,[join(process.cwd(),'modules/research-agent/worker.py')],{windowsHide:true,env:{NODE_ENV:process.env.NODE_ENV,...Object.fromEntries(['PATH','Path','SystemRoot','TEMP','TMP','HOME','USERPROFILE'].filter(k=>process.env[k]).map(k=>[k,process.env[k]!])),PYTHONUTF8:'1',PYTHONDONTWRITEBYTECODE:'1'},stdio:['pipe','pipe','pipe']});
  const chunks:Buffer[]=[];let size=0,done=false;
  const end=(error?:Error,result?:ToolResult)=>{if(done)return;done=true;clearTimeout(timer);if(error)reject(error);else resolve(result!);};
  const timer=setTimeout(()=>{child.kill();end(Error('调查工具超时，保留已有资料'));},timeoutMs);
  child.stdout.on('data',chunk=>{size+=chunk.length;if(size>512000){child.kill();end(Error('调查材料过大，保留已有资料'));}else chunks.push(chunk);});
  child.stderr.on('data',()=>{}); // Vendor diagnostics cannot leak credentials into API errors.
  child.on('error',()=>end(Error('Python 调查工具未配置或不可启动，保留已有资料')));
  child.on('close',code=>{if(code!==0)return end(Error('调查工具未完成，保留已有资料'));try{end(undefined,toolResultSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8'))));}catch{end(Error('调查资料格式不完整，保留已有资料'));}});
  child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({action,...parsed}));
 });
}
