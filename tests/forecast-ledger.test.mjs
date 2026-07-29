import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("forecast ledger passes cross-reference and settlement validation", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/validate-forecast-ledger.mjs", "forecast-ledger/forecasts/2026-07-23.json"],
    { cwd: root, encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /forecasts": 3/);
  assert.match(result.stdout, /scenarios": 6/);
  assert.match(result.stdout, /watching": 3/);
  assert.match(result.stdout, /blocked": 0/);
});
