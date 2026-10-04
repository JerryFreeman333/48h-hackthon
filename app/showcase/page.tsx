import type { Metadata } from 'next';
import { sectors, sources, metrics, reportDate } from './case-data';
import styles from './showcase.module.css';

export const metadata: Metadata = { title: '万科 · 七板块风险对照案例｜求职 X-Ray' };

export default function ShowcasePage() {
  return <div className={styles.page}>
    <a className={styles.skip} href="#case-content">跳到案例内容</a>
    <header className={styles.topbar}>
      <a className={styles.brand} href="/">求职 X-Ray<span>看清公司，也看清适合自己的方向</span></a>
      <nav className={styles.topnav} aria-label="主导航"><a href="/research">候选岗位</a><a href="/history">我的报告</a><span className={styles.stage}>展示案例</span></nav>
    </header>
    <main className={styles.layout} id="case-content">
      <aside className={styles.intro}>
        <span className={styles.eyebrow}>展示案例 · 万科</span>
        <h1>制度很完整，<br />入职就稳了吗？</h1>
        <p className={styles.subtitle}>万科企业股份有限公司<br />用年报与可持续发展报告，看清成长、福利与经营风险如何同时存在。</p>
        <div className={styles.badges}><span>七板块有资料</span><span>官方报告</span><span>示例需求</span></div>
        <p className={styles.boundary}>采用 2024 报告期资料，发布于 {reportDate}。这是有固定资料截面的历史案例；不描述当前在招岗位或企业今天的状态。</p>
        <nav className={styles.directory} aria-label="案例目录">
          <a href="#needs">A · 先说清求职需求</a><a href="#evidence">B · 福利与风险一起看</a><a href="#comparison">C · 七板块需求对照</a><a href="#decision">判断与下一步</a><a href="#sources">查看原文与页码</a>
        </nav>
        <a className={styles.primary} href="/profile?new=1">开始自己的判断 →</a>
      </aside>
      <div className={styles.content}>
        <section className={styles.card}>
          <span className={styles.eyebrow}>先看结论</span><h2>有培养、有福利，也有经营压力</h2>
          <div className={styles.summary}><strong>制度信息值得了解，经营与岗位预算需要优先核实。</strong><p>七个板块都有官方原文依据。培训、薪酬、休假和保障看制度披露；经营与稳定看财务和人员数据。</p></div>
          <div className={styles.metrics}>{metrics.map(metric => <div key={metric.label}><strong>{metric.value}</strong><span>{metric.label}</span><a href={`#source-${metric.sourceId}`}>{metric.reference} ↗</a></div>)}</div>
          <p className={styles.muted}>集团经营风险不自动证明某个团队欠薪、裁员或福利失效；政策披露也不保证每份岗位都已兑现。</p>
        </section>
        <section className={styles.card} id="needs">
          <span className={styles.eyebrow}>A · 需求</span><h2>我想成长，也希望收入与岗位稳定</h2>
          <p className={styles.muted}>示例求职者希望了解万科集团相关机会。以下是展示用需求，没有虚构招聘报价或具体岗位。</p>
          <div className={styles.needs}>
            <div><span>求职方向</span><strong>地产与城市服务相关机会</strong><p>希望有学习资源、明确的沟通方式。</p></div>
            <div><span>重点关注</span><strong>收入兑现 · 用工稳定</strong><p>希望薪酬规则清楚，业务与岗位能够持续。</p></div>
            <div><span>继续了解的前提</span><strong>制度能落实到这份工作</strong><p>核对签约主体、固定与浮动报酬、目标团队预算，以及休假和保障安排。</p></div>
          </div>
        </section>
        <section className={styles.card} id="evidence">
          <span className={styles.eyebrow}>B · 资料</span><h2>好的制度，与真实的风险同时存在</h2>
          <div className={styles.evidenceGrid}>
            <article className={styles.attraction}><span className={styles.label}>有具体制度与统计</span><h3>培训、薪酬、休假、保障</h3><p>可持续发展报告披露了员工培养、报酬与保障政策，以及员工沟通方式。它们给出了可进一步核对的具体项目。</p><a href="#source-2">来源 02 · 公司官方报告 ↗</a></article>
            <article className={styles.risk}><span className={styles.label}>有财务风险依据</span><h3>亏损与偿债压力</h3><p>年度报告呈现了 2024 年的亏损与资金压力；这会改变重视稳定的求职者的核实顺序。</p><a href="#source-1">来源 01 · 年度报告 ↗</a></article>
          </div>
          <details className={styles.method}><summary>这些资料能说明哪一层？</summary><p>财务数据属于报告期内的集团经营信息；员工制度及指标属于公司披露。它们都不是某个城市、项目或团队的独立员工调查。具体岗位的签约、薪资、排班及用工关系，需要对应主体的书面材料。</p></details>
        </section>
        <section className={styles.card} id="comparison">
          <span className={styles.eyebrow}>C · 对照</span><h2>七个板块，都有资料可看</h2>
          <p className={styles.muted}>每个板块分别写清示例需求、报告记载、对照判断和下一步。原文链接可直接跳到对应 PDF 页。</p>
          {sectors.map((sector, index) => <article className={styles.sector} key={sector.id}>
            <div className={styles.sectorHeading}><h3><span>{String(index + 1).padStart(2, '0')}</span>{sector.title}</h3><span className={sector.tone === 'risk' ? styles.alert : styles.known}>{sector.status}</span></div>
            <dl className={styles.rows}><div><dt>示例需求</dt><dd>{sector.need}</dd></div><div><dt>报告记载</dt><dd>{sector.material}</dd></div><div className={styles.judgment}><dt>对照判断</dt><dd>{sector.judgment}</dd></div></dl>
            <p className={styles.nextCheck}><strong>针对这份岗位，再问：</strong>{sector.question}</p>
            <div className={styles.sourceRefs}>{sector.references.map(ref => {
              const source = sources.find(item => item.id === ref.sourceId)!;
              return <a href={`${source.url}#page=${ref.pdfPage}`} target="_blank" rel="noopener noreferrer" key={`${ref.sourceId}-${ref.pdfPage}`}>来源 {String(ref.sourceId).padStart(2, '0')} · {ref.label} ↗</a>;
            })}</div>
          </article>)}
        </section>
        <section className={styles.card} id="decision">
          <span className={styles.eyebrow}>判断与下一步</span><h2>先核对岗位能否兑现，再比较成长与福利</h2>
          <p className={styles.priority}>对重视收入与稳定的人，经营和岗位预算是优先核实项。</p>
          <p>报告给出了培养、薪酬、休假、保障与沟通制度，也明确呈现了经营压力。可以有条件地继续了解，但这些制度的吸引力不能替代对目标团队的核实。</p>
          <h3>优先问清三个问题</h3>
          <ol className={styles.questions}><li>实际签约、发薪和缴纳社保的是哪个主体？属于开发、物业还是其他业务，是否落在上述报告范围内？</li><li>固定报酬、奖金条件和发薪安排能否书面确认？报告期经营压力是否影响这个团队的薪酬和岗位预算？</li><li>目标业务和岗位计划是否持续？培训、休假与保障政策在这个团队具体怎么执行？</li></ol>
          <p className={styles.muted}>这是基于既定历史资料的需求对照，不是对企业当前偿债能力或某个岗位裁撤概率的预测。</p>
        </section>
        <section className={styles.card} id="sources">
          <span className={styles.eyebrow}>来源与范围</span><h2>直接回到官方原文</h2>
          {sources.map(source => <details className={styles.source} key={source.id} id={`source-${source.id}`} open>
            <summary><span>0{source.id}</span>{source.title}</summary><p className={styles.muted}>发布时间：{source.date} · {source.kind}</p><p>{source.note}</p><a href={source.url} target="_blank" rel="noopener noreferrer">打开官方 PDF ↗</a>
          </details>)}
          <p className={styles.boundary}>统一采用 2024 年的报告期，避免把不同年份政策与数据拼成同一时点。PDF 链接页码按文件顺序计算，旁边标出报告印刷页码。集团与子公司、政策与实际执行、统计与个人工资分别解释。</p>
        </section>
        <footer className={styles.footer}><a className={styles.primary} href="/profile?new=1">用自己的需求开始判断 →</a><a href="/">返回首页</a></footer>
      </div>
    </main>
  </div>;
}
