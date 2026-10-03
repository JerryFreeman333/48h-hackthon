import {PageHeader} from '@/packages/ui';
export default function ShowcasePage(){
 return <main><PageHeader title="展示案例"><p>展示入口已预留。</p></PageHeader>
  <section className="panel"><h2>暂未设置展示案例</h2><p>之后由你选定自己的一条判断记录，用它展示完整流程。当前不会自动把个人历史记录放到这里，也不会加入模拟案例。</p></section>
  <p><a href="/">返回首页 →</a>　<a href="/history">查看我的历史判断 →</a></p>
 </main>;
}
