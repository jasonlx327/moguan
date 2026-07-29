import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const validation = JSON.parse(
  fs.readFileSync(
    "forecast-ledger/validations/FORECAST-2026-07-23-04.current.json",
    "utf8",
  ),
);

test("Hormuz daily validation preserves the original forecast and reports stage feedback", () => {
  assert.equal(validation.original_conclusion.immutable, true);
  assert.equal(
    validation.original_conclusion.supported_scenario_id,
    "SCENARIO-2026-07-23-04-B",
  );
  assert.equal(validation.contract.baseline_valid_days, 30);
  assert.equal(validation.progress.forecast_days_total, 15);
  assert.equal(validation.progress.valid_days, 0);
  assert.equal(validation.current_support, "awaiting_data");
  assert.equal(validation.settlement_state, "watching");
  assert.equal(validation.decision_feedback.status, "awaiting_new_evidence");
  assert.equal(validation.decision_feedback.label, "尚无新证据");
  assert.equal(validation.decision_feedback.conclusion_action, "maintain_original");
  assert.deepEqual(
    Object.keys(validation.stage_feedback),
    ["facts", "structure", "forecast", "validation"],
  );
  assert.equal(validation.stage_feedback.facts.status, "通行明显走弱");
  assert.equal(validation.stage_feedback.forecast.status, "倾向断续低位");
  assert.equal(validation.stage_feedback.validation.status, "等待首个验证日");
  assert.doesNotMatch(JSON.stringify(validation), /confidence|置信/);
});
