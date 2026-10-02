import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadDemoInputs, clone } from './helpers.js';
import { handleCreateMatch, handleGetRun, handleGetReport, handleExportReport, handleUpdateReport, type CApiContext } from '../application/api/handlers.js';
import { InMemoryCStores, FakeIdentityProvider, createDemoIdentity } from '../adapters/memory/in-memory.js';
import type { CStores, IdentityProvider, Principal, Project } from '../application/ports.js';

export const DEMO_TOKEN = 'Bearer token-user-demo-1';
export const OTHER_TOKEN = 'Bearer token-user-other';

export interface CreateOverrides {
  token?: string;
  profileMutation?: (profile: any) => void;
  bundleMutation?: (bundle: any) => void;
  idempotencyKey?: string;
  bodyOverride?: unknown;
  omitToken?: boolean;
}

export interface TestHarness {
  ctx: CApiContext;
  stores: CStores;
  identity: IdentityProvider | null;
  createMatch(overrides?: CreateOverrides): Promise<Response>;
}

export function createHarness(options?: { identity?: IdentityProvider | null; readableProjectIds?: (principal: Principal) => Promise<string[]> }): TestHarness {
  const stores = new InMemoryCStores();
  const identity = options?.identity !== undefined ? options.identity : createDemoIdentity();
  let idCounter = 0;
  const ctx: CApiContext = {
    stores,
    identity,
    async readableProjectIds(principal: Principal): Promise<string[]> {
      if (options?.readableProjectIds) {
        return options.readableProjectIds(principal);
      }
      if (identity instanceof FakeIdentityProvider) {
        return identity.projectsOf(principal.userId);
      }
      return [];
    },
    now: () => new Date().toISOString(),
    newRequestId: () => `req-${String(++idCounter)}`,
    newId: (prefix) => `${prefix}-test-${String(++idCounter)}`,
  };
  return {
    ctx,
    stores,
    identity,
    createMatch: (overrides) => createMatchRequest(ctx, overrides),
  };
}

export async function createMatchRequest(ctx: CApiContext, overrides: CreateOverrides = {}): Promise<Response> {
  const inputs = loadDemoInputs();
  const profile = clone(inputs.profile);
  const intent = clone(inputs.intent);
  const bundle = clone(inputs.bundle);
  if (overrides.profileMutation) {
    overrides.profileMutation(profile);
  }
  if (overrides.bundleMutation) {
    overrides.bundleMutation(bundle);
  }
  const body = overrides.bodyOverride ?? {
    profile,
    intentContext: intent,
    bundle,
    idempotencyKey: overrides.idempotencyKey ?? 'key-default-1',
  };
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (!overrides.omitToken) {
    headers.authorization = overrides.token ?? DEMO_TOKEN;
  }
  return handleCreateMatch(
    ctx,
    new Request('http://local/api/c/matches', { method: 'POST', headers, body: JSON.stringify(body) }),
  );
}

export async function getRun(harness: TestHarness, runId: string, token: string = DEMO_TOKEN): Promise<Response> {
  return handleGetRun(
    harness.ctx,
    new Request(`http://local/api/c/runs/${runId}`, { headers: { authorization: token } }),
    runId,
  );
}

export async function getReport(harness: TestHarness, reportId: string, token: string = DEMO_TOKEN): Promise<Response> {
  return handleGetReport(
    harness.ctx,
    new Request(`http://local/api/c/reports/${reportId}`, { headers: { authorization: token } }),
    reportId,
  );
}

export async function exportReport(harness: TestHarness, reportId: string, token: string = DEMO_TOKEN, format = 'md'): Promise<Response> {
  const url = new URL(`http://local/api/c/reports/${reportId}/export?format=${format}`);
  return handleExportReport(
    harness.ctx,
    new Request(url, { headers: { authorization: token } }),
    reportId,
    url,
  );
}

export async function updateReport(harness: TestHarness, reportId: string, overrides: Omit<CreateOverrides, 'bodyOverride'> = {}): Promise<Response> {
  const inputs = loadDemoInputs();
  const profile = clone(inputs.profile);
  const intent = clone(inputs.intent);
  const bundle = clone(inputs.bundle);
  if (overrides.profileMutation) {
    overrides.profileMutation(profile);
  }
  if (overrides.bundleMutation) {
    overrides.bundleMutation(bundle);
  }
  const body = {
    profile,
    intentContext: intent,
    bundle,
    idempotencyKey: overrides.idempotencyKey ?? 'update-key-1',
  };
  return handleUpdateReport(
    harness.ctx,
    new Request(`http://local/api/c/reports/${reportId}/update`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: overrides.token ?? DEMO_TOKEN },
      body: JSON.stringify(body),
    }),
    reportId,
  );
}

export async function readJson(response: Response): Promise<any> {
  return JSON.parse(await response.text());
}

export function assertErrorShape(body: any): void {
  assert.ok(body && typeof body === 'object' && body.error, '错误响应必须是 {error:{...}}');
  assert.strictEqual(typeof body.error.code, 'string');
  assert.strictEqual(typeof body.error.message, 'string');
  assert.strictEqual(typeof body.error.retryable, 'boolean');
  assert.strictEqual(typeof body.error.requestId, 'string');
}
