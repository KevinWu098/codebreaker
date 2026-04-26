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
const nowExpr = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const followupError = `Manual cleanup: workflow was pending or running for more than ${ageMinutes} minutes without update`;
const followupErrorSql = followupError.replaceAll("'", "''");

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

select
  'stale_cve_followup' as kind,
  id,
  run_id,
  status,
  updated_at
from cve_followups
where status in ('pending', 'running') and updated_at < ${cutoffExpr}
order by updated_at;

select
  'stale_cve_stage' as kind,
  st.id as stage_id,
  st.followup_id,
  st.kind as stage_kind,
  st.status as stage_status,
  st.updated_at
from cve_followup_stages st
inner join cve_followups f on f.id = st.followup_id
where f.status in ('pending', 'running')
  and st.status in ('dispatched', 'validating')
  and st.updated_at < ${cutoffExpr}
order by st.updated_at;
`;

const applySql = `
insert or ignore into processed_events (session_id, kind, event_id, created_at)
select
  id,
  'status',
  'manual-stale-running:' || id || ':' || ${nowExpr},
  ${nowExpr}
from sessions
where status = 'running' and updated_at < ${cutoffExpr};

insert or ignore into benchmark_run_events (id, run_id, kind, message, details, created_at)
select
  'manual-stale-benchmark-' || br.id || ':' || ${nowExpr},
  br.id,
  'failed',
  'Manual cleanup marked stale benchmark failed',
  json_object(
    'sessionId', br.session_id,
    'benchmarkUpdatedAt', br.updated_at,
    'sessionUpdatedAt', s.updated_at,
    'reason', 'benchmark or session running for more than ${ageMinutes} minutes without update'
  ),
  ${nowExpr}
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
  completed_at = ${nowExpr},
  updated_at = ${nowExpr}
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
  completed_at = ${nowExpr},
  updated_at = ${nowExpr}
where status = 'running' and updated_at < ${cutoffExpr};

insert or ignore into cve_followup_events (id, followup_id, kind, message, details, created_at)
select
  'manual-stale-cve-fu-' || f.id || ':' || ${nowExpr},
  f.id,
  'failed',
  'Manual cleanup marked stale CVE follow-up (workflow) failed',
  json_object(
    'followupUpdatedAt', f.updated_at,
    'runId', f.run_id,
    'reason', '${followupErrorSql}'
  ),
  ${nowExpr}
from cve_followups f
where f.status in ('pending', 'running') and f.updated_at < ${cutoffExpr};

update cve_followup_stages
set
  status = 'failed',
  last_error = '${followupErrorSql}',
  updated_at = ${nowExpr}
where id in (
  select st.id
  from cve_followup_stages st
  inner join cve_followups f on f.id = st.followup_id
  where f.status in ('pending', 'running')
    and f.updated_at < ${cutoffExpr}
    and st.status in ('pending', 'dispatched', 'validating')
);

update cve_followups
set
  status = 'failed',
  completed_at = ${nowExpr},
  updated_at = ${nowExpr},
  cancellation_reason = 'manual cleanup: ${followupErrorSql}'
where status in ('pending', 'running') and updated_at < ${cutoffExpr};

insert or ignore into cve_followup_events (id, followup_id, kind, message, details, created_at)
select
  'manual-stale-cve-st-' || st.id || ':' || ${nowExpr},
  st.followup_id,
  'failed',
  'Manual cleanup marked stale CVE follow-up stage failed',
  json_object(
    'stageId', st.id,
    'stageKind', st.kind,
    'stageStatus', st.status,
    'stageUpdatedAt', st.updated_at,
    'reason', 'Manual cleanup: ' || st.kind || ' stage stuck in ' || st.status
      || ' for more than ' || ${ageMinutes} || ' minutes without update'
  ),
  ${nowExpr}
from cve_followup_stages st
inner join cve_followups f on f.id = st.followup_id
where f.status in ('pending', 'running')
  and st.status in ('dispatched', 'validating')
  and st.updated_at < ${cutoffExpr};

update cve_followup_stages
set
  status = 'failed',
  last_error = 'Manual cleanup: ' || kind || ' stage stuck in ' || status
    || ' for more than ' || ${ageMinutes} || ' minutes without update',
  updated_at = ${nowExpr}
where id in (
  select st2.id
  from cve_followup_stages st2
  inner join cve_followups f2 on f2.id = st2.followup_id
  where f2.status in ('pending', 'running')
    and st2.status in ('dispatched', 'validating')
    and st2.updated_at < ${cutoffExpr}
);
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
