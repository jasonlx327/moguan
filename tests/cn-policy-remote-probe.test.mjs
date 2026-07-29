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
  assert.match(artifact.access_issue.message, /network closed/);
  assert.match(fs.readFileSync(`${output}.sha256`, "utf8"), /^[a-f0-9]{64}  blocked\.json\n$/);
});
