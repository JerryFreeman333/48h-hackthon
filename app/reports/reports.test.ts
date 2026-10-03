import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import ReportsPage from "./page";
import { GET as exportDemoReport } from "./export/route";
import { handleCreateMatch, handleExportReport } from "../../modules/c-report/application/api/handlers";
import { createSharedCApiContext, resetSharedCApiContextForTests } from "../../modules/c-report/adapters/memory/context";
import { loadDemoInputs } from "../../modules/c-report/tests/helpers";

async function createReport(otherUser = false): Promise<string> {
  const context = createSharedCApiContext();
  const { profile, intent, bundle } = loadDemoInputs();
  if (otherUser) {
    profile.projectId = intent.projectId = bundle.projectId = "project-other";
  }
  const response = await handleCreateMatch(context, new Request("http://c-test.invalid/api/c/matches", {
    method: "POST",
    headers: { authorization: otherUser ? "Bearer token-user-other" : "Bearer token-user-demo-1", "content-type": "application/json" },
    body: JSON.stringify({ profile, intentContext: intent, bundle, idempotencyKey: "host-test" }),
  }));
  assert.equal(response.status, 202);
  return (await response.json() as { reportId: string }).reportId;
}

describe("C 报告演示宿主实际挂载", () => {
  beforeEach(resetSharedCApiContextForTests);

  it("同进程页面不发 HTTP 请求，正确显示快照岗位且不显示下载入口", async () => {
    const reportId = await createReport();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error("页面不应依赖 self-fetch 或端口"); };
    try {
      const page = await ReportsPage({ searchParams: Promise.resolve({ reportId }) });
      const html = renderToStaticMarkup(page);
      assert.ok(html.includes(loadDemoInputs().bundle.jobs[0]!.title));
      assert.ok(html.includes("当前是演示报告宿主"));
      assert.ok(!html.includes(`/reports/export`));
      assert.ok(!html.includes(`导出私有`));
      assert.ok(!html.includes("演示报告读取失败"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("演示导出接口关闭，内部服务仍校验所有权",async()=>{const reportId=await createReport();for(const format of ['md','json','pdf']){const response=await exportDemoReport(new Request('http://localhost/reports/export?reportId='+reportId+'&format='+format));assert.equal(response.status,403);assert.equal(response.headers.get('content-disposition'),null);}const url=new URL('http://localhost/api/c/reports/'+reportId+'/export?format=json');assert.equal((await handleExportReport(createSharedCApiContext(),new Request(url),reportId,url)).status,401);});

  it("演示宿主不读取或导出其他用户的报告", async () => {
    const reportId = await createReport(true);
    const response = await exportDemoReport(new Request(`http://c-test.invalid/reports/export?reportId=${reportId}`));
    assert.equal(response.status, 403);
    const page = await ReportsPage({ searchParams: Promise.resolve({ reportId }) });
    assert.ok(renderToStaticMarkup(page).includes("演示报告读取失败"));
  });

  it("明确拒绝非 demo 的已存报告", async () => {
    const sourceId = await createReport();
    const context = createSharedCApiContext();
    const projectId = "project-demo-1";
    const sourceVersion = await context.stores.reportVersions.read(projectId, `${sourceId}:v1`);
    const sourceSnapshot = await context.stores.reportSnapshots.read(projectId, `${sourceId}:v1`);
    const sourceIndex = await context.stores.reportIndex.get(projectId, sourceId);
    assert.ok(sourceVersion && sourceSnapshot && sourceIndex);
    const reportId = "report-live-host-test";
    const report = { ...structuredClone(sourceVersion.report), reportId, mode: "live" as const };
    await context.stores.reportVersions.insert(projectId, `${reportId}:v1`, { ...structuredClone(sourceVersion), report });
    await context.stores.reportSnapshots.insert(projectId, `${reportId}:v1`, {
      ...structuredClone(sourceSnapshot), report,
      snapshot: { ...structuredClone(sourceSnapshot.snapshot), report },
    });
    await context.stores.reportIndex.putInitial(projectId, reportId, structuredClone(sourceIndex));
    const response = await exportDemoReport(new Request(`http://c-test.invalid/reports/export?reportId=${reportId}&format=json`));
    assert.equal(response.status, 403);
    const page = await ReportsPage({ searchParams: Promise.resolve({ reportId }) });
    assert.ok(renderToStaticMarkup(page).includes("只支持 mode=demo"));
  });
});
