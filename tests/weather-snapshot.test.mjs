import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";

const snapshot = JSON.parse(
  fs.readFileSync(
    new URL("../weather-data/current.json", import.meta.url),
    "utf8",
  ),
);
const image = fs.readFileSync(
  new URL(`../public${snapshot.image.public_path}`, import.meta.url),
);

test("weather layer is a traceable daily observation snapshot", () => {
  assert.equal(snapshot.snapshot_id, "WEATHER-VIIRS-NOAA20-2026-07-23");
  assert.equal(snapshot.valid_time, "2026-07-23");
  assert.equal(snapshot.data_kind, "observation_daily_composite");
  assert.equal(snapshot.data_status, "snapshot");
  assert.equal(snapshot.source.publisher, "NASA Earthdata Global Imagery Browse Services");
  assert.equal(snapshot.source.instrument, "VIIRS");
  assert.equal(snapshot.source.platform, "NOAA-20");
  assert.match(snapshot.source.request_url, /TIME=2026-07-23/);
  assert.match(snapshot.spatial_resolution.native_layer, /250 m/);
});

test("weather image matches the frozen snapshot hash", () => {
  assert.equal(image.length, snapshot.image.bytes);
  assert.equal(
    crypto.createHash("sha256").update(image).digest("hex"),
    snapshot.image.sha256,
  );
  assert.deepEqual([...image.subarray(0, 2)], [0xff, 0xd8]);
});

test("weather copy preserves interpretation boundaries", () => {
  assert.match(snapshot.quality_note, /不是定量云量产品/);
  assert.match(snapshot.quality_note, /云、积雪与高反射地表可能混淆/);
  assert.match(snapshot.interpretation.direct_event_impact, /未发现/);
});
