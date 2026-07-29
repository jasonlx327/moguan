import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ledger = JSON.parse(
  fs.readFileSync(
    path.join(root, "forecast-ledger/forecasts/2026-07-23.json"),
    "utf8",
  ),
);
const validationDirectory = path.join(root, "forecast-ledger/validations");
const validations = fs.readdirSync(validationDirectory)
  .filter((name) => name.endsWith(".current.json"))
  .map((name) => JSON.parse(
    fs.readFileSync(path.join(validationDirectory, name), "utf8"),
  ));

const errors = [];
const validationsByForecast = new Map(
  validations.map((validation) => [validation.forecast_id, validation]),
);
const allowedStatuses = new Set([
  "awaiting_new_evidence",
  "supported",
  "weakening",
  "revised",
]);

for (const forecast of ledger.forecasts ?? []) {
  const validation = validationsByForecast.get(forecast.forecast_id);
  if (!validation) {
    errors.push(`${forecast.forecast_id}: missing current validation`);
    continue;
  }
  const scenarioIds = new Set(
    (forecast.scenarios ?? []).map((scenario) => scenario.scenario_id),
  );
  if (!validation.original_conclusion?.immutable) {
    errors.push(`${forecast.forecast_id}: original conclusion is not immutable`);
  }
  if (!scenarioIds.has(validation.original_conclusion?.supported_scenario_id)) {
    errors.push(`${forecast.forecast_id}: validation points to an unknown scenario`);
  }
  if (
    validation.original_conclusion?.supported_scenario_id !==
    forecast.current_direction?.supported_scenario_id
  ) {
    errors.push(`${forecast.forecast_id}: original conclusion differs from forecast direction`);
  }
  const feedback = validation.decision_feedback;
  if (
    !feedback?.label ||
    !feedback?.original_headline ||
    !feedback?.current_headline ||
    !feedback?.latest_change ||
    !feedback?.checked_at ||
    !feedback?.source_cadence
  ) {
    errors.push(`${forecast.forecast_id}: incomplete decision feedback`);
  }
  if (!allowedStatuses.has(feedback?.status)) {
    errors.push(`${forecast.forecast_id}: invalid decision feedback status`);
  }
  if (
    feedback?.conclusion_action === "maintain_original" &&
    feedback.current_headline !== feedback.original_headline
  ) {
    errors.push(`${forecast.forecast_id}: maintained conclusion changed its headline`);
  }
  if (
    feedback?.conclusion_action === "publish_new_version" &&
    feedback.status !== "revised"
  ) {
    errors.push(`${forecast.forecast_id}: new version requires revised status`);
  }
  if (Number.isNaN(Date.parse(feedback?.checked_at))) {
    errors.push(`${forecast.forecast_id}: invalid feedback timestamp`);
  }
  if (/confidence|置信度|probability/i.test(JSON.stringify(validation))) {
    errors.push(`${forecast.forecast_id}: validation contains confidence language`);
  }
}

for (const validation of validations) {
  if (!(ledger.forecasts ?? []).some(
    (forecast) => forecast.forecast_id === validation.forecast_id,
  )) {
    errors.push(`${validation.forecast_id}: validation has no forecast`);
  }
}

console.log(JSON.stringify({
  forecasts: ledger.forecasts?.length ?? 0,
  validations: validations.length,
  awaiting_new_evidence: validations.filter(
    (item) => item.decision_feedback?.status === "awaiting_new_evidence",
  ).length,
  revised: validations.filter(
    (item) => item.decision_feedback?.status === "revised",
  ).length,
}, null, 2));

if (errors.length) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log("current validation records passed");
