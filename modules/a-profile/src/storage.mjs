import {readFileSync,writeFileSync,mkdirSync,existsSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {publicSession,cleanV1Draft,FLOW_VERSION} from './profile/scope.mjs';
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
 if(legacyIds.size){
 // Archive byte-for-byte before replacing active state; fail closed on archive errors.
 mkdirSync(archiveDir,{recursive:true});const hash=createHash('sha256').update(raw).digest('hex');const backup=join(archiveDir,`state-${hash}.json`);
 if(!existsSync(backup))writeFileSync(backup,raw,{flag:'wx'});
 if(createHash('sha256').update(readFileSync(backup)).digest('hex')!==hash)throw new Error('历史存档校验失败');
 const removedProfiles=new Set((state.profiles??[]).filter(p=>legacyIds.has(p.projectId)).map(p=>p.profileId));
 state.attempts=Object.fromEntries(Object.entries(state.attempts??{}).filter(([,a])=>!legacyIds.has(a.projectId)));
 state.profiles=(state.profiles??[]).filter(p=>!legacyIds.has(p.projectId));state.intents=(state.intents??[]).filter(i=>!legacyIds.has(i.projectId));
 state.metadata=Object.fromEntries(Object.entries(state.metadata??{}).filter(([k])=>![...removedProfiles].some(id=>k.startsWith(id+':'))));
 state.storageVersion=2;state.archivedLegacyProjects=(state.archivedLegacyProjects??0)+legacyIds.size;
 persistState(path,state);}
 if(state.scopeVersion!==FLOW_VERSION){
  const personalDraft=Object.values(state.attempts??{}).some(a=>Object.keys(a.draft??{}).some(k=>['education','major','skills','experiences'].includes(k)));
  const needsArchive=personalDraft||!!state.v2;
  if(needsArchive){mkdirSync(archiveDir,{recursive:true});const hash=createHash('sha256').update(raw).digest('hex'),backup=join(archiveDir,'scope-state-'+hash+'.json');if(!existsSync(backup))writeFileSync(backup,raw,{flag:'wx'});if(createHash('sha256').update(readFileSync(backup)).digest('hex')!==hash)throw new Error('A范围升级存档校验失败');state.scopeMigration={version:FLOW_VERSION,backupSha256:hash};}
  for(const a of Object.values(state.attempts??{}))a.draft=cleanV1Draft(a.draft);
  for(const s of Object.values(state.v2?.sessions??{})){const visible=publicSession(s);Object.assign(s,visible);delete s.claims;}
  if(state.v2)delete state.v2.jobs;
  state.scopeVersion=FLOW_VERSION;persistState(path,state);
 }return state;
}
