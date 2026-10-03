import {CSS} from '../../modules/c-report/ui/render-html';

/** The seven-sector report shares A's visual language; older report templates stay unchanged. */
export const SECTOR_REPORT_CSS = CSS + `
:root{--ink:#24352f;--muted:#728073;--line:#e1e7da;--bg:#f5f6f0;--card:#fff;--green:#285c42}
body{padding:0;background:var(--bg);font:16px/1.7 Inter,"Microsoft YaHei",sans-serif}
a{color:#31543e;text-underline-offset:3px}
a:focus-visible,summary:focus-visible{outline:3px solid #52805d;outline-offset:4px;border-radius:4px}
.page{max-width:none;margin:0}
.report-topbar{padding:24px 6%;border-bottom:1px solid #dde2d6;display:flex;justify-content:space-between;align-items:center;gap:20px}
.report-brand{color:#294d3b;text-decoration:none;font-size:24px;font-weight:800;white-space:nowrap}
.report-brand span{font-size:12px;font-weight:400;margin-left:14px}
.report-topnav{display:flex;gap:20px;align-items:center;font-size:14px}
.report-topnav a{text-decoration:none}
.report-badge,.eyebrow{font-size:11px;letter-spacing:2px;color:#657960}
.report-badge{border:1px solid #c9d5c3;border-radius:30px;padding:5px 14px;white-space:nowrap}
.report-layout{max-width:1280px;margin:auto;display:grid;grid-template-columns:320px minmax(0,1fr);gap:70px;padding:55px 40px;align-items:start}
.report-intro{min-width:0;position:sticky;top:24px}
.report-intro h1{font-size:46px;line-height:1.3;letter-spacing:-2px;margin:16px 0 24px}
.report-intro p{color:#627163;margin:12px 0}
.report-intro .report-meta{font-size:12px;overflow-wrap:anywhere}
.anchor-nav{display:grid;gap:10px;margin:30px 0 0;padding:0;border:0;background:none}
.anchor-nav a{display:block;border-left:2px solid #d9e1d4;padding:8px 12px;color:#657960;text-decoration:none;font-size:14px;border-radius:0}
.anchor-nav a:hover,.anchor-nav a:focus-visible{background:#e9efe3;color:#255c40;border-left-color:#255c40}
.report-content,.card,.sector{min-width:0}
.report-content{overflow-wrap:anywhere}
.card{background:#fff;border:1px solid #e1e7da;border-radius:18px;padding:26px;margin:0 0 20px;box-shadow:0 5px 25px #24352f04}
h2{font-size:26px;line-height:1.4;border:0;padding:0;margin:0 0 18px;scroll-margin-top:20px}
h3{font-size:18px;line-height:1.5;margin:0 0 10px}
p{margin:10px 0}.muted,.ref{color:#728073;font-size:14px}
.card-intro{margin-top:-7px;margin-bottom:20px}
.overview-candidate + .overview-candidate{border-top:1px solid #edf0e8;padding-top:22px;margin-top:22px}
.overview-meta{color:#627163;font-size:14px}
.overview-summary{margin:14px 0;padding:14px 16px;border-radius:10px;background:#f6f8f2;border:1px solid #e1e7da;color:#31543e}
.overview-summary strong{display:block;margin-bottom:5px;font-size:13px;font-weight:700}
.priority-alert{color:#9c4426;border-left:3px solid #ba704b;padding-left:12px;font-size:14px}
.profile-goals{margin-bottom:15px}
.profile-conditions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:12px 0}
.profile-condition{padding:12px;border:1px solid #e1e7da;border-radius:10px;background:#fafbf7}
.profile-condition dt{color:#728073;font-size:12px;margin-bottom:3px}
.profile-condition dd{margin:0;font-size:14px}
.condition-strength{display:block;color:#657960;font-size:12px;margin-top:4px}
.sector{border:1px solid #e1e7da;border-radius:12px;padding:20px;margin:14px 0;background:#fff}
.sector:last-child{margin-bottom:0}
.sector-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:16px}
.sector-heading h3{margin:0}
.sector-status{display:inline-block;border:1px solid #ddd8ca;border-radius:30px;padding:4px 10px;font-size:12px;line-height:1.5;flex-shrink:0;color:#6f654a;background:#f8f6ef}
.sector-status.missing{color:#728073;background:#f5f6f0;border-color:#e1e7da}
.sector-status.conflict,.sector-status.difference{color:#9c4426;background:#fbf2eb;border-color:#e8cfbd}
.sector-status.material{color:#526d54;background:#f1f5eb;border-color:#d7e2cd}
.sector-rows{margin:0;display:grid;gap:14px}
.sector-row{display:grid;grid-template-columns:96px minmax(0,1fr);gap:12px}
.sector-row dt{font-size:13px;color:#728073;padding-top:2px}
.sector-row dd{margin:0;font-size:14px;line-height:1.8}
.sector-row.judgment{border-top:1px solid #edf0e8;padding-top:14px}
.sector-row.judgment dd{color:#31543e}
.sector-question-link{display:inline-block;font-size:12px;margin-top:14px;color:#657960}
.next-questions{margin:14px 0 0;padding-left:24px}
.next-questions li{padding:5px 0}
details{margin:12px 0;border-top:1px solid #edf0e8;padding:4px 0}
summary{cursor:pointer;padding:10px 0;color:#31543e;font-size:14px;overflow-wrap:anywhere}
details > p,details > blockquote{font-size:14px}
blockquote{margin:12px 0;padding:12px 16px;border-left:3px solid #cad5c4;background:#f6f8f2;color:#627163}
.source-heading{margin:26px 0 12px}
.source-material{border-top:1px solid #edf0e8;margin-top:12px;padding-top:5px}
.source-metadata{font-size:12px;color:#728073}
.report-actions{display:flex;gap:12px;flex-wrap:wrap;margin:24px 0}
.report-actions a{border:1px solid #cbd7c5;border-radius:9px;background:#fff;padding:11px 18px;text-decoration:none;font-size:14px;color:#31543e}
.report-actions a.primary{background:#285c42;border-color:#285c42;color:white}
.report-actions a:hover{filter:brightness(.94)}
.page-foot{max-width:1280px;margin:auto;text-align:center;padding:0 40px 32px;border:0;color:#899383;font-size:12px}
.table-scroll{max-width:100%}pre{white-space:pre-wrap;overflow-wrap:anywhere}
@media(max-width:1050px){.report-layout{grid-template-columns:260px minmax(0,1fr);gap:35px}.sector-heading{flex-wrap:wrap}.report-intro h1{font-size:40px}}
@media(max-width:850px){.report-layout{grid-template-columns:minmax(0,1fr);padding:24px;gap:24px}.report-intro{position:static}.report-intro h1{font-size:32px;letter-spacing:-1px;margin:8px 0 12px}.report-intro h1 br{display:none}.report-intro > p{margin:8px 0}.anchor-nav{display:flex;flex-wrap:wrap;gap:6px;margin-top:18px}.anchor-nav a{border:1px solid #d9e1d4;border-radius:8px;padding:7px 10px;font-size:12px}.card{padding:20px}.report-brand span{display:none}.report-topbar{padding:20px 24px}.report-topnav{gap:12px;font-size:12px}.report-badge{display:none}h2{font-size:23px}.sector{padding:16px}.sector-row{grid-template-columns:1fr;gap:4px}.sector-status{max-width:100%;flex-shrink:1}.page-foot{padding:0 24px 24px}}
@media(max-width:420px){.report-topbar{padding:18px 20px;gap:10px}.report-brand{font-size:21px}.report-layout{padding:20px}.profile-conditions{grid-template-columns:1fr}.report-actions a{width:100%;text-align:center}}
`;
