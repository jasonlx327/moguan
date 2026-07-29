import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

export const endpoint = "https://sousuo.www.gov.cn/search-gov/data";
export const defaultDepartment = "商务部";
export const defaultTerms = [
  "半导体",
  "芯片",
  "出口管制",
  "先进计算",
  "两用物项",
];
export const resultLimit = 100;

export class ResponseShapeError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "ResponseShapeError";
    this.details = details;
  }
}

export class ResponseQualityError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "ResponseQualityError";
    this.details = details;
  }
}

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
  department = defaultDepartment,
}) {
  const params = new URLSearchParams({
    t: "zhengcelibrary_bm",
    q: term,
    timetype: "timezd",
    mintime: from,
    maxtime: to,
    sort: "pubtime",
    sortType: "1",
    searchfield: "title:content:summary",
    childtype: "bumenfile",
    bmfl: department,
    p: "1",
    n: String(resultLimit),
  });
  return `${endpoint}?${params}`;
}

function stripMarkup(value) {
  return typeof value === "string"
    ? value
      .replace(/<[^>]*>/g, "")
      .replaceAll("&nbsp;", " ")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&amp;", "&")
      .replace(/\s+/g, " ")
      .trim()
    : null;
}

function normalizeDate(value) {
  if (value === null || value === undefined || value === "") return null;
  if (/^\d{12,}$/.test(String(value))) {
    const date = new Date(Number(value));
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }
  const match = String(value).match(/\d{4}[-年/.]\d{1,2}[-月/.]\d{1,2}/);
  if (!match) return null;
  return match[0]
    .replace(/[年/.]/g, "-")
    .replace("月", "-")
    .replace("日", "")
    .split("-")
    .map((part, index) => index === 0 ? part : part.padStart(2, "0"))
    .join("-");
}

function extractItems(searchVO) {
  if (Array.isArray(searchVO?.listVO)) return searchVO.listVO;
  const categoryLists = Object.values(searchVO?.catMap ?? {})
    .flatMap((category) => category?.listVO ?? []);
  return categoryLists;
}

function officialHostname(value) {
  try {
    const hostname = new URL(value).hostname;
    return hostname === "www.gov.cn"
      || hostname === "app.www.gov.cn"
      || hostname.endsWith(".mofcom.gov.cn");
  } catch {
    return false;
  }
}

function normalizeItem(item, matchedTerms) {
  const officialUrl = item.url ?? item.piclinksurl ?? item.linkurl ?? null;
  const documentNumber = stripMarkup(item.pcode ?? item.wenhao ?? item.fwzh) || null;
  const title = stripMarkup(item.title);

  return {
    record_id: documentNumber || officialUrl,
    document_number: documentNumber,
    title,
    publication_date: normalizeDate(item.pubtime ?? item.ptime ?? item.pubdate),
    publisher: stripMarkup(item.puborg ?? item.source) || null,
    summary: stripMarkup(item.summary) || null,
    official_url: officialUrl,
    matched_terms: [...matchedTerms].sort(),
    record_status: "discovery_candidate",
    legal_verification_status: documentNumber
      ? "official_document_number_present"
      : "official_document_number_missing",
  };
}

