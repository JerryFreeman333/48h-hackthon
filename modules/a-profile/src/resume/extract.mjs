import {existsSync} from 'node:fs';
import {resolve,extname} from 'node:path';
export const MAX_BYTES=10*1024*1024;
export function checkFile(name,buffer){
 if(!Buffer.isBuffer(buffer)||!buffer.length||buffer.length>MAX_BYTES)throw new Error('单文件必须为1字节至10MB');
 const ext=extname(name).toLowerCase();
 if(ext==='.pdf'&&buffer.subarray(0,5).toString()==='%PDF-')return 'pdf';
 if(ext==='.docx'&&buffer.subarray(0,4).equals(Buffer.from([80,75,3,4]))){
  let expanded=0,count=0,hasDocument=false;
  for(let i=0;i<buffer.length-46;i++)if(buffer.readUInt32LE(i)===0x02014b50){
   const len=buffer.readUInt16LE(i+28);expanded+=buffer.readUInt32LE(i+24);count++;
   if(buffer.subarray(i+46,i+46+len).toString()==='word/document.xml')hasDocument=true;
  }
  if(!hasDocument||expanded>50*1024*1024||count>5000)throw new Error('DOCX结构非法或解压大小超限');return 'docx';
 }
 if(ext==='.png'&&buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){
  if(buffer.length<24||buffer.readUInt32BE(16)*buffer.readUInt32BE(20)>16000000)throw new Error('图片尺寸超限');return 'image';
 }
 if(['.jpg','.jpeg'].includes(ext)&&buffer[0]===255&&buffer[1]===216){
  let i=2,dimensions=false;while(i<buffer.length-9){if(buffer[i]!==255){i++;continue;}const marker=buffer[i+1],len=buffer.readUInt16BE(i+2);
   if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){if(buffer.readUInt16BE(i+5)*buffer.readUInt16BE(i+7)>16000000)throw new Error('图片尺寸超限');dimensions=true;break;}
   if(marker===218||len<2)break;i+=2+len;
  }if(!dimensions)throw new Error('JPEG尺寸无法确认');return 'image';
 }
 throw new Error('只接受内容匹配的PDF/DOCX/PNG/JPG；不能仅改扩展名');
}
export function candidatesFromText(pages){
 const rows=[];
 for(const page of pages){let section=null,lineNumber=0;for(const raw of page.text.split(/\r?\n/)){
  lineNumber++;const line=raw.trim();if(!line||line.length>4000)continue;
  // Do not send contact lines as career claims.
  if(/@|(?:手机|电话|邮箱|身份证)\s*[:：]|^\+?\d[\d\s-]{7,}$/.test(line))continue;
  if(/^(技能|专业技能|skills)\s*[:：]?$/i.test(line)){section='skill';continue;}
  if(/^(项目经历|实习经历|工作经历|experience|projects)\s*[:：]?$/i.test(line)){section='experience';continue;}
  if(/^(教育经历|教育背景|education)\s*[:：]?$/i.test(line)){section='education';continue;}
  let kind=/专业\s*[:：]/.test(line)?'major':/本科|硕士|博士|大专|学士|Bachelor|Master|Ph\.?D/i.test(line)?'education':/^(技能|skills)\s*[:：]/i.test(line)?'skill':section??'experience';
  rows.push({kind,description:line,originalQuote:line,locator:`${page.locator}; line ${lineNumber}`,dates:null,organization:null,role:null,extraction:'literal-line-candidate'});
 }}return rows.slice(0,100);
}
async function ocr(images,modelsDir){
 const languages=['chi_sim','eng'];if(!modelsDir||!languages.every(x=>existsSync(resolve(modelsDir,x+'.traineddata')))){const e=new Error('OCR本地中英文模型尚未安装，请运行npm run setup:ocr或使用手填');e.code='not_connected';throw e;}
 const {createWorker}=await import('tesseract.js');
 const worker=await createWorker(languages,1,{langPath:resolve(modelsDir),gzip:false,cacheMethod:'none',logger:()=>{}});
 try{const out=[];for(const image of images){const {data}=await worker.recognize(image.data);out.push({text:data.text,locator:image.locator,ocr:true});}return out;}finally{await worker.terminate();}
}
export async function extract(buffer,kind,modelsDir){
 if(kind==='docx'){const {default:mammoth}=await import('mammoth');const result=await mammoth.extractRawText({buffer});return {pages:[{text:result.value,locator:'DOCX extracted paragraph stream'}],warnings:result.messages.map(x=>x.message),method:'mammoth-text'};}
 if(kind==='image')return {pages:await ocr([{data:buffer,locator:'image 1'}],modelsDir),warnings:['OCR文本可能识别错误，必须逐条核对原文件。'],method:'tesseract-local'};
 const {PDFParse}=await import('pdf-parse');const parser=new PDFParse({data:new Uint8Array(buffer),isEvalSupported:false});
 try{const info=await parser.getInfo({parsePageInfo:true});if(info.total>30)throw new Error('PDF最多30页');
  const result=await parser.getText();const pages=[];let usedOcr=false;
  for(const p of result.pages){if(p.text.trim().length>=20){pages.push({text:p.text,locator:`PDF page ${p.num}`});continue;}
   const meta=info.pages?.find(x=>x.pageNumber===p.num||x.num===p.num);
   if(meta?.height&&meta?.width&&meta.height/meta.width>5)throw new Error('PDF页面比例超限，无法安全OCR');
   const screenshots=await parser.getScreenshot({partial:[p.num],desiredWidth:1400,imageDataUrl:false,imageBuffer:true});
   const shot=screenshots.pages[0];pages.push(...await ocr([{data:Buffer.from(shot.data),locator:`PDF page ${p.num} OCR`}],modelsDir));usedOcr=true;
  }
  return {pages,warnings:usedOcr?['扫描页使用本地OCR，结果待本人确认。']:[],method:usedOcr?'pdf-text-and-local-ocr':'pdf-text'};
 }finally{await parser.destroy();}
}
