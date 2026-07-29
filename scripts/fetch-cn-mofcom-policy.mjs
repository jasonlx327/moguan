import { createHash } from "node:crypto";

export const mofcomHomepage = "https://www.mofcom.gov.cn/zcfb/";
export const defaultMofcomTerms = [
  "半导体",
  "芯片",
  "出口管制",
  "先进计算",
  "两用物项",
  "战略矿产",
];

function stripMarkup(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, "")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDate(value) {
  const match = String(value ?? "").match(/(\d{4})[-年](\d{1,2})[-月](\d{1,2})日?/);
  if (!match) return null;
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function documentNumber(title) {
  return title.match(/商务部(?:\s*海关总署)?公告\d{4}年第\d+号/)?.[0] ?? null;
}

export function buildMofcomAnnouncementUrl(to) {
  const year = String(to).slice(0, 4);
  if (!/^\d{4}$/.test(year)) throw new Error(`Invalid MOFCOM year: ${to}`);
  return `https://www.mofcom.gov.cn/zcfb/blgg/gg/${year}/index.html`;
}

export function parseMofcomAnnouncementList({
  html,
  listUrl,
  from,
  to,
  terms = defaultMofcomTerms,
}) {
  const records = new Map();
  const anchorPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchorPattern)) {
    const title = stripMarkup(match[2]);
    if (!title) continue;
    const matchedTerms = terms.filter((term) => title.includes(term));
    if (matchedTerms.length === 0) continue;

    const anchorStart = match.index;
    const anchorEnd = anchorStart + match[0].length;
    const contextStart = Math.max(0, anchorStart - 300);
    const contextEnd = Math.min(html.length, anchorEnd + 300);
    const context = html.slice(contextStart, contextEnd);
    const dateMatches = [...context.matchAll(/\d{4}(?:-|年)\d{1,2}(?:-|月)\d{1,2}日?/g)]
      .map((dateMatch) => ({
        date: normalizeDate(dateMatch[0]),
        distance: Math.abs(
          contextStart + dateMatch.index + dateMatch[0].length / 2
          - (anchorStart + anchorEnd) / 2,
        ),
      }))
      .filter((candidate) => candidate.date)
      .sort((a, b) => a.distance - b.distance);
    const publicationDate = dateMatches[0]?.date ?? null;
    if (!publicationDate || publicationDate < from || publicationDate > to) continue;

    let officialUrl;
    try {
      officialUrl = new URL(match[1], listUrl).href;
    } catch {
      continue;
    }
    if (new URL(officialUrl).hostname !== "www.mofcom.gov.cn") continue;
    if (!/\/zcfb\/.*\/art\/\d{4}\//.test(new URL(officialUrl).pathname)) continue;

    const number = documentNumber(title);
    records.set(number ?? officialUrl, {
      record_id: number ?? officialUrl,
      document_number: number,
      title,
      publication_date: publicationDate,
      publisher: "中华人民共和国商务部",
      summary: null,
      official_url: officialUrl,
      matched_terms: matchedTerms.sort(),
      record_status: "discovery_candidate",
      legal_verification_status: number
        ? "official_document_number_present"
        : "official_document_number_missing",
    });
  }

  return [...records.values()].sort((a, b) =>
    b.publication_date.localeCompare(a.publication_date)
    || a.record_id.localeCompare(b.record_id),
  );
}

export async function collectCnMofcomPolicy({
  from,
  to,
  terms = defaultMofcomTerms,
  fetchImpl = fetch,
  collectedAt = new Date(),
}) {
  const listUrl = buildMofcomAnnouncementUrl(to);
  const response = await fetchImpl(listUrl, {
    headers: {
      accept: "text/html,application/xhtml+xml",
    },
  });
  if (!response.ok) {
    throw new Error(`MOFCOM announcement request failed: ${response.status}`);
  }

  const html = await response.text();
  const documents = parseMofcomAnnouncementList({
    html,
    listUrl,
    from,
    to,
    terms,
  });
  const listAnchorCount = [...html.matchAll(/<a\b[^>]*href=/gi)].length;
  const topicAnchorCount = [...html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => stripMarkup(match[1]))
    .filter((title) => terms.some((term) => title.includes(term)))
    .length;
  if (listAnchorCount === 0) {
    throw new Error("MOFCOM announcement page contains no links");
  }
  if (topicAnchorCount > 0 && documents.length === 0) {
    throw new Error(
      `MOFCOM announcement page contains ${topicAnchorCount} topic links but none passed date and URL parsing`,
    );
  }

  return {
    schema_version: "0.1",
    snapshot_id: `CN-MOFCOM-ANNOUNCEMENTS-${from}-${to}`,
    collected_at: collectedAt.toISOString(),
    source: {
      source_id: "cn_mofcom_announcements",
      publisher: "中华人民共和国商务部",
      endpoint: listUrl,
      homepage: mofcomHomepage,
      open_level: "O0/O2",
      authentication: "none",
      interface_status:
        "Public official annual announcement list. HTML structure is not a documented machine contract.",
      legal_status:
        "List entries are discovery candidates. Event-ledger entry requires opening the official article and confirming issuing authority, document number, effective status and scope.",
    },
    query: {
      terms,
      publication_date_from: from,
      publication_date_to: to,
      requests: [{
        url: listUrl,
        http_status: response.status,
        content_type: response.headers.get("content-type"),
        response_bytes: Buffer.byteLength(html),
        response_sha256: createHash("sha256").update(html).digest("hex"),
        list_anchor_count: listAnchorCount,
        topic_anchor_count: topicAnchorCount,
      }],
    },
    data_status: "snapshot",
    candidate_count: documents.length,
    documents,
    review_gate: {
      status: "pending",
      rule:
        "MOFCOM list matches are discovery candidates only. Open the linked official article before event-ledger entry.",
    },
  };
}
