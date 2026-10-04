import type { Metadata } from 'next';
import styles from './showcase.module.css';

export const metadata: Metadata = { title: '白鹭时代 · 历史风险复盘｜求职 X-Ray' };

const sectors = [
  { title: '晋升与成长', status: '资料不足', need: '希望学习游戏开发，有带教和持续成长的机会。', material: '公开报道介绍了游戏引擎和开发工具业务，但本案例没有岗位带教、培训或晋升规则的原始材料。', judgment: '技术品牌可以吸引你继续了解，不能替代具体团队的成长安排。', sources: [2] },
  { title: '薪资高低', status: '优先核实', need: '工资按时发放，固定报酬和发放规则明确。', material: '2022 年媒体援引创始人内部信，提到偿还欠薪、债务的安排。案例没有具体岗位薪资或员工工资流水。', judgment: '历史欠薪线索直接关系到收入兑现；即便报价有吸引力，也应先核对履约情况，不能据此编造薪资水平或欠薪金额。', sources: [1, 2] },
  { title: '工时与休息', status: '资料不足', need: '希望休息安排明确，加班有边界。', material: '本次引用资料没有具体团队的上下班、加班频率或休假记录。', judgment: '经营压力不能直接推出加班严重；也不能因为没有记录，就认定双休或工时正常。', sources: [] },
  { title: '五险一金', status: '资料不足', need: '明确缴纳主体、起缴时间及执行情况。', material: '本案例未取得个人缴纳记录或具体岗位的书面保障约定。', judgment: '不能从欠薪报道推断社保停缴，需要另行核对对应主体和时期。', sources: [] },
  { title: '团队文化与工作方式', status: '资料不足', need: '希望沟通透明，团队对问题及时反馈。', material: '媒体转述的内部信是经营事件线索，不是对具体团队日常行为的独立调查。', judgment: '融资背景、创始人表态都不能证明管理支持或团队氛围。', sources: [1] },
  { title: '职位与用工稳定', status: '优先核实', need: '希望工作可持续，签约主体和岗位安排清楚。', material: '2022 年报道援引内部信，提到公司等待破产清算。未取得法院受理或终结清算的裁定，也没有具体劳动合同。', judgment: '对看重稳定的求职者，这是需要优先调查的历史线索；不能把“等待清算”的表述写成已获法院确认的清算结果。', sources: [1, 2] },
  { title: '企业经营状况', status: '存在风险线索', need: '希望企业能够持续经营、兑现用工承诺。', material: '当时的报道同时提及融资背景、经营困难和债务问题；这些信息对应的是历史时期。', judgment: '曾获投资与后来出现经营困难可以同时成立。融资记录不能担保持续经营，这份复盘也不判断企业今天的状态。', sources: [1, 2] },
];

const sources = [
  { id: 1, date: '2022-06-06', title: '游戏日报｜壹周游闻：游戏服务商创始人转行偿债', url: 'https://m.18183.com/news/ztlm/yxrb/202206/3981643.html', note: '18183 刊载的游戏日报报道，转述创始人内部信。属于媒体二手资料，并非独立的法院或劳动争议文书。' },
  { id: 2, date: '2022-06-07', title: '钛媒体｜估值25亿的白鹭科技破产，H5游戏的反思', url: 'https://www.tmtpost.com/6138000.html', note: '作者王新喜。仅采用其中融资背景及内部信相关记载，不将文章标题作为司法确认，也不采用作者对失败原因的评论作为事实。' },
];

