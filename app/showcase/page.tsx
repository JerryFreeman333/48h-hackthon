"use client";
import {useEffect,useState} from 'react';
import {PageHeader} from '@/packages/ui';
import type {HistoryItem} from '@/packages/integration/report-selection';

export default function ShowcasePage(){
 const [items,setItems]=useState<HistoryItem[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{let active=true;(async()=>{
  const boot=await fetch('/api/a/needs/bootstrap',{cache:'no-store'});if(!boot.ok)throw Error('本地会话恢复失败');
  const response=await fetch('/api/integration/history',{cache:'no-store'}),body=await response.json();
  if(!response.ok)throw Error(body.error?.message??'案例读取失败');
  if(active)setItems(body.reports.filter((item:HistoryItem)=>item.dataStatus?.presentationEligible===true));
 })().catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
 return <main><PageHeader title="展示案例"><p>这里用真实公开岗位展示判断流程；案例中的求职偏好是示例，不是你的个人记录。</p></PageHeader>
  <p><a href="/">返回首页 →</a>　<a href="/analyze">添加实际岗位资料 →</a>　<a href="/history">查看全部历史 →</a></p>
  <section className="panel"><h2>Rokid · B端市场营销策划</h2><p>真实公开招聘页面摘要 · 工作地点杭州 · 求职偏好为展示示例</p><p>演示重点：重视成长、薪酬透明和工时安排时，报告怎样提出需要核实的问题。固定薪资、晋升规则和实际在招状态保持未知。</p><p><a href="/showcase/rokid-marketing">打开完整案例报告 →</a>　<a href="https://rokid.zhiye.com/jobs?LocId=%5B%7B%22id%22%3A%223301%22%2C%22label%22%3A%22%E6%9D%AD%E5%B7%9E%E5%B8%82%22%7D%5D" target="_blank" rel="noreferrer">查看官方招聘来源 →</a></p></section>
  <h2>你保存的展示案例</h2>
  <section className="panel"><p><strong>资料来源：用户提供资料</strong> · <strong>核验状态：未独立核验</strong></p><p>用户声明为实际资料，不代表公司信息、招聘状态或待遇已经核实；报告保留缺失信息与待核验问题。</p></section>
  {loading&&<p role="status">正在读取展示案例…</p>}{error&&<p role="alert">{error}</p>}
  {!loading&&!error&&!items.length&&<section className="panel"><h2>尚未添加你自己的展示案例</h2><p>提交实际岗位 JD、填写来源链接，并勾选实际资料声明后，生成的报告会出现在这里。不会用合成公司或岗位填充案例。</p></section>}
  {items.map(item=><section className="panel" key={item.reportId}><h2><a href={item.reportUrl}>{item.jobTitles.join('、')}</a></h2><p>{item.dataStatus?.sourceLabel} · {item.dataStatus?.authenticityLabel} · 核验状态：{item.dataStatus?.verificationLabel}</p><p>需求版本 {item.profileRevision} · {new Date(item.generatedAt).toLocaleString('zh-CN')}</p><a href={item.reportUrl}>打开案例报告 →</a></section>)}
 </main>;
}
