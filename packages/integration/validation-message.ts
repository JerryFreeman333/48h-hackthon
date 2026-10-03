// Never display a validation library's JSON, English messages or regex to users.
export function validationMessage(error:unknown):string{
 const issues=(error as {issues?:{path:PropertyKey[];code:string;maximum?:number}[]})?.issues;
 if(!Array.isArray(issues))return error instanceof SyntaxError?'输入格式不正确，请检查文件或重新填写。':error instanceof Error?error.message:'请求失败，请重试。';
 const labels:Record<string,string>={title:'岗位名称',rawJd:'JD正文',city:'岗位城市',companyName:'公司名称',sourceUrl:'来源链接',publishedAt:'发布日期',answer:'核验回复',salaryMin:'薪资下限',district:'所在区县',address:'办公地址',station:'附近地铁站',street:'街道或片区',building:'园区或楼宇'};
 return [...new Set(issues.slice(0,5).map(i=>{const key=String(i.path.at(-1)??''),label=labels[key]??'输入内容';if(i.code==='too_big')return label+'最多'+i.maximum+'字。';if(key==='sourceUrl')return '来源链接须为有效的 HTTP 或 HTTPS 地址，不能包含用户名和密码。';if(key==='publishedAt')return '发布日期需包含时间和时区，例如 2026-10-03T09:00:00+08:00；不知道时请留空。';if(key==='salaryMin')return '薪资下限不能高于上限。';return label+'未填写或格式不正确，请检查后重试。';}))].join(' ');
}
