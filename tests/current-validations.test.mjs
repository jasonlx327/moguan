import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("every forecast has a valid current decision feedback record", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/validate-current-validations.mjs"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /"validations": 3/);
  assert.match(result.stdout, /current validation records passed/);
});
