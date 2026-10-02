import {Worker} from 'node:worker_threads';
export function parseJob(path,kind,modelsDir){return new Promise(resolve=>{
 const worker=new Worker(new URL('./worker.mjs',import.meta.url),{workerData:{path,kind,modelsDir},resourceLimits:{maxOldGenerationSizeMb:384}});
 let done=false;const finish=x=>{if(done)return;done=true;clearTimeout(timer);worker.terminate();resolve(x);};
 const timer=setTimeout(()=>finish({ok:false,code:'parse_failed',message:'解析超过90秒，请使用较小文件或手填'}),90000);
 worker.once('message',finish);worker.once('error',e=>finish({ok:false,code:'parse_failed',message:e.message}));worker.once('exit',code=>{if(!done)finish({ok:false,code:'parse_failed',message:'解析进程提前结束：'+code});});
 });}
