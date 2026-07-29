import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(root, "celestial-data/bright-stars.v0.1.json");
const query = [
  "SELECT TOP 500 b.main_id, b.ra, b.dec, f.flux AS vmag",
  "FROM basic AS b JOIN flux AS f ON b.oid=f.oidref",
  "WHERE f.filter='V' AND f.flux < 5.2 AND b.main_id LIKE '*%'",
  "ORDER BY vmag ASC",
].join(" ");
const params = new URLSearchParams({
  request: "doQuery",
  lang: "adql",
  format: "json",
  query,
});
const endpoint =
  `https://simbad.cds.unistra.fr/simbad/sim-tap/sync?${params}`;
const response = await fetch(endpoint, {
  headers: { "user-agent": "MoguanResearch/0.1 (local source review)" },
});

if (!response.ok) {
  throw new Error(`SIMBAD query failed: ${response.status}`);
}

const result = await response.json();
const columnIndex = Object.fromEntries(
  result.metadata.map((column, index) => [column.name, index]),
);
const unique = new Map();

for (const row of result.data) {
  const id = row[columnIndex.main_id];
  const ra = row[columnIndex.ra];
  const dec = row[columnIndex.dec];
  const magnitude = row[columnIndex.vmag];
  if (
    typeof id !== "string" ||
    !Number.isFinite(ra) ||
    !Number.isFinite(dec) ||
    !Number.isFinite(magnitude)
  ) {
    continue;
  }
  const key = `${id}:${ra.toFixed(6)}:${dec.toFixed(6)}`;
  const previous = unique.get(key);
  if (!previous || magnitude < previous.magnitude) {
    unique.set(key, {
      id,
      ra_degrees: Math.round(ra * 1_000_000) / 1_000_000,
      dec_degrees: Math.round(dec * 1_000_000) / 1_000_000,
      magnitude: Math.round(magnitude * 1_000) / 1_000,
    });
  }
}

const stars = [...unique.values()]
  .sort((a, b) => a.magnitude - b.magnitude)
  .slice(0, 400);
const output = {
  schema_version: "0.1",
  catalog_id: "SIMBAD-BRIGHT-STARS-V5.2",
  coordinate_frame: "ICRS/J2000",
  magnitude_band: "V",
  magnitude_limit: 5.2,
  star_count: stars.length,
  source: {
    publisher: "CDS SIMBAD",
    endpoint: "https://simbad.cds.unistra.fr/simbad/sim-tap",
    query,
    accessed_at: new Date().toISOString(),
    data_note:
      "用于墨观夜空可视化的亮星快照；不替代完整星表或专业天体测量。",
  },
  stars,
};

fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`saved ${stars.length} stars to ${path.relative(root, outputPath)}`);
