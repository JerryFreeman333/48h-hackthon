import {randomUUID} from 'node:crypto';
import {writeFileSync,renameSync,unlinkSync} from 'node:fs';

/** Windows sync/indexer handles may briefly lock the destination. Never delete the last checkpoint. */
export function atomicWrite(file:string,text:string){
 const temp=file+'.'+randomUUID()+'.tmp';writeFileSync(temp,text,{encoding:'utf8',flag:'wx'});
 try{
  for(let n=0;;n++){
   try{renameSync(temp,file);return;}catch(error){
    if(!['EPERM','EACCES','EBUSY'].includes((error as NodeJS.ErrnoException).code??'')||n>=4)throw error;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,[40,100,200,400][n]);
   }
  }
 }finally{try{unlinkSync(temp);}catch{/* Successful rename leaves no temporary file. */}}
}
