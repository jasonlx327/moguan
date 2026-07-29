import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ledgerPath = path.join(root, "forecast-ledger/forecasts/2026-07-23.json");
const frozenReview = JSON.parse(
  fs.readFileSync(
    path.join(root, "forecast-ledger/daily-reviews/2026-07-24.json"),
    "utf8",
  ),
);

function hash(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

test("daily review freezes all forecasts without changing the source ledger", () => {
  const before = hash(ledgerPath);
  const output = execFileSync(
    process.execPath,
    [
      "scripts/create-daily-review.mjs",
      "--date",
      "2026-07-24",
      "--checked-at",
      "2026-07-24T09:00:00+08:00",
      "--dry-run",
    ],
    { cwd: root, encoding: "utf8" },
  );
  const review = JSON.parse(output);
  assert.equal(review.review_date, "2026-07-24");
  assert.equal(review.mode, "immutable_daily_snapshot");
  assert.equal(review.reviews.length, 3);
  assert.ok(review.reviews.every((item) => item.original_conclusion.immutable));
  assert.ok(review.reviews.every((item) => item.frozen_inputs.current_validation_sha256.length === 64));
  assert.equal(hash(ledgerPath), before);
});

test("the first frozen review records a check without inventing support", () => {
  assert.equal(frozenReview.review_date, "2026-07-24");
  assert.equal(frozenReview.reviews.length, 3);
  assert.ok(
    frozenReview.reviews.every(
      (item) => item.review_outcome === "maintain_without_new_evidence",
    ),
  );
  assert.equal(frozenReview.policy.no_new_evidence_is_not_support, true);
  assert.deepEqual(
    new Set(frozenReview.reviews.map((item) => item.event_id)),
    new Set([
      "EVENT-2026-07-23-01",
      "EVENT-2026-07-23-03",
      "EVENT-2026-07-23-04",
    ]),
  );
});

test("daily review refuses to overwrite an existing date", () => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "moguan-review-"));
  const outputPath = path.join(temporaryDirectory, "2026-07-24.json");
  const args = [
    "scripts/create-daily-review.mjs",
    "--date",
    "2026-07-24",
    "--checked-at",
    "2026-07-24T09:00:00+08:00",
    "--output",
    outputPath,
  ];
  execFileSync(process.execPath, args, { cwd: root, encoding: "utf8" });
  const second = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8" });
  assert.notEqual(second.status, 0);
  assert.match(second.stderr, /will not be overwritten/);
});
