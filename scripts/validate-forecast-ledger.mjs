import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const forecastPath = process.argv[2] ?? "forecast-ledger/forecasts/2026-07-23.json";
const forecastLedger = JSON.parse(fs.readFileSync(path.join(root, forecastPath), "utf8"));
const eventLedger = JSON.parse(
  fs.readFileSync(path.join(root, "event-ledger/daily/2026-07-23.json"), "utf8"),
);
const interpretations = JSON.parse(
  fs.readFileSync(path.join(root, "knowledge-base/registries/interpretations.v0.1.json"), "utf8"),
).interpretations;

const errors = [];
const sourceIds = new Set(eventLedger.source_records.map((item) => item.source_record_id));
const selectedEventIds = new Set(eventLedger.selection?.selected_event_ids ?? []);
const analysisByEvent = new Map(interpretations.map((item) => [item.event_id, item]));
const forecastIds = new Set();
const scenarioIds = new Set();
const statuses = new Set(["draft", "watching", "triggered", "invalidated", "settled", "blocked", "withdrawn"]);

for (const forecast of forecastLedger.forecasts ?? []) {
  if (!forecast.forecast_id || forecastIds.has(forecast.forecast_id)) {
    errors.push(`duplicate or missing forecast_id: ${forecast.forecast_id ?? "unknown"}`);
  }
  forecastIds.add(forecast.forecast_id);
  if (!selectedEventIds.has(forecast.event_id)) errors.push(`${forecast.forecast_id}: event is not selected`);
  if (forecast.fact_version !== eventLedger.selection?.publication_version) {
    errors.push(`${forecast.forecast_id}: fact_version does not match event publication`);
  }
  const analysis = analysisByEvent.get(forecast.event_id);
  if (!analysis || analysis.published_version !== forecast.analysis_version) {
    errors.push(`${forecast.forecast_id}: analysis_version is unknown`);
  }
  const basis = forecast.reasoning_basis;
  if (!basis?.knowledge_analysis_id || !basis?.method || !basis?.boundary) {
    errors.push(`${forecast.forecast_id}: incomplete reasoning basis`);
  }
  if (analysis && basis?.knowledge_analysis_id !== analysis.analysis_id) {
    errors.push(`${forecast.forecast_id}: reasoning basis points to the wrong knowledge analysis`);
  }
  for (const passageId of basis?.knowledge_passage_ids ?? []) {
    if (!(analysis?.passage_ids ?? []).includes(passageId)) {
      errors.push(`${forecast.forecast_id}: unknown knowledge passage ${passageId}`);
    }
  }
  for (const sourceId of basis?.modern_source_ids ?? []) {
    if (!sourceIds.has(sourceId)) {
      errors.push(`${forecast.forecast_id}: unknown reasoning source ${sourceId}`);
    }
  }
  const direction = forecast.current_direction;
  if (
    !direction?.as_of ||
    !direction?.headline ||
    !direction?.current_judgment ||
    !direction?.outlook ||
    !direction?.change_condition
  ) {
    errors.push(`${forecast.forecast_id}: incomplete current direction`);
  }
  if (!(forecast.scenarios ?? []).some(
    (scenario) => scenario.scenario_id === direction?.supported_scenario_id,
  )) {
    errors.push(`${forecast.forecast_id}: current direction points to an unknown scenario`);
  }
  if (
    direction?.as_of &&
    (
      Number.isNaN(Date.parse(direction.as_of)) ||
      Date.parse(direction.as_of) > Date.parse(forecast.valid_until)
    )
  ) {
    errors.push(`${forecast.forecast_id}: invalid current direction date`);
  }
  if (!statuses.has(forecast.status)) errors.push(`${forecast.forecast_id}: invalid status`);
  if (!(Date.parse(forecast.valid_until) > Date.parse(forecast.issued_at))) {
    errors.push(`${forecast.forecast_id}: valid_until must be after issued_at`);
  }
  if (!Array.isArray(forecast.scenarios) || forecast.scenarios.length < 2) {
    errors.push(`${forecast.forecast_id}: at least two scenarios are required`);
  }
  for (const scenario of forecast.scenarios ?? []) {
    if (!scenario.scenario_id || scenarioIds.has(scenario.scenario_id)) {
      errors.push(`${forecast.forecast_id}: duplicate or missing scenario_id`);
    }
    scenarioIds.add(scenario.scenario_id);
    if (!scenario.name) {
      errors.push(`${scenario.scenario_id}: incomplete scenario identity`);
    }
    for (const field of ["supporting_signals", "trigger_conditions", "invalidation_conditions"]) {
      if (!Array.isArray(scenario[field]) || scenario[field].length === 0) {
        errors.push(`${scenario.scenario_id}: empty ${field}`);
      }
    }
    if (!scenario.settlement_rule) errors.push(`${scenario.scenario_id}: missing settlement_rule`);
  }
  if (forecast.evaluation_contract) {
    const contract = forecast.evaluation_contract;
    const totalDays =
      Math.round(
        (Date.parse(`${contract.forecast_end}T00:00:00Z`) -
          Date.parse(`${contract.forecast_start}T00:00:00Z`)) /
          86_400_000,
      ) + 1;
    if (contract.baseline_valid_days !== 30) {
      errors.push(`${forecast.forecast_id}: evaluation baseline must contain 30 valid days`);
    }
    if (totalDays !== 15) {
      errors.push(`${forecast.forecast_id}: evaluation window must contain 15 calendar days`);
    }
    if (
      contract.minimum_valid_days < 1 ||
      contract.minimum_valid_days > totalDays
    ) {
      errors.push(`${forecast.forecast_id}: invalid minimum valid days`);
    }
    if (
      !(forecast.scenarios ?? []).some(
        (scenario) =>
          scenario.scenario_id === contract.original_supported_scenario_id,
      )
    ) {
      errors.push(`${forecast.forecast_id}: original supported scenario is unknown`);
    }
  }
  for (const sourceId of forecast.settlement_source_ids ?? []) {
    if (!sourceIds.has(sourceId)) errors.push(`${forecast.forecast_id}: unknown settlement source ${sourceId}`);
  }
  if (forecast.settlement_readiness === "ready") {
    if (forecast.status === "blocked") errors.push(`${forecast.forecast_id}: ready forecast cannot be blocked`);
    if ((forecast.settlement_source_ids ?? []).length === 0) {
      errors.push(`${forecast.forecast_id}: ready forecast lacks settlement sources`);
    }
    if ((forecast.blocking_issues ?? []).length > 0) {
      errors.push(`${forecast.forecast_id}: ready forecast has blocking issues`);
    }
  } else if (forecast.settlement_readiness === "blocked") {
    if (forecast.status !== "blocked") errors.push(`${forecast.forecast_id}: blocked readiness requires blocked status`);
    if ((forecast.blocking_issues ?? []).length === 0) {
      errors.push(`${forecast.forecast_id}: blocked forecast lacks blocking issues`);
    }
    if (forecast.ui_publishable) errors.push(`${forecast.forecast_id}: blocked forecast cannot be UI-publishable`);
  } else {
    errors.push(`${forecast.forecast_id}: invalid settlement_readiness`);
  }
}

console.log(JSON.stringify({
  ledger_id: forecastLedger.ledger_id,
  forecasts: forecastLedger.forecasts?.length ?? 0,
  scenarios: scenarioIds.size,
  watching: forecastLedger.forecasts?.filter((item) => item.status === "watching").length ?? 0,
  blocked: forecastLedger.forecasts?.filter((item) => item.status === "blocked").length ?? 0,
}, null, 2));

if (errors.length) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log("forecast ledger validation passed");
