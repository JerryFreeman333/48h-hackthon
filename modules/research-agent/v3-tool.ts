import {spawn} from 'node:child_process';
import {join} from 'node:path';
import {z} from 'zod';
import {agentConfiguration} from './config';
const loc=z.object({paragraph:z.number().optional(),physical_page:z.number().optional(),table:z.number().optional(),row:z.number().optional(),column:z.number().optional()});
export const acquisitionResultSchema=z.object({
 records:z.array(z.unknown()),documents:z.array(z.object({id:z.string(),url:z.string().nullable(),title:z.string(),publishedAt:z.string().nullable(),retrievedAt:z.string(),declaredSubject:z.string().nullable(),entityMatch:z.string(),rawRef:z.string(),rawHash:z.string(),parsedRef:z.string(),originUrl:z.string().nullable().optional(),contentHash:z.string(),mode:z.enum(['http','pdf','search','user_text','user_pdf']),units:z.array(z.object({text:z.string(),locator:loc}))})),done:z.boolean(),requests:z.number()
});
export type V3ToolRequest={company_id:number;question_id:string;task_id:string;query:string;urls:string[];imports:{kind:'text'|'pdf';content:string;title:string;declared_source?:string|null;synthetic_fixture?:boolean}[];max_requests:number;seconds:number;recovery_only?:boolean};
export function runV3Tool(request:V3ToolRequest,timeoutMs=45000){
 return new Promise<z.infer<typeof acquisitionResultSchema>>((resolve,reject)=>{
  const config=agentConfiguration(),env:NodeJS.ProcessEnv={NODE_ENV:process.env.NODE_ENV,PYTHONUTF8:'1',PYTHONDONTWRITEBYTECODE:'1'};
  for(const k of ['PATH','Path','SystemRoot','TEMP','TMP','USERPROFILE'])if(process.env[k])env[k]=process.env[k];
  const child=spawn(config.python,[join(process.cwd(),'modules/research-agent/worker_v3.py')],{windowsHide:true,env,stdio:['pipe','pipe','pipe']});
  const chunks:Buffer[]=[];let size=0,done=false;
  const finish=(error?:Error,value?:z.infer<typeof acquisitionResultSchema>)=>{if(done)return;done=true;clearTimeout(timer);if(error)reject(error);else resolve(value!);};
  const timer=setTimeout(()=>{child.kill();finish(Error('V3 acquisition timeout'));},timeoutMs);
  child.stdout.on('data',(c:Buffer)=>{size+=c.length;if(size>2_000_000){child.kill();finish(Error('V3 output limit'));}else chunks.push(c);});
  child.stderr.on('data',()=>{});child.stdin.on('error',()=>{});
  child.on('error',()=>finish(Error('V3 Python unavailable')));
  child.on('close',code=>{if(code!==0)return finish(Error('V3 acquisition failed'));try{finish(undefined,acquisitionResultSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8'))));}catch{finish(Error('V3 invalid tool output'));}});
  child.stdin.end(JSON.stringify(request));
 });
}
