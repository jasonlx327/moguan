import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function search(...args) {
  return JSON.parse(
    execFileSync(process.execPath, ["scripts/search-knowledge-base.mjs", ...args], {
      cwd: root,
      encoding: "utf8",
    }),
  );
}

test("P0 knowledge manifest reaches the 30–50 reviewed-passage gate", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "knowledge-base/manifests/p0.v0.1.json"), "utf8"),
  );
  assert.equal(manifest.status, "ready_for_p1");
  assert.ok(manifest.actual.reviewed_passages >= 30);
  assert.ok(manifest.actual.reviewed_passages <= 50);
  assert.deepEqual(manifest.target.required_layers, [
    "theory_source",
    "institutional_synthesis",
    "observation_refinement",
    "modern_validation",
  ]);
});

test("knowledge search finds Song instrument records without promoting them", () => {
  const result = search("水运", "仪象");
  assert.ok(result.result_count >= 1);
  assert.equal(result.results[0].historical_layer, "observation_refinement");
  assert.equal(result.results[0].publishable, false);
  assert.equal(result.results[0].rule_eligible, false);
});

test("knowledge search can retrieve counterevidence and filter layers", () => {
  const result = search("占验", "--layer", "institutional_synthesis");
  assert.ok(result.results.some((item) => item.passage_id === "PASS-HANSHU-TIANWEN-0003"));
  assert.ok(result.results.every((item) => item.historical_layer === "institutional_synthesis"));
});

test("modern validation records remain distinct from classical passages", () => {
  const result = search("J2000", "--layer", "modern_validation");
  assert.ok(result.result_count >= 1);
  assert.ok(result.results.every((item) => item.source_function === "modern_validation"));
});

test("MOFCOM classical mapping remains a non-public research draft", () => {
  const registry = JSON.parse(
    fs.readFileSync(
      path.join(
        root,
        "knowledge-base/registries/event-mappings.2026-07-29.v0.1.json",
      ),
      "utf8",
    ),
  );
  const mapping = registry.event_mappings[0];

  assert.equal(mapping.event_id, "EVENT-2026-07-29-01");
  assert.equal(mapping.mapping_status, "research_draft");
  assert.equal(mapping.ui_publishable, false);
  assert.equal(mapping.public_passage_id, null);
  assert.match(mapping.five_phase_position, /不分配固定五行/);
  assert.ok(mapping.review_gate.forbidden_outputs.some((item) => item.includes("因果")));
});

test("knowledge validator resolves events across daily ledger files", () => {
  const output = execFileSync(
    process.execPath,
    ["scripts/validate-knowledge-base.mjs"],
    { cwd: root, encoding: "utf8" },
  );

  assert.match(output, /"event_mappings": 4/);
  assert.match(output, /knowledge base validation passed/);
});
