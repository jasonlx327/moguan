import assert from "node:assert/strict";
import test from "node:test";
import {
  buildQueryUrl,
  collectCnGovPolicy,
  validateSnapshot,
} from "../scripts/fetch-cn-gov-policy.mjs";

const policyItem = {
  title: "商务部公告2026年第30号 公布将14家欧盟实体列入<em>出口管制</em>管控名单",
  pcode: "商务部公告2026年第30号",
  puborg: "商务部",
  pubtime: String(Date.UTC(2026, 6, 24)),
  summary: "根据出口管制法和两用物项出口管制条例发布。",
  url: "https://www.mofcom.gov.cn/zcfb/blgg/art/2026/example.html",
};

async function fixtureFetch(url) {
  const term = new URL(url).searchParams.get("q");
  const items = ["出口管制", "两用物项"].includes(term) ? [policyItem] : [];
  return new Response(JSON.stringify({
    code: 200,
    searchVO: {
      totalCount: items.length,
      totalpage: 1,
      listVO: items,
    },
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

test("query contains department, exact dates, topic, and page limit", () => {
  const url = new URL(buildQueryUrl({
    term: "出口管制",
    from: "2026-06-29",
    to: "2026-07-28",
  }));

  assert.equal(url.searchParams.get("t"), "zhengcelibrary_bm");
  assert.equal(url.searchParams.get("q"), "出口管制");
  assert.equal(url.searchParams.get("mintime"), "2026-06-29");
  assert.equal(url.searchParams.get("maxtime"), "2026-07-28");
  assert.equal(url.searchParams.get("bmfl"), "商务部");
  assert.equal(url.searchParams.get("n"), "100");
});

test("collector deduplicates policy documents and preserves matched terms", async () => {
  const snapshot = await collectCnGovPolicy({
    from: "2026-06-29",
    to: "2026-07-28",
    fetchImpl: fixtureFetch,
    collectedAt: new Date("2026-07-28T00:00:00Z"),
  });

  assert.equal(snapshot.candidate_count, 1);
  assert.equal(snapshot.documents[0].document_number, "商务部公告2026年第30号");
  assert.equal(snapshot.documents[0].publication_date, "2026-07-24");
  assert.deepEqual(snapshot.documents[0].matched_terms, ["两用物项", "出口管制"]);
  assert.equal(snapshot.documents[0].record_status, "discovery_candidate");
  assert.equal(snapshot.review_gate.status, "pending");
  assert.match(snapshot.query.requests[0].response_sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(validateSnapshot(snapshot), []);
});

test("collector accepts searchVO nested under data", async () => {
  const snapshot = await collectCnGovPolicy({
    from: "2026-06-29",
    to: "2026-07-28",
    terms: ["出口管制"],
    fetchImpl: async () => new Response(JSON.stringify({
      code: 200,
      data: {
        searchVO: {
          totalCount: 1,
          totalpage: 1,
          listVO: [policyItem],
        },
      },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  });

  assert.equal(snapshot.candidate_count, 1);
  assert.equal(snapshot.query.requests[0].http_status, 200);
  assert.equal(snapshot.query.requests[0].content_type, "application/json");
  assert.ok(snapshot.query.requests[0].response_bytes > 0);
});

test("collector accepts a direct data array when searchVO is null", async () => {
  const snapshot = await collectCnGovPolicy({
    from: "2026-06-29",
    to: "2026-07-28",
    terms: ["出口管制"],
    fetchImpl: async () => new Response(JSON.stringify({
      code: 200,
      msg: "success",
      data: [policyItem],
      searchVO: null,
      paramsVO: null,
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  });

  assert.equal(snapshot.candidate_count, 1);
  assert.equal(snapshot.documents[0].document_number, "商务部公告2026年第30号");
});

test("collector reports safe response shape diagnostics without storing the body", async () => {
  const body = JSON.stringify({
    code: 200,
    data: { message: "shape changed", secret_marker: "must-not-be-copied" },
  });

  await assert.rejects(
    collectCnGovPolicy({
      from: "2026-06-29",
      to: "2026-07-28",
      terms: ["半导体"],
      fetchImpl: async () => new Response(body, {
        status: 200,
        headers: { "content-type": "application/json;charset=UTF-8" },
      }),
    }),
    (error) => {
      assert.equal(error.name, "ResponseShapeError");
      assert.equal(error.details.http_status, 200);
      assert.deepEqual(error.details.top_level_keys, ["code", "data"]);
      assert.deepEqual(error.details.data_keys, ["message", "secret_marker"]);
      assert.equal(error.details.response_bytes, Buffer.byteLength(body));
      assert.match(error.details.response_sha256, /^[a-f0-9]{64}$/);
      assert.doesNotMatch(JSON.stringify(error.details), /must-not-be-copied/);
      return true;
    },
  );
});

test("collector blocks identical empty responses across different terms", async () => {
  const body = JSON.stringify({
    code: 200,
    data: [],
    searchVO: null,
  });

  await assert.rejects(
    collectCnGovPolicy({
      from: "2026-06-29",
      to: "2026-07-28",
      terms: ["半导体", "出口管制"],
      fetchImpl: async () => new Response(body, {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    }),
    (error) => {
      assert.equal(error.name, "ResponseQualityError");
      assert.equal(error.details.request_count, 2);
      assert.deepEqual(error.details.terms, ["半导体", "出口管制"]);
      assert.deepEqual(error.details.http_statuses, [200]);
      assert.match(error.details.response_sha256, /^[a-f0-9]{64}$/);
      return true;
    },
  );
});

test("validator rejects unofficial links", async () => {
  const snapshot = await collectCnGovPolicy({
    from: "2026-06-29",
    to: "2026-07-28",
    fetchImpl: fixtureFetch,
  });
  snapshot.documents[0].official_url = "https://example.com/not-official";

  assert.ok(
    validateSnapshot(snapshot).some((error) =>
      error.includes("official_url must use an approved government domain"),
    ),
  );
});

test("validator accepts an explicit empty blocked state", () => {
  const blocked = {
    schema_version: "0.1",
    source: { source_id: "cn_state_council_policy_search" },
    data_status: "blocked",
    candidate_count: 0,
    documents: [],
    access_issue: "TLS connection closed before the official API responded.",
    review_gate: { status: "pending" },
  };

  assert.deepEqual(validateSnapshot(blocked), []);
});
