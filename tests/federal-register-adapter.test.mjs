import assert from "node:assert/strict";
import test from "node:test";
import {
  buildQueryUrl,
  collectFederalRegister,
  validateSnapshot,
} from "../scripts/fetch-federal-register.mjs";

const documentsByTerm = {
  semiconductor: [
    {
      title: "Revision to License Review Policy for Advanced Computing Commodities",
      type: "Rule",
      abstract: "A semiconductor export control rule.",
      document_number: "2026-00789",
      html_url: "https://www.federalregister.gov/documents/2026/01/15/2026-00789/example",
      pdf_url: "https://www.govinfo.gov/content/pkg/FR-2026-01-15/pdf/2026-00789.pdf",
      publication_date: "2026-01-15",
      agencies: [{ name: "Industry and Security Bureau", slug: "industry-and-security-bureau" }],
      excerpts: "Certain <span class=\"match\">semiconductors</span>.",
    },
  ],
  "advanced computing": [
    {
      title: "Revision to License Review Policy for Advanced Computing Commodities",
      type: "Rule",
      abstract: "A semiconductor export control rule.",
      document_number: "2026-00789",
      html_url: "https://www.federalregister.gov/documents/2026/01/15/2026-00789/example",
      pdf_url: "https://www.govinfo.gov/content/pkg/FR-2026-01-15/pdf/2026-00789.pdf",
      publication_date: "2026-01-15",
      agencies: [{ name: "Industry and Security Bureau", slug: "industry-and-security-bureau" }],
      excerpts: "Certain <span class=\"match\">advanced computing</span> items.",
    },
  ],
  "semiconductor manufacturing equipment": [],
};

async function fixtureFetch(url) {
  const term = new URL(url).searchParams.get("conditions[term]");
  const results = documentsByTerm[term] ?? [];
  const payload = results.length === 0
    ? { count: 0 }
    : { count: results.length, total_pages: 1, results };
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

test("buildQueryUrl contains agency, dates, and term", () => {
  const url = new URL(buildQueryUrl({
    term: "semiconductor",
    from: "2026-01-01",
    to: "2026-01-31",
  }));
  assert.equal(url.searchParams.get("conditions[agencies][]"), "industry-and-security-bureau");
  assert.equal(url.searchParams.get("conditions[publication_date][gte]"), "2026-01-01");
  assert.equal(url.searchParams.get("conditions[publication_date][lte]"), "2026-01-31");
  assert.equal(url.searchParams.get("conditions[term]"), "semiconductor");
});

test("collector deduplicates documents and preserves matched terms", async () => {
  const snapshot = await collectFederalRegister({
    from: "2026-01-01",
    to: "2026-01-31",
    fetchImpl: fixtureFetch,
    collectedAt: new Date("2026-02-01T00:00:00Z"),
  });

  assert.equal(snapshot.candidate_count, 1);
  assert.deepEqual(snapshot.documents[0].matched_terms, [
    "advanced computing",
    "semiconductor",
  ]);
  assert.equal(snapshot.documents[0].match_excerpt, "Certain semiconductors.");
  assert.equal(snapshot.documents[0].record_status, "discovery_candidate");
  assert.equal(snapshot.review_gate.status, "pending");
  assert.deepEqual(validateSnapshot(snapshot), []);
});

test("validator rejects a non-GovInfo legal verification link", async () => {
  const snapshot = await collectFederalRegister({
    from: "2026-01-01",
    to: "2026-01-31",
    fetchImpl: fixtureFetch,
  });
  snapshot.documents[0].official_pdf_url = "https://example.com/not-official.pdf";

  assert.ok(
    validateSnapshot(snapshot).some((error) =>
      error.includes("official_pdf_url must use govinfo.gov"),
    ),
  );
});
