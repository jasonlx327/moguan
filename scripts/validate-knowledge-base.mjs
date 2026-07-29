import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const kb = path.join(root, "knowledge-base");
const load = (relativePath) =>
  JSON.parse(fs.readFileSync(path.join(kb, relativePath), "utf8"));
const registriesDir = path.join(kb, "registries");

function loadRegistryShards(prefix, field) {
  const files = fs
    .readdirSync(registriesDir)
    .filter((file) => file.startsWith(`${prefix}.`) && file.endsWith(".json"))
    .sort();
  if (files.length === 0) throw new Error(`no registry shards found for ${prefix}`);
  return files.flatMap((file) => {
    const document = JSON.parse(fs.readFileSync(path.join(registriesDir, file), "utf8"));
    if (!Array.isArray(document[field])) throw new Error(`${file}: missing array ${field}`);
    return document[field];
  });
}

const validLayers = new Set([
  "theory_source",
  "institutional_synthesis",
  "observation_refinement",
  "modern_validation",
]);
const validFunctions = new Set([
  "theory",
  "omen",
  "observation",
  "calendar",
  "instrument",
  "institution",
  "historical_example",
  "commentary",
  "modern_validation",
]);
const validStatuses = new Set([
  "planned",
  "needs_revalidation",
  "pending_review",
  "reviewed",
  "public_citation",
  "rule_eligible",
  "disputed",
  "deprecated",
]);

const errors = [];
const sources = loadRegistryShards("sources", "sources");
const works = loadRegistryShards("works", "works");
const passages = loadRegistryShards("passages", "passages");
const rules = loadRegistryShards("rules", "rules");
const eventMappings = loadRegistryShards("event-mappings", "event_mappings");
const interpretations = loadRegistryShards("interpretations", "interpretations");
const manifest = load("manifests/p0.v0.1.json");
const eventLedger = JSON.parse(
  fs.readFileSync(path.join(root, "event-ledger/daily/2026-07-23.json"), "utf8"),
);

function index(records, key, label) {
  const result = new Map();
  for (const record of records) {
    if (!record[key]) errors.push(`${label}: missing ${key}`);
    else if (result.has(record[key])) errors.push(`${label}: duplicate ${record[key]}`);
    else result.set(record[key], record);
  }
  return result;
}

const sourceById = index(sources, "source_id", "sources");
const workById = index(works, "work_id", "works");
const passageById = index(passages, "passage_id", "passages");
index(rules, "rule_id", "rules");
index(eventMappings, "mapping_id", "event mappings");
index(interpretations, "analysis_id", "interpretations");
const eventById = index(eventLedger.candidates ?? [], "event_id", "event ledger");

for (const work of works) {
  if (!validLayers.has(work.historical_layer)) errors.push(`${work.work_id}: invalid historical_layer`);
  if (!validStatuses.has(work.review_status)) errors.push(`${work.work_id}: invalid review_status`);
  for (const sourceId of work.source_ids ?? []) {
    if (!sourceById.has(sourceId)) errors.push(`${work.work_id}: unknown source ${sourceId}`);
  }
}

for (const passage of passages) {
  if (!workById.has(passage.work_id)) errors.push(`${passage.passage_id}: unknown work`);
  if (!validLayers.has(passage.historical_layer)) errors.push(`${passage.passage_id}: invalid historical_layer`);
  if (!validFunctions.has(passage.source_function)) errors.push(`${passage.passage_id}: invalid source_function`);
  if (!validStatuses.has(passage.review_status)) errors.push(`${passage.passage_id}: invalid review_status`);
  for (const field of ["source_text", "modern_paraphrase", "allowed_use", "forbidden_inference", "counterevidence"]) {
    if (!passage[field] || passage[field].length === 0) errors.push(`${passage.passage_id}: empty ${field}`);
  }
  for (const anchor of passage.source_anchors ?? []) {
    if (!sourceById.has(anchor.source_id)) errors.push(`${passage.passage_id}: unknown source anchor ${anchor.source_id}`);
  }
  if (passage.publishable && !["public_citation", "rule_eligible"].includes(passage.review_status)) {
    errors.push(`${passage.passage_id}: publishable passage has insufficient review status`);
  }
  if (passage.publishable) {
    const review = passage.public_citation_review;
    if (!review) errors.push(`${passage.passage_id}: missing public_citation_review`);
    else {
      if (!review.reviewed_at || !review.reviewed_by) errors.push(`${passage.passage_id}: incomplete public review identity`);
      if (!review.primary_anchor_frozen) errors.push(`${passage.passage_id}: primary anchor is not frozen`);
      if (!review.second_text_witness || !sourceById.has(review.second_text_witness)) {
        errors.push(`${passage.passage_id}: invalid second text witness`);
      }
      if (!review.paraphrase_checked || !review.boundary_checked) {
        errors.push(`${passage.passage_id}: public paraphrase or boundary is unchecked`);
      }
    }
    if ((passage.source_anchors ?? []).length < 2) {
      errors.push(`${passage.passage_id}: public citation needs at least two source anchors`);
    }
  }
  if (passage.rule_eligible && passage.review_status !== "rule_eligible") {
    errors.push(`${passage.passage_id}: rule eligibility and review status disagree`);
  }
}

for (const rule of rules) {
  for (const passageId of rule.passage_ids ?? []) {
    const passage = passageById.get(passageId);
    if (!passage) errors.push(`${rule.rule_id}: unknown passage ${passageId}`);
    else if (!passage.rule_eligible) errors.push(`${rule.rule_id}: passage ${passageId} is not rule eligible`);
  }
}

