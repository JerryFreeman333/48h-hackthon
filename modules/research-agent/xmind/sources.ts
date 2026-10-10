/** Capability registry, not a list of successfully crawled sites. No new crawler is installed here. */
export type Source={id:string;label:string;domains:string[];categories:string[];mode:'http'|'browser'|'api'|'file'|'ocr'|'client'|'event';status:'available'|'connector_pending';fields:string[];prerequisite:string;cost:'local'|'network'|'provider_unknown'};
const make=(id:string,label:string,domains:string[],categories:string[],mode:Source['mode'],fields:string[],prerequisite='',available=false):Source=>({id,label,domains,categories,mode,fields,prerequisite,status:available?'available':'connector_pending',cost:mode==='file'?'local':mode==='api'?'provider_unknown':'network'});
export const sources:Source[]=[
 make('local','只读企业候选库',[],['identity','business','finance','recruitment','employment','experience','opinion'],'file',['excerpt','job','subject'],'本机库已配置',true),
 make('public','可访问公开网页',[],['identity','business','finance','recruitment','employment','experience','opinion'],'http',['full_text','period','quote'],'正文实际可访问；逐次验证',true),
 make('pdf','文本 PDF',[],['identity','business','finance','recruitment','employment','experience'],'file',['full_text','page','quote'],'文本层可解析；网络取得可能失败',true),
 make('user','主动提供文本/文本 PDF',[],['identity','business','finance','recruitment','employment','experience','opinion'],'file',['full_text','quote'],'提供者声明来源，不认证真实性',true),
 make('gsxt','国家企业信用信息公示系统',['gsxt.gov.cn'],['identity'],'api',['legalName','creditCode','relation'],'授权接口或可访问材料'),
 ...[['tianyancha','天眼查','tianyancha.com'],['qixin','启信宝','qixin.com'],['qcc','企查查','qcc.com']].map(([id,label,domain])=>make(id,label,[domain],['identity','business','finance','employment'],'api',['legalName','creditCode','relation','period'],'各自授权与字段契约，不能互换接口')),
 make('aiqicha','爱企查',['aiqicha.baidu.com'],['identity','business'],'browser',['legalName','relation'],'浏览器来源适配器待接'),
 make('disclosure','巨潮/交易所披露',['cninfo.com.cn','szse.cn','sse.com.cn'],['business','finance','employment'],'http',['period','value','unit','reportingScope'],'复用公开正文/PDF获取，专用发现待接',true),
 make('official','公司官网/招聘官网/官方公众号',[],['identity','business','recruitment','employment','experience'],'http',['full_text','role','period'],'用户指定公共URL或搜索发现；可见公众号正文',true),
 make('news','36氪/虎嗅/财新/界面',['36kr.com','huxiu.com','caixin.com','jiemian.com'],['business','opinion'],'http',['full_text','origin','period'],'复用公开HTTP；付费/限制页面保留访问状态',true),
 make('procurement','招投标/政府采购/监管公示',['ccgp.gov.cn'],['business','employment'],'http',['subject','period','eventStage'],'公开正文可访问',true),
 ...[['boss','BOSS直聘','zhipin.com'],['liepin','猎聘','liepin.com'],['zhaopin','智联','zhaopin.com'],['51job','前程无忧','51job.com'],['lagou','拉勾','lagou.com'],['shixiseng','实习僧','shixiseng.com'],['yingjiesheng','应届生','yingjiesheng.com']].map(([id,label,domain])=>make(id,label,[domain],['recruitment'],'browser',['role','city','salary','period'],'岗位来源适配器待接；不凭搜索摘要判定在招')),
 make('campus','公司招聘/校园就业网',[],['recruitment'],'http',['role','city','period'],'实际可访问正文',true),
 make('court','司法/执行/裁判/监管材料',[],['employment','identity'],'http',['subject','eventStage','period'],'仅可取得正文；专用查询接口待接',true),
 ...[['maimai','脉脉','maimai.cn'],['zhihu','知乎','zhihu.com'],['nowcoder','牛客','nowcoder.com'],['xiaohongshu','小红书','xiaohongshu.com'],['weibo','微博','weibo.com'],['douban','豆瓣','douban.com'],['tieba','贴吧','tieba.baidu.com'],['bilibili','B站文字评论','bilibili.com'],['douyin','抖音文字评论','douyin.com']].map(([id,label,domain])=>make(id,label,[domain],['experience','opinion','recruitment'],'browser',['account','timestamp','full_text','origin'],'文字适配器待接；不采视频/音频')),
 make('wechat','微信白名单群可见消息',[],['experience','opinion'],'client',['account','timestamp','context'],'本人本地客户端授权与版本兼容，适配器待接'),
 make('qq','QQ机器人事件',[],['experience','opinion'],'event',['account','timestamp','context'],'有权限的官方机器人事件，适配器待接'),
 make('group_import','用户提供群聊文本',[],['experience','opinion'],'file',['account','timestamp','context'],'用户主动导入，敏感字段仅内部使用',true),
 make('docx','DOCX/表格文件',[],['identity','employment','finance'],'file',['full_text','table','cell'],'专用文件解析器待接，可先导入文本'),
 make('ocr','截图/扫描件 OCR',[],['identity','employment','finance'],'ocr',['text','image','position'],'OCR解析器待接，高影响数字需复核')
];
export function category(predicate:string,topic:string){return predicate==='identity'?'identity':predicate==='recruitment'?'recruitment':predicate==='finance'?'finance':topic==='company'?'business':topic==='position'?'employment':topic==='culture'||topic==='growth'||topic==='hours'?'experience':topic==='pay'||topic==='benefits'?'employment':'opinion';}
export function routeSources(predicate:string,topic:string,missingFields:string[]){const cat=category(predicate,topic);return sources.filter(s=>s.categories.includes(cat)).sort((a,b)=>10*(Number(b.status==='available')-Number(a.status==='available'))+Number(b.fields.some(f=>missingFields.includes(f)))-Number(a.fields.some(f=>missingFields.includes(f)))).map(s=>s.id);}