export async function collectCnGovPolicy({
  from,
  to,
  department = defaultDepartment,
  terms = defaultTerms,
  fetchImpl = fetch,
  collectedAt = new Date(),
}) {
  const matches = new Map();
  const requests = [];

  for (const term of terms) {
    const url = buildQueryUrl({ term, from, to, department });
    const response = await fetchImpl(url, {
      headers: {
        accept: "application/json, text/plain, */*",
        referer: "https://sousuo.www.gov.cn/zcwjk/policyDocumentLibrary",
      },
    });
    if (!response.ok) {
      throw new Error(`China government policy request failed for "${term}": ${response.status}`);
    }

    const rawResponse = await response.text();
    const responseSha256 = createHash("sha256").update(rawResponse).digest("hex");
    const responseDetails = {
      term,
      http_status: response.status,
      content_type: response.headers.get("content-type"),
      response_bytes: Buffer.byteLength(rawResponse),
      response_sha256: responseSha256,
    };
    let payload;
    try {
      payload = JSON.parse(rawResponse);
    } catch {
      throw new ResponseShapeError(
        `China government policy response for "${term}" is not valid JSON`,
        responseDetails,
      );
    }
    const payloadObject = payload && typeof payload === "object" && !Array.isArray(payload);
    const dataObject = payloadObject
      && payload.data
      && typeof payload.data === "object"
      && !Array.isArray(payload.data);
    const shapeDetails = {
      ...responseDetails,
      top_level_keys: payloadObject ? Object.keys(payload).slice(0, 20) : [],
      data_type: Array.isArray(payload?.data) ? "array" : typeof payload?.data,
      data_keys: dataObject ? Object.keys(payload.data).slice(0, 20) : [],
    };
    const searchVO = payload?.searchVO
      ?? payload?.data?.searchVO
      ?? (Array.isArray(payload?.data)
        ? {
          listVO: payload.data,
          totalCount: payload.data.length,
          totalpage: 1,
        }
        : null);
    if (!searchVO || typeof searchVO !== "object") {
      throw new ResponseShapeError(
        `China government policy response for "${term}" has no searchVO`,
        shapeDetails,
      );
    }
    const items = extractItems(searchVO);
    if (!Array.isArray(items)) {
      throw new ResponseShapeError(
        `China government policy response for "${term}" has no result list`,
        shapeDetails,
      );
    }
    const totalCount = Number(searchVO.totalCount ?? items.length);
    const totalPages = Number(searchVO.totalpage ?? 1);
    if (totalPages > 1 || totalCount > resultLimit) {
      throw new Error(
        `China government policy response for "${term}" may exceed one page; narrow the query`,
      );
    }

    requests.push({
      term,
      url,
      returned_count: items.length,
      total_count: totalCount,
      http_status: response.status,
      content_type: response.headers.get("content-type"),
      response_bytes: Buffer.byteLength(rawResponse),
      response_sha256: responseSha256,
    });

    for (const item of items) {
      const key = stripMarkup(item.pcode ?? item.wenhao ?? item.fwzh)
        || item.url
        || item.piclinksurl;
      if (!key) continue;
      const existing = matches.get(key);
      if (existing) existing.terms.add(term);
      else matches.set(key, { item, terms: new Set([term]) });
    }
  }

  const allEmpty = requests.length > 1
    && requests.every((request) => request.returned_count === 0);
  const uniqueResponseHashes = new Set(
    requests.map((request) => request.response_sha256),
  );
  if (allEmpty && uniqueResponseHashes.size === 1) {
    throw new ResponseQualityError(
      "Official policy searches returned one identical empty response for every term",
      {
        request_count: requests.length,
        terms: requests.map((request) => request.term),
        http_statuses: [...new Set(requests.map((request) => request.http_status))],
        content_types: [...new Set(requests.map((request) => request.content_type))],
        response_bytes: [...new Set(requests.map((request) => request.response_bytes))],
        response_sha256: requests[0].response_sha256,
      },
    );
  }

  const documents = [...matches.values()]
    .map(({ item, terms: matchedTerms }) => normalizeItem(item, matchedTerms))
    .sort((a, b) =>
      (b.publication_date ?? "").localeCompare(a.publication_date ?? "")
      || a.record_id.localeCompare(b.record_id),
    );

  return {
    schema_version: "0.1",
    snapshot_id: `CN-GOV-MOFCOM-SEMICONDUCTOR-${from}-${to}`,
    collected_at: collectedAt.toISOString(),
    source: {
      source_id: "cn_state_council_policy_search",
      publisher: "中国政府网",
      endpoint,
      open_level: "O0",
      authentication: "none",
      interface_status:
        "Public no-authentication search interface on an official government domain; machine contract is not formally documented.",
      legal_status:
        "The index is used for discovery. Event-ledger entry requires opening the linked official document and confirming its issuing authority, document number, effective status and scope.",
    },
    query: {
      department,
      terms,
      publication_date_from: from,
      publication_date_to: to,
      result_limit_per_term: resultLimit,
      requests,
    },
    data_status: "snapshot",
    candidate_count: documents.length,
    documents,
    review_gate: {
      status: "pending",
      rule:
        "Search matches are discovery candidates only. Human review must distinguish binding measures, ministry positions, policy explanations and unrelated supply-chain documents before event-ledger entry.",
    },
  };
}

export function validateSnapshot(snapshot) {
  const errors = [];
  const blocked = snapshot.data_status === "blocked";
  if (snapshot.schema_version !== "0.1") errors.push("unsupported schema_version");
  if (snapshot.source?.source_id !== "cn_state_council_policy_search") {
    errors.push("unexpected source_id");
  }
  if (!["snapshot", "blocked"].includes(snapshot.data_status)) {
    errors.push("data_status must be snapshot or blocked");
  }
  if (snapshot.review_gate?.status !== "pending") {
    errors.push("new snapshots must remain pending human review");
  }
  if (!Array.isArray(snapshot.documents)) errors.push("documents must be an array");
  if (snapshot.candidate_count !== snapshot.documents?.length) {
    errors.push("candidate_count must match documents length");
  }
  if (blocked) {
    if (!snapshot.access_issue) errors.push("blocked snapshots must explain access_issue");
    if (snapshot.documents?.length !== 0) errors.push("blocked snapshots must not contain documents");
  }

  const seen = new Set();
  for (const document of snapshot.documents ?? []) {
    for (const field of [
      "record_id",
      "title",
      "publication_date",
      "official_url",
      "record_status",
      "legal_verification_status",
    ]) {
      if (!document[field]) errors.push(`${document.record_id ?? "unknown"}: missing ${field}`);
    }
    if (seen.has(document.record_id)) errors.push(`duplicate record_id: ${document.record_id}`);
    seen.add(document.record_id);
    if (document.record_status !== "discovery_candidate") {
      errors.push(`${document.record_id}: record_status must be discovery_candidate`);
    }
    if (!officialHostname(document.official_url)) {
      errors.push(`${document.record_id}: official_url must use an approved government domain`);
    }
    if (!Array.isArray(document.matched_terms) || document.matched_terms.length === 0) {
      errors.push(`${document.record_id}: matched_terms must not be empty`);
    }
  }
  return errors;
}

async function main() {
  const to = isoDate(argument("--to") ?? new Date());
  const from = isoDate(argument("--from") ?? daysBefore(to, 29));
  const output = argument("--output");
  const snapshot = await collectCnGovPolicy({ from, to });
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
