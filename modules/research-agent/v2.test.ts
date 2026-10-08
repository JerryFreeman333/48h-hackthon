import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  candidateBundleSchema,
  validateBundleReferences,
} from "../../packages/contracts";
import { v2ResultSchema } from "./v2-result";
import {
  mergeV2Materials,
  validateV2Result,
  enrichWithV2,
} from "./v2-research";
import { renderV2Report } from "./v2-report";
import { agentConfiguration } from "./config";

const result = () =>
  v2ResultSchema.parse(
    JSON.parse(
      readFileSync(
        join(
          process.cwd(),
          "modules/research-agent/fixtures/v2-channels.fixture.json",
        ),
        "utf8",
      ),
    ),
  );
const bundle = () =>
  candidateBundleSchema.parse(
    JSON.parse(
      readFileSync(
        join(
          process.cwd(),
          "packages/contracts/fixtures/candidate-bundle.json",
        ),
        "utf8",
      ).replaceAll("company-demo-1", "db-company-900001"),
    ),
  );

test("v2 keeps fixtures visibly synthetic and refuses them in live/manual reports", () => {
  const data = result();
  assert.ok(validateV2Result(data, 900001).includes("unaccepted_document"));
  assert.deepEqual(validateV2Result(data, 900001, true), []);
  const target = bundle();
  target.mode = "manual";
  assert.throws(() => mergeV2Materials(target, {}, "db-company-900001", data));
});

test("v2 reaches the existing contract with citations and preserves fixed salary and job scope", () => {
  const target = bundle(),
    original = structuredClone(target.jobs),
    source: any = {};
  mergeV2Materials(target, source, "db-company-900001", result());
  assert.deepEqual(target.jobs, original);
  assert.deepEqual(validateBundleReferences(target), []);
  const acquired = target.evidence.filter((e) =>
    e.sourceType.startsWith("agent_v2_"),
  );
  assert.ok(acquired.length > 4);
  assert.ok(
    acquired.every(
      (e) =>
        e.jobId === null &&
        e.scope === "company" &&
        e.verification === "unverified",
    ),
  );
  assert.ok(acquired.some((e) => e.sourceType === "agent_v2_index_snippet"));
  assert.ok(
    acquired.some((e) => e.topicLinks?.some((l) => l.topicId === "company")),
  );
  assert.ok(source.agentV2.companies[0].gaps.length > 0);
  const before = [target.evidence.length, target.facts.length];
  mergeV2Materials(target, source, "db-company-900001", result());
  assert.deepEqual([target.evidence.length, target.facts.length], before);
  assert.equal(source.agentV2.companies.length, 1);
});

test("invalid source IDs, subject, quote/hash and translation citations are rejected atomically", () => {
  for (const mutate of [
    (r: ReturnType<typeof result>) => {
      r.facts[0].evidence_id = "missing";
    },
    (r: ReturnType<typeof result>) => {
      r.documents[0].company_id = 42;
    },
    (r: ReturnType<typeof result>) => {
      r.excerpts[0].excerpt += "invented";
    },
    (r: ReturnType<typeof result>) => {
      r.translations[0].fact_ids = ["invented-model-id"];
    },
    (r: ReturnType<typeof result>) => {
      r.excerpts[0].url = "https://another.example/wrong";
    },
  ]) {
    const data = result();
    mutate(data);
    const target = bundle(),
      before = structuredClone(target);
    assert.ok(validateV2Result(data, 900001, true).length);
    assert.throws(() =>
      mergeV2Materials(target, {}, "db-company-900001", data),
    );
    assert.deepEqual(target, before);
  }
});

test("v2 no-key collection is deterministic and progress failures do not discard acquired evidence", async () => {
  const target = bundle(),
    source: any = {};
  let calls = 0;
  await enrichWithV2(
    target,
    source,
    {
      JobNeedsSnapshot: {
        topics: [
          { topicId: "company", priority: "priority", verificationItemIds: [] },
        ],
      },
    },
    () => {
      throw Error("progress unavailable");
    },
    {
      tool: async (args) => {
        calls++;
        assert.deepEqual(args, { company_id: 900001, topics: ["company"] });
        return result();
      },
    },
  );
  assert.equal(calls, 1);
  assert.equal(source.agentV2.companies.length, 1);
  assert.ok(target.evidence.some((e) => e.sourceType.startsWith("agent_v2_")));
});

test("a failed company tool preserves original data and records incomplete investigation", async () => {
  const target = bundle(),
    before = structuredClone(target),
    source: any = {};
  await enrichWithV2(
    target,
    source,
    {
      JobNeedsSnapshot: {
        topics: [
          { topicId: "company", priority: "priority", verificationItemIds: [] },
        ],
      },
    },
    () => {},
    {
      tool: async () => {
        throw Error("timeout");
      },
    },
  );
  assert.deepEqual(target, before);
  assert.match(source.agentV2.notes.join(""), /检查点/);
});

test("a timed out company tool restores acquired evidence into this report without recollection", async () => {
  const target = bundle(),
    source: any = {};
  let recoveries = 0;
  await enrichWithV2(
    target,
    source,
    {
      JobNeedsSnapshot: {
        topics: [
          { topicId: "company", priority: "priority", verificationItemIds: [] },
        ],
      },
    },
    () => {},
    {
      tool: async () => {
        throw Error("deadline");
      },
      recover: async (args, timeout, action) => {
        recoveries++;
        assert.equal(action, "read_company_checkpoint");
        assert.equal(timeout, 12000);
        return result();
      },
    },
  );
  assert.equal(recoveries, 1);
  assert.equal(source.agentV2.companies.length, 1);
  assert.match(source.agentV2.notes.join(""), /恢复取得的材料/);
  assert.ok(target.evidence.some((e) => e.sourceType.startsWith("agent_v2_")));
});

test("report renders five-part interpretations, source limitations and safe PDF locators", () => {
  const data = result();
  const html = renderV2Report({ companies: [data] });
  for (const phrase of [
    "看到了什么",
    "可能意味着什么",
    "与你的关联",
    "还不知道什么",
    "建议询问",
    "搜索索引摘要",
    "精神空间",
    "采购阶段",
    "固定月薪",
    "原采集时间",
  ])
    assert.ok(html.includes(phrase), phrase);
  assert.ok(html.includes("未知"));
  assert.ok(!html.includes("已享受"));
  assert.ok(!html.includes("已核验"));
  data.translations[0].finding = "<script>alert(1)</script>";
  assert.ok(renderV2Report({ companies: [data] }).includes("&lt;script&gt;"));
  data.excerpts[0].url = "javascript:alert(1)";
  assert.ok(
    !renderV2Report({ companies: [data] }).includes('href="javascript:'),
  );
});

test("v2 switch defaults off and retains the old no-key path", () => {
  assert.equal(agentConfiguration({ NODE_ENV: "test" }).v2Enabled, false);
  assert.equal(
    agentConfiguration({
      NODE_ENV: "test",
      RESEARCH_AGENT_ENABLED: "true",
      RESEARCH_AGENT_V2_ENABLED: "true",
    }).v2Enabled,
    true,
  );
});
