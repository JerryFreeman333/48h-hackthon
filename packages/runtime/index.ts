import type { Mode } from "../contracts";

export class RuntimeError extends Error {
  constructor(public code: string, message: string, public status: number, public retryable = false) { super(message); }
}

export function errorResponse(error: unknown, requestId = crypto.randomUUID()) {
  const known = error instanceof RuntimeError;
  return Response.json({ error: { code: known ? error.code : "INTERNAL_ERROR", message: known ? error.message : "Internal server error", retryable: known ? error.retryable : false, requestId } }, { status: known ? error.status : 500 });
}

export interface Principal { userId: string }
export interface Project { projectId: string; ownerId: string; mode: Mode }
export interface IdentityProvider { authenticate(request: Request): Promise<Principal | null>; getProject(projectId: string): Promise<Project | null> }

export async function requireProjectAccess(request: Request, projectId: string, identity?: IdentityProvider): Promise<Project> {
  if (!identity) throw new RuntimeError("NOT_CONFIGURED", "Identity provider is not configured", 503);
  const principal = await identity.authenticate(request);
  if (!principal) throw new RuntimeError("UNAUTHENTICATED", "Login required", 401);
  const project = await identity.getProject(projectId);
  if (!project || project.ownerId !== principal.userId) throw new RuntimeError("FORBIDDEN", "Project access denied", 403);
  return project;
}

export type RunStatus = "queued" | "running" | "completed" | "partial" | "failed" | "cancelled";
export interface RunRecord { runId: string; projectId: string; module: "a" | "b" | "c"; status: RunStatus; stage: string; createdAt: string; updatedAt: string }
export interface UsageRecord { runId: string; provider: string; requestId: string; costMinor: number | null; tokens: number | null; recordedAt: string }
export interface SnapshotRepository<T> {
  insert(projectId: string, snapshotId: string, snapshot: T): Promise<void>;
  read(projectId: string, snapshotId: string): Promise<T | null>;
}
export interface DurableScheduler {
  enqueue(run: RunRecord, idempotencyKey: string): Promise<RunRecord>;
  read(projectId: string, runId: string): Promise<RunRecord | null>;
  cancel(projectId: string, runId: string): Promise<void>;
}

export class CallBudget {
  private calls = 0;
  private spent = 0;
  constructor(private maxCalls: number, private maxCostMinor: number) {
    if (!Number.isInteger(maxCalls) || maxCalls < 0 || !Number.isSafeInteger(maxCostMinor) || maxCostMinor < 0) throw new Error("Invalid budget");
  }
  reserve(upperBoundMinor: number | null) {
    if (upperBoundMinor === null) throw new RuntimeError("UNKNOWN_COST", "Known cost ceiling required before paid calls", 503);
    if (!Number.isSafeInteger(upperBoundMinor) || upperBoundMinor < 0) throw new RuntimeError("INVALID_COST", "Invalid cost ceiling", 422);
    if (this.calls >= this.maxCalls || this.spent + upperBoundMinor > this.maxCostMinor) throw new RuntimeError("BUDGET_EXHAUSTED", "Call budget exhausted", 429);
    this.calls++; this.spent += upperBoundMinor;
  }
}

export function summarizeCosts(records: Pick<UsageRecord, "costMinor">[]) {
  return { knownCostMinor: records.reduce((total, x) => total + (x.costMinor ?? 0), 0), hasUnknown: records.some(x => x.costMinor === null) };
}
