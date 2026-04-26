alter table sessions add column agent_role text;

create index if not exists sessions_agent_role_idx on sessions (agent_role);
