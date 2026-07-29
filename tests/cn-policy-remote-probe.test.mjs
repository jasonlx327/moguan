import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  beijingDate,
  daysBefore,
  runRemoteProbe,
} from "../scripts/run-cn-policy-remote.mjs";

const policyItem = {
  title: "商务部公告2026年第30号 公布出口管制管控名单",
  pcode: "商务部公告2026年第30号",
  puborg: "商务部",
  pubtime: String(Date.UTC(2026, 6, 24)),
  url: "https://www.mofcom.gov.cn/zcfb/blgg/art/2026/example.html",
};

async function fixtureFetch(url) {
  const term = new URL(url).searchParams.get("q");
  const items = term === "出口管制" ? [policyItem] : [];
  return new Response(JSON.stringify({
    searchVO: {
      totalCount: items.length,
      totalpage: 1,
      listVO: items,
    },
  }), { status: 200 });
}

test("remote probe uses the Beijing civil date and an inclusive 30-day window", () => {
  assert.equal(beijingDate(new Date("2026-07-28T23:35:00Z")), "2026-07-29");
  assert.equal(daysBefore("2026-07-29", 29), "2026-06-30");
});

test("successful remote probe writes a hashed snapshot artifact", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "moguan-cn-probe-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const output = path.join(directory, "snapshot.json");
  const result = await runRemoteProbe({
    from: "2026-06-30",
    to: "2026-07-29",
    output,
    fetchImpl: fixtureFetch,
    attemptedAt: new Date("2026-07-29T00:00:00Z"),
  });

  assert.equal(result.status, "snapshot");
  assert.equal(result.candidate_count, 1);
  assert.match(result.snapshot_sha256, /^[a-f0-9]{64}$/);
  assert.equal(JSON.parse(fs.readFileSync(output, "utf8")).candidate_count, 1);
  assert.match(
    fs.readFileSync(`${output}.sha256`, "utf8"),
    new RegExp(`^${result.snapshot_sha256}  snapshot\\.json\\n$`),
  );
});

test("failed remote probe writes a blocked artifact and still fails the run", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "moguan-cn-probe-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const output = path.join(directory, "blocked.json");

  await assert.rejects(
    runRemoteProbe({
      from: "2026-06-30",
      to: "2026-07-29",
      output,
      fetchImpl: async () => {
        throw new Error("network closed");
      },
      attemptedAt: new Date("2026-07-29T00:00:00Z"),
    }),
    /Official-source probe failed/,
  );

  const artifact = JSON.parse(fs.readFileSync(output, "utf8"));
  assert.equal(artifact.data_status, "blocked");
  assert.equal(artifact.candidate_count, 0);
  assert.deepEqual(artifact.documents, []);
  assert.match(artifact.access_issue.primary_source.message, /network closed/);
  assert.match(artifact.access_issue.fallback_source.message, /network closed/);
  assert.match(fs.readFileSync(`${output}.sha256`, "utf8"), /^[a-f0-9]{64}  blocked\.json\n$/);
});

test("blocked artifact preserves only safe response diagnostics", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "moguan-cn-probe-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const output = path.join(directory, "blocked-shape.json");
  const body = JSON.stringify({
    code: 200,
    data: { message: "shape changed", raw_marker: "must-not-be-copied" },
  });

  await assert.rejects(
    runRemoteProbe({
      from: "2026-06-30",
      to: "2026-07-29",
      output,
      fetchImpl: async () => new Response(body, {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
      attemptedAt: new Date("2026-07-29T00:00:00Z"),
    }),
    /Official-source probe failed/,
  );

  const artifact = JSON.parse(fs.readFileSync(output, "utf8"));
  const diagnostics = artifact.access_issue.primary_source.response_diagnostics;
  assert.deepEqual(diagnostics.top_level_keys, ["code", "data"]);
  assert.deepEqual(diagnostics.data_keys, ["message", "raw_marker"]);
  assert.doesNotMatch(JSON.stringify(artifact), /must-not-be-copied/);
});

test("remote probe falls back to the official MOFCOM announcement list", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "moguan-cn-probe-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const output = path.join(directory, "fallback.json");
  const emptyPrimaryBody = JSON.stringify({
    code: 200,
    data: [],
    searchVO: null,
  });
  const mofcomHtml = `
    <a href="/zcfb/zc/art/2026/art_example.html">
      商务部公告2026年第30号 公布出口管制管控名单
    </a>
    <span>2026-07-24</span>
  `;

  const result = await runRemoteProbe({
    from: "2026-06-30",
    to: "2026-07-29",
    output,
    fetchImpl: async (url) => String(url).includes("/zcfb/blgg/gg/")
      ? new Response(mofcomHtml, {
        status: 200,
        headers: { "content-type": "text/html" },
      })
      : new Response(emptyPrimaryBody, {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    attemptedAt: new Date("2026-07-29T00:00:00Z"),
  });

  const snapshot = JSON.parse(fs.readFileSync(output, "utf8"));
  assert.equal(result.status, "snapshot");
  assert.equal(snapshot.source.source_id, "cn_mofcom_announcements");
  assert.equal(snapshot.candidate_count, 1);
  assert.equal(snapshot.fallback.activated, true);
  assert.equal(
    snapshot.fallback.primary_access_issue.error_type,
    "ResponseQualityError",
  );
});
