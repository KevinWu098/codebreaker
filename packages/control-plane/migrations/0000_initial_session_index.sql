create table if not exists sessions (
  id text primary key not null,
  status text not null,
  title text,
  model_provider text not null,
  model_id text not null,
  repo_owner text,
  repo_name text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  turn_count integer not null default 0,
  created_at text not null,
  updated_at text not null,
  completed_at text
);

create table if not exists processed_events (
  session_id text not null,
  kind text not null,
  event_id text not null,
  created_at text not null
);

create unique index if not exists processed_events_unique_event
  on processed_events (session_id, kind, event_id);

create index if not exists sessions_status_created_at
  on sessions (status, created_at desc);
