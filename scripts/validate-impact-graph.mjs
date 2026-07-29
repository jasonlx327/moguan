import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const validNodeTypes = new Set([
  "event",
  "actor",
  "actor_group",
  "trade_flow",
  "policy_path",
  "watch_signal",
]);
const validRings = new Set(["center", "direct", "context", "watch"]);
const validNodeStates = new Set(["confirmed", "unverified", "invalidated"]);
const validRelations = new Set([
  "causes",
  "amplifies",
  "constrains",
  "depends_on",
  "precedes",
  "responds_to",
  "reported_effect",
  "correlates_with",
  "claimed_by",
  "analogous_to",
  "interpreted_through",
  "may_lead_to",
  "invalidated",
]);
const validEvidenceClasses = new Set([
  "fact",
  "source_claim",
  "correlation",
  "analogy",
  "interpretation",
  "inference",
  "invalidated",
]);
const validStatuses = new Set(["confirmed", "unverified", "invalidated"]);
const validReviews = new Set(["pending", "approved", "rejected", "revision_required"]);

function indexBy(records, field, label, errors) {
  const index = new Map();
  for (const record of records ?? []) {
    const value = record[field];
    if (!value) errors.push(`${label}: missing ${field}`);
    else if (index.has(value)) errors.push(`${label}: duplicate ${value}`);
    else index.set(value, record);
  }
  return index;
}

export function validateImpactGraph(graph, ledger) {
  const errors = [];
  if (graph.schema_version !== "0.1") errors.push("unsupported schema_version");
  if (graph.status !== "draft") errors.push("new impact graphs must remain draft");
  if (graph.review_gate?.status !== "pending") {
    errors.push("new impact graphs must remain pending review");
  }

  const event = (ledger.candidates ?? []).find(
    (candidate) => candidate.event_id === graph.event_id,
  );
  if (!event) errors.push(`unknown event_id: ${graph.event_id}`);
  if (graph.timezone !== ledger.timezone) errors.push("graph timezone must match ledger");

  const nodes = indexBy(graph.nodes, "node_id", "nodes", errors);
  const edges = indexBy(graph.edges, "edge_id", "edges", errors);
  const sources = indexBy(ledger.source_records, "source_record_id", "sources", errors);
  const claims = indexBy(event?.claims, "claim_id", "claims", errors);

  if ([...nodes.values()].filter((node) => node.ring === "center").length !== 1) {
    errors.push("impact graph must contain exactly one center node");
  }

  for (const node of nodes.values()) {
    if (!validNodeTypes.has(node.node_type)) {
      errors.push(`${node.node_id}: invalid node_type`);
    }
    if (!validRings.has(node.ring)) errors.push(`${node.node_id}: invalid ring`);
    if (!validNodeStates.has(node.state)) errors.push(`${node.node_id}: invalid state`);
    if (!node.label) errors.push(`${node.node_id}: missing label`);
    for (const sourceId of node.source_record_ids ?? []) {
      if (!sources.has(sourceId)) errors.push(`${node.node_id}: unknown source ${sourceId}`);
    }
  }

  for (const edge of edges.values()) {
    if (!nodes.has(edge.from)) errors.push(`${edge.edge_id}: unknown from node`);
    if (!nodes.has(edge.to)) errors.push(`${edge.edge_id}: unknown to node`);
    if (!validRelations.has(edge.relation_type)) {
      errors.push(`${edge.edge_id}: invalid relation_type`);
    }
    if (!validEvidenceClasses.has(edge.evidence_class)) {
      errors.push(`${edge.edge_id}: invalid evidence_class`);
    }
    if (!validStatuses.has(edge.status)) errors.push(`${edge.edge_id}: invalid status`);
    if (!validReviews.has(edge.review_status)) {
      errors.push(`${edge.edge_id}: invalid review_status`);
    }
    for (const field of ["first_observed_at", "last_updated_at", "created_by"]) {
      if (!edge[field]) errors.push(`${edge.edge_id}: missing ${field}`);
    }
    for (const sourceId of edge.source_record_ids ?? []) {
      if (!sources.has(sourceId)) errors.push(`${edge.edge_id}: unknown source ${sourceId}`);
    }
    for (const claimId of edge.claim_ids ?? []) {
      if (!claims.has(claimId)) errors.push(`${edge.edge_id}: unknown claim ${claimId}`);
    }

    if (edge.evidence_class === "fact") {
      if (edge.status !== "confirmed") {
        errors.push(`${edge.edge_id}: fact edge must be confirmed`);
      }
      if ((edge.source_record_ids ?? []).length === 0) {
        errors.push(`${edge.edge_id}: fact edge requires a source`);
      }
      if ((edge.claim_ids ?? []).length === 0) {
        errors.push(`${edge.edge_id}: fact edge requires a claim`);
      }
    }
    if (edge.relation_type === "correlates_with") {
      if (edge.evidence_class !== "correlation" || edge.status !== "unverified") {
        errors.push(`${edge.edge_id}: correlation must remain unverified correlation`);
      }
      if (!edge.boundary_note) errors.push(`${edge.edge_id}: correlation needs boundary_note`);
    }
    if (edge.relation_type === "may_lead_to") {
      if (edge.evidence_class !== "inference" || edge.status !== "unverified") {
        errors.push(`${edge.edge_id}: may_lead_to must remain unverified inference`);
      }
      if (!edge.boundary_note) errors.push(`${edge.edge_id}: inference needs boundary_note`);
    }
  }

  return errors;
}

function main() {
  const [graphArg, ledgerArg] = process.argv.slice(2);
  if (!graphArg || !ledgerArg) {
    console.error("Usage: node scripts/validate-impact-graph.mjs <graph.json> <ledger.json>");
    process.exit(2);
  }
  const graph = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), graphArg), "utf8"));
  const ledger = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), ledgerArg), "utf8"));
  const errors = validateImpactGraph(graph, ledger);
  console.log(`graph=${graph.graph_id} nodes=${graph.nodes?.length ?? 0} edges=${graph.edges?.length ?? 0}`);
  if (errors.length) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exit(1);
  }
  console.log("impact graph validation passed");
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main();
}