export default function ShowcasePage() {
  return <div className={styles.page}>
    <a className={styles.skip} href="#case-content">跳到案例内容</a>
    <header className={styles.topbar}>
      <a className={styles.brand} href="/">求职 X-Ray<span>看清公司，也看清适合自己的方向</span></a>
      <nav className={styles.topnav} aria-label="主导航"><a href="/research">候选岗位</a><a href="/history">我的报告</a><span className={styles.stage}>展示案例</span></nav>
    </header>
    <main className={styles.layout} id="case-content">
      <aside className={styles.intro}>
        <span className={styles.eyebrow}>展示案例 · 01</span>
        <h1>知名机构投过，<br />就能放心入职？</h1>
        <p className={styles.subtitle}>白鹭时代／白鹭科技<br />一份关于收入兑现与企业稳定的历史风险复盘。</p>
        <div className={styles.badges}><span>历史复盘</span><span>示例需求</span><span>公开报道</span></div>
        <p className={styles.boundary}>事件资料截至 2022 年 6 月。案例整理于 2026 年 10 月 4 日；不判断企业当前状态，不对应今天的在招岗位。</p>
        <nav className={styles.directory} aria-label="案例目录">
          <a href="#needs">A · 先说清求职需求</a>
          <a href="#evidence">B · 看见不同方向的资料</a>
          <a href="#comparison">C · 七板块需求对照</a>
          <a href="#decision">判断与下一步</a>
          <a href="#sources">查看资料来源</a>
        </nav>
        <a className={styles.primary} href="/profile?new=1">开始自己的判断 →</a>
      </aside>
      <div className={styles.content}>
        <section className={`${styles.card} ${styles.takeaway}`}>
          <span className={styles.eyebrow}>这个案例要看清什么</span>
          <h2>先看清这份判断</h2>
          <div className={styles.summary}><strong>品牌有吸引力，收入兑现仍要单独核对。</strong><p>重点核对工资兑现、用工稳定和企业经营；其他板块保留未知。</p></div>
          <p>把“我想进游戏技术行业”和“我需要工资按时发、工作相对稳定”放在一起看。历史风险线索改变的是调查顺序，而不是替你给企业打一个分。</p>
        </section>
        <section className={styles.card} id="needs">
          <span className={styles.eyebrow}>A · 需求</span><h2>先说清楚，这份工作要满足什么</h2>
          <p className={styles.muted}>以下为教学用的示例需求，不是用户的个人侧写，也不描述一条真实招聘岗位。</p>
          <div className={styles.needs}>
            <div><span>求职方向</span><strong>游戏技术与开发</strong><p>希望接触技术产品，持续学习。</p></div>
            <div><span>重点关注</span><strong>收入兑现 · 用工稳定</strong><p>希望工资按时发放，岗位能够持续。</p></div>
            <div><span>继续了解的前提</span><strong>把履约情况问清楚</strong><p>明确签约主体、发薪安排与业务延续情况。</p></div>
          </div>
        </section>
        <section className={styles.card} id="evidence">
          <span className={styles.eyebrow}>B · 资料</span><h2>吸引你的信息，和需要警惕的信息</h2>
          <div className={styles.evidenceGrid}>
            <article className={styles.attraction}><span className={styles.label}>继续了解的理由</span><h3>技术产品与融资背景</h3><p>历史报道介绍了白鹭的游戏引擎业务及获得投资的经历。</p><a href="#source-2">来源 02 · 历史媒体报道 ↗</a></article>
            <article className={styles.risk}><span className={styles.label}>优先调查的线索</span><h3>欠薪与等待清算的表述</h3><p>2022 年媒体转述的内部信涉及欠薪偿还及等待破产清算。</p><a href="#source-1">来源 01 · 内部信的媒体转述 ↗</a></article>
          </div>
          <details className={styles.method}><summary>资料不一致时，如何判断？</summary><p>本地数据库（公司记录 289）既有司法风险检索命中，也有“公开检索未见”记录；这些摘要未记录原始链接，且标为未核验。本案例不将其作为确定事实，也不采用其中未经核对的执行金额。“未检索到”不能消除已有风险线索。</p></details>
        </section>
        <section className={styles.card} id="comparison">
          <span className={styles.eyebrow}>C · 对照</span><h2>七个板块，分别判断</h2>
          <p className={styles.muted}>有风险线索的板块优先核对，缺资料的板块保留未知。公司层面信息不冒充具体岗位承诺。</p>
          {sectors.map((sector, index) => <article className={styles.sector} key={sector.title}>
            <div className={styles.sectorHeading}><h3><span>{String(index + 1).padStart(2, '0')}</span>{sector.title}</h3><span className={sector.status === '资料不足' ? styles.unknown : styles.alert}>{sector.status}</span></div>
            <dl className={styles.rows}><div><dt>示例需求</dt><dd>{sector.need}</dd></div><div><dt>现有资料</dt><dd>{sector.material}</dd></div><div className={styles.judgment}><dt>对照判断</dt><dd>{sector.judgment}</dd></div></dl>
            {sector.sources.length > 0 && <p className={styles.sourceRefs}>资料依据：{sector.sources.map(id => <a href={`#source-${id}`} key={id}>来源 {String(id).padStart(2, '0')} ↗</a>)}</p>}
          </article>)}
        </section>
        <section className={`${styles.card} ${styles.decision}`} id="decision">
          <span className={styles.eyebrow}>判断与下一步</span><h2>综合结论与下一步</h2>
          <p className={styles.priority}>先核对收入与稳定，再权衡品牌与成长。</p>
          <p>在这组历史资料下，如果你把工资兑现和工作稳定放在前面，应先澄清经营与履约问题，不能只凭融资背景作入职决定。</p>
          <p className={styles.muted}>这是一份事后教学复盘，使用了 2022 年已披露的信息，不声称产品能提前预测危机。</p>
          <h3>面对类似企业，优先问这三个问题</h3>
          <ol className={styles.questions}><li>实际签约、发薪和缴纳社保的是哪一个主体？与报道涉及的主体是什么关系？</li><li>是否存在尚未解决的欠薪或履约问题？能否提供对应时期的书面说明和可核对材料？</li><li>目标团队的业务是否继续、岗位预算是否落实？清算或重组线索是否影响这份岗位？</li></ol>
        </section>
        <section className={styles.card} id="sources">
          <span className={styles.eyebrow}>来源与边界</span><h2>每条判断，都能回到资料</h2>
          {sources.map(source => <details className={styles.source} key={source.id} id={`source-${source.id}`} open>
            <summary><span>0{source.id}</span>{source.title}</summary><p className={styles.muted}>发布时间：{source.date} · 公司层面 · 媒体二手资料</p><p>{source.note}</p><a href={source.url} target="_blank" rel="noopener noreferrer">打开原始报道 ↗</a>
          </details>)}
          <p className={styles.boundary}>本案例未取得内部信原件、法院裁定、劳动合同或工资流水。历史媒体报道不证明企业今天仍存在同样问题；“白鹭时代／白鹭科技”为报道中的称呼，具体法律主体应以原始文书核对。</p>
        </section>
        <footer className={styles.footer}><a className={styles.primary} href="/profile?new=1">用自己的需求开始判断 →</a><a href="/">返回首页</a></footer>
      </div>
    </main>
  </div>;
}
