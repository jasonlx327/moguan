import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const endpoint = "https://publications.europa.eu/webapi/rdf/sparql";
export const cdmOntology = "http://publications.europa.eu/ontology/cdm#";
export const defaultTerms = [
  "semiconductor",
  "export control",
  "advanced computing",
  "dual-use",
];
export const resultLimit = 100;

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

function sparqlString(value) {
  return `"${String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

export function buildSparqlQuery({
  from,
  to,
  terms = defaultTerms,
  limit = resultLimit,
}) {
  if (!terms.length) throw new Error("At least one search term is required");
  const filters = terms
    .map((term) => `CONTAINS(LCASE(STR(?title)), ${sparqlString(term.toLowerCase())})`)
    .join(" ||\n    ");

  return `PREFIX cdm: <${cdmOntology}>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
SELECT ?work ?date ?title
  (GROUP_CONCAT(DISTINCT STR(?id);separator="|") AS ?identifiers)
WHERE {
  ?work cdm:work_date_document ?date .
  ?expression cdm:expression_belongs_to_work ?work ;
    cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/ENG> ;
    cdm:expression_title ?title .
  OPTIONAL { ?work cdm:work_id_document ?id . }
  FILTER (?date >= "${from}"^^xsd:date && ?date <= "${to}"^^xsd:date)
  FILTER (
    ${filters}
  )
}
GROUP BY ?work ?date ?title
ORDER BY DESC(?date)
LIMIT ${limit + 1}`;
}

export function buildQueryUrl(options) {
  const params = new URLSearchParams({
    query: buildSparqlQuery(options),
    format: "application/sparql-results+json",
  });
  return `${endpoint}?${params}`;
}

function bindingValue(binding, key) {
  return binding?.[key]?.value ?? null;
}

function normalizeOfficialUri(uri) {
  return uri?.replace(/^http:\/\/publications\.europa\.eu\//, "https://publications.europa.eu/");
}

function parseIdentifiers(value) {
  return [...new Set(
    String(value ?? "")
      .split("|")
      .map((identifier) => identifier.trim())
      .filter(Boolean),
  )].sort();
}

function identifierValue(identifiers, prefix) {
  return identifiers
    .find((identifier) => identifier.toLowerCase().startsWith(`${prefix}:`))
    ?.slice(prefix.length + 1) ?? null;
}

function normalizeBinding(binding, terms) {
  const rawWorkUri = bindingValue(binding, "work");
  const cellarResourceUrl = normalizeOfficialUri(rawWorkUri);
  const title = bindingValue(binding, "title");
  const identifiers = parseIdentifiers(bindingValue(binding, "identifiers"));
  const celexId = identifierValue(identifiers, "celex");
  const eliId = identifierValue(identifiers, "eli");
  const matchedTerms = terms
    .filter((term) => title?.toLowerCase().includes(term.toLowerCase()))
    .sort();

  return {
    cellar_id: rawWorkUri?.split("/").filter(Boolean).at(-1) ?? null,
    cellar_work_uri: cellarResourceUrl,
    document_date: bindingValue(binding, "date"),
    title,
    identifiers,
    celex_id: celexId,
    eli_id: eliId,
    eurlex_url: celexId
      ? `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:${encodeURIComponent(celexId)}`
      : null,
    cellar_resource_url: cellarResourceUrl,
    official_document_url: celexId
      ? `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:${encodeURIComponent(celexId)}`
      : cellarResourceUrl,
    matched_terms: matchedTerms,
    record_status: "discovery_candidate",
    legal_verification_status: celexId || eliId
      ? "official_identifier_present"
      : "official_identifier_missing",
  };
}

export async function collectEuCellar({
  from,
  to,
  terms = defaultTerms,
  fetchImpl = fetch,
  collectedAt = new Date(),
}) {
  const query = buildSparqlQuery({ from, to, terms });
  const url = buildQueryUrl({ from, to, terms });
  const response = await fetchImpl(url, {
    headers: { accept: "application/sparql-results+json" },
  });
  if (!response.ok) {
    throw new Error(`EU Cellar SPARQL request failed: ${response.status}`);
  }

  const payload = await response.json();
  const bindings = payload?.results?.bindings;
  if (!Array.isArray(bindings)) {
    throw new Error("EU Cellar response has no results.bindings array");
  }
  if (bindings.length > resultLimit) {
    throw new Error(`EU Cellar response exceeds ${resultLimit} results; narrow or paginate the query`);
  }

  const documentsByKey = new Map();
  for (const binding of bindings) {
    const document = normalizeBinding(binding, terms);
    const key = document.cellar_id ?? `${document.document_date}:${document.title}`;
    const existing = documentsByKey.get(key);
    if (!existing) {
      documentsByKey.set(key, document);
      continue;
    }
    existing.identifiers = [...new Set([
      ...existing.identifiers,
      ...document.identifiers,
    ])].sort();
    existing.matched_terms = [...new Set([
      ...existing.matched_terms,
      ...document.matched_terms,
    ])].sort();
  }

  const documents = [...documentsByKey.values()].sort((a, b) =>
    b.document_date.localeCompare(a.document_date)
    || a.cellar_id.localeCompare(b.cellar_id),
  );

  return {
    schema_version: "0.1",
    snapshot_id: `EU-CELLAR-EXPORT-CONTROLS-${from}-${to}`,
    collected_at: collectedAt.toISOString(),
    source: {
      source_id: "eu_cellar_sparql",
      publisher: "Publications Office of the European Union",
      endpoint,
      cdm_ontology: cdmOntology,
      open_level: "O0",
      authentication: "none",
      legal_status:
        "Official EU metadata discovery service. Verify the document through its CELEX/ELI identifier or Cellar resource before event-ledger entry.",
    },
    query: {
      language: "ENG",
      terms,
      document_date_from: from,
      document_date_to: to,
      result_limit: resultLimit,
      returned_count: bindings.length,
      sparql: query,
    },
    data_status: "snapshot",
    candidate_count: documents.length,
    documents,
    review_gate: {
      status: "pending",
      rule:
        "Title matches are discovery candidates only. Human review must confirm relevance, inspect the official EU document, and separate enacted rules from proposals, reports, and notices before entry into the event ledger.",
    },
  };
}

function isOfficialUrl(value) {
  if (!value) return false;
  try {
    const hostname = new URL(value).hostname;
    return hostname === "publications.europa.eu" || hostname === "eur-lex.europa.eu";
  } catch {
    return false;
  }
}

function usesHostname(value, hostname) {
  try {
    return new URL(value).hostname === hostname;
  } catch {
    return false;
  }
}

export function validateSnapshot(snapshot) {
  const errors = [];
  if (snapshot.schema_version !== "0.1") errors.push("unsupported schema_version");
  if (snapshot.source?.source_id !== "eu_cellar_sparql") errors.push("unexpected source_id");
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
      "cellar_id",
      "cellar_work_uri",
      "document_date",
      "title",
      "official_document_url",
      "record_status",
      "legal_verification_status",
    ]) {
      if (!document[field]) errors.push(`${document.cellar_id ?? "unknown"}: missing ${field}`);
    }
    if (seen.has(document.cellar_id)) errors.push(`duplicate cellar_id: ${document.cellar_id}`);
    seen.add(document.cellar_id);
    if (document.record_status !== "discovery_candidate") {
      errors.push(`${document.cellar_id}: record_status must be discovery_candidate`);
    }
    if (!usesHostname(document.cellar_work_uri, "publications.europa.eu")) {
      errors.push(`${document.cellar_id}: cellar_work_uri must use publications.europa.eu`);
    }
    if (!isOfficialUrl(document.official_document_url)) {
      errors.push(`${document.cellar_id}: official_document_url must use an official EU domain`);
    }
    if (!Array.isArray(document.identifiers) || document.identifiers.length === 0) {
      errors.push(`${document.cellar_id}: identifiers must not be empty`);
    }
    if (!Array.isArray(document.matched_terms) || document.matched_terms.length === 0) {
      errors.push(`${document.cellar_id}: matched_terms must not be empty`);
    }
  }
  return errors;
}

async function main() {
  const to = isoDate(argument("--to") ?? new Date());
  const from = isoDate(argument("--from") ?? daysBefore(to, 29));
  const output = argument("--output");
  const snapshot = await collectEuCellar({ from, to });
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
