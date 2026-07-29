import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
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

function previousDate(date) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

function run(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `${script} failed: ${(result.stderr || result.stdout).trim()}`,
    );
  }
  return result.stdout.trim();
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

const operationDate = option("--date") ?? shanghaiDate();
const weatherDate = option("--weather-date") ?? previousDate(operationDate);
const refresh = process.argv.includes("--refresh");
const freeze = process.argv.includes("--freeze");

for (const [name, value] of [
  ["--date", operationDate],
  ["--weather-date", weatherDate],
]) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${name} must use YYYY-MM-DD`);
  }
}

if (refresh) {
  run("scripts/fetch-weather-snapshot.mjs", ["--date", weatherDate]);
  run("scripts/fetch-hormuz-portwatch.mjs", [
    "--output",
    "transit-monitor/current.json",
  ]);
  run("scripts/update-hormuz-validation.mjs", [
    "--output",
    "forecast-ledger/validations/FORECAST-2026-07-23-04.current.json",
  ]);
}

const weather = readJson("weather-data/current.json");
const transit = readJson("transit-monitor/current.json");
const validationDirectory = path.join(root, "forecast-ledger", "validations");
const validations = fs
  .readdirSync(validationDirectory)
  .filter((name) => name.endsWith(".current.json"))
  .sort()
  .map((name) => ({
    file: name,
    record: JSON.parse(
      fs.readFileSync(path.join(validationDirectory, name), "utf8"),
    ),
  }));
const validationChecks = validations.map(({ file, record }) => ({
  forecast_id: record.forecast_id,
  file,
  checked_at: record.decision_feedback?.checked_at ?? null,
  checked_date: record.decision_feedback?.checked_at
    ? shanghaiDate(new Date(record.decision_feedback.checked_at))
    : null,
  ready:
    record.decision_feedback?.checked_at &&
    shanghaiDate(new Date(record.decision_feedback.checked_at)) === operationDate,
}));
const reviewRelativePath = `forecast-ledger/daily-reviews/${operationDate}.json`;
const reviewPath = path.join(root, reviewRelativePath);
const reviewExists = fs.existsSync(reviewPath);
const prerequisites = {
  weather_ready: weather.valid_time === weatherDate,
  transit_available: Boolean(transit.latest_available_date),
  validations_checked_today:
    validationChecks.length === 3 &&
    validationChecks.every((item) => item.ready),
};
const canFreeze = Object.values(prerequisites).every(Boolean);
let reviewStatus = reviewExists ? "already_frozen" : "not_requested";

if (freeze && !reviewExists && canFreeze) {
  run("scripts/create-daily-review.mjs", [
    "--date",
    operationDate,
  ]);
  reviewStatus = "created";
} else if (freeze && !reviewExists && !canFreeze) {
  reviewStatus = "blocked_by_incomplete_checks";
}

run("scripts/validate-current-validations.mjs");
run("scripts/validate-weather-snapshot.mjs");
run("scripts/validate-daily-reviews.mjs");

const report = {
  schema_version: "0.1",
  operation_date: operationDate,
  timezone: "Asia/Shanghai",
  mode: refresh ? "source_refresh_and_audit" : "read_only_audit",
  requested: { refresh, freeze },
  sources: {
    weather: {
      status: prerequisites.weather_ready ? "ready" : "date_mismatch",
      valid_time: weather.valid_time,
      required_date: weatherDate,
      snapshot_id: weather.snapshot_id,
    },
    hormuz: {
      status: prerequisites.transit_available ? "ready" : "missing",
      latest_available_date: transit.latest_available_date ?? null,
      snapshot_id: transit.snapshot_id ?? null,
    },
  },
  validations: {
    status: prerequisites.validations_checked_today
      ? "checked_today"
      : "manual_checks_required",
    records: validationChecks,
  },
  review: {
    status: reviewStatus,
    path: reviewExists || reviewStatus === "created" ? reviewRelativePath : null,
    immutable: true,
  },
  can_freeze_new_review: !reviewExists && canFreeze,
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (reviewStatus === "blocked_by_incomplete_checks") process.exitCode = 2;
