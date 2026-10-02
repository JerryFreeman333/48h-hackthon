/* Legacy Next routes lack request identity. Keep them local-only for private data. */
export { demoSample } from "./research-service";
import { ResearchService, demoSample } from "./research-service";
import { RuntimeError } from "../../packages/runtime";
import { searchIntentSchema } from "./contract";
const service = new ResearchService();
const publicDemo = new ResearchService();
const publicRuns = new Map<string, string>();
const publicBundles = new Map<string, string>();
export const localProjectId = () => process.env.XRAY_B_LOCAL_PROJECT || "project-demo-1";
function localProject(requested?: unknown) {
  if (process.env.XRAY_B_LOCAL_MODE !== "1" || process.env.NODE_ENV === "production") throw new RuntimeError("NOT_CONFIGURED", "人工模式需本地显式开启 XRAY_B_LOCAL_MODE=1；生产须接入公共鉴权适配器。", 503);
  const projectId = localProjectId();
  if (requested !== undefined && requested !== projectId) throw new RuntimeError("FORBIDDEN", "本地原型仅允许配置的项目", 403);
  return projectId;
}
export function addManualJob(input: Record<string, unknown>) { return service.addManualJob({ ...input, projectId: localProject(input.projectId) }); }
export function addEvidence(input: Record<string, unknown>) { return service.addEvidence({ ...input, projectId: localProject(input.projectId) }); }
export function createResearchRun(raw: unknown) {
  const intent = searchIntentSchema.parse(raw);
  if (intent.mode === "demo") {
    if (publicRuns.size >= 100) throw new RuntimeError("CAPACITY_REACHED", "演示快照容量已满，请重启本地原型", 429);
    const result = publicDemo.createResearchRun(intent);
    publicRuns.set(result.run.runId, intent.projectId); publicBundles.set(result.bundle.bundleId, intent.projectId);
    return result;
  }
  localProject(intent.projectId); return service.createResearchRun(intent);
}
export function getRun(id: string) {
  const project = publicRuns.get(id);
  return project ? publicDemo.getRun(project, id) : service.getRun(localProject(), id);
}
export function getBundle(id: string) {
  const project = publicBundles.get(id);
  return project ? publicDemo.getBundle(project, id) : service.getBundle(localProject(), id);
}
export function listManualJobs() {
  if (process.env.XRAY_B_LOCAL_MODE !== "1" || process.env.NODE_ENV === "production") return [];
  return service.listManualJobs(localProject());
}
export function selectIdentity(companyId: string, selectedLegalName: string) { return service.selectIdentity({ projectId: localProject(), companyId, selectedLegalName }); }
export function currentDemoBundle() { return demoSample().bundle; }
