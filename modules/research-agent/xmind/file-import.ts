import type {MaterialKind} from './document-schema';
export function inferMaterialKind(name:string):MaterialKind {
 const extension=name.toLowerCase().split('.').at(-1);
 if(extension==='pdf'||extension==='docx'||extension==='xlsx'||extension==='csv')return extension;
 if(['png','jpg','jpeg'].includes(extension??''))return 'image';
 if(['txt','md'].includes(extension??''))return 'text';
 throw Error('支持 PDF、DOCX、XLSX、CSV、PNG、JPEG 和文字文件');
}
export async function readMaterialFile(file:File){
 if(file.size>18_000_000)throw Error('材料请小于 18MB');
 const kind=inferMaterialKind(file.name);
 const content=kind==='text'?await file.text():await new Promise<string>((resolve,reject)=>{
  const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);
  reader.onerror=()=>reject(Error('文件读取失败'));reader.readAsDataURL(file);
 });
 return {kind,title:file.name,content};
}
