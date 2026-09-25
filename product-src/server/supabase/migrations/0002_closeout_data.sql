-- P5 data backbone. Only the Fly server (service role) touches these tables or the bucket;
-- RLS is on with no policies, so the anon key can read or write nothing.
-- An account is its sign-in email (closeout_state.email); the server upserts that row
-- (insert ... on conflict do nothing) before its first data write.

create table if not exists closeout_sources (
  id                text primary key,                          -- src_ + 12 hex of sha256(email|set|system|site)
  email             text not null references closeout_state(email) on delete cascade,
  set_no            smallint not null check (set_no in (1, 2, 3)),
  system            text not null check (length(system) between 1 and 80),  -- Bullhorn, UKG, ADP, HyperTrack, Spreadsheet
  site              text,                                      -- the one client site a source covers, when it covers one
  method            text not null check (method in ('upload', 'simulated')),
  sample            boolean not null default false,
  created_at        timestamptz not null default now(),
  last_received_at  timestamptz
);
create index if not exists closeout_sources_email on closeout_sources (email);

create table if not exists closeout_mappings (
  id           text primary key,                               -- map_ + fingerprint[0:16]
  email        text not null references closeout_state(email) on delete cascade,
  fingerprint  text not null,
  spec         jsonb not null,                                 -- MappingSpec v1, validated by the server
  author       text not null check (author in ('agent', 'library', 'user')),
  version      integer not null default 1,                     -- bumped when a correction replaces it
  updated_at   timestamptz not null default now(),
  unique (email, fingerprint)
);

create table if not exists closeout_files (
  id             text primary key,                             -- f_ + 12 base32
  email          text not null references closeout_state(email) on delete cascade,
  source_id      text references closeout_sources(id) on delete set null,
  mapping_id     text references closeout_mappings(id) on delete set null,
  name           text not null check (length(name) between 1 and 200),   -- sanitized original name
  mime           text not null,
  bytes          integer not null check (bytes between 1 and 10485760),
  sha256         text not null,
  storage_path   text not null,                                -- <acct>/files/<id>/<name>, acct = workspace hash
  status         text not null check (status in ('received', 'needs_mapping', 'normalized', 'needs_extraction', 'rejected')),
  fingerprint    text,
  set_hint       smallint check (set_hint in (1, 2, 3)),       -- what the user said it was, if they did
  period_end     date,                                         -- the export's own "week ending", when the file states it
  first_date     date,                                         -- min / max work_date of its entries
  last_date      date,
  row_count      integer,
  entry_count    integer,
  unparsed       jsonb not null default '[]'::jsonb,           -- [{row, reason}], capped at 200
  sample         boolean not null default false,
  received_at    timestamptz not null default now(),
  normalized_at  timestamptz,
  unique (email, sha256)
);
create index if not exists closeout_files_email on closeout_files (email, received_at desc);

create table if not exists closeout_entries (
  id             text primary key,                             -- e_ + 16 hex, deterministic (TimeEntry.id)
  email          text not null references closeout_state(email) on delete cascade,
  file_id        text not null references closeout_files(id) on delete cascade,
  source_id      text not null references closeout_sources(id) on delete cascade,
  set_no         smallint not null check (set_no in (1, 2, 3)),
  kind           text not null check (kind in ('work', 'meal', 'diff', 'hours', 'geo')),
  worker         text not null,
  worker_key     text not null,
  worker_ext     text,
  site           text not null,
  site_key       text not null,
  role           text,
  work_date      date not null,
  start_min      integer check (start_min between -1440 and 4320),
  end_min        integer check (end_min between -1440 and 5760),
  meal_min       integer check (meal_min between 0 and 480),
  minutes        integer check (minutes between 0 and 2880),
  sched_start    integer,
  sched_end      integer,
  pay_rate       numeric(10, 2) check (pay_rate between 0 and 1000),
  bill_rate      numeric(10, 2) check (bill_rate between 0 and 2000),
  capture        text check (capture in ('clock', 'web', 'manual', 'import', 'location')),
  pay_code       text,
  approved_by    text,
  edited         boolean,
  comment        text,
  dup_of         text,                                         -- the first identical entry
  superseded_by  text,                                         -- file id of a newer export of the same worker-day
  flags          text[] not null default '{}',
  prov           jsonb not null,                               -- {file, sheet?, row, cols:{start:'Start', ...}}
  sample         boolean not null default false
);
create index if not exists closeout_entries_email_date on closeout_entries (email, work_date);
create index if not exists closeout_entries_file on closeout_entries (file_id);

create table if not exists closeout_facts (
  email       text not null references closeout_state(email) on delete cascade,
  kind        text not null check (kind in ('site', 'rate', 'differential', 'alias', 'account')),
  key         text not null,
  value       jsonb not null,                                  -- validated per kind by the server (§4.3)
  source      text not null check (source in ('user', 'agent', 'sample', 'firm')),
  sample      boolean not null default false,
  updated_at  timestamptz not null default now(),
  primary key (email, kind, key)
);

create table if not exists closeout_runs (                       -- the current run of each cycle
  email         text not null references closeout_state(email) on delete cascade,
  cycle_id      date not null,                                 -- period end: the id the client already uses (cycles.ts:78)
  run_id        text not null,                                 -- r_ + input_hash[0:16]; findings hang off it
  period_start  date not null,
  input_hash    text not null,                                 -- engine sha, calendar, facts, contributing files
  storage_path  text not null,                                 -- <acct>/runs/<cycle>/<run_id>.json.gz (CyclePayload)
  totals        jsonb not null,                                -- {under, over, flags, held, gross, naive, shifts, workers}
  counts        jsonb not null,                                -- {set1, set2, set3} entries in the cycle
  groups        jsonb not null default '[]'::jsonb,            -- finding groups (§7), the sample's 7-finding shape
  gaps          jsonb not null default '[]'::jsonb,            -- §6.4
  sample        boolean not null default false,
  run_at        timestamptz not null default now(),
  primary key (email, cycle_id)
);

create table if not exists closeout_findings (                   -- one row per case: a rule that fired on a time entry
  email      text not null references closeout_state(email) on delete cascade,
  run_id     text not null,
  cycle_id   date not null,
  shift_id   text not null,
  rule_id    text not null,
  seq        smallint not null default 0,                      -- a rule can emit several rows on one shift
  status     text not null check (status in ('flag', 'held', 'applied')),
  note       text not null,
  effect     jsonb,
  delta      numeric(12, 2) not null default 0,                -- this shift's pay after minus as submitted
  exposure   numeric(12, 2),                                   -- the finding's own amount for this case (billed, owed, lost)
  entry_ids  text[] not null default '{}',                     -- the evidence
  worker     text not null,
  site       text not null,
  work_date  date not null,
  primary key (email, run_id, shift_id, rule_id, seq)
);
create index if not exists closeout_findings_cycle on closeout_findings (email, cycle_id, rule_id);

alter table closeout_sources  enable row level security;
alter table closeout_mappings enable row level security;
alter table closeout_files    enable row level security;
alter table closeout_entries  enable row level security;
alter table closeout_facts    enable row level security;
alter table closeout_runs     enable row level security;
alter table closeout_findings enable row level security;

-- Private bucket: originals under <acct>/files/, run payloads under <acct>/runs/. storage.objects already
-- has RLS on in Supabase; with no policies only the service key reads or writes.
insert into storage.buckets (id, name, public, file_size_limit)
values ('closeout-files', 'closeout-files', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;
