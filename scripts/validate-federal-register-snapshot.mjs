import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { validateSnapshot } from "./fetch-federal-register.mjs";

const fileArg = process.argv[2];
if (!fileArg) {
  console.error("Usage: node scripts/validate-federal-register-snapshot.mjs <snapshot.json>");
  process.exit(2);
}

const filePath = path.resolve(process.cwd(), fileArg);
const snapshot = JSON.parse(fs.readFileSync(filePath, "utf8"));
const errors = validateSnapshot(snapshot);

console.log(
  `snapshot=${snapshot.snapshot_id} candidates=${snapshot.candidate_count ?? 0}`,
);
if (errors.length) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}
console.log("Federal Register snapshot validation passed");
