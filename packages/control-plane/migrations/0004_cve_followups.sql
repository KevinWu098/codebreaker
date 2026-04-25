create table if not exists cve_followups (
  id text primary key not null,
  run_id text not null,
  task_id text not null,
  ghsa_id text not null,
  status text not null,
  auto_fired integer not null,
  deepwiki_context text,
  created_at text not null,
  updated_at text not null,
  completed_at text,
  cancellation_reason text
);

create unique index if not exists cve_followups_run_id
  on cve_followups (run_id);

create index if not exists cve_followups_status_created
  on cve_followups (status, created_at desc);

create table if not exists cve_followup_stages (
  id text primary key not null,
  followup_id text not null,
  kind text not null,
  status text not null,
  devin_session_id text,
  devin_url text,
  branch text,
  pr_url text,
  attempts integer not null default 0,
  last_error text,
  validation_result_id text,
  created_at text not null,
  updated_at text not null
);

create index if not exists cve_followup_stages_followup
  on cve_followup_stages (followup_id);

create unique index if not exists cve_followup_stages_followup_kind
  on cve_followup_stages (followup_id, kind);

create table if not exists cve_followup_validations (
  id text primary key not null,
  stage_id text not null,
  manifest_json text,
  exit_code integer,
  marker_seen integer,
  stdout_excerpt text,
  stderr_excerpt text,
  passed integer not null,
  tier text,
  observational_fingerprint_matched integer,
  created_at text not null
);

create index if not exists cve_followup_validations_stage
  on cve_followup_validations (stage_id);

create table if not exists cve_followup_events (
  id text primary key not null,
  followup_id text not null,
  kind text not null,
  message text not null,
  details text,
  created_at text not null
);

create index if not exists cve_followup_events_followup
  on cve_followup_events (followup_id, created_at);
