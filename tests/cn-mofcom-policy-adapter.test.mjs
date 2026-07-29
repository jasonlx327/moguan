import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMofcomAnnouncementUrl,
  collectCnMofcomPolicy,
  parseMofcomAnnouncementList,
} from "../scripts/fetch-cn-mofcom-policy.mjs";
import { validateSnapshot } from "../scripts/fetch-cn-gov-policy.mjs";

const fixtureHtml = `
  <section>
    <a href="/zcfb/zc/art/2026/art_example.html">
      商务部公告2026年第30号 公布将14家欧盟实体列入出口管制管控名单
    </a>
    <span>2026-07-24</span>
    <a href="/zcfb/zc/art/2026/art_unrelated.html">
      商务部公告2026年第29号 公布其他管理事项
    </a>
    <span>2026-07-10</span>
    <a href="/zcfb/zc/art/2026/art_old.html">
      商务部公告2026年第1号 关于加强两用物项出口管制的公告
    </a>
    <span>2026-01-06</span>
  </section>
`;

test("MOFCOM annual announcement URL follows the requested year", () => {
  assert.equal(
    buildMofcomAnnouncementUrl("2026-07-29"),
    "https://www.mofcom.gov.cn/zcfb/blgg/gg/2026/index.html",
  );
});

test("MOFCOM parser keeps in-window topic matches and official links", () => {
  const documents = parseMofcomAnnouncementList({
    html: fixtureHtml,
    listUrl: buildMofcomAnnouncementUrl("2026-07-29"),
    from: "2026-06-30",
    to: "2026-07-29",
  });

  assert.equal(documents.length, 1);
  assert.equal(documents[0].document_number, "商务部公告2026年第30号");
  assert.equal(documents[0].publication_date, "2026-07-24");
  assert.deepEqual(documents[0].matched_terms, ["出口管制"]);
  assert.equal(
    documents[0].official_url,
    "https://www.mofcom.gov.cn/zcfb/zc/art/2026/art_example.html",
  );
});

test("MOFCOM parser accepts dates placed before announcement links", () => {
  const documents = parseMofcomAnnouncementList({
    html: `
      <li>
        <span>2026-07-24</span>
        <a href="/zcfb/zc/art/2026/art_before_date.html">
          商务部公告2026年第30号 公布出口管制管控名单
        </a>
      </li>
    `,
    listUrl: buildMofcomAnnouncementUrl("2026-07-29"),
    from: "2026-06-30",
    to: "2026-07-29",
  });

  assert.equal(documents.length, 1);
  assert.equal(documents[0].publication_date, "2026-07-24");
});

test("MOFCOM collector produces a pending auditable snapshot", async () => {
  const snapshot = await collectCnMofcomPolicy({
    from: "2026-06-30",
    to: "2026-07-29",
    fetchImpl: async () => new Response(fixtureHtml, {
      status: 200,
      headers: { "content-type": "text/html;charset=UTF-8" },
    }),
    collectedAt: new Date("2026-07-29T00:00:00Z"),
  });

  assert.equal(snapshot.source.source_id, "cn_mofcom_announcements");
  assert.equal(snapshot.candidate_count, 1);
  assert.ok(snapshot.query.requests[0].list_anchor_count >= 3);
  assert.equal(snapshot.query.requests[0].topic_anchor_count, 2);
  assert.match(snapshot.query.requests[0].response_sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(validateSnapshot(snapshot), []);
});
