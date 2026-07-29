import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  collectCnGovPolicy,
  defaultDepartment,
  defaultTerms,
  endpoint,
  validateSnapshot,
} from "./fetch-cn-gov-policy.mjs";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

export function beijingDate(value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

export function daysBefore(date, days) {
  const result = new Date(`${date}T12:00:00+08:00`);
  if (Number.isNaN(result.getTime())) throw new Error(`Invalid date: ${date}`);
  result.setUTCDate(result.getUTCDate() - days);
  return beijingDate(result);
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const json = `${JSON.stringify(value, null, 2)}\n`;
  fs.writeFileSync(filePath, json);
  const sha256 = createHash("sha256").update(json).digest("hex");
  fs.writeFileSync(
    `${filePath}.sha256`,
    `${sha256}  ${path.basename(filePath)}\n`,
  );
  return sha256;
}

export async function runRemoteProbe({
  to = beijingDate(),
  from = daysBefore(to, 29),
  output,
  fetchImpl = fetch,
  attemptedAt = new Date(),
}) {
  try {
    const snapshot = await collectCnGovPolicy({
      from,
      to,
      fetchImpl,
      collectedAt: attemptedAt,
    });
    const errors = validateSnapshot(snapshot);
    if (errors.length) throw new Error(errors.join("\n"));
    const snapshotSha256 = writeJson(output, snapshot);
    return {
      status: "snapshot",
      output,
      candidate_count: snapshot.candidate_count,
      snapshot_sha256: snapshotSha256,
    };
  } catch (error) {
    const blocked = {
      schema_version: "0.1",
      snapshot_id: `CN-GOV-MOFCOM-SEMICONDUCTOR-${from}-${to}`,
      attempted_at: attemptedAt.toISOString(),
      source: {
        source_id: "cn_state_council_policy_search",
        publisher: "中国政府网",
        endpoint,
        open_level: "O0",
        authentication: "none",
      },
      query: {
        department: defaultDepartment,
        terms: defaultTerms,
        publication_date_from: from,
        publication_date_to: to,
      },
      data_status: "blocked",
      candidate_count: 0,
      documents: [],
      access_issue: {
        error_type: error?.constructor?.name ?? "Error",
        message: String(error?.message ?? error).slice(0, 500),
      },
      review_gate: {
        status: "pending",
        rule: "A failed remote probe produces no event-ledger candidate.",
      },
    };
    const blockedSha256 = writeJson(output, blocked);
    const failure = new Error(`Official-source probe failed; blocked artifact=${output}`);
    failure.cause = error;
    failure.artifact = {
      status: "blocked",
      output,
      candidate_count: 0,
      snapshot_sha256: blockedSha256,
    };
    throw failure;
  }
}

async function main() {
  const output = path.resolve(
    process.cwd(),
    argument("--output") ?? "artifacts/cn-policy-current.json",
  );
  const to = argument("--to") ?? beijingDate();
  const from = argument("--from") ?? daysBefore(to, 29);

  try {
    const result = await runRemoteProbe({ from, to, output });
    console.log(
      `status=${result.status} candidates=${result.candidate_count} sha256=${result.snapshot_sha256}`,
    );
  } catch (error) {
    const artifact = error.artifact;
    if (artifact) {
      console.error(
        `status=${artifact.status} candidates=0 sha256=${artifact.snapshot_sha256}`,
      );
    }
    console.error(error.message);
    process.exit(1);
  }
}

if (
  process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
) {
  main();
}
