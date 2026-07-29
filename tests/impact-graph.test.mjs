import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { validateImpactGraph } from "../scripts/validate-impact-graph.mjs";

const graph = JSON.parse(
  fs.readFileSync(
    new URL("../chashi/graphs/EVENT-2026-07-29-01.json", import.meta.url),
    "utf8",
  ),
);
const ledger = JSON.parse(
  fs.readFileSync(
    new URL("../event-ledger/daily/2026-07-29.json", import.meta.url),
    "utf8",
  ),
);

test("MOFCOM impact graph keeps fact, correlation, and inference layers valid", () => {
  assert.deepEqual(validateImpactGraph(graph, ledger), []);
});

test("official policy response is confirmed without claiming enterprise loss", () => {
  const response = graph.edges.find(
    (edge) => edge.edge_id === "EDGE-MOFCOM-RESPONDS-TO-EU-PACKAGE",
  );
  assert.equal(response.evidence_class, "source_claim");
  assert.equal(response.status, "confirmed");
  assert.match(response.boundary_note, /不等于已经证明具体企业损失/);
});

test("VIGO disclosure is confirmed but bounded to one company", () => {
  const disclosure = graph.edges.find(
    (edge) => edge.edge_id === "EDGE-MOFCOM-HAS-VIGO-DISCLOSURE",
  );
  assert.equal(disclosure.evidence_class, "source_claim");
  assert.equal(disclosure.status, "confirmed");
  assert.match(disclosure.boundary_note, /不能外推至其余13家实体/);
});

test("future observation edges remain unverified inferences", () => {
  const futureEdges = graph.edges.filter(
    (edge) => edge.relation_type === "may_lead_to",
  );
  assert.ok(futureEdges.length > 0);
  assert.ok(futureEdges.every((edge) =>
    edge.evidence_class === "inference" && edge.status === "unverified",
  ));
});