for (const mapping of eventMappings) {
  if (!eventById.has(mapping.event_id)) errors.push(`${mapping.mapping_id}: unknown event ${mapping.event_id}`);
  if (!["research_draft", "approved", "deprecated"].includes(mapping.mapping_status)) {
    errors.push(`${mapping.mapping_id}: invalid mapping_status`);
  }
  if (!mapping.theme || !mapping.interpretive_frame || !mapping.five_phase_position) {
    errors.push(`${mapping.mapping_id}: incomplete interpretation boundary`);
  }
  if (!Array.isArray(mapping.modern_evidence_priority) || mapping.modern_evidence_priority.length === 0) {
    errors.push(`${mapping.mapping_id}: empty modern_evidence_priority`);
  }
  for (const passageId of mapping.passage_ids ?? []) {
    const passage = passageById.get(passageId);
    if (!passage) errors.push(`${mapping.mapping_id}: unknown passage ${passageId}`);
    else if (passage.review_status === "planned" || passage.review_status === "deprecated") {
      errors.push(`${mapping.mapping_id}: unusable passage ${passageId}`);
    }
  }
  if (mapping.ui_publishable && mapping.mapping_status !== "approved") {
    errors.push(`${mapping.mapping_id}: UI-publishable mapping is not approved`);
  }
  if (mapping.ui_publishable) {
    const publicPassage = passageById.get(mapping.public_passage_id);
    if (!publicPassage || !publicPassage.publishable) {
      errors.push(`${mapping.mapping_id}: invalid public_passage_id`);
    } else if (!(mapping.passage_ids ?? []).includes(mapping.public_passage_id)) {
      errors.push(`${mapping.mapping_id}: public passage is outside mapping passage_ids`);
    }
  }
}

for (const interpretation of interpretations) {
  if (!eventById.has(interpretation.event_id)) {
    errors.push(`${interpretation.analysis_id}: unknown event ${interpretation.event_id}`);
  }
  if (!(eventLedger.selection?.selected_event_ids ?? []).includes(interpretation.event_id)) {
    errors.push(`${interpretation.analysis_id}: event is not selected for publication`);
  }
  if (interpretation.fact_version !== eventLedger.selection?.publication_version) {
    errors.push(`${interpretation.analysis_id}: fact_version does not match published ledger`);
  }
  if (!["draft", "analysis_reviewed", "published", "corrected", "withdrawn"].includes(interpretation.review_status)) {
    errors.push(`${interpretation.analysis_id}: invalid review_status`);
  }
  for (const field of ["reality_change", "modern_bridge", "limits_and_counterreadings"]) {
    if (!interpretation[field] || interpretation[field].length === 0) {
      errors.push(`${interpretation.analysis_id}: empty ${field}`);
    }
  }
  const publicPassage = passageById.get(interpretation.classical_lens?.public_passage_id);
  if (!publicPassage || !publicPassage.publishable) {
    errors.push(`${interpretation.analysis_id}: classical lens lacks a public passage`);
  }
  for (const passageId of interpretation.passage_ids ?? []) {
    if (!passageById.has(passageId)) errors.push(`${interpretation.analysis_id}: unknown passage ${passageId}`);
  }
  if (!["direct_historical_reference", "structural_analogy", "disputed_mapping"].includes(interpretation.mapping_basis?.type)) {
    errors.push(`${interpretation.analysis_id}: invalid mapping basis type`);
  }
  if (!interpretation.mapping_basis?.reason) {
    errors.push(`${interpretation.analysis_id}: missing mapping basis reason`);
  }
  if (!interpretation.continued_observation?.window) {
    errors.push(`${interpretation.analysis_id}: missing observation window`);
  }
  for (const field of ["supporting_signals", "weakening_signals"]) {
    if (!Array.isArray(interpretation.continued_observation?.[field]) || interpretation.continued_observation[field].length === 0) {
      errors.push(`${interpretation.analysis_id}: empty ${field}`);
    }
  }
}

const actual = {
  works: works.length,
  sources: sources.length,
  passages_total: passages.length,
  reviewed_passages: passages.filter((item) => ["reviewed", "public_citation", "rule_eligible"].includes(item.review_status)).length,
  public_citation_passages: passages.filter((item) => item.publishable).length,
  rule_eligible_passages: passages.filter((item) => item.rule_eligible).length,
  rules: rules.length,
  event_mappings: eventMappings.length,
  interpretations: interpretations.length,
};
for (const [key, value] of Object.entries(actual)) {
  if (manifest.actual[key] !== value) errors.push(`manifest actual.${key}: expected ${value}, found ${manifest.actual[key]}`);
}
const representedLayers = new Set(
  passages
    .filter((item) => ["reviewed", "public_citation", "rule_eligible"].includes(item.review_status))
    .map((item) => item.historical_layer),
);
for (const layer of manifest.target.required_layers ?? []) {
  if (!representedLayers.has(layer)) errors.push(`manifest target: missing reviewed layer ${layer}`);
}
if (manifest.status === "ready_for_p1") {
  if (actual.reviewed_passages < manifest.target.verified_passages_min) {
    errors.push(`manifest target: reviewed passages below ${manifest.target.verified_passages_min}`);
  }
  if (actual.reviewed_passages > manifest.target.verified_passages_max) {
    errors.push(`manifest target: reviewed passages above ${manifest.target.verified_passages_max}`);
  }
}

console.log(JSON.stringify(actual, null, 2));
if (errors.length) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}
console.log("knowledge base validation passed");
