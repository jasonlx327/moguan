import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const frozenReviewPath = path.join(
  root,
  "forecast-ledger/daily-reviews/2026-07-24.json",
);

function hash(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

test("daily cycle audits the frozen date without overwriting it", () => {
  const before = hash(frozenReviewPath);
  const result = spawnSync(
    process.execPath,
    [
      "scripts/run-daily-cycle.mjs",
      "--date",
      "2026-07-24",
      "--weather-date",
      "2026-07-23",
      "--freeze",
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(result.status, 0);
  const report = JSON.parse(result.stdout);
  assert.equal(report.review.status, "already_frozen");
  assert.equal(report.validations.status, "checked_today");
  assert.equal(hash(frozenReviewPath), before);
});

test("daily cycle refuses to freeze before manual source checks are current", () => {
  const result = spawnSync(
    process.execPath,
    [
      "scripts/run-daily-cycle.mjs",
      "--date",
      "2026-07-25",
      "--weather-date",
      "2026-07-23",
      "--freeze",
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(result.status, 2);
  const report = JSON.parse(result.stdout);
  assert.equal(report.validations.status, "manual_checks_required");
  assert.equal(report.review.status, "blocked_by_incomplete_checks");
  assert.equal(
    fs.existsSync(
      path.join(root, "forecast-ledger/daily-reviews/2026-07-25.json"),
    ),
    false,
  );
});
