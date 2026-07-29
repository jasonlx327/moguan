import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dateIndex = process.argv.indexOf("--date");
const validDate = dateIndex === -1 ? "2026-07-22" : process.argv[dateIndex + 1];

if (!validDate || !/^\d{4}-\d{2}-\d{2}$/.test(validDate)) {
  throw new Error("--date must use YYYY-MM-DD");
}

const layer = "VIIRS_NOAA20_CorrectedReflectance_TrueColor";
const tileMatrixSet = "250m";
const width = 1024;
const height = 512;
const sourceRoot = "https://gibs.earthdata.nasa.gov";
const domainUrl =
  `${sourceRoot}/wmts/epsg4326/best/1.0.0/${layer}/default/` +
  `${tileMatrixSet}/all/${validDate}--${validDate}.xml`;
const query = new URLSearchParams({
  SERVICE: "WMS",
  REQUEST: "GetMap",
  VERSION: "1.1.1",
  LAYERS: layer,
  STYLES: "",
  FORMAT: "image/jpeg",
  SRS: "EPSG:4326",
  BBOX: "-180,-90,180,90",
  WIDTH: String(width),
  HEIGHT: String(height),
  TIME: validDate,
});
const imageUrl =
  `${sourceRoot}/wms/epsg4326/best/wms.cgi?${query.toString()}`;
const imageName = `viirs-noaa20-truecolor.${validDate}.jpg`;
const imageDirectory = path.join(root, "public", "weather");
const dataDirectory = path.join(root, "weather-data");
const imagePath = path.join(imageDirectory, imageName);
const snapshotPath = path.join(dataDirectory, `snapshot.${validDate}.json`);
const currentPath = path.join(dataDirectory, "current.json");
fs.mkdirSync(imageDirectory, { recursive: true });
fs.mkdirSync(dataDirectory, { recursive: true });

if (fs.existsSync(snapshotPath) || fs.existsSync(imagePath)) {
  if (!fs.existsSync(snapshotPath) || !fs.existsSync(imagePath)) {
    throw new Error(`incomplete immutable weather snapshot for ${validDate}`);
  }
  const existing = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
  const existingImage = fs.readFileSync(imagePath);
  const existingHash = crypto.createHash("sha256").update(existingImage).digest("hex");
  if (
    existing.valid_time !== validDate ||
    existing.image?.sha256 !== existingHash ||
    existing.image?.bytes !== existingImage.length
  ) {
    throw new Error(`immutable weather snapshot integrity failure for ${validDate}`);
  }
  fs.writeFileSync(currentPath, `${JSON.stringify(existing, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        snapshot_id: existing.snapshot_id,
        valid_time: validDate,
        snapshot_path: path.relative(root, snapshotPath),
        current_path: path.relative(root, currentPath),
        sha256: existingHash,
        bytes: existingImage.length,
        reused: true,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const domainResponse = await fetch(domainUrl, {
  headers: { "user-agent": "MoguanWeatherSnapshot/0.1" },
});
if (!domainResponse.ok) {
  throw new Error(`GIBS date-domain request failed: ${domainResponse.status}`);
}
const domainXml = await domainResponse.text();
if (
  !domainXml.includes(`<Domain>${validDate}</Domain>`) &&
  !domainXml.includes(`<Domain>${validDate}/${validDate}/P1D</Domain>`)
) {
  throw new Error(`GIBS does not report imagery for ${validDate}`);
}

const imageResponse = await fetch(imageUrl, {
  headers: { "user-agent": "MoguanWeatherSnapshot/0.1" },
});
if (!imageResponse.ok) {
  throw new Error(`GIBS image request failed: ${imageResponse.status}`);
}
const contentType = imageResponse.headers.get("content-type") ?? "";
if (!contentType.startsWith("image/jpeg")) {
  throw new Error(`unexpected GIBS response type: ${contentType}`);
}
const image = Buffer.from(await imageResponse.arrayBuffer());
if (image.length < 10_000 || image[0] !== 0xff || image[1] !== 0xd8) {
  throw new Error("GIBS image failed JPEG integrity checks");
}

const collectedAt = new Date().toISOString();
fs.writeFileSync(imagePath, image);

const snapshot = {
  schema_version: "0.1",
  snapshot_id: `WEATHER-VIIRS-NOAA20-${validDate}`,
  record_type: "weather",
  title: "全球卫星云况",
  variable: "satellite_true_color_cloud_scene",
  unit: "unitless_visible_reflectance_display",
  valid_time: validDate,
  run_time: null,
  collected_at: collectedAt,
  timezone: "UTC",
  data_kind: "observation_daily_composite",
  data_status: "snapshot",
  spatial_resolution: {
    native_layer: "250 m tile matrix set",
    display_export: `${width} × ${height} global EPSG:4326`,
    display_degrees_per_pixel: 0.3515625,
  },
  temporal_resolution: "P1D",
  coverage: "global daily composite",
  source_id: "NASA-GIBS-VIIRS-NOAA20-TRUECOLOR",
  source: {
    publisher: "NASA Earthdata Global Imagery Browse Services",
    instrument: "VIIRS",
    platform: "NOAA-20",
    layer,
    service: "OGC WMS 1.1.1",
    request_url: imageUrl,
    date_domain_url: domainUrl,
    documentation_url: "https://nasa-gibs.github.io/gibs-api-docs/access-basics/",
    attribution: "NASA EOSDIS GIBS / Worldview; VIIRS aboard NOAA-20",
  },
  image: {
    public_path: `/weather/${imageName}`,
    width,
    height,
    format: "image/jpeg",
    sha256: crypto.createHash("sha256").update(image).digest("hex"),
    bytes: image.length,
  },
  interpretation: {
    display_name: "卫星云况（真彩色观测）",
    meaning: "白色云系可用于直观看到当日全球云况与天气系统形态。",
    direct_event_impact: "未发现可仅凭本图直接归因于首页三项事件的天气影响。",
  },
  quality_note:
    "这是白天可见光真彩色每日合成，不是定量云量产品；云、积雪与高反射地表可能混淆，轨道拼接和无日照区域可能存在缺口。",
  review_status: "source_reviewed",
  version: "0.1",
};
fs.writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
fs.writeFileSync(currentPath, `${JSON.stringify(snapshot, null, 2)}\n`);

console.log(
  JSON.stringify(
    {
      snapshot_id: snapshot.snapshot_id,
      valid_time: validDate,
      image_path: path.relative(root, imagePath),
      snapshot_path: path.relative(root, snapshotPath),
      current_path: path.relative(root, currentPath),
      sha256: snapshot.image.sha256,
      bytes: snapshot.image.bytes,
      reused: false,
    },
    null,
    2,
  ),
);
