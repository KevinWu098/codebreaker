alter table sessions add column benchmark_id text;
alter table sessions add column target_repo_name text;
alter table sessions add column target_repo_remote text;
alter table sessions add column run_repo_name text;
alter table sessions add column run_repo_remote text;
alter table sessions add column artifact_working_branch text;
alter table sessions add column artifact_latest_commit_sha text;
alter table sessions add column artifact_path text;
alter table sessions add column run_command text;
alter table sessions add column vulnerable_evidence_path text;
alter table sessions add column patched_evidence_path text;
alter table sessions add column artifact_status text;

create index if not exists sessions_benchmark_id
  on sessions (benchmark_id);

create index if not exists sessions_run_repo_name
  on sessions (run_repo_name);
