import { requireProjectAccess, RuntimeError, type IdentityProvider } from "../../packages/runtime";
import { ResearchService } from "./research-service";
import { projectIdSchema } from "./inputs";
import { searchIntentSchema } from "./contract";
import { jsonError } from "./http";

// The integration owner supplies the shared identity provider; no second auth system.
export function createResearchApi(service: ResearchService, identity?: IdentityProvider) {
  return async function handle(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const body = request.method === "GET" ? null : await request.json();
      const projectId = projectIdSchema.parse(body?.projectId ?? url.searchParams.get("projectId"));
      const project = await requireProjectAccess(request, projectId, identity);
      const path = url.pathname.replace(/\/$/u, "");
      let result: unknown; let status = 200;
      if (path === "/api/b/search" && request.method === "POST") {
        const intent = searchIntentSchema.parse(body);
        if (intent.mode !== project.mode) throw new RuntimeError("MODE_MISMATCH", "项目模式与意向不一致", 409);
        const { run } = service.createResearchRun(intent);
        result = { runId: run.runId, bundleId: run.bundleId, status: run.status }; status = 202;
      } else if (path === "/api/b/jobs" && request.method === "GET") {
        result = { jobs: service.listManualJobs(projectId), mode: "manual" };
      } else if (path === "/api/b/jobs" && request.method === "POST") {
        if (project.mode !== "manual") throw new RuntimeError("MODE_MISMATCH", "仅人工项目允许录入", 409);
        result = service.addManualJob(body); status = 201;
      } else if (path === "/api/b/evidence" && request.method === "POST") {
        if (project.mode !== "manual") throw new RuntimeError("MODE_MISMATCH", "仅人工项目允许录入", 409);
        result = service.addEvidence(body); status = 201;
      } else if (path === "/api/b/identity-selection" && request.method === "PUT") {
        if (project.mode !== "manual") throw new RuntimeError("MODE_MISMATCH", "仅人工项目允许主体选择", 409);
        result = service.selectIdentity(body);
      } else if (path === "/api/b/company-candidates" && request.method === "GET") {
        result = service.companyCandidates(projectId, url.searchParams.get("name") ?? "");
      } else {
        const match = /^\/api\/b\/(runs|bundles)\/([^/]+)(\/export)?$/u.exec(path);
        if (!match || request.method !== "GET" || match[1] === "runs" && match[3]) throw new RuntimeError("NOT_FOUND", "接口不存在", 404);
        result = match[1] === "runs" ? service.getRun(projectId, match[2]) : service.getBundle(projectId, match[2]);
        if (!result) throw new RuntimeError("NOT_FOUND", "当前项目不存在该快照或任务", 404);
        if (match[3]) return new Response(JSON.stringify(result, null, 2), { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": "attachment; filename=candidate-bundle.json", "cache-control": "no-store" } });
      }
      return Response.json(result, { status, headers: { "cache-control": "no-store" } });
    } catch (error) { return jsonError(error); }
  };
}
