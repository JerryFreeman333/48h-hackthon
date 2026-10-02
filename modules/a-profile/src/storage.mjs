import {readFileSync,writeFileSync,mkdirSync,existsSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
export function persistState(path,state){
 const temp=path+'.'+randomUUID()+'.tmp';writeFileSync(temp,JSON.stringify(state));
 for(let retry=0;;retry++){
  try{renameSync(temp,path);return;}catch(e){if(!['EPERM','EBUSY','EACCES'].includes(e.code)||retry>=11)throw e;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,25);}
 }
}
export function loadState(dataDir,archiveDir){
 mkdirSync(dataDir,{recursive:true});const path=join(dataDir,'state.json');
 if(!existsSync(path))return undefined;
 const raw=readFileSync(path);const state=JSON.parse(raw.toString('utf8'));
 const legacyIds=new Set(Object.values(state.attempts??{}).filter(a=>!a.instrumentId||a.instrumentId==='career-prototype-48').map(a=>a.projectId));
 for(const p of state.profiles??[])if(p.assessment?.instrumentId==='career-prototype-48')legacyIds.add(p.projectId);
 if(!legacyIds.size)return state;
 // Archive byte-for-byte before replacing active state; fail closed on archive errors.
 mkdirSync(archiveDir,{recursive:true});const hash=createHash('sha256').update(raw).digest('hex');const backup=join(archiveDir,`state-${hash}.json`);
 if(!existsSync(backup))writeFileSync(backup,raw,{flag:'wx'});
 if(createHash('sha256').update(readFileSync(backup)).digest('hex')!==hash)throw new Error('历史存档校验失败');
 const removedProfiles=new Set((state.profiles??[]).filter(p=>legacyIds.has(p.projectId)).map(p=>p.profileId));
 state.attempts=Object.fromEntries(Object.entries(state.attempts??{}).filter(([,a])=>!legacyIds.has(a.projectId)));
 state.profiles=(state.profiles??[]).filter(p=>!legacyIds.has(p.projectId));state.intents=(state.intents??[]).filter(i=>!legacyIds.has(i.projectId));
 state.metadata=Object.fromEntries(Object.entries(state.metadata??{}).filter(([k])=>![...removedProfiles].some(id=>k.startsWith(id+':'))));
 state.storageVersion=2;state.archivedLegacyProjects=(state.archivedLegacyProjects??0)+legacyIds.size;
 persistState(path,state);return state;
}
