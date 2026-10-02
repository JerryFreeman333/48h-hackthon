import {mkdirSync,writeFileSync,readFileSync,existsSync,renameSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const commit='65727574dfcd264acbb0c3e07860e4e9e9b22185'; // Official tessdata_fast 4.1.0 tag resolved to a frozen commit.
mkdirSync('.models',{recursive:true});const manifest=[];
const expected={eng:'bbef4675053b5b468cdb477053e28b1c698ba08e',chi_sim:'388bac276d033d06e5ed5ba7a7ad14ae58f97dab'};
const blobHash=data=>createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex');
for(const language of ['eng','chi_sim']){const url=`https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/${commit}/${language}.traineddata`;
 const destination=`.models/${language}.traineddata`,partial=destination+'.part';
 if(!existsSync(destination)||blobHash(readFileSync(destination))!==expected[language]){
  let complete=false;for(let retry=0;retry<8;retry++){console.log(`下载${language}模型，第${retry+1}次（可续传）`);
   try{execFileSync(process.platform==='win32'?'curl.exe':'curl',['--location','--fail','--silent','--show-error','--max-time','45','--continue-at','-','--output',partial,url],{windowsHide:true,stdio:'inherit',timeout:50000});complete=true;break;}catch(e){if(![28,56].includes(e.status))throw new Error(`模型下载失败：${e.status}；可稍后重新运行。`);}
  }
  if(!complete)throw new Error('模型下载未完成；保留.part，可稍后续传。');const data=readFileSync(partial);if(blobHash(data)!==expected[language])throw new Error('OCR模型与固定官方Git blob不一致，拒绝启用');renameSync(partial,destination);
 }
 const data=readFileSync(destination);manifest.push({language,url,release:commit,gitBlob:expected[language],sha256:createHash('sha256').update(data).digest('hex'),license:'Apache-2.0'});
}writeFileSync('.models/manifest.json',JSON.stringify(manifest,null,2));console.log('本地中英文OCR模型已安装；运行解析时不发送文件到外部服务。');
