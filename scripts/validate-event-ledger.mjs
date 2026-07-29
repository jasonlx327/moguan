import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const weights = {
  public_impact: 30,
  change_intensity: 25,
  evidence_completeness: 25,
  continued_observation_value: 15,
  freshness: 5,
};
const forbiddenScoreFields = new Set([
  "classical_fit",
  "astrological_fit",
  "visual_impact",
  "social_heat",
]);
const validPools = new Set(["天地", "生民", "天下", "流通"]);
const validDecisions = new Set(["pending", "selected", "rejected"]);
const validClaimStatuses = new Set(["unverified", "confirmed", "disputed", "retracted"]);
const validReviewStatuses = new Set(["pending", "approved", "rejected", "revision_required"]);
const validLedgerStatuses = new Set(["collecting", "verifying", "review_ready", "published", "archived"]);
const validDataStatuses = new Set(["live", "delayed", "snapshot", "demo", "missing"]);
const allowedSourceKeys = new Set([
  "source_record_id",
  "publisher_id",
  "source_type",
  "primary_or_secondary",
  "title_or_paraphrase",
  "url",
  "published_at",
  "accessed_at",
  "language",
  "evidence_chain_id",
  "license_note",
  "reliability_note",
  "document_id",
  "archived_copy",
]);

export function calculateTotal(score) {
  return Math.round(
    Object.entries(weights).reduce((total, [field, weight]) => total + (score[field] / 5) * weight, 0),
  );
}

function uniqueIndex(records, key, label, errors) {
  const result = new Map();
  for (const record of records) {
    if (!record[key]) errors.push(`${label}: missing ${key}`);
    else if (result.has(record[key])) errors.push(`${label}: duplicate ${record[key]}`);
    else result.set(record[key], record);
  }
  return result;
}

