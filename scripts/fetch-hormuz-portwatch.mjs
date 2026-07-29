import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const endpoint =
  "https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/" +
  "Daily_Chokepoints_Data/FeatureServer/0/query";
const portId = "chokepoint6";
const outputArgIndex = process.argv.indexOf("--output");

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function normalizeRow(row) {
  return {
    date: row.date,
    total_transits: row.n_total,
    tanker: row.n_tanker,
    cargo_total: row.n_cargo,
    container: row.n_container,
    dry_bulk: row.n_dry_bulk,
    general_cargo: row.n_general_cargo,
    roro: row.n_roro,
    estimated_capacity_tonnes: row.capacity,
  };
}

async function query(where, recordCount = 2000, orderByFields = "date ASC") {
  const params = new URLSearchParams({
    where,
    outFields:
      "date,portid,portname,n_container,n_dry_bulk,n_general_cargo,n_roro," +
      "n_tanker,n_cargo,n_total,capacity",
    returnGeometry: "false",
    orderByFields,
    resultRecordCount: String(recordCount),
    f: "json",
  });
  const response = await fetch(`${endpoint}?${params}`);
  if (!response.ok) throw new Error(`PortWatch request failed: ${response.status}`);
  const payload = await response.json();
  if (payload.error) throw new Error(`PortWatch error: ${JSON.stringify(payload.error)}`);
  return payload.features.map((feature) => feature.attributes);
}

const preCrisis = await query(
  `portid='${portId}' AND date >= DATE '2025-02-28' AND date <= DATE '2026-02-27'`,
);
const history30 = (
  await query(`portid='${portId}'`, 30, "date DESC")
).reverse();
const latestDate = history30.at(-1)?.date;

if (!latestDate || history30.length !== 30 || preCrisis.length !== 365) {
  throw new Error(
    `Incomplete PortWatch response: history30=${history30.length}, ` +
      `preCrisis=${preCrisis.length}`,
  );
}

const normalizedHistory30 = history30.map(normalizeRow);
const latestDaily = normalizedHistory30.at(-1);
const baseline30Median = median(history30.map((row) => row.n_total));
const baseline30Mean =
  history30.reduce((sum, row) => sum + row.n_total, 0) / history30.length;
const first7Median = median(history30.slice(0, 7).map((row) => row.n_total));
const last7Median = median(history30.slice(-7).map((row) => row.n_total));
const firstToLast7ChangePct = round(
  ((last7Median - first7Median) / first7Median) * 100,
);
const preCrisisMedian = median(preCrisis.map((row) => row.n_total));
const preCrisisMean =
  preCrisis.reduce((sum, row) => sum + row.n_total, 0) / preCrisis.length;
const collectedAt = new Date();
const sourceDate = new Date(`${latestDate}T00:00:00Z`);
const observedLagDays = Math.max(
  0,
  Math.floor((collectedAt.getTime() - sourceDate.getTime()) / 86_400_000),
);

const snapshot = {
  schema_version: "0.1",
  snapshot_id: `HORMUZ-PORTWATCH-${latestDate}`,
  collected_at: collectedAt.toISOString(),
  source: {
    source_id: "SRC-20260723-IMF-PORTWATCH-HORMUZ",
    publisher: "IMF PortWatch",
    port_id: portId,
    endpoint,
    attribution: "Source: IMF PortWatch; underlying vessel data: UN Global Platform.",
  },
  latest_available_date: latestDate,
  observed_lag_days: observedLagDays,
  data_status: "official_derived_daily_snapshot",
  baselines: {
    baseline_30d: {
      start: history30[0].date,
      end: history30.at(-1).date,
      days: history30.length,
      median_total_transits: baseline30Median,
      mean_total_transits: round(baseline30Mean),
      first_7d_median: first7Median,
      last_7d_median: last7Median,
      first_to_last_7d_change_pct: firstToLast7ChangePct,
    },
    pre_crisis: {
      start: preCrisis[0].date,
      end: preCrisis.at(-1).date,
      days: preCrisis.length,
      median_total_transits: preCrisisMedian,
      mean_total_transits: round(preCrisisMean),
    },
  },
  latest_daily: latestDaily,
  history_30d: normalizedHistory30,
  derived_reading: {
    latest_vs_30d_median_pct: round(
      ((latestDaily.total_transits - baseline30Median) / baseline30Median) * 100,
    ),
    baseline_30d_vs_pre_crisis_median_pct: round(
      (baseline30Median / preCrisisMedian) * 100,
    ),
    summary:
      `最新日过境量为${latestDaily.total_transits}艘，过去30日中位数为${baseline30Median}艘；` +
      `最近7日中位数较最早7日变化${firstToLast7ChangePct}%，` +
      `过去30日中位数为战前一年中位数的${round((baseline30Median / preCrisisMedian) * 100)}%。`,
  },
  caveats: [
    "PortWatch is an AIS-derived estimate and can be revised when source coverage or methodology changes.",
    "A daily transit count does not establish uninterrupted safe passage for every vessel.",
    "Official security and navigational warnings must be reviewed separately.",
  ],
};

const json = `${JSON.stringify(snapshot, null, 2)}\n`;
if (outputArgIndex !== -1) {
  const outputPath = process.argv[outputArgIndex + 1];
  if (!outputPath) throw new Error("--output requires a file path");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, json);
}
process.stdout.write(json);
