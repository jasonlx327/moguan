import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { validateSnapshot } from "./fetch-cn-gov-policy.mjs";

const fileArg = process.argv[2];
if (!fileArg) {
  console.error("Usage: node scripts/validate-cn-gov-policy-snapshot.mjs <snapshot.json>");
  process.exit(2);
}

const filePath = path.resolve(process.cwd(), fileArg);
const snapshot = JSON.parse(fs.readFileSync(filePath, "utf8"));
const errors = validateSnapshot(snapshot);

console.log(
  `snapshot=${snapshot.snapshot_id} status=${snapshot.data_status} candidates=${snapshot.candidate_count ?? 0}`,
);
if (errors.length) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}
console.log("China government policy snapshot validation passed");
