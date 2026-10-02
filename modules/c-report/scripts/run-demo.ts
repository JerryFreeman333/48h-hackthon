/**
 * C 模块独立演示（P1）：网络关闭、无模型、无外部服务。
 *
 * 读取公共合成 fixtures → 运行匹配管线 → 输出 MatchReport JSON →
 * 逐项对照 C_EXPECTED_BEHAVIOR.demo.v1.json 的人工预期并打印 PASS/FAIL。
 *
 * 用法：
 *   npm run demo                       # 报告打印到 stdout
 *   npm run demo -- --out <path>       # 同时写入 JSON 文件
 *   npm run demo -- --generated-at 2026-10-02T09:00:00Z   # 固定时间戳（可复现）
 *
 * 退出码：预期全部满足=0；任何一项失败=1。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runMatchPipeline } from '../application/pipeline.js';

const moduleRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixturesDir = join(moduleRoot, 'fixtures');

function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf8'));
}

const profile = readFixture('user-profile.demo.v1.json');
const intent = readFixture('search-intent.demo.v1.json');
const bundle = readFixture('candidate-bundle.demo.v1.json');
const expected = readFixture('C_EXPECTED_BEHAVIOR.demo.v1.json') as Record<string, unknown>;

function parseArgs(argv: string[]): { out?: string; generatedAt?: string } {
  const args: { out?: string; generatedAt?: string } = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out' && i + 1 < argv.length) {
      args.out = argv[i + 1];
      i += 1;
    } else if (arg === '--generated-at' && i + 1 < argv.length) {
      args.generatedAt = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

const cliArgs = parseArgs(process.argv);
const generatedAt = cliArgs.generatedAt ?? new Date().toISOString();

const result = runMatchPipeline({
  profile,
  intentContext: intent,
  bundle,
  options: {
    reportId: 'report-demo-p1-1',
    generatedAt,
    version: 1,
  },
});

if (!result.ok) {
  console.error('演示运行失败：', JSON.stringify(result.error, null, 2));
  process.exit(1);
}

const { report, snapshot } = result;

const output = JSON.stringify(
  { artifactType: 'c_demo_match_report_with_private_snapshot', report, snapshot },
  null,
  2,
) + '\n';

if (cliArgs.out) {
  writeFileSync(cliArgs.out, output, 'utf8');
  console.log(`已写入：${cliArgs.out}`);
}

console.log('=== MatchReport（公共部分） ===');
console.log(JSON.stringify(report, null, 2));

// --- 人工预期逐项对照（对照 C_EXPECTED_BEHAVIOR.demo.v1.json） ---
type Check = { name: string; pass: boolean; detail: string };
const checks: Check[] = [];
function check(name: string, pass: boolean, detail: string): void {
  checks.push({ name, pass, detail });
}

const firstResult = report.results[0];
const expectedJobId = expected.jobId as string;

check(
  'schemaVersion/mode/completeness',
  report.schemaVersion === '1.0.0' && report.mode === 'demo' && report.completeness === 'partial',
  `schemaVersion=${report.schemaVersion} mode=${report.mode} completeness=${report.completeness}`,
);
check(
  'expectedRecommendation=deprioritize',
  firstResult !== undefined && firstResult.jobId === expectedJobId && firstResult.recommendation === 'deprioritize',
  firstResult ? `jobId=${firstResult.jobId} recommendation=${firstResult.recommendation}` : 'results 为空',
);
const salesConstraint = firstResult?.constraints.find((c) => c.key === 'accept_sales_kpi');
check(
  'accept_sales_kpi fail + fact-demo-1',
  salesConstraint !== undefined &&
    salesConstraint.result === 'fail' &&
    JSON.stringify([...salesConstraint.factIds].sort()) === JSON.stringify(['fact-demo-1']),
  salesConstraint ? `result=${salesConstraint.result} factIds=${salesConstraint.factIds.join(',')}` : '约束缺失',
);
check(
  '不发明新的硬约束（只有 accept_sales_kpi）',
  firstResult !== undefined && firstResult.constraints.every((c) => c.key === 'accept_sales_kpi'),
  firstResult ? `keys=${firstResult.constraints.map((c) => c.key).join(',')}` : 'results 为空',
);
const dimensionKeys = firstResult?.dimensions.map((d) => d.key) ?? [];
check(
  '五维恰好各一次',
  JSON.stringify([...dimensionKeys].sort()) ===
    JSON.stringify([...(expected.requiredDimensionKeys as string[])].sort()),
  dimensionKeys.join(','),
);
const allTexts = [
  ...(firstResult?.reasons.map((r) => r.text) ?? []),
  ...(firstResult?.dimensions.map((d) => d.summary) ?? []),
  ...(firstResult?.questions.map((q) => q.text) ?? []),
];
check(
  '固定月薪保持 unknown（total 不冒充 fixed）',
  firstResult?.reasons.some((r) => r.kind === 'unknown' && r.text.includes('固定月薪')) === true &&
    !firstResult?.constraints.some((c) => c.key === 'min_fixed_monthly_salary' && c.result !== 'unknown'),
  allTexts.some((t) => t.includes('固定月薪')) ? '原因/维度中明确固定月薪未知' : '未见固定月薪未知表述',
);
check(
  '真实在招保持 unknown',
  firstResult?.reasons.some((r) => r.kind === 'unknown' && r.text.includes('在招状态未知')) === true,
  firstResult?.questions.some((q) => q.resolves.includes('job.vacancyStatus')) === true
    ? '含在招核验问题'
    : '缺在招核验问题',
);
const businessDim = firstResult?.dimensions.find((d) => d.key === 'business');
check(
  'business_financials 保持 unknown',
  businessDim?.status === 'unknown',
  businessDim ? `status=${businessDim.status}` : '维度缺失',
);
const identityDim = firstResult?.dimensions.find((d) => d.key === 'identity_credit');
check(
  'mustNotClaim: 不称已真实核验主体（identity_credit 非 supported/绿色）',
  identityDim !== undefined && identityDim.status === 'unknown' && identityDim.summary.includes('不能当作现实主体核验'),
  identityDim ? `status=${identityDim.status}` : '维度缺失',
);
const percentagePattern = /\d+(\.\d+)?\s*%|％/;
check(
  'mustNotClaim: 无销售/职责占比数字',
  allTexts.every((t) => !percentagePattern.test(t)),
  percentagePattern.test(allTexts.join('')) ? '发现百分比样式文本' : '未发现百分比',
);
const careerDim = firstResult?.dimensions.find((d) => d.key === 'career_value');
check(
  'mustNotClaim: 不称已证明产品设计职责/交付成长',
  careerDim !== undefined &&
    careerDim.status === 'unknown' &&
    careerDim.factIds.length === 0 &&
    careerDim.summary.includes('不声称'),
  careerDim ? `status=${careerDim.status} factIds=${careerDim.factIds.length}` : '维度缺失',
);
check(
  'mustNotClaim: 无综合匹配概率',
  allTexts.every((t) => !t.includes('匹配概率') && !t.includes('匹配度')),
  allTexts.some((t) => t.includes('匹配概率') || t.includes('匹配度')) ? '发现概率/匹配度表述' : '未发现',
);
check(
  'factsMustRemainUnchanged（快照与输入一致）',
  JSON.stringify(report.factsSnapshot) === JSON.stringify(bundle && (bundle as { facts: unknown }).facts) &&
    JSON.stringify(report.evidenceSnapshot) === JSON.stringify((bundle as { evidence: unknown }).evidence) &&
    JSON.stringify(report.coverageSnapshot) === JSON.stringify((bundle as { coverage: unknown }).coverage),
  `facts=${String(report.factsSnapshot.length)} evidence=${String(report.evidenceSnapshot.length)} coverage=${String(report.coverageSnapshot.length)}`,
);
check(
  'promptVersion 标记为无模型模板',
  report.promptVersion.includes('no-model') && report.promptVersion.length > 0,
  `promptVersion=${report.promptVersion}`,
);

let failed = 0;
console.log('\n=== 人工预期对照（C_EXPECTED_BEHAVIOR.demo.v1.json） ===');
for (const c of checks) {
  console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name}  —— ${c.detail}`);
  if (!c.pass) {
    failed += 1;
  }
}
console.log(`\n共 ${String(checks.length)} 项，通过 ${String(checks.length - failed)}，失败 ${String(failed)}。`);
console.log(`私有快照：${snapshot.artifactType}；DecisionTrace ${String(snapshot.decisionTraces.length)} 条。`);
process.exit(failed === 0 ? 0 : 1);
