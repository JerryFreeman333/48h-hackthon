import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {deflateRawSync} from 'node:zlib';
import {extract,checkFile,candidatesFromText} from '../src/resume/extract.mjs';
import {ProfileService} from '../src/profile/service.mjs';

export function pdfFixture(){
 const text='BT /F1 16 Tf 50 750 Td (Education: Bachelor) Tj 0 -30 Td (Skills: Basic Python) Tj 0 -30 Td (Participated in testing project) Tj ET';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`];
 let doc='%PDF-1.4\n',offsets=[0];objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(doc));doc+=`${i+1} 0 obj\n${o}\nendobj\n`;});const start=Buffer.byteLength(doc);doc+=`xref\n0 6\n0000000000 65535 f \n`+offsets.slice(1).map(v=>`${String(v).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;return Buffer.from(doc);
}
const crc32=buffer=>{let crc=0xffffffff;for(const byte of buffer){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;};
export function docxFixture(){
 const files={'[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
 '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
 'word/document.xml':'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>本科</w:t></w:r></w:p><w:p><w:r><w:t>专业：计算机</w:t></w:r></w:p><w:p><w:r><w:t>技能：了解Python</w:t></w:r></w:p><w:p><w:r><w:t>参与项目，完成测试</w:t></w:r></w:p></w:body></w:document>'};
 let offset=0;const local=[],central=[];for(const [filename,value] of Object.entries(files)){const name=Buffer.from(filename),raw=Buffer.from(value),data=deflateRawSync(raw),crc=crc32(raw),h=Buffer.alloc(30);
 h.writeUInt32LE(0x04034b50,0);h.writeUInt16LE(20,4);h.writeUInt16LE(8,8);h.writeUInt32LE(crc,14);h.writeUInt32LE(data.length,18);h.writeUInt32LE(raw.length,22);h.writeUInt16LE(name.length,26);
 const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(8,10);c.writeUInt32LE(crc,16);c.writeUInt32LE(data.length,20);c.writeUInt32LE(raw.length,24);c.writeUInt16LE(name.length,28);c.writeUInt32LE(offset,42);central.push(c,name);local.push(h,name,data);offset+=h.length+name.length+data.length;
 }const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(3,8);end.writeUInt16LE(3,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...local,directory,end]);
}
test('actual PDF text extraction preserves original page/line evidence',async()=>{
 const b=pdfFixture();assert.equal(checkFile('resume.pdf',b),'pdf');const r=await extract(b,'pdf');assert.equal(r.method,'pdf-text');assert.match(r.pages[0].text,/Participated in testing project/);assert(candidatesFromText(r.pages).some(x=>x.locator.includes('PDF page 1')));
});
test('actual DOCX extraction retains Chinese limited skill/participation and no invented role',async()=>{
 const b=docxFixture();assert.equal(checkFile('resume.docx',b),'docx');const r=await extract(b,'docx');assert.match(r.pages[0].text,/技能：了解Python/);assert.match(r.pages[0].text,/参与项目/);assert(!r.pages[0].text.includes('负责人'));
});
test('actual image/OCR unavailable path returns not_connected',async()=>{
 await assert.rejects(()=>extract(Buffer.from('image'),'image',join(tmpdir(),'not-configured-models')),{code:'not_connected'});
});
test('real worker job, owned private file, pending candidates and deletion',async()=>{
 const dataDir=mkdtempSync(join(tmpdir(),'resume-job-')),svc=new ProfileService({},()=>{}, {dataDir});let s=svc.create('owner',{battery:'None'});
 const x=await svc.upload('owner',{sessionId:s.id,expectedRevision:s.revision,filename:'synthetic.docx',base64:docxFixture().toString('base64')});let job=x.job;
 for(let i=0;i<100&&job.status==='processing';i++){await new Promise(r=>setTimeout(r,100));job=svc.job('owner',job.id);}assert.equal(job.status,'completed',JSON.stringify(job.error));
 assert(!('path' in job));assert.throws(()=>svc.job('other',job.id),/访问权限/);s=svc.get('owner',s.id);assert.equal(s.claims.length,4);assert(s.claims.every(c=>c.status==='pending'));
 const privatePath=svc.db.jobs[job.id].path;assert(existsSync(privatePath));svc.delete('owner',s.profileId);assert(!existsSync(privatePath));
});
test('actual local Chinese/English OCR recognizes synthetic PNG', {skip:!existsSync(resolve('.models/chi_sim.traineddata'))?'OCR模型未安装':false,timeout:90000},async()=>{
 const {createCanvas}=await import('@napi-rs/canvas');const canvas=createCanvas(1200,360),ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1200,360);ctx.fillStyle='black';ctx.font='44px Arial';ctx.fillText('Skills: Basic Python',40,80);ctx.fillText('Participated in testing project',40,170);ctx.font='44px "Microsoft YaHei"';ctx.fillText('参与项目，完成测试',40,260);
 const b=canvas.toBuffer('image/png');assert.equal(checkFile('resume.png',b),'image');const r=await extract(b,'image',resolve('.models'));assert.equal(r.method,'tesseract-local');assert.match(r.pages[0].text,/Python/i);assert.match(r.pages[0].text,/testing/i);assert.match(r.pages[0].text,/参与|测试/);
});
test('actual scanned PDF renders page then OCR, retaining page evidence', {skip:!existsSync(resolve('.models/chi_sim.traineddata'))?'OCR模型未安装':false,timeout:90000},async()=>{
 const {createCanvas}=await import('@napi-rs/canvas'),canvas=createCanvas(1200,300),ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1200,300);ctx.fillStyle='black';ctx.font='48px Arial';ctx.fillText('Skills: Basic Python',40,100);ctx.fillText('Participated in testing',40,210);const jpg=canvas.toBuffer('image/jpeg');
 const draw=Buffer.from('q 500 0 0 125 40 600 cm /Im1 Do Q');const objects=[Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>'),Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width 1200 /Height 300 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`),jpg,Buffer.from('\nendstream')]),Buffer.concat([Buffer.from(`<< /Length ${draw.length} >>\nstream\n`),draw,Buffer.from('\nendstream')])];
 const parts=[Buffer.from('%PDF-1.4\n')],offsets=[];let offset=parts[0].length;objects.forEach((o,i)=>{offsets.push(offset);const data=Buffer.concat([Buffer.from(`${i+1} 0 obj\n`),o,Buffer.from('\nendobj\n')]);parts.push(data);offset+=data.length;});
 parts.push(Buffer.from(`xref\n0 6\n0000000000 65535 f \n`+offsets.map(v=>`${String(v).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF`));
 const result=await extract(Buffer.concat(parts),'pdf',resolve('.models'));assert.equal(result.method,'pdf-text-and-local-ocr');assert.match(result.pages[0].text,/Python/i);assert(result.pages[0].locator.includes('PDF page 1 OCR'));
});
