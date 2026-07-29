import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  discoverRelevantLinks,
  runEventWatch,
} from "../scripts/run-event-watch.mjs";

const mofcomQaUrl =
  "https://aqygzj.mofcom.gov.cn/zhxx/art/2026/art_90f295b25fce4401b72ddf1b9adac31f.html";
const mofcomIndexUrl = "https://aqygzj.mofcom.gov.cn/index.html";
const mofcomFallbackQaUrl =
  "https://www.mofcom.gov.cn/xwfb/xwfyrth/art/2026/art_21b4467c09fc435d8d4aee6f310f9f8a.html";
const mofcomFallbackIndexUrl = "https://www.mofcom.gov.cn/xwfb/";
const vigoReportUrl =
  "https://vigophotonics.com/reports/analysis-of-the-impact-of-placing-vigo-photonics-on-the-chinese-dual-use-export-restriction-list/";
const vigoIndexUrl =
  "https://vigophotonics.com/investor-relations/reports/current-reports/";

function response(html, status = 200) {
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function completeFetch({ withNewVigoReport = false, failVigoIndex = false } = {}) {
  return async (url) => {
    if (url === mofcomQaUrl) {
      return response(
        "<html>欧方正式发布第21轮对俄制裁措施。针对欧方上述恶劣行径。</html>",
      );
    }
    if (url === mofcomIndexUrl) {
      return response(`<a href="${mofcomQaUrl}">将14家欧盟实体列入出口管制管控名单答记者问</a>`);
    }
    if (url === vigoReportUrl) {
      return response(
        "<html>Current Report No. 35/2026 approximately 8.8% export licenses</html>",
      );
    }
    if (url === vigoIndexUrl && failVigoIndex) {
      return response("<html>unavailable</html>", 503);
    }
    if (url === vigoIndexUrl) {
      const newReport = withNewVigoReport
        ? '<a href="/reports/license-update/">Update on Chinese export license applications</a>'
        : "";
      return response(
        `<a href="${vigoReportUrl}">Analysis of the impact of placing VIGO on the Chinese dual-use export restriction list</a>${newReport}`,
      );
    }
    throw new Error(`unexpected URL: ${url}`);
  };
}

function temporaryOutput(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "moguan-event-watch-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return path.join(directory, "2026-07-29.json");
}

test("link discovery keeps relevant same-host links and excludes known evidence", () => {
  const records = discoverRelevantLinks({
    html: `
      <a href="/known">Chinese dual-use export restriction</a>
      <a href="/new">Export license update</a>
      <a href="https://example.com/other">China export license</a>
      <a href="/unrelated">Quarterly calendar</a>
    `,
    baseUrl: "https://vigophotonics.com/reports/",
    allowedHost: "vigophotonics.com",
    terms: ["china", "chinese", "dual-use", "export license"],
    knownUrls: ["https://vigophotonics.com/known"],
  });

  assert.deepEqual(records.map((record) => record.url), [
    "https://vigophotonics.com/new",
  ]);
  assert.deepEqual(records[0].matched_terms, ["export license"]);
});

test("daily watch writes an immutable no-new-evidence record", async (t) => {
  const output = temporaryOutput(t);
  const result = await runEventWatch({
    operationDate: "2026-07-29",
    output,
    fetchImpl: completeFetch(),
    checkedAt: new Date("2026-07-29T07:00:00Z"),
  });

  assert.equal(result.record.data_status, "snapshot");
  assert.equal(result.record.result_status, "no_new_evidence");
  assert.equal(result.record.new_evidence_count, 0);
  assert.equal(result.record.conclusion.direction, "maintained");
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
  assert.match(
    fs.readFileSync(`${output}.sha256`, "utf8"),
    new RegExp(`^${result.sha256}  2026-07-29\\.json\\n$`),
  );

  await assert.rejects(
    runEventWatch({
      operationDate: "2026-07-29",
      output,
      fetchImpl: async () => {
        throw new Error("network must not run");
      },
    }),
    /immutable watch record already exists/,
  );
});

test("a new company link requires review without changing facts", async (t) => {
  const output = temporaryOutput(t);
  const result = await runEventWatch({
    operationDate: "2026-07-29",
    output,
    fetchImpl: completeFetch({ withNewVigoReport: true }),
    checkedAt: new Date("2026-07-29T07:00:00Z"),
  });

  assert.equal(result.record.result_status, "new_evidence_candidates");
  assert.equal(result.record.new_evidence_count, 1);
  assert.equal(result.record.conclusion.direction, "requires_review");
  assert.equal(result.record.review_gate.status, "pending");
  assert.equal(
    result.record.new_evidence_candidates[0].url,
    "https://vigophotonics.com/reports/license-update/",
  );
});

test("MOFCOM main site is used when the bureau subsite is unavailable", async (t) => {
  const output = temporaryOutput(t);
  const standardFetch = completeFetch();
  const result = await runEventWatch({
    operationDate: "2026-07-29",
    output,
    fetchImpl: async (url) => {
      if (url === mofcomQaUrl || url === mofcomIndexUrl) {
        throw new Error("bureau subsite unavailable");
      }
      if (url === mofcomFallbackQaUrl) {
        return response(
          "<html>欧方正式发布第21轮对俄制裁措施。针对欧方上述恶劣行径。</html>",
        );
      }
      if (url === mofcomFallbackIndexUrl) {
        return response(`<a href="${mofcomFallbackQaUrl}">将14家欧盟实体列入出口管制管控名单答记者问</a>`);
      }
      return standardFetch(url);
    },
    checkedAt: new Date("2026-07-29T07:00:00Z"),
  });

  const mofcomCheck = result.record.source_checks[0];
  assert.equal(result.record.result_status, "no_new_evidence");
  assert.equal(mofcomCheck.baseline_request.fallback_used, true);
  assert.equal(mofcomCheck.index_request.fallback_used, true);
  assert.equal(mofcomCheck.baseline_request.used_url, mofcomFallbackQaUrl);
  assert.equal(mofcomCheck.index_request.used_url, mofcomFallbackIndexUrl);
});

test("an inaccessible index cannot be reported as no new evidence", async (t) => {
  const output = temporaryOutput(t);
  const result = await runEventWatch({
    operationDate: "2026-07-29",
    output,
    fetchImpl: completeFetch({ failVigoIndex: true }),
    checkedAt: new Date("2026-07-29T07:00:00Z"),
  });

  assert.equal(result.record.data_status, "partial");
  assert.equal(result.record.result_status, "not_determined");
  assert.equal(result.record.conclusion.direction, "blocked");
  assert.match(result.record.conclusion.text, /不能得出暂无新增证据/);
});
