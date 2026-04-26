alter table benchmark_runs add column harness_mode text not null default 'minimal';

update benchmark_runs set harness_mode = 'full' where model_provider = 'kimi';

create index if not exists benchmark_runs_harness_mode
  on benchmark_runs (harness_mode);
