import {z} from 'zod';

const declarationSchema=z.strictObject({kind:z.enum(['user_provided','synthetic']).default('user_provided'),actualMaterialConfirmed:z.boolean().default(false)});
export type SourceDeclaration=z.infer<typeof declarationSchema> & {jobId:string;sourceUrl:string|null};
export function parseSourceDeclaration(raw:unknown,sourceUrl:string|null){
 const value=declarationSchema.parse(raw??{});
 if(value.actualMaterialConfirmed&&value.kind==='synthetic')throw Error('合成测试样例不能作为实际资料展示。');
 if(value.actualMaterialConfirmed&&!sourceUrl)throw Error('收录展示案例需要填写资料来源链接。');
 return value;
}
export function reportDataStatus(saved:{inputs:Record<string,any>}){
 const bundle=saved.inputs.bundle,jobs=bundle.jobs as {jobId:string;sourceUrl?:string|null}[];
 const declarations=(saved.inputs.sourceDeclarations??[]) as SourceDeclaration[];
 const matched=jobs.map(job=>{const xs=declarations.filter(x=>x.jobId===job.jobId);return xs.length===1?xs[0]:null;});
 const synthetic=bundle.mode==='demo'||matched.some(d=>d?.kind==='synthetic');
 const allDeclared=jobs.length>0&&matched.every(d=>d?.kind==='user_provided'&&d.actualMaterialConfirmed===true&&!!d.sourceUrl);
 return {
  sourceLabel:synthetic?(bundle.mode==='demo'||matched.every(d=>d?.kind==='synthetic')?'合成测试样例':'混合资料（含合成测试样例）'):saved.inputs.databaseSource?'本地爬虫数据库':'用户提供资料',
  authenticityLabel:synthetic?'虚构资料，仅供开发测试':saved.inputs.databaseSource?'爬虫数据库记录，适用范围待核验':allDeclared?'用户声明为实际岗位资料':'真实性未声明',
  verificationLabel:synthetic?'不用于真实公司判断':'未独立核验',
  presentationEligible:!synthetic&&allDeclared,
 };
}
