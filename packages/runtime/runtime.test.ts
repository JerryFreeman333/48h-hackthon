import assert from "node:assert/strict";
import test from "node:test";
import { CallBudget, requireProjectAccess, summarizeCosts } from "./index";

test("missing identity and unauthenticated access fail closed", async () => {
  await assert.rejects(requireProjectAccess(new Request("http://localhost"), "p"), { status: 503 });
  await assert.rejects(requireProjectAccess(new Request("http://localhost"), "p", { authenticate: async () => null, getProject: async () => null }), { status: 401 });
});
test("project ownership is checked server-side", async () => {
  const identity = { authenticate: async () => ({ userId: "u1" }), getProject: async () => ({ projectId: "p", ownerId: "u2", mode: "manual" as const }) };
  await assert.rejects(requireProjectAccess(new Request("http://localhost"), "p", identity), { status: 403 });
});
test("cost and call limits include retries and reject unknown costs", () => {
  const budget = new CallBudget(2, 100);
  assert.throws(() => budget.reserve(null)); budget.reserve(60);
  assert.throws(() => budget.reserve(41)); budget.reserve(40);
  assert.throws(() => budget.reserve(0));
});
test("unknown usage costs are not represented as zero total cost", () => {
  assert.deepEqual(summarizeCosts([{ costMinor: 20 }, { costMinor: null }]), { knownCostMinor: 20, hasUnknown: true });
});
