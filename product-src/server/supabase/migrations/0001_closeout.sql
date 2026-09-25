-- Closeout app store. Only the Fly server (service role) touches these tables;
-- RLS is on with no policies, so the anon key can read or write nothing.

create table if not exists closeout_state (
  email       text primary key,
  doc         jsonb not null default '{}'::jsonb,   -- whitelisted closeout-onboarding-v2 snapshot
  updated_at  timestamptz not null default now()
);

create table if not exists closeout_chat (
  id       text primary key,
  email    text not null references closeout_state(email) on delete cascade,
  at       timestamptz not null default now(),
  role     text not null check (role in ('user','agent')),
  text     text not null default '',
  cards    jsonb,
  context  jsonb,
  scope    text
);
create index if not exists closeout_chat_email_at on closeout_chat (email, at);

create table if not exists closeout_calls (
  id          text primary key,
  email       text not null references closeout_state(email) on delete cascade,
  started_at  timestamptz not null default now(),
  seconds     integer,
  transcript  jsonb not null default '[]'::jsonb,
  summary     text
);
create index if not exists closeout_calls_email on closeout_calls (email, started_at desc);

create table if not exists closeout_firm_reads (
  domain   text primary key,
  facts    jsonb not null,
  read_at  timestamptz not null default now()
);

alter table closeout_state      enable row level security;
alter table closeout_chat       enable row level security;
alter table closeout_calls      enable row level security;
alter table closeout_firm_reads enable row level security;
