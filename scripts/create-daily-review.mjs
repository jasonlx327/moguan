import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

function shanghaiDate(value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

const reviewDate = option("--date") ?? shanghaiDate();
const checkedAt = option("--checked-at") ?? new Date().toISOString();
const outputOption =
  option("--output") ?? `forecast-ledger/daily-reviews/${reviewDate}.json`;
const dryRun = process.argv.includes("--dry-run");

if (!/^\d{4}-\d{2}-\d{2}$/.test(reviewDate)) {
  throw new Error("--date must use YYYY-MM-DD");
}
if (Number.isNaN(Date.parse(checkedAt))) {
  throw new Error("--checked-at must be a valid ISO timestamp");
}

const ledgerPath = path.join(root, "forecast-ledger/forecasts/2026-07-23.json");
const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
const validationDirectory = path.join(root, "forecast-ledger/validations");
const validationFiles = fs
  .readdirSync(validationDirectory)
  .filter((name) => name.endsWith(".current.json"))
  .sort();
const validations = validationFiles.map((name) => ({
  name,
  path: path.join(validationDirectory, name),
  record: JSON.parse(fs.readFileSync(path.join(validationDirectory, name), "utf8")),
}));
const validationByForecast = new Map(
  validations.map((item) => [item.record.forecast_id, item]),
);

const missing = (ledger.forecasts ?? [])
  .filter((forecast) => !validationByForecast.has(forecast.forecast_id))
  .map((forecast) => forecast.forecast_id);
if (missing.length) {
  throw new Error(`missing current validation: ${missing.join(", ")}`);
}

const reviews = ledger.forecasts.map((forecast) => {
  const validationFile = validationByForecast.get(forecast.forecast_id);
  const validation = validationFile.record;
  const feedback = validation.decision_feedback;
  const outcome =
    feedback.status === "revised"
      ? "publish_new_version"
      : feedback.status === "supported"
        ? "maintain_supported"
        : feedback.status === "weakening"
          ? "maintain_but_weakening"
          : "maintain_without_new_evidence";
  return {
    forecast_id: forecast.forecast_id,
    event_id: forecast.event_id,
    target: forecast.target,
    original_issued_at: forecast.issued_at,
    original_conclusion: {
      supported_scenario_id: validation.original_conclusion.supported_scenario_id,
      label: validation.original_conclusion.label,
      immutable: true,
    },
    current_feedback: {
      status: feedback.status,
      label: feedback.label,
      headline: feedback.current_headline,
      latest_change: feedback.latest_change,
      conclusion_action: feedback.conclusion_action,
      source_latest_available_date:
        feedback.source_latest_available_date ??
        validation.source_latest_available_date ??
        null,
    },
    stage_feedback: validation.stage_feedback ?? {
      facts: {
        status: feedback.status === "awaiting_new_evidence" ? "无新增正式事实" : "已有新增正式事实",
        statement: feedback.latest_change,
      },
      structure: {
        status: "保留原分析结构",
        statement: "当日复盘不自动改写知识库映射；如结构改变，必须发布新的分析版本。",
      },
      forecast: {
        status: validation.original_conclusion.label,
        statement: "原始推演永久保留；当日复盘只记录支持、削弱或改版动作。",
      },
      validation: {
        status: feedback.label,
        statement: feedback.latest_change,
      },
    },
    review_outcome: outcome,
    next_action:
      outcome === "publish_new_version"
        ? "新增推演版本并保留原始版本；不得回写原始结论。"
        : "继续按既定来源节奏检查；没有新证据时不得声称结论获得支持。",
    frozen_inputs: {
      current_validation_file: `forecast-ledger/validations/${validationFile.name}`,
      current_validation_sha256: sha256(validationFile.path),
    },
  };
});

const review = {
  schema_version: "0.1",
  review_id: `DAILY-REVIEW-${reviewDate}`,
  review_date: reviewDate,
  checked_at: checkedAt,
  timezone: "Asia/Shanghai",
  mode: "immutable_daily_snapshot",
  source_ledger: "forecast-ledger/forecasts/2026-07-23.json",
  source_ledger_sha256: sha256(ledgerPath),
  policy: {
    original_forecasts_are_immutable: true,
    no_new_evidence_is_not_support: true,
    revised_direction_requires_new_version: true,
  },
  reviews,
};

const json = `${JSON.stringify(review, null, 2)}\n`;
if (!dryRun) {
  const outputPath = path.resolve(root, outputOption);
  if (fs.existsSync(outputPath)) {
    throw new Error(`daily review already exists and will not be overwritten: ${outputPath}`);
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, json, { flag: "wx" });
  console.error(`created immutable daily review: ${outputPath}`);
}
process.stdout.write(json);
