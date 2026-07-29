import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const snapshotPath = path.join(root, "weather-data", "current.json");
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
const errors = [];

for (const field of [
  "snapshot_id",
  "variable",
  "unit",
  "valid_time",
  "collected_at",
  "data_kind",
  "data_status",
  "temporal_resolution",
  "coverage",
  "source_id",
  "quality_note",
  "review_status",
]) {
  if (snapshot[field] === null || snapshot[field] === undefined || snapshot[field] === "") {
    errors.push(`missing ${field}`);
  }
}
if (snapshot.data_kind !== "observation_daily_composite") {
  errors.push("weather layer is not identified as an observation composite");
}
if (snapshot.data_status !== "snapshot") {
  errors.push("weather layer must be an immutable snapshot");
}
if (snapshot.source?.publisher !== "NASA Earthdata Global Imagery Browse Services") {
  errors.push("unexpected weather publisher");
}
if (!snapshot.source?.request_url?.includes(`TIME=${snapshot.valid_time}`)) {
  errors.push("source request does not freeze the valid date");
}
if (!snapshot.source?.layer?.includes("CorrectedReflectance_TrueColor")) {
  errors.push("source layer is not the reviewed true-color layer");
}
if (!snapshot.spatial_resolution?.native_layer || !snapshot.spatial_resolution?.display_export) {
  errors.push("incomplete spatial resolution");
}
if (!snapshot.interpretation?.direct_event_impact?.includes("未发现")) {
  errors.push("weather-to-event boundary is missing");
}
if (!snapshot.quality_note.includes("不是定量云量产品")) {
  errors.push("quantitative-cloud boundary is missing");
}

const imagePath = path.join(
  root,
  "public",
  snapshot.image?.public_path?.replace(/^\//, "") ?? "",
);
if (!fs.existsSync(imagePath)) {
  errors.push("weather image is missing");
} else {
  const image = fs.readFileSync(imagePath);
  const hash = crypto.createHash("sha256").update(image).digest("hex");
  if (hash !== snapshot.image.sha256) errors.push("weather image hash mismatch");
  if (image.length !== snapshot.image.bytes) errors.push("weather image byte count mismatch");
  if (image[0] !== 0xff || image[1] !== 0xd8) errors.push("weather image is not a JPEG");
}

console.log(
  JSON.stringify(
    {
      snapshot_id: snapshot.snapshot_id,
      valid_time: snapshot.valid_time,
      data_kind: snapshot.data_kind,
      data_status: snapshot.data_status,
      source_id: snapshot.source_id,
      image_sha256: snapshot.image.sha256,
    },
    null,
    2,
  ),
);
if (errors.length) {
  errors.forEach((error) => console.error(`ERROR: ${error}`));
  process.exit(1);
}
console.log("weather snapshot validation passed");
