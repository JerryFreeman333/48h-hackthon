import {exportsDisabled} from './export-policy';
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NeedsService, handleNeeds } from "../../modules/a-profile/src/needs/service.mjs";
import { persistState } from "../../modules/a-profile/src/storage.mjs";
import {validationMessage} from './validation-message';

// A keeps its own service and snapshots; this adapter only mounts its current API.
export function createAHost(dataDir: string) {
  mkdirSync(dataDir, { recursive: true });
  const path = join(dataDir, "state.json");
  const state = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  state.sessions ??= [];
  // The legacy JS constructor's inferred default callback has zero parameters.
  const service = new (NeedsService as any)(state, (next: unknown) => persistState(path, next));
  const owner = (request: Request) => {
    const cookie = request.headers.get("cookie") ?? "";
    const id = cookie.split(";").map(x => x.trim()).find(x => x.startsWith("a_session="))?.slice(10);
    if (!id || !state.sessions.includes(id)) throw Object.assign(new Error("请先打开求职需求页面建立本地会话"), { status: 401 });
    return id;
  };
  return { service, owner, async handle(request: Request) {
    try {
      assertLocalRequest(request);
      const url = new URL(request.url);
      let id: string;
      let cookie: string | undefined;
      try { id = owner(request); } catch (error) {
        if (request.method !== "GET" || url.pathname !== "/api/a/needs/bootstrap") throw error;
        id = randomUUID(); state.sessions.push(id); persistState(path, state);
        cookie = `a_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000`;
      }
      if(request.method==='GET'&&url.pathname==='/api/a/needs/bootstrap')cookie=`a_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000`;
      if (/\/(export|report)$/.test(url.pathname)) return exportsDisabled();
      const viewMatch=url.pathname.match(/^\/api\/a\/needs\/sessions\/([^/]+)\/view$/);
      if(viewMatch&&request.method==='GET')return Response.json(needsView(service.export(id,viewMatch[1],url.searchParams.get('revision')??undefined)),{headers:{'cache-control':'no-store'}});
      const body = request.method === "GET" ? {} : await readJson(request, url.pathname.endsWith("/import") ? 6000000 : 256000);
      const result = handleNeeds(service, id, request, url, body);
      if(request.method==='POST'&&url.pathname.endsWith('/confirm'))return Response.json({session:result.session,view:needsView(result.export),description:result.description},{headers:{'cache-control':'no-store'}});
      return Response.json(result, { headers: { "cache-control": "no-store", ...(cookie ? { "set-cookie": cookie } : {}) } });
    } catch (error) { return integrationError(error); }
  } };
}

export function assertLocalRequest(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get("host") ?? url.host;
  const name = host.replace(/:\d+$/, "");
  if (!["127.0.0.1", "localhost", "[::1]"].includes(name)) throw Object.assign(new Error("集成原型仅供本机访问"), { status: 403 });
  const origin = request.headers.get("origin");
  if (origin && origin !== `${url.protocol}//${host}`) throw Object.assign(new Error("拒绝跨站请求"), { status: 403 });
}

export async function readJson(request: Request, limit = 256000): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader(); let size = 0; const chunks: Uint8Array[] = [];
  if (reader) for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw Object.assign(new Error("输入过大"), { status: 422 }); }
    chunks.push(value);
  }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw Object.assign(new Error("JSON 格式错误"), { status: 422 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw Object.assign(new Error("请求体必须为对象"), { status: 422 });
  return body;
}

export function integrationError(error: unknown) {
  const e = error as { status?: number; code?: string; message?: string };
  const status = e.status ?? 422;
  return Response.json({ error: { code: e.code ?? ({ 401: "UNAUTHENTICATED", 403: "FORBIDDEN", 404: "NOT_FOUND", 409: "REVISION_CONFLICT" } as Record<number, string>)[status] ?? "VALIDATION_ERROR", message: validationMessage(error), retryable: status === 409, requestId: randomUUID() } }, { status });
}

const globalHost = globalThis as unknown as { __xrayAHost?: ReturnType<typeof createAHost> };
export function getAHost() {
  return globalHost.__xrayAHost ??= createAHost(join(process.cwd(), ".data", "integration-a"));
}

function needsView(out:any){return {UserProfile:{revision:out.UserProfile.revision,mode:out.UserProfile.mode,preferences:out.UserProfile.preferences},SearchIntent:{industryTags:out.SearchIntent.industryTags,roleTypes:out.SearchIntent.roleTypes},JobNeedsSnapshot:{topics:out.JobNeedsSnapshot.topics}};}
