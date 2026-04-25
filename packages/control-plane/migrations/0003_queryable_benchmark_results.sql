alter table benchmark_run_results add column predicted_vulnerable integer;
alter table benchmark_run_results add column expected_vulnerable integer;
alter table benchmark_run_results add column vulnerable_matched integer;
alter table benchmark_run_results add column predicted_vuln_class text;
alter table benchmark_run_results add column expected_vuln_class text;
alter table benchmark_run_results add column vuln_class_matched integer;
alter table benchmark_run_results add column confidence real;
alter table benchmark_run_results add column location_score real;
alter table benchmark_run_results add column correct_locations integer;

create table if not exists benchmark_run_locations (
  id text primary key not null,
  result_id text not null,
  run_id text not null,
  file text not null,
  function_name text,
  matched_ground_truth integer,
  created_at text not null
);

create index if not exists benchmark_run_results_predicted_vulnerable
  on benchmark_run_results (predicted_vulnerable);

create index if not exists benchmark_run_results_expected_vuln_class
  on benchmark_run_results (expected_vuln_class);

create index if not exists benchmark_run_results_confidence
  on benchmark_run_results (confidence);

create index if not exists benchmark_run_locations_run_id
  on benchmark_run_locations (run_id);

create index if not exists benchmark_run_locations_result_id
  on benchmark_run_locations (result_id);
