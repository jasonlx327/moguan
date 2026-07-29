import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputArgIndex = process.argv.indexOf("--output");
const outputPath =
  outputArgIndex === -1
    ? null
    : process.argv[outputArgIndex + 1];

if (outputArgIndex !== -1 && !outputPath) {
  throw new Error("--output requires a file path");
}

const current = JSON.parse(
  fs.readFileSync(path.join(root, "transit-monitor/current.json"), "utf8"),
);
const ledger = JSON.parse(
  fs.readFileSync(
    path.join(root, "forecast-ledger/forecasts/2026-07-23.json"),
    "utf8",
  ),
);
const forecast = ledger.forecasts.find(
  (item) => item.forecast_id === "FORECAST-2026-07-23-04",
);
const contract = forecast?.evaluation_contract;

if (!forecast || !contract) {
  throw new Error("Hormuz forecast or evaluation contract is missing");
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

const observations = current.history_30d.filter(
  (row) =>
    row.date >= contract.forecast_start &&
    row.date <= contract.forecast_end,
);
const values = observations.map((row) => row.total_transits);
const observedMedian = median(values);
const daysAboveBaseline = values.filter(
  (value) => value > contract.baseline_median,
).length;
const lowDays = values.filter((value) => value <= contract.low_day_max).length;
const validDays = observations.length;

let currentSupport = "awaiting_data";
let supportReason =
  "PortWatch最新可用日早于推演窗口，尚无发布后数据可用于验证。";

if (validDays > 0) {
  const aboveShare = daysAboveBaseline / validDays;
  const lowShare = lowDays / validDays;
  if (
    observedMedian >= contract.recovery_median_min &&
    aboveShare >=
      contract.recovery_days_above_baseline_min / 15
  ) {
    currentSupport = "supports_recovery";
    supportReason =
      "当前窗口中位数和高于基线的日期占比暂时支持持续修复情景。";
  } else if (
    observedMedian <= contract.baseline_median ||
    lowShare >= contract.low_days_min / 15
  ) {
    currentSupport = "supports_intermittent_low";
    supportReason =
      "当前窗口中位数或低通行日期占比暂时支持断续低位情景。";
  } else {
    currentSupport = "mixed";
    supportReason = "当前数据位于两个触发区间之间，暂不足以改变支持方向。";
  }
}

let settlementState = "watching";
if (validDays >= contract.minimum_valid_days) {
  if (
    observedMedian >= contract.recovery_median_min &&
    daysAboveBaseline >= contract.recovery_days_above_baseline_min
  ) {
    settlementState = "recovery_triggered";
  } else if (observedMedian <= contract.baseline_median) {
    settlementState = "intermittent_low_triggered";
  } else if (lowDays >= contract.low_days_min) {
    settlementState = "official_incident_confirmation_required";
  } else {
    settlementState = "no_scenario_triggered_yet";
  }
}

const decisionStatus =
  settlementState === "recovery_triggered"
    ? "revised"
    : currentSupport === "supports_recovery"
      ? "weakening"
      : currentSupport === "supports_intermittent_low"
        ? "supported"
        : "awaiting_new_evidence";
const decisionLabel =
  decisionStatus === "revised"
    ? "已触发改判"
    : decisionStatus === "weakening"
      ? "正在削弱"
      : decisionStatus === "supported"
        ? "继续支持"
        : "尚无新证据";

const validation = {
  schema_version: "0.1",
  validation_id: "VALIDATION-FORECAST-2026-07-23-04-CURRENT",
  forecast_id: forecast.forecast_id,
  forecast_version: forecast.analysis_version,
  original_issued_at: forecast.issued_at,
  original_conclusion: {
    supported_scenario_id: contract.original_supported_scenario_id,
    label: "未来15日延续断续低位",
    immutable: true,
  },
  contract,
  updated_at: new Date().toISOString(),
  source_snapshot_id: current.snapshot_id,
  source_latest_available_date: current.latest_available_date,
  progress: {
    valid_days: validDays,
    minimum_valid_days: contract.minimum_valid_days,
    forecast_days_total: 15,
    last_observed_date: observations.at(-1)?.date ?? null,
    observed_median: observedMedian,
    days_above_baseline: daysAboveBaseline,
    low_days: lowDays,
  },
  current_support: currentSupport,
  support_reason: supportReason,
  settlement_state: settlementState,
  decision_feedback: {
    status: decisionStatus,
    label: decisionLabel,
    original_headline: forecast.current_direction.headline,
    current_headline:
      decisionStatus === "revised"
        ? "通行进入持续修复"
        : forecast.current_direction.headline,
    latest_change: supportReason,
    conclusion_action:
      decisionStatus === "revised" ? "publish_new_version" : "maintain_original",
    checked_at: new Date().toISOString(),
    source_latest_available_date: current.latest_available_date,
    source_cadence: "每日检查IMF PortWatch；安全事件按UKMTO/JMIC与NAVAREA IX通报更新。",
  },
  stage_feedback: {
    facts: {
      label: "事实反馈",
      status:
        current.baselines.baseline_30d.first_to_last_7d_change_pct <= -20
          ? "通行明显走弱"
          : current.baselines.baseline_30d.first_to_last_7d_change_pct >= 20
            ? "通行明显改善"
            : "通行区间波动",
      statement:
        `过去30日中位数为${current.baselines.baseline_30d.median_total_transits}艘；` +
        `最近7日中位数较最早7日变化` +
        `${current.baselines.baseline_30d.first_to_last_7d_change_pct}%。`,
      basis: "IMF PortWatch过去30个有效日及战前一年参照",
      evidence: [
        `最早7日中位数${current.baselines.baseline_30d.first_7d_median}艘`,
        `最近7日中位数${current.baselines.baseline_30d.last_7d_median}艘`,
        `数据截至${current.latest_available_date}`,
      ],
    },
    structure: {
      label: "结构反馈",
      status: "关键流通功能受阻",
      statement:
        "霍尔木兹仍有船舶通过，但其能源与货物流通能力显著低于战前常态，低位反复正在延长外溢影响。",
      basis: "知识库 ANALYSIS-2026-07-23-03：聚货、交易与流通",
      boundary:
        "这是对流通功能的判断，不等于海峡正式关闭，也不代表所有船舶均无法通过。",
    },
    forecast: {
      label: "推演反馈",
      status: "倾向断续低位",
      statement:
        "基于发布时封存的过去30日状态，未来15日当前更支持“延续断续低位”，而不是“持续修复”。",
      basis:
        `${forecast.reasoning_basis.knowledge_analysis_id} + ` +
        `${contract.baseline_snapshot_id}`,
      window: `${contract.forecast_start} 至 ${contract.forecast_end}`,
      immutable_original: true,
    },
    validation: {
      label: "验证反馈",
      status:
        currentSupport === "awaiting_data"
          ? "等待首个验证日"
          : currentSupport === "supports_recovery"
            ? "新增数据支持修复"
            : currentSupport === "supports_intermittent_low"
              ? "新增数据支持断续低位"
              : "新增数据尚未形成方向",
      statement: supportReason,
      basis: "发布后PortWatch有效日及UKMTO/JMIC、NAVAREA IX事件复核",
      progress: `${validDays}/${contract.minimum_valid_days}个最低有效日`,
    },
  },
  distance_to_conditions: {
    valid_days_remaining: Math.max(
      0,
      contract.minimum_valid_days - validDays,
    ),
    recovery_median_gap:
      observedMedian === null
        ? null
        : round(contract.recovery_median_min - observedMedian),
    recovery_days_above_baseline_remaining: Math.max(
      0,
      contract.recovery_days_above_baseline_min - daysAboveBaseline,
    ),
    low_days_remaining: Math.max(
      0,
      contract.low_days_min - lowDays,
    ),
  },
  observations,
  official_incident_evidence: {
    status: "manual_review_required",
    accepted_sources: ["UKMTO/JMIC", "NAVAREA IX"],
  },
  data_note:
    `PortWatch当前数据截至${current.latest_available_date}，` +
    `观测延迟约${current.observed_lag_days}日。`,
};

const json = `${JSON.stringify(validation, null, 2)}\n`;
if (outputPath) {
  const absoluteOutput = path.resolve(root, outputPath);
  fs.mkdirSync(path.dirname(absoluteOutput), { recursive: true });
  fs.writeFileSync(absoluteOutput, json);
}
process.stdout.write(json);
