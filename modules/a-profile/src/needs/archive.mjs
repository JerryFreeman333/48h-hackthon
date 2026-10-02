import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
// Keep a byte-exact archive before the new flow can append state. Never migrate scores into needs.
export function archivePreviousFlow(dataDir,archiveDir){
 const path=join(dataDir,'state.json');if(!existsSync(path))return null;
 const raw=readFileSync(path),state=JSON.parse(raw.toString('utf8'));
 if(state.needs||(!Object.keys(state.attempts??{}).length&&!Object.keys(state.v2?.sessions??{}).length&&!state.profiles?.length))return null;
 mkdirSync(archiveDir,{recursive:true});const sha256=createHash('sha256').update(raw).digest('hex'),backup=join(archiveDir,'needs-transition-'+sha256+'.json');
 if(!existsSync(backup))writeFileSync(backup,raw,{flag:'wx'});
 if(createHash('sha256').update(readFileSync(backup)).digest('hex')!==sha256)throw new Error('旧问卷完整存档校验失败，未启动新流程');
 return {sha256,file:backup};
}
