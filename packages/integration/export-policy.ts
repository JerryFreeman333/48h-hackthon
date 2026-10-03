export function exportsDisabled(){return Response.json({error:{code:'EXPORT_DISABLED',message:'数据导出已关闭，请在页面内查看分析结果。'}},{status:403,headers:{'cache-control':'no-store'}});}
