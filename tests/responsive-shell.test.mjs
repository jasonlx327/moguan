import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const css = fs.readFileSync(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);

test("mobile hero keeps the chart in normal document flow", () => {
  const mobile = css.slice(css.indexOf("@media (max-width: 620px)"));
  assert.match(mobile, /\.celestial-chart\s*\{[^}]*position:\s*relative/s);
  assert.match(mobile, /\.celestial-chart\s*\{[^}]*top:\s*auto/s);
  assert.match(mobile, /\.celestial-strip\s*\{[^}]*position:\s*relative/s);
  assert.match(mobile, /\.sky-hero\s*\{[^}]*min-height:\s*auto/s);
});

test("satellite observation is presented as a globe rather than a flat ellipse", () => {
  assert.match(css, /\.earth\s*\{[^}]*aspect-ratio:\s*1/s);
  assert.match(css, /\.earth\s*\{[^}]*background-size:\s*auto\s+165%/s);
  assert.match(css, /\.earth-panel-heading/);
});
