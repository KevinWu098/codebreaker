-- Reset script: drops all application tables and indexes.
-- Run with: pnpm db:reset:local (or db:reset:remote for production)
--
-- After running this, re-apply migrations to recreate tables:
--   pnpm db:apply:local (or db:apply:remote)

-- CVE follow-up tables
drop table if exists cve_followup_events;
drop table if exists cve_followup_validations;
drop table if exists cve_followup_stages;
drop table if exists cve_followups;

-- Benchmark result tables
drop table if exists benchmark_run_locations;
drop table if exists benchmark_run_results;
drop table if exists benchmark_run_events;
drop table if exists benchmark_runs;

-- Session tables
drop table if exists processed_events;
drop table if exists sessions;

-- Wrangler migration tracker (must drop so migrations can be re-applied cleanly)
drop table if exists d1_migrations;
