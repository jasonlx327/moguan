import assert from "node:assert/strict";
import test from "node:test";
import {
  buildQueryUrl,
  collectEuCellar,
  validateSnapshot,
} from "../scripts/fetch-eu-cellar.mjs";

const fixturePayload = {
  head: { vars: ["work", "date", "title", "identifiers"] },
  results: {
    bindings: [
      {
        work: {
          type: "uri",
          value: "http://publications.europa.eu/resource/cellar/example-cellar-id",
        },
        date: { type: "literal", value: "2026-07-03" },
        title: {
          type: "literal",
          value: "Compilation of national export control lists for dual-use items",
        },
        identifiers: {
          type: "literal",
          value: "celex:52026XC03577|eli:C/2026/3577/oj|oj:C_202603577",
        },
      },
    ],
  },
};

async function fixtureFetch() {
  return new Response(JSON.stringify(fixturePayload), {
    status: 200,
    headers: { "content-type": "application/sparql-results+json" },
  });
}

test("query contains the exact date window, English language, and terms", () => {
  const url = new URL(buildQueryUrl({
    from: "2026-06-29",
    to: "2026-07-28",
    terms: ["semiconductor", "dual-use"],
  }));
  const query = url.searchParams.get("query");

  assert.match(query, /2026-06-29/);
  assert.match(query, /2026-07-28/);
  assert.match(query, /language\/ENG/);
  assert.match(query, /semiconductor/);
  assert.match(query, /dual-use/);
  assert.match(query, /LIMIT 101/);
});

test("collector preserves official identifiers and keeps review pending", async () => {
  const snapshot = await collectEuCellar({
    from: "2026-06-29",
    to: "2026-07-28",
    fetchImpl: fixtureFetch,
    collectedAt: new Date("2026-07-28T00:00:00Z"),
  });

  assert.equal(snapshot.candidate_count, 1);
  assert.equal(snapshot.documents[0].cellar_id, "example-cellar-id");
  assert.equal(snapshot.documents[0].celex_id, "52026XC03577");
  assert.equal(snapshot.documents[0].eli_id, "C/2026/3577/oj");
  assert.equal(
    snapshot.documents[0].eurlex_url,
    "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:52026XC03577",
  );
  assert.deepEqual(snapshot.documents[0].matched_terms, ["dual-use", "export control"]);
  assert.equal(snapshot.documents[0].record_status, "discovery_candidate");
  assert.equal(snapshot.review_gate.status, "pending");
  assert.deepEqual(validateSnapshot(snapshot), []);
});

test("validator rejects a non-EU official document URL", async () => {
  const snapshot = await collectEuCellar({
    from: "2026-06-29",
    to: "2026-07-28",
    fetchImpl: fixtureFetch,
  });
  snapshot.documents[0].official_document_url = "https://example.com/not-official";

  assert.ok(
    validateSnapshot(snapshot).some((error) =>
      error.includes("official_document_url must use an official EU domain"),
    ),
  );
});