export function validateLedger(ledger, { publish = false } = {}) {
  const errors = [];
  if (ledger.schema_version !== "0.1") errors.push("unsupported schema_version");
  if (!validLedgerStatuses.has(ledger.status)) errors.push(`invalid ledger status: ${ledger.status}`);
  if (ledger.selection?.target_count !== 3) errors.push("selection.target_count must equal 3");

  const sources = ledger.source_records ?? [];
  const candidates = ledger.candidates ?? [];
  const sourceById = uniqueIndex(sources, "source_record_id", "source_records", errors);
  const candidateById = uniqueIndex(candidates, "event_id", "candidates", errors);

  for (const source of sources) {
    for (const key of Object.keys(source)) {
      if (!allowedSourceKeys.has(key)) errors.push(`${source.source_record_id}: unsupported source field ${key}`);
    }
    for (const field of ["publisher_id", "source_type", "primary_or_secondary", "title_or_paraphrase", "url", "accessed_at", "evidence_chain_id"]) {
      if (!source[field]) errors.push(`${source.source_record_id}: missing ${field}`);
    }
  }

  for (const candidate of candidates) {
    const prefix = candidate.event_id ?? "<unknown event>";
    if (candidate.record_type !== "event") errors.push(`${prefix}: record_type must be event`);
    if (!validPools.has(candidate.event_pool)) errors.push(`${prefix}: invalid event_pool`);
    if (!validDecisions.has(candidate.decision)) errors.push(`${prefix}: invalid decision`);
    if (!validReviewStatuses.has(candidate.review_status)) errors.push(`${prefix}: invalid review_status`);
    if (!validDataStatuses.has(candidate.data_status)) errors.push(`${prefix}: invalid data_status`);
    if (!["unreviewed", "source_reviewed", "fact_checked"].includes(candidate.evidence_status)) {
      errors.push(`${prefix}: invalid evidence_status`);
    }

    for (const field of ["headline", "summary", "observed_at", "start_time", "latest_change_time", "collected_at", "cutoff_at", "timezone", "version", "locations", "actors", "claims", "unknowns", "next_signals", "observation_window", "decision_reason"]) {
      const value = candidate[field];
      if (
        value === undefined
        || value === null
        || (typeof value === "string" && value.trim() === "")
        || (Array.isArray(value) && value.length === 0)
      ) {
        errors.push(`${prefix}: empty ${field}`);
      }
    }
    if (candidate.cutoff_at !== ledger.cutoff_at) errors.push(`${prefix}: cutoff_at must match ledger cutoff_at`);
    if (candidate.timezone !== ledger.timezone) errors.push(`${prefix}: timezone must match ledger timezone`);

    const referencedSourceIds = new Set([
      ...(candidate.discovery_source_record_ids ?? []),
      ...(candidate.verification_source_record_ids ?? []),
    ]);
    for (const sourceId of referencedSourceIds) {
      if (!sourceById.has(sourceId)) errors.push(`${prefix}: unknown source ${sourceId}`);
    }

    for (const claim of candidate.claims ?? []) {
      if (!claim.claim_id || !claim.text) errors.push(`${prefix}: claim missing id or text`);
      if (!validClaimStatuses.has(claim.status)) errors.push(`${prefix}/${claim.claim_id}: invalid claim status`);
      for (const sourceId of [...(claim.supporting_source_record_ids ?? []), ...(claim.contradicting_source_record_ids ?? [])]) {
        if (!sourceById.has(sourceId)) errors.push(`${prefix}/${claim.claim_id}: unknown source ${sourceId}`);
      }
      if (claim.status === "confirmed" && (claim.supporting_source_record_ids ?? []).length === 0) {
        errors.push(`${prefix}/${claim.claim_id}: confirmed claim has no supporting source`);
      }
    }

    const score = candidate.score ?? {};
    for (const field of forbiddenScoreFields) {
      if (field in score) errors.push(`${prefix}: forbidden score field ${field}`);
    }
    for (const field of Object.keys(weights)) {
      if (!Number.isInteger(score[field]) || score[field] < 0 || score[field] > 5) {
        errors.push(`${prefix}: ${field} must be an integer from 0 to 5`);
      }
    }
    if (Object.keys(weights).every((field) => Number.isInteger(score[field]))) {
      const expectedTotal = calculateTotal(score);
      if (score.total !== expectedTotal) errors.push(`${prefix}: score.total must equal ${expectedTotal}`);
    }

    if (candidate.decision === "selected") {
      const verificationSources = (candidate.verification_source_record_ids ?? [])
        .map((sourceId) => sourceById.get(sourceId))
        .filter(Boolean);
      const evidenceChains = new Set(verificationSources.map((source) => source.evidence_chain_id));
      if (verificationSources.length < 2 || evidenceChains.size < 2) {
        errors.push(`${prefix}: selected event requires at least two independent verification chains`);
      }
      if (candidate.review_status !== "approved") errors.push(`${prefix}: selected event must be human approved`);
      if (candidate.data_status !== "snapshot") errors.push(`${prefix}: selected event data_status must be snapshot`);
    }
  }

  const selectedIds = ledger.selection?.selected_event_ids ?? [];
  const selectedByDecision = candidates.filter((candidate) => candidate.decision === "selected").map((candidate) => candidate.event_id);
  for (const eventId of selectedIds) {
    if (!candidateById.has(eventId)) errors.push(`selection: unknown event ${eventId}`);
  }
  if (JSON.stringify([...selectedIds].sort()) !== JSON.stringify([...selectedByDecision].sort())) {
    errors.push("selection.selected_event_ids must match candidates marked selected");
  }

  if (publish) {
    if (candidates.length < 10) errors.push("publish gate: at least 10 candidates required");
    if (candidates.some((candidate) => candidate.decision === "pending")) errors.push("publish gate: pending candidate remains");
    if (selectedIds.length !== 3) errors.push("publish gate: exactly 3 selected events required");
    if (ledger.status !== "published") errors.push("publish gate: ledger status must be published");
    if (ledger.data_status !== "snapshot") errors.push("publish gate: data_status must be snapshot");
    for (const field of ["cutoff_at", "collected_at"]) {
      if (!ledger[field]) errors.push(`publish gate: missing ${field}`);
    }
    for (const field of ["reviewer", "reviewed_at", "publication_version", "selection_note"]) {
      if (!ledger.selection?.[field]) errors.push(`publish gate: missing selection.${field}`);
    }
  }

  return errors;
}

function main() {
  const args = process.argv.slice(2);
  const publish = args.includes("--publish");
  const fileArg = args.find((arg) => arg !== "--publish");
  if (!fileArg) {
    console.error("Usage: node scripts/validate-event-ledger.mjs <ledger.json> [--publish]");
    process.exit(2);
  }
  const filePath = path.resolve(process.cwd(), fileArg);
  const ledger = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const errors = validateLedger(ledger, { publish });
  console.log(`ledger=${ledger.ledger_id} candidates=${ledger.candidates?.length ?? 0} selected=${ledger.selection?.selected_event_ids?.length ?? 0} mode=${publish ? "publish" : "draft"}`);
  if (errors.length) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exit(1);
  }
  console.log("event ledger validation passed");
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main();
}
