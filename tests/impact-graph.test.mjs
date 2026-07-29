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

test("EU context is not represented as a cause of the MOFCOM announcement", () => {
  const forbidden = graph.edges.find((edge) =>
    edge.from === "NODE-EU-21-PACKAGE"
    && edge.to === "NODE-MOFCOM-30-EVENT"
    && edge.relation_type === "causes",
  );
  assert.equal(forbidden, undefined);

  const correlation = graph.edges.find(
    (edge) => edge.edge_id === "EDGE-EU-PACKAGE-CORRELATES-MOFCOM",
  );
  assert.equal(correlation.evidence_class, "correlation");
  assert.equal(correlation.status, "unverified");
  assert.match(correlation.boundary_note, /没有一手来源证明直接因果关系/);
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
