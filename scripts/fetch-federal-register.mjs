import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const endpoint = "https://www.federalregister.gov/api/v1/documents.json";
export const defaultAgency = "industry-and-security-bureau";
export const defaultTerms = [
  "semiconductor",
  "advanced computing",
  "semiconductor manufacturing equipment",
];

function isoDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid date: ${value}`);
  return date.toISOString().slice(0, 10);
}

function daysBefore(date, days) {
  const result = new Date(`${isoDate(date)}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() - days);
  return result.toISOString().slice(0, 10);
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

export function buildQueryUrl({
  term,
  from,
  to,
  agency = defaultAgency,
}) {
  const params = new URLSearchParams({
    per_page: "100",
    order: "newest",
    "conditions[agencies][]": agency,
    "conditions[publication_date][gte]": from,
    "conditions[publication_date][lte]": to,
    "conditions[term]": term,
  });
  return `${endpoint}?${params}`;
}

function stripMarkup(value) {
  return typeof value === "string"
    ? value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim()
    : null;
}

function normalizeDocument(document, matchedTerms) {
  return {
    document_number: document.document_number,
    title: document.title,
    document_type: document.type,
    abstract: document.abstract ?? null,
    publication_date: document.publication_date,
    agencies: (document.agencies ?? []).map((agency) => ({
      name: agency.name,
      slug: agency.slug,
    })),
    federalregister_url: document.html_url,
    official_pdf_url: document.pdf_url,
    public_inspection_pdf_url: document.public_inspection_pdf_url ?? null,
    matched_terms: [...matchedTerms].sort(),
    match_excerpt: stripMarkup(document.excerpts),
    record_status: "discovery_candidate",
    legal_verification_status: document.pdf_url?.includes("govinfo.gov")
      ? "official_pdf_link_present"
      : "official_pdf_link_missing",
  };
}

export async function collectFederalRegister({
  from,
  to,
  agency = defaultAgency,
  terms = defaultTerms,
  fetchImpl = fetch,
  collectedAt = new Date(),
}) {
  const matches = new Map();
  const requests = [];

  for (const term of terms) {
    const url = buildQueryUrl({ term, from, to, agency });
    const response = await fetchImpl(url, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`Federal Register request failed for "${term}": ${response.status}`);
    }
    const payload = await response.json();
    const results = payload.count === 0 && payload.results === undefined
      ? []
      : payload.results;
    if (!Array.isArray(results)) {
      throw new Error(`Federal Register response for "${term}" has no results array`);
    }
    if ((payload.total_pages ?? 1) > 1) {
      throw new Error(
        `Federal Register response for "${term}" exceeds one page; pagination is required`,
      );
    }

    requests.push({
      term,
      url,
      returned_count: results.length,
      total_count: payload.count,
    });

    for (const document of results) {
      if (!document.document_number) continue;
      const existing = matches.get(document.document_number);
      if (existing) existing.terms.add(term);
      else matches.set(document.document_number, { document, terms: new Set([term]) });
    }
  }

  const documents = [...matches.values()]
    .map(({ document, terms: matchedTerms }) => normalizeDocument(document, matchedTerms))
    .sort((a, b) =>
      b.publication_date.localeCompare(a.publication_date)
      || a.document_number.localeCompare(b.document_number),
    );

  return {
    schema_version: "0.1",
    snapshot_id: `FR-BIS-SEMICONDUCTOR-${from}-${to}`,
    collected_at: collectedAt.toISOString(),
    source: {
      source_id: "us_federal_register_api",
      publisher: "Office of the Federal Register / FederalRegister.gov",
      endpoint,
      open_level: "O0",
      authentication: "none",
      legal_status:
        "FederalRegister.gov is a discovery and XML rendition service; legal verification must use the linked official GovInfo edition.",
    },
    query: {
      agency,
      terms,
      publication_date_from: from,
      publication_date_to: to,
      requests,
    },
    data_status: "snapshot",
    candidate_count: documents.length,
    documents,
    review_gate: {
      status: "pending",
      rule:
        "Keyword matches are discovery candidates only. Human review must confirm event relevance and verify the linked official GovInfo document before entry into the event ledger.",
    },
  };
}

export function validateSnapshot(snapshot) {
  const errors = [];
  if (snapshot.schema_version !== "0.1") errors.push("unsupported schema_version");
  if (snapshot.source?.source_id !== "us_federal_register_api") {
    errors.push("unexpected source_id");
  }
  if (snapshot.data_status !== "snapshot") errors.push("data_status must be snapshot");
  if (snapshot.review_gate?.status !== "pending") {
    errors.push("new snapshots must remain pending human review");
  }
  if (!Array.isArray(snapshot.documents)) errors.push("documents must be an array");
  if (snapshot.candidate_count !== snapshot.documents?.length) {
    errors.push("candidate_count must match documents length");
  }

  const seen = new Set();
  for (const document of snapshot.documents ?? []) {
    for (const field of [
      "document_number",
      "title",
      "document_type",
      "publication_date",
      "federalregister_url",
      "official_pdf_url",
      "record_status",
      "legal_verification_status",
    ]) {
      if (!document[field]) errors.push(`${document.document_number ?? "unknown"}: missing ${field}`);
    }
    if (seen.has(document.document_number)) {
      errors.push(`duplicate document_number: ${document.document_number}`);
    }
    seen.add(document.document_number);
    if (document.record_status !== "discovery_candidate") {
      errors.push(`${document.document_number}: record_status must be discovery_candidate`);
    }
    if (!document.official_pdf_url?.startsWith("https://www.govinfo.gov/")) {
      errors.push(`${document.document_number}: official_pdf_url must use govinfo.gov`);
    }
    if (!Array.isArray(document.matched_terms) || document.matched_terms.length === 0) {
      errors.push(`${document.document_number}: matched_terms must not be empty`);
    }
  }
  return errors;
}

async function main() {
  const to = isoDate(argument("--to") ?? new Date());
  const from = isoDate(argument("--from") ?? daysBefore(to, 29));
  const output = argument("--output");
  const snapshot = await collectFederalRegister({ from, to });
  const errors = validateSnapshot(snapshot);
  if (errors.length) throw new Error(errors.join("\n"));

  const json = `${JSON.stringify(snapshot, null, 2)}\n`;
  if (output) {
    const outputPath = path.resolve(process.cwd(), output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, json);
  }
  process.stdout.write(json);
}

if (
  process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
