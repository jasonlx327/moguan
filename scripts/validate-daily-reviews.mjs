import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ledger = JSON.parse(
  fs.readFileSync(path.join(root, "forecast-ledger/forecasts/2026-07-23.json"), "utf8"),
);
const reviewDirectory = path.join(root, "forecast-ledger/daily-reviews");
const files = fs.existsSync(reviewDirectory)
  ? fs.readdirSync(reviewDirectory).filter((name) => name.endsWith(".json")).sort()
  : [];
const errors = [];
const seenDates = new Set();
const forecastById = new Map(
  (ledger.forecasts ?? []).map((forecast) => [forecast.forecast_id, forecast]),
);

for (const file of files) {
  const review = JSON.parse(fs.readFileSync(path.join(reviewDirectory, file), "utf8"));
  if (seenDates.has(review.review_date)) errors.push(`${file}: duplicate review date`);
  seenDates.add(review.review_date);
  if (review.mode !== "immutable_daily_snapshot") errors.push(`${file}: invalid mode`);
  if (!review.policy?.original_forecasts_are_immutable) errors.push(`${file}: immutable policy missing`);
  if (!review.policy?.no_new_evidence_is_not_support) errors.push(`${file}: evidence policy missing`);
  if (!review.source_ledger_sha256?.match(/^[a-f0-9]{64}$/)) errors.push(`${file}: invalid ledger hash`);
  if ((review.reviews ?? []).length !== forecastById.size) {
    errors.push(`${file}: expected ${forecastById.size} forecast reviews`);
  }
  for (const item of review.reviews ?? []) {
    const forecast = forecastById.get(item.forecast_id);
    if (!forecast) {
      errors.push(`${file}: unknown forecast ${item.forecast_id}`);
      continue;
    }
    if (!item.original_conclusion?.immutable) {
      errors.push(`${file}: ${item.forecast_id} original is mutable`);
    }
    if (
      item.original_conclusion.supported_scenario_id !==
      forecast.current_direction.supported_scenario_id
    ) {
      errors.push(`${file}: ${item.forecast_id} original scenario changed`);
    }
    if (!item.frozen_inputs?.current_validation_sha256?.match(/^[a-f0-9]{64}$/)) {
      errors.push(`${file}: ${item.forecast_id} invalid validation hash`);
    }
    if (/confidence|置信度|probability/i.test(JSON.stringify(item))) {
      errors.push(`${file}: ${item.forecast_id} contains confidence language`);
    }
  }
}

console.log(JSON.stringify({ daily_reviews: files.length, review_dates: [...seenDates] }, null, 2));
if (errors.length) {
  errors.forEach((error) => console.error(`ERROR: ${error}`));
  process.exit(1);
}
console.log("daily review records passed");
