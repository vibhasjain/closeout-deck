-- P7 closeout journey: decisions, mediation threads, Payroll batches and disputes.
-- Only the Fly server (service role) touches these tables; RLS is on with no policies,
-- so the anon key can read or write nothing. Batch CSVs live in the private
-- closeout-files bucket under <acct>/batches/<id>.csv.

create table if not exists closeout_decisions (
  id         text primary key,                                   -- d_ + sha256(email|cycle|group)[0:16]
  email      text not null references closeout_state(email) on delete cascade,
  cycle_id   text not null,
  group_id   text not null check (length(group_id) between 1 and 80),   -- findings group or engine rule id
  shift_ids  jsonb not null default '[]'::jsonb,
  decision   text not null check (decision in ('approved', 'dismissed', 'escalated')),
  reason     text check (reason is null or length(reason) <= 500),
  "by"       text not null check ("by" in ('user', 'agent')),
  at         timestamptz not null default now(),
  unique (email, cycle_id, group_id),
  check (decision <> 'dismissed' or length(coalesce(reason, '')) > 0)
);

create table if not exists closeout_threads (
  id            text primary key,
  email         text not null references closeout_state(email) on delete cascade,
  cycle_id      text not null,
  shift_id      text,
  dispute_id    text,
  counterparty  jsonb not null,                                  -- {kind:'worker'|'site', name, contact?}
  status        text not null check (status in ('open', 'waiting', 'resolved')),
  created_at    timestamptz not null default now()
);
create index if not exists closeout_threads_email_cycle on closeout_threads (email, cycle_id);

create table if not exists closeout_messages (
  id         text primary key,
  thread_id  text not null references closeout_threads(id) on delete cascade,
  email      text not null references closeout_state(email) on delete cascade,
  dir        text not null check (dir in ('out', 'in', 'note')),
  text       text not null check (length(text) between 1 and 4000),
  status     text not null check (status in ('draft', 'not_sent_demo', 'recorded')),
  at         timestamptz not null default now()
);
create index if not exists closeout_messages_thread on closeout_messages (email, thread_id, at);

create table if not exists closeout_batches (
  id           text primary key,
  email        text not null references closeout_state(email) on delete cascade,
  cycle_id     text not null,
  destination  text not null check (length(destination) between 1 and 80),
  workers      integer not null check (workers >= 0),
  gross        numeric(14, 2) not null,
  held         integer not null check (held >= 0),
  csv_path     text not null,                                    -- <acct>/batches/<id>.csv
  created_at   timestamptz not null default now(),
  unique (email, cycle_id)                                       -- never re-send a cycle
);

create table if not exists closeout_disputes (
  id           text primary key,
  email        text not null references closeout_state(email) on delete cascade,
  cycle_id     text not null,                                    -- the paid cycle
  worker       text not null check (length(worker) between 1 and 200),
  description  text not null check (length(description) between 1 and 2000),
  source       text not null check (source in ('upload', 'paste', 'simulated')),
  status       text not null check (status in ('open', 'adjusted', 'rejected')),
  adjustment   jsonb,                                            -- {hours, amount, next_cycle_id}
  created_at   timestamptz not null default now()
);
create index if not exists closeout_disputes_email on closeout_disputes (email, created_at desc);

alter table closeout_decisions enable row level security;
alter table closeout_threads   enable row level security;
alter table closeout_messages  enable row level security;
alter table closeout_batches   enable row level security;
alter table closeout_disputes  enable row level security;
