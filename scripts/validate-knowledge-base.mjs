import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const kb = path.join(root, "knowledge-base");
const load = (relativePath) =>
  JSON.parse(fs.readFileSync(path.join(kb, relativePath), "utf8"));

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
const sources = load("registries/sources.v0.1.json").sources;
const works = load("registries/works.v0.1.json").works;
const passages = load("registries/passages.v0.1.json").passages;
const rules = load("registries/rules.v0.1.json").rules;
const manifest = load("manifests/p0.v0.1.json");

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

const actual = {
  works: works.length,
  sources: sources.length,
  passages_total: passages.length,
  reviewed_passages: passages.filter((item) => ["reviewed", "public_citation", "rule_eligible"].includes(item.review_status)).length,
  public_citation_passages: passages.filter((item) => item.publishable).length,
  rule_eligible_passages: passages.filter((item) => item.rule_eligible).length,
  rules: rules.length,
};
for (const [key, value] of Object.entries(actual)) {
  if (manifest.actual[key] !== value) errors.push(`manifest actual.${key}: expected ${value}, found ${manifest.actual[key]}`);
}

console.log(JSON.stringify(actual, null, 2));
if (errors.length) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}
console.log("knowledge base validation passed");
