-- Persist the run repo name on the follow-up row instead of scraping it from
-- events/PR URLs in the dashboard.
alter table cve_followups add column repo_name text;
