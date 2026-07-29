import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const eventId = "EVENT-2026-07-29-01";
const timezone = "Asia/Shanghai";
const defaultRegistryPath = path.join(root, "event-watch/entities.v0.1.json");

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function shanghaiDate(value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function stripMarkup(value) {
  return String(value ?? "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function discoverRelevantLinks({
  html,
  baseUrl,
  allowedHost,
  terms,
  knownUrls = [],
}) {
  const known = new Set(knownUrls);
  const records = new Map();
  const anchorPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchorPattern)) {
    const title = stripMarkup(match[2]);
    if (!title) continue;
    const normalizedTitle = title.toLowerCase();
    const matchedTerms = terms.filter((term) =>
      normalizedTitle.includes(term.toLowerCase()),
    );
    if (matchedTerms.length === 0) continue;

    let url;
    try {
      url = new URL(match[1], baseUrl);
    } catch {
      continue;
    }
    if (url.hostname !== allowedHost || known.has(url.href)) continue;

    records.set(url.href, {
      title,
      url: url.href,
      matched_terms: matchedTerms,
      evidence_status: "discovery_candidate",
    });
  }

  return [...records.values()].sort((a, b) => a.url.localeCompare(b.url));
}

async function fetchPage(url, fetchImpl) {
  const response = await fetchImpl(url, {
    headers: { accept: "text/html,application/xhtml+xml" },
  });
  if (!response.ok) throw new Error(`request failed: ${response.status}`);
  const html = await response.text();
  if (!/<html|<a\b|<!doctype/i.test(html)) {
    throw new Error("response does not resemble an HTML page");
  }
  return {
    html,
    diagnostics: {
      http_status: response.status,
      content_type: response.headers.get("content-type"),
      response_bytes: Buffer.byteLength(html),
      response_sha256: createHash("sha256").update(html).digest("hex"),
    },
  };
}

async function fetchFirst(urls, fetchImpl) {
  const accessIssues = [];
  for (const url of urls) {
    try {
      return {
        ...(await fetchPage(url, fetchImpl)),
        usedUrl: url,
        fallbackUsed: url !== urls[0],
        accessIssues,
      };
    } catch (error) {
      accessIssues.push({ url, ...safeError(error) });
    }
  }
  const failure = new Error("all configured public URLs failed");
  failure.accessIssues = accessIssues;
  throw failure;
}

function safeError(error) {
  return {
    error_type: error?.constructor?.name ?? "Error",
    message: String(error?.message ?? error).slice(0, 300),
  };
}

function writeImmutableJson(output, value) {
  if (fs.existsSync(output)) {
    throw new Error(`immutable watch record already exists: ${output}`);
  }
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const json = `${JSON.stringify(value, null, 2)}\n`;
  fs.writeFileSync(output, json);
  const sha256 = createHash("sha256").update(json).digest("hex");
  fs.writeFileSync(
    `${output}.sha256`,
    `${sha256}  ${path.basename(output)}\n`,
  );
  return sha256;
}

