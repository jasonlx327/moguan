import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const snapshot = JSON.parse(
  fs.readFileSync(
    new URL("../celestial-data/snapshot.2026-07-23.json", import.meta.url),
    "utf8",
  ),
);

test("celestial snapshot contains a complete traceable P0 chart", () => {
  assert.equal(snapshot.snapshot_id, "CELESTIAL-2026-07-23T0800-CST");
  assert.equal(snapshot.projection.coordinate_frame, "ICRS/J2000");
  assert.equal(snapshot.seven_luminaries.length, 7);
  assert.equal(snapshot.lunar_mansions.length, 28);
  assert.equal(new Set(snapshot.lunar_mansions.map((item) => item.name)).size, 28);
  assert.equal(new Set(snapshot.lunar_mansions.map((item) => item.hip)).size, 28);
  assert.match(snapshot.provenance.planet_engine, /^astronomy-engine /);
  assert.match(snapshot.provenance.star_coordinates, /SIMBAD/);
  assert.equal(snapshot.provenance.review_state, "working_reference");

  for (const body of snapshot.seven_luminaries) {
    assert.ok(body.ra_hours >= 0 && body.ra_hours < 24, `${body.name}: invalid RA`);
    assert.ok(body.dec_degrees >= -90 && body.dec_degrees <= 90, `${body.name}: invalid Dec`);
  }
  for (const mansion of snapshot.lunar_mansions) {
    assert.ok(mansion.ra_degrees >= 0 && mansion.ra_degrees < 360, `${mansion.name}: invalid RA`);
    assert.ok(mansion.dec_degrees >= -90 && mansion.dec_degrees <= 90, `${mansion.name}: invalid Dec`);
  }
});
