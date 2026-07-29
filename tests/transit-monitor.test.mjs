import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const snapshot = JSON.parse(
  fs.readFileSync("transit-monitor/snapshots/2026-07-23.json", "utf8"),
);
const current = JSON.parse(
  fs.readFileSync("transit-monitor/current.json", "utf8"),
);
const baseline30Archive = JSON.parse(
  fs.readFileSync("transit-monitor/snapshots/2026-07-23-30d.json", "utf8"),
);

test("Hormuz snapshot keeps source dates and baseline arithmetic explicit", () => {
  assert.equal(snapshot.source.source_id, "SRC-20260723-IMF-PORTWATCH-HORMUZ");
  assert.equal(snapshot.latest_available_date, "2026-07-19");
  assert.equal(snapshot.baselines.recent_7d.median_total_transits, 11);
  assert.equal(snapshot.baselines.pre_crisis.median_total_transits, 88);
  assert.equal(snapshot.derived_reading.recent_median_vs_pre_crisis_median_pct, 12.5);
  assert.equal(snapshot.recent_daily.length, 7);
});

test("the UI-facing Hormuz snapshot uses a frozen 30-day forecast baseline", () => {
  assert.equal(current.snapshot_id, baseline30Archive.snapshot_id);
  assert.equal(current.latest_daily.total_transits, snapshot.latest_daily.total_transits);
  assert.equal(current.baselines.baseline_30d.days, 30);
  assert.equal(current.baselines.baseline_30d.median_total_transits, 18.5);
  assert.equal(current.baselines.baseline_30d.first_7d_median, 26);
  assert.equal(current.baselines.baseline_30d.last_7d_median, 11);
  assert.equal(current.baselines.baseline_30d.first_to_last_7d_change_pct, -57.69);
  assert.equal(current.history_30d.length, 30);
  for (const day of current.history_30d) {
    assert.equal(typeof day.total_transits, "number");
    assert.equal(typeof day.tanker, "number");
    assert.equal(typeof day.cargo_total, "number");
  }
});
