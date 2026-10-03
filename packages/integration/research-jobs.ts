import {randomUUID,createHash} from 'node:crypto';
import {mkdirSync,writeFileSync,readFileSync,existsSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {databaseBundle} from './local-database';
import {getDemoFlow} from './demo-flow';
type Job={id:string;owner:string;key:string;status:'running'|'completed'|'failed';message:string;reportUrl?:string;warnings?:string[]};
export function createResearchJobs(dir=join(process.cwd(),'.data/research-agent/runs'),execute=(owner:string,input:Record<string,any>,ids:number[],progress:(p:{message:string})=>void)=>getDemoFlow().runDatabase(owner,input,ids,{onProgress:progress})){
 const active=new Map<string,Job>();
 const known=new Map<string,Job>();
 function save(job:Job){mkdirSync(dir,{recursive:true});const file=join(dir,job.id+'.json');writeFileSync(file+'.tmp',JSON.stringify(job));renameSync(file+'.tmp',file);}
 function publicJob(j:Job){return {runId:j.id,status:j.status,message:j.message,reportUrl:j.reportUrl,warnings:j.warnings};}
 return {
  start(owner:string,input:Record<string,any>,ids:number[]){
   databaseBundle(input,ids); // Reject invalid candidates before starting any paid work.
   const key=createHash('sha256').update(JSON.stringify([owner,input.UserProfile.profileId,input.UserProfile.revision,[...ids].sort()])).digest('hex');
   const previous=[...active.values()].find(j=>j.key===key);if(previous)return publicJob(previous);
   if(active.size)throw Object.assign(Error('已有调查正在进行，请稍后再试。'),{status:409});
   const job:Job={id:randomUUID(),owner,key,status:'running',message:'正在接收已确认的侧写与候选'};save(job);active.set(job.id,job);known.set(job.id,job);
   void Promise.resolve().then(()=>execute(owner,structuredClone(input),[...ids],p=>{job.message=p.message;try{save(job);}catch{/* A progress write must not cancel analysis. */}})).then(result=>{job.status='completed';job.message='报告已生成';job.reportUrl=result.reportUrl;job.warnings=result.warnings;}).catch(()=>{job.status='failed';job.message='本次分析未完成，请重试；原侧写与历史报告已保留。';}).finally(()=>{try{save(job);}catch{console.error('调查进度未能持久保存；本进程仍可读取结果，已生成报告可在历史中查看。');}active.delete(job.id);if(known.size>100){const oldest=[...known.keys()].find(id=>!active.has(id));if(oldest)known.delete(oldest);}});
   return publicJob(job);
  },
  read(owner:string,id:string){
   if(!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id))throw Object.assign(Error('调查记录不存在'),{status:404});
   const path=join(dir,id+'.json');if(!known.has(id)&&!existsSync(path))throw Object.assign(Error('调查记录不存在'),{status:404});
   const job:Job=known.get(id)??JSON.parse(readFileSync(path,'utf8'));if(job.owner!==owner)throw Object.assign(Error('调查记录不存在'),{status:404});
   if(job.status==='running'&&!active.has(id)){job.status='failed';job.message='服务重启中断了本次调查，请重新点击分析；不会自动重复调用。';save(job);}
   return publicJob(job);
  }
 };
}
const shared=globalThis as unknown as {__xrayResearchJobs?:ReturnType<typeof createResearchJobs>};
export function getResearchJobs(){return shared.__xrayResearchJobs??=createResearchJobs();}
