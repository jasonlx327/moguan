import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registriesDir = path.join(root, "knowledge-base", "registries");

function loadShards(prefix, field) {
  return fs
    .readdirSync(registriesDir)
    .filter((file) => file.startsWith(`${prefix}.`) && file.endsWith(".json"))
    .sort()
    .flatMap((file) => JSON.parse(fs.readFileSync(path.join(registriesDir, file), "utf8"))[field] ?? []);
}

function parseArgs(argv) {
  const filters = {};
  const queryParts = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--layer") filters.layer = argv[++index];
    else if (argv[index] === "--status") filters.status = argv[++index];
    else queryParts.push(argv[index]);
  }
  return { query: queryParts.join(" ").trim(), filters };
}

const { query, filters } = parseArgs(process.argv.slice(2));
if (!query) {
  console.error("usage: npm run kb:search -- <query> [--layer <layer>] [--status <status>]");
  process.exit(1);
}

const works = loadShards("works", "works");
const passages = loadShards("passages", "passages");
const workById = new Map(works.map((work) => [work.work_id, work]));
const terms = query.toLocaleLowerCase("zh-CN").split(/\s+/).filter(Boolean);

const results = passages
  .filter((passage) => !filters.layer || passage.historical_layer === filters.layer)
  .filter((passage) => !filters.status || passage.review_status === filters.status)
  .map((passage) => {
    const work = workById.get(passage.work_id);
    const title = work?.canonical_title ?? passage.work_id;
    const fields = [
      title,
      passage.chapter,
      passage.source_text,
      passage.modern_paraphrase,
      ...(passage.allowed_use ?? []),
      ...(passage.forbidden_inference ?? []),
      ...(passage.counterevidence ?? []),
    ];
    const haystack = fields.join("\n").toLocaleLowerCase("zh-CN");
    const matchedTerms = terms.filter((term) => haystack.includes(term));
    const titleText = `${title}\n${passage.chapter}`.toLocaleLowerCase("zh-CN");
    const score = matchedTerms.reduce(
      (total, term) => total + (titleText.includes(term) ? 3 : 1),
      0,
    );
    return { passage, title, matchedTerms, score };
  })
  .filter((result) => result.matchedTerms.length === terms.length)
  .sort((left, right) => right.score - left.score || left.passage.passage_id.localeCompare(right.passage.passage_id))
  .slice(0, 20)
  .map(({ passage, title, matchedTerms }) => ({
    passage_id: passage.passage_id,
    work: title,
    chapter: passage.chapter,
    historical_layer: passage.historical_layer,
    source_function: passage.source_function,
    review_status: passage.review_status,
    publishable: passage.publishable,
    rule_eligible: passage.rule_eligible,
    source_text: passage.source_text,
    modern_paraphrase: passage.modern_paraphrase,
    matched_terms: matchedTerms,
    source_anchors: passage.source_anchors,
  }));

console.log(JSON.stringify({ query, filters, result_count: results.length, results }, null, 2));
