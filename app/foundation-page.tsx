import { PageHeader, StateBadge } from "@/packages/ui";

export default function FoundationPage() {
  return <main><PageHeader title="求职 X-Ray"><p>项目基础架构 · 契约 1.0.0</p></PageHeader>
    <table><thead><tr><th>模块</th><th>输入 → 输出</th><th>当前状态</th></tr></thead><tbody>
      <tr><td>A 用户画像与意向</td><td>UserProfile / SearchIntent</td><td><StateBadge>待模块接入</StateBadge></td></tr>
      <tr><td>B 公司与岗位调查</td><td>SearchIntent → CandidateBundle</td><td><StateBadge>独立分支开发</StateBadge></td></tr>
      <tr><td>C 匹配与报告</td><td>UserProfile + CandidateBundle → MatchReport</td><td><StateBadge>独立就绪 ✓（P1-P5 + promptfoo + 根挂载 + 启动续跑，221 tests / 88 demos / 4 eval 全绿）</StateBadge></td></tr>
    </tbody></table>
  </main>;
}
