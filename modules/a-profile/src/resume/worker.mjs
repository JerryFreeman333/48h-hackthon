import {parentPort,workerData} from 'node:worker_threads';
import {readFileSync} from 'node:fs';
import {extract,candidatesFromText} from './extract.mjs';
try{const result=await extract(readFileSync(workerData.path),workerData.kind,workerData.modelsDir);
 if(result.pages.reduce((n,p)=>n+p.text.length,0)>200000)throw new Error('提取文本超限');
 parentPort.postMessage({ok:true,method:result.method,warnings:result.warnings,candidates:candidatesFromText(result.pages)});
}catch(e){parentPort.postMessage({ok:false,code:e.code??'parse_failed',message:e.message});}
