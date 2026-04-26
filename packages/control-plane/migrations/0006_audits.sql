create table if not exists audits (
  id text primary key not null,
  repo_url text not null,
  ref text,
  mirror_repo_full_name text,
  status text not null,
  model_provider text not null,
  model_id text not null,
  sandbox_profile text,
  min_confidence real not null default 0.7,
  coordinator_session_id text,
  title text,
  total_candidates integer not null default 0,
  validated_count integer not null default 0,
  high_confidence_count integer not null default 0,
  error text,
  created_at text not null,
  updated_at text not null,
  started_at text,
  completed_at text,
  cleanup_completed_at text
);

create index if not exists audits_status_created_at
  on audits (status, created_at desc);

create table if not exists audit_shards (
  id text primary key not null,
  audit_id text not null,
  kind text not null,
  status text not null,
  investigator_session_id text,
  summary text,
  error text,
  created_at text not null,
  updated_at text not null,
  started_at text,
  completed_at text
);

create index if not exists audit_shards_audit_id
  on audit_shards (audit_id);

create unique index if not exists audit_shards_audit_kind
  on audit_shards (audit_id, kind);

create table if not exists audit_findings (
  id text primary key not null,
  audit_id text not null,
  shard_id text,
  status text not null,
  vuln_class text not null,
  severity text not null,
  confidence real not null,
  title text not null,
  description text not null,
  evidence text not null,
  poc_sketch text,
  cwe text,
  locations_json text not null,
  references_json text not null default '[]',
  validation_notes text,
  validator_session_id text,
  created_at text not null,
  updated_at text not null
);

create index if not exists audit_findings_audit_id
  on audit_findings (audit_id, status, confidence desc);

create index if not exists audit_findings_shard_id
  on audit_findings (shard_id);

create table if not exists audit_events (
  id text primary key not null,
  audit_id text not null,
  kind text not null,
  message text not null,
  details text,
  created_at text not null
);

create index if not exists audit_events_audit_id_created_at
  on audit_events (audit_id, created_at);
