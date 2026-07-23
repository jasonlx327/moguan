import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { calculateTotal, validateLedger } from "../scripts/validate-event-ledger.mjs";

const ledger = JSON.parse(
  fs.readFileSync(new URL("../event-ledger/daily/2026-07-23.json", import.meta.url), "utf8"),
);

test("empty collecting ledger passes draft validation", () => {
  assert.deepEqual(validateLedger(ledger), []);
});

test("empty collecting ledger cannot pass publication gate", () => {
  const errors = validateLedger(ledger, { publish: true });
  assert.ok(errors.some((error) => error.includes("at least 10 candidates")));
  assert.ok(errors.some((error) => error.includes("exactly 3 selected events")));
});

test("score calculation follows the documented weights", () => {
  assert.equal(
    calculateTotal({
      public_impact: 5,
      change_intensity: 4,
      evidence_completeness: 3,
      continued_observation_value: 2,
      freshness: 1,
    }),
    72,
  );
});

test("a complete ledger passes the publication gate", () => {
  const sourceRecords = Array.from({ length: 20 }, (_, index) => ({
    source_record_id: `SRC-TEST-${index + 1}`,
    publisher_id: index % 2 === 0 ? "PUB-PRIMARY-A" : "PUB-MEDIA-B",
    source_type: index % 2 === 0 ? "official" : "media",
    primary_or_secondary: index % 2 === 0 ? "primary" : "secondary",
    title_or_paraphrase: `Test source ${index + 1}`,
    url: `https://example.com/source-${index + 1}`,
    published_at: "2026-07-23T01:00:00Z",
    accessed_at: "2026-07-23T07:00:00+08:00",
    language: "en",
    evidence_chain_id: `CHAIN-${index + 1}`,
    license_note: "Synthetic test record.",
    reliability_note: "Synthetic test record.",
  }));
  const candidates = Array.from({ length: 10 }, (_, index) => {
    const firstSourceId = sourceRecords[index * 2].source_record_id;
    const secondSourceId = sourceRecords[index * 2 + 1].source_record_id;
    const selected = index < 3;
    return {
      event_id: `EVENT-2026-07-23-${String(index + 1).padStart(2, "0")}`,
      record_type: "event",
      event_pool: ["天地", "生民", "天下", "流通"][index % 4],
      headline: `Neutral event ${index + 1}`,
      summary: "A synthetic summary used only to test the publication contract.",
      observed_at: "2026-07-23T00:00:00Z",
      start_time: "2026-07-22T00:00:00Z",
      latest_change_time: "2026-07-23T00:00:00Z",
      collected_at: "2026-07-23T07:30:00+08:00",
      cutoff_at: "2026-07-23T08:00:00+08:00",
      timezone: "Asia/Shanghai",
      data_status: "snapshot",
      confidence: 0.8,
      version: "test-only",
      locations: ["Test location"],
      actors: ["Test actor"],
      claims: [{
        claim_id: `CLAIM-${index + 1}`,
        text: "A synthetic confirmed claim.",
        status: "confirmed",
        supporting_source_record_ids: [firstSourceId],
        contradicting_source_record_ids: [],
      }],
      unknowns: ["Synthetic unknown"],
      next_signals: ["Synthetic next signal"],
      observation_window: { start: "2026-07-23", end: "2026-07-30" },
      discovery_source_record_ids: [firstSourceId],
      verification_source_record_ids: [firstSourceId, secondSourceId],
      score: {
        public_impact: 3,
        change_intensity: 3,
        evidence_completeness: 3,
        continued_observation_value: 3,
        freshness: 3,
        total: 60,
      },
      decision: selected ? "selected" : "rejected",
      decision_reason: selected ? "Selected for synthetic contract test." : "Rejected for synthetic contract test.",
      review_status: selected ? "approved" : "pending",
    };
  });
  const publishableLedger = {
    ...ledger,
    status: "published",
    data_status: "snapshot",
    collected_at: "2026-07-23T07:30:00+08:00",
    source_records: sourceRecords,
    candidates,
    selection: {
      target_count: 3,
      selected_event_ids: candidates.slice(0, 3).map((candidate) => candidate.event_id),
      reviewer: "test-reviewer",
      reviewed_at: "2026-07-23T07:45:00+08:00",
      publication_version: "test-only",
      selection_note: "Synthetic test selection.",
    },
  };
  assert.deepEqual(validateLedger(publishableLedger, { publish: true }), []);
});
