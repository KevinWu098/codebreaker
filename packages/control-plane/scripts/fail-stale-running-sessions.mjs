#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const DEFAULT_AGE_MINUTES = 10;
const DB_NAME = "codebreaker-sessions";
const WRANGLER_CONFIG = "wrangler.jsonc";

const args = process.argv.slice(2);
const remote = args.includes("--remote");
const dryRun = args.includes("--dry-run");
const ageMinutes = Number.parseInt(
  valueForFlag(args, "--age-minutes") ?? String(DEFAULT_AGE_MINUTES),
  10
);

if (!(Number.isInteger(ageMinutes) && ageMinutes > 0)) {
  throw new Error("--age-minutes must be a positive whole number");
}

const targetFlag = remote ? "--remote" : "--local";
const cutoffExpr = `strftime('%Y-%m-%dT%H:%M:%fZ','now','-${ageMinutes} minutes')`;

const dryRunSql = `
select
  'stale_session' as kind,
  id,
  status,
  updated_at
from sessions
where status = 'running' and updated_at < ${cutoffExpr}
order by updated_at;

select id, status, updated_at
from benchmark_runs br
where br.status = 'running'
  and (
    br.updated_at < ${cutoffExpr}
    or br.session_id in (
      select id from sessions
      where status = 'running' and updated_at < ${cutoffExpr}
    )
  )
order by updated_at;
`;

const applySql = `
insert or ignore into processed_events (session_id, kind, event_id, created_at)
select
  id,
  'status',
  'manual-stale-running:' || id || ':' || strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
from sessions
where status = 'running' and updated_at < ${cutoffExpr};

insert or ignore into benchmark_run_events (id, run_id, kind, message, details, created_at)
select
  'manual-stale-benchmark-' || br.id || ':' || strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  br.id,
  'failed',
  'Manual cleanup marked stale benchmark failed',
  json_object(
    'sessionId', br.session_id,
    'benchmarkUpdatedAt', br.updated_at,
    'sessionUpdatedAt', s.updated_at,
    'reason', 'benchmark or session running for more than ${ageMinutes} minutes without update'
  ),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
from benchmark_runs br
left join sessions s on s.id = br.session_id
where br.status = 'running'
  and (
    br.updated_at < ${cutoffExpr}
    or (
      s.status = 'running'
      and s.updated_at < ${cutoffExpr}
    )
  );

update benchmark_runs
set
  status = 'failed',
  error = 'Manual cleanup: benchmark or session was running for more than ${ageMinutes} minutes without update',
  completed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
where status = 'running'
  and (
    updated_at < ${cutoffExpr}
    or session_id in (
      select id from sessions
      where status = 'running' and updated_at < ${cutoffExpr}
    )
  );

update sessions
set
  status = 'failed',
  completed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
where status = 'running' and updated_at < ${cutoffExpr};
`;

runWrangler(dryRun ? dryRunSql : applySql);

function valueForFlag(argv, flag) {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv.at(index + 1);
}

function runWrangler(command) {
  const result = spawnSync(
    "pnpm",
    [
      "exec",
      "wrangler",
      "d1",
      "execute",
      DB_NAME,
      targetFlag,
      "--config",
      WRANGLER_CONFIG,
      "--command",
      command,
      "--json",
    ],
    { encoding: "utf8", stdio: "inherit" }
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
