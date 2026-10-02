import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from '../src/server.mjs';
import {loadState} from '../src/storage.mjs';
test('legacy state archived byte-for-byte and isolated; startup idempotent',()=>{
 const root=mkdtempSync(join(tmpdir(),'xray-archive-'));const data=join(root,'data'),archive=join(root,'rubbish/private');loadState(data,archive);
 const old={attempts:{old:{id:'old',owner:'u',projectId:'project-old',profileId:'profile-old',version:'1',answers:{q01:5}},new:{id:'new',instrumentId:'not-administered',projectId:'project-new'}},profiles:[{profileId:'profile-old',projectId:'project-old',assessment:{instrumentId:'career-prototype-48'}}],intents:[{projectId:'project-old'}],metadata:{'profile-old:1':{secret:true}},sessions:['u']};
 const bytes=Buffer.from(JSON.stringify(old,null,2));writeFileSync(join(data,'state.json'),bytes);
 const state=loadState(data,archive);assert.deepEqual(readFileSync(join(archive,readdirSync(archive)[0])),bytes);assert.equal(state.attempts.old,undefined);assert.ok(state.attempts.new);assert.deepEqual(state.profiles,[]);assert.deepEqual(state.intents,[]);assert.deepEqual(state.metadata,{});
 assert.equal(loadState(data,archive).archivedLegacyProjects,1);assert.equal(readdirSync(archive).length,1);
});
