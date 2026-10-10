import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadV3Options,saveV3Import} from '../v3-sources';
import {locatorSchema} from './document-schema';
test('OCR parser coordinates map explicitly into the archived public contract',()=>{
 const locator={physical_page:1,paragraph:1,bbox:[0,0,20,0,20,8,0,8],confidence:0.93,engine:'rapidocr-onnxruntime'};
 assert.deepEqual(locatorSchema.parse(locator),{physical_page:1,paragraph:1,bbox:locator.bbox,ocr_confidence:0.93,ocr_engine:'rapidocr-onnxruntime'});
 assert.throws(()=>locatorSchema.parse({...locator,ocr_confidence:0.1}));assert.throws(()=>locatorSchema.parse({...locator,confidence:1.1}));
});
test('large canonical binary imports avoid regex stack exhaustion and remain owner scoped',()=>{
 const before=process.cwd(),directory=mkdtempSync(join(tmpdir(),'xmind-binary-import-'));process.chdir(directory);
 try{const bytes=Buffer.alloc(10_000_000,65);bytes.write('%PDF-1.7\n',0,'ascii');const content=bytes.toString('base64');
  const saved=saveV3Import('owner-a',{kind:'pdf',title:'large synthetic PDF encoding acceptance',content,syntheticFixture:true});
  assert.equal(loadV3Options('owner-a',{importIds:[saved.importId]}).materials[0].content,content);
  assert.throws(()=>loadV3Options('owner-b',{importIds:[saved.importId]}),/本会话无/);
  for(const invalid of [content+'=',content.slice(0,-2),content.slice(0,100)+'!'+content.slice(101),content+'\n'])assert.throws(()=>saveV3Import('owner-a',{kind:'pdf',title:'noncanonical',content:invalid}),/格式或编码/);
 }finally{process.chdir(before);assert.ok(directory.startsWith(join(tmpdir(),'xmind-binary-import-')));rmSync(directory,{recursive:true,force:true});}
});