export async function runEventWatch({
  operationDate = shanghaiDate(),
  output,
  fetchImpl = fetch,
  checkedAt = new Date(),
  ledgerPath = path.join(root, "event-ledger/daily/2026-07-29.json"),
  registryPath = defaultRegistryPath,
}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(operationDate)) {
    throw new Error("operationDate must use YYYY-MM-DD");
  }
  if (!output) throw new Error("output is required");
  if (fs.existsSync(output)) {
    throw new Error(`immutable watch record already exists: ${output}`);
  }

  const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  if (registry.event_id !== eventId || !Array.isArray(registry.sources)) {
    throw new Error("event watch registry does not match the configured event");
  }
  const watchSources = registry.sources;
  const event = ledger.candidates.find((candidate) => candidate.event_id === eventId);
  if (!event) throw new Error(`event not found: ${eventId}`);
  const sourceById = new Map(
    ledger.source_records.map((source) => [source.source_record_id, source]),
  );
  const knownUrls = [
    ...ledger.source_records.map((source) => source.url),
    ...watchSources.flatMap((source) => [
      source.baseline_url,
      ...(source.fallback_baseline_urls ?? []),
    ].filter(Boolean)),
  ];
  const sourceChecks = [];
  const newCandidates = [];

  for (const config of watchSources) {
    const baseline = sourceById.get(config.source_record_id);
    const baselineUrl = baseline?.url ?? config.baseline_url;
    if (!baselineUrl) {
      throw new Error(`baseline URL not found: ${config.source_record_id}`);
    }

    const check = {
      entity_id: config.entity_id,
      official_list_name: config.official_list_name,
      source_record_id: config.source_record_id,
      publisher: config.publisher,
      baseline_url: baselineUrl,
      index_url: config.index_url,
      baseline_status: "not_checked",
      index_status: "not_checked",
    };

    try {
      const page = await fetchFirst(
        [baselineUrl, ...(config.fallback_baseline_urls ?? [])],
        fetchImpl,
      );
      const text = stripMarkup(page.html);
      const matchedMarkers = config.baseline_markers.filter((marker) =>
        text.includes(marker),
      );
      check.baseline_status = matchedMarkers.length === config.baseline_markers.length
        ? "confirmed"
        : "marker_mismatch";
      check.baseline_markers = {
        required: config.baseline_markers,
        matched: matchedMarkers,
      };
      check.baseline_request = page.diagnostics;
      check.baseline_request.used_url = page.usedUrl;
      check.baseline_request.fallback_used = page.fallbackUsed;
      if (page.accessIssues.length > 0) {
        check.baseline_request.prior_access_issues = page.accessIssues;
      }
    } catch (error) {
      check.baseline_status = "access_failed";
      check.baseline_access_issue = {
        ...safeError(error),
        attempts: error.accessIssues ?? [],
      };
    }

    try {
      const page = await fetchFirst(
        [config.index_url, ...(config.fallback_index_urls ?? [])],
        fetchImpl,
      );
      const candidates = discoverRelevantLinks({
        html: page.html,
        baseUrl: page.usedUrl,
        allowedHost: new URL(page.usedUrl).hostname,
        terms: config.discovery_terms,
        knownUrls,
      }).map((candidate) => ({
        ...candidate,
        publisher: config.publisher,
      }));
      check.index_status = "checked";
      check.index_request = page.diagnostics;
      check.index_request.used_url = page.usedUrl;
      check.index_request.fallback_used = page.fallbackUsed;
      if (page.accessIssues.length > 0) {
        check.index_request.prior_access_issues = page.accessIssues;
      }
      check.discovery_candidate_count = candidates.length;
      newCandidates.push(...candidates);
    } catch (error) {
      check.index_status = "access_failed";
      check.index_access_issue = {
        ...safeError(error),
        attempts: error.accessIssues ?? [],
      };
    }

    sourceChecks.push(check);
  }

  const checkedIndexes = sourceChecks.filter(
    (check) => check.index_status === "checked",
  ).length;
  const completedChecks = sourceChecks.flatMap((check) => [
    check.baseline_status === "confirmed",
    check.index_status === "checked",
  ]).filter(Boolean).length;
  const dataStatus = completedChecks === sourceChecks.length * 2
    ? "snapshot"
    : completedChecks === 0
      ? "blocked"
      : "partial";
  const resultStatus = newCandidates.length > 0
    ? "new_evidence_candidates"
    : checkedIndexes === sourceChecks.length
      ? "no_new_evidence"
      : "not_determined";
  const direction = resultStatus === "new_evidence_candidates"
    ? "requires_review"
    : resultStatus === "no_new_evidence"
      ? "maintained"
      : "blocked";

  const record = {
    schema_version: "0.2",
    watch_id: `WATCH-${eventId}-${operationDate}`,
    event_id: eventId,
    operation_date: operationDate,
    timezone,
    checked_at: checkedAt.toISOString(),
    base_fact_version: ledger.selection.publication_version,
    entity_registry: {
      schema_version: registry.schema_version,
      source_count: watchSources.length,
      selection_rule: registry.selection_rule,
    },
    data_status: dataStatus,
    result_status: resultStatus,
    source_checks: sourceChecks,
    new_evidence_count: newCandidates.length,
    new_evidence_candidates: newCandidates,
    conclusion: {
      direction,
      text:
        direction === "requires_review"
          ? "发现新的相关链接，必须人工核验后才能改变事实版本。"
          : direction === "maintained"
            ? "全部登记的公开索引均已检查，未发现超出当前事实版本的新相关链接。"
            : "至少一个公开索引未完成检查，不能得出暂无新增证据的结论。",
    },
    review_gate: {
      status: newCandidates.length > 0 ? "pending" : "not_required",
      rule: "候验器只发现候选证据；任何事实、解释或推演变化都必须经人工核验并发布新版本。",
    },
  };
  const sha256 = writeImmutableJson(output, record);
  return { record, output, sha256 };
}

async function main() {
  const operationDate = argument("--date") ?? shanghaiDate();
  const output = path.resolve(
    process.cwd(),
    argument("--output") ?? `event-watch/daily/${operationDate}.json`,
  );
  try {
    const result = await runEventWatch({ operationDate, output });
    console.log(
      `status=${result.record.result_status} data=${result.record.data_status} candidates=${result.record.new_evidence_count} sha256=${result.sha256}`,
    );
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (
  process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
) {
  main();
}
