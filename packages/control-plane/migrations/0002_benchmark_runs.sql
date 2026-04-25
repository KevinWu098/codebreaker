create table if not exists benchmark_runs (
  id text primary key not null,
  task_id text not null,
  difficulty text not null,
  status text not null,
  model_provider text not null,
  model_id text not null,
  cleanup_policy text not null,
  session_id text,
  artifact_commit_sha text,
  artifact_path text,
  score real,
  error text,
  created_at text not null,
  updated_at text not null,
  completed_at text,
  cleanup_completed_at text
);

create table if not exists benchmark_run_events (
  id text primary key not null,
  run_id text not null,
  kind text not null,
  message text not null,
  details text,
  created_at text not null
);

create table if not exists benchmark_run_results (
  id text primary key not null,
  run_id text not null,
  agent_output text,
  raw_output text,
  score text,
  artifact_path text,
  error text,
  created_at text not null
);

create index if not exists benchmark_runs_status_created_at
  on benchmark_runs (status, created_at desc);

create index if not exists benchmark_runs_task_id
  on benchmark_runs (task_id);

create index if not exists benchmark_run_events_run_id_created_at
  on benchmark_run_events (run_id, created_at);

create index if not exists benchmark_run_results_run_id
  on benchmark_run_results (run_id);
