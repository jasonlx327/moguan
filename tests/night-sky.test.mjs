import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { Body, Equator, Horizon, Observer } from "astronomy-engine";

const catalog = JSON.parse(
  fs.readFileSync(
    new URL("../celestial-data/bright-stars.v0.1.json", import.meta.url),
    "utf8",
  ),
);
const componentSource = fs.readFileSync(
  new URL("../app/NightSkyCanvas.tsx", import.meta.url),
  "utf8",
);
const observer = new Observer(31.2304, 121.4737, 4);
const shanghai2200 = new Date("2026-07-23T22:00:00+08:00");

test("night-sky catalog is a frozen, traceable 400-star J2000 snapshot", () => {
  assert.equal(catalog.catalog_id, "SIMBAD-BRIGHT-STARS-V5.2");
  assert.equal(catalog.coordinate_frame, "ICRS/J2000");
  assert.equal(catalog.magnitude_band, "V");
  assert.equal(catalog.magnitude_limit, 5.2);
  assert.equal(catalog.star_count, 400);
  assert.equal(catalog.stars.length, 400);
  assert.match(catalog.source.endpoint, /simbad\.cds\.unistra\.fr/);
  assert.match(catalog.source.query, /ORDER BY vmag ASC/);
  for (const star of catalog.stars) {
    assert.ok(star.ra_degrees >= 0 && star.ra_degrees < 360, `${star.id}: invalid RA`);
    assert.ok(star.dec_degrees >= -90 && star.dec_degrees <= 90, `${star.id}: invalid Dec`);
    assert.ok(star.magnitude < 5.2, `${star.id}: outside magnitude limit`);
  }
});

test("Shanghai 22:00 view derives visible stars from real horizontal coordinates", () => {
  const visible = catalog.stars
    .map((star) => ({
      star,
      horizon: Horizon(
        shanghai2200,
        observer,
        star.ra_degrees / 15,
        star.dec_degrees,
        "normal",
      ),
    }))
    .filter((item) => item.horizon.altitude >= 0);
  assert.ok(visible.length >= 100);
  assert.ok(visible.some((item) => item.star.id === "* alf Lyr"));
  assert.ok(visible.some((item) => item.star.id === "* alf Aql"));
  assert.ok(visible.some((item) => item.star.id === "* alf Cyg"));
});

test("seven luminaries have calculable Shanghai horizontal positions", () => {
  const bodies = [
    Body.Sun,
    Body.Moon,
    Body.Mercury,
    Body.Venus,
    Body.Mars,
    Body.Jupiter,
    Body.Saturn,
  ];
  for (const body of bodies) {
    const equator = Equator(body, shanghai2200, observer, true, true);
    const horizon = Horizon(shanghai2200, observer, equator.ra, equator.dec, "normal");
    assert.ok(horizon.azimuth >= 0 && horizon.azimuth <= 360);
    assert.ok(horizon.altitude >= -90 && horizon.altitude <= 90);
  }
});

test("night-sky canvas exposes drag, keyboard, hover and perspective controls", () => {
  assert.match(componentSource, /onPointerDown=/);
  assert.match(componentSource, /onPointerMove=/);
  assert.match(componentSource, /setPointerCapture/);
  assert.match(componentSource, /ArrowLeft/);
  assert.match(componentSource, /depth <= 0\.12/);
  assert.match(componentSource, /horizontal \/ depth/);
  assert.match(componentSource, /高度 .*方位/);
  assert.match(componentSource, /回到南天/);
});
