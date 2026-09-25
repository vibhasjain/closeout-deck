-- P9 memory (Instinct model). Only the Fly server (service role) touches these tables;
-- RLS is on with no policies, so the anon key can read or write nothing.
-- An instinct changes what the Closeout Agent says, suggests or asks; a checkable rule
-- lives in the Rulebook instead. Forgotten rows are tombstones consolidation never re-adds.

create table if not exists closeout_instincts (
  id           text primary key,                               -- i_ + 16 hex
  email        text not null references closeout_state(email) on delete cascade,
  kind         text not null check (kind in ('context', 'autonomy', 'style')),
  text         text not null check (length(text) between 1 and 280),   -- one fact, trimmed
  source       text not null check (source in ('site', 'call', 'chat', 'decisions', 'send', 'user')),
  status       text not null check (status in ('pending', 'active', 'forgotten', 'replaced')),
  until        date,                                           -- time-bound facts such as PTO
  rule_id      text check (rule_id is null or length(rule_id) between 1 and 80),  -- engine rule id
  replaced_by  text,                                           -- the instinct that replaced this one
  at           timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists closeout_instincts_email_status on closeout_instincts (email, status);

create table if not exists closeout_memory_runs (
  id           text primary key,                               -- mr_ + 16 hex
  email        text not null references closeout_state(email) on delete cascade,
  trigger      text not null check (trigger in ('site', 'call', 'send', 'chat')),
  ref          text,                                           -- domain, call id or cycle id
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  ops          jsonb not null default '[]'::jsonb,             -- the ops that were applied
  dropped      jsonb not null default '[]'::jsonb,             -- [{op, reason}]
  error        text
);
create index if not exists closeout_memory_runs_email on closeout_memory_runs (email, started_at desc);

alter table closeout_instincts   enable row level security;
alter table closeout_memory_runs enable row level security;

-- The replace pair in one transaction: the new row takes the old row's status, the old row
-- becomes replaced with replaced_by. When the new id is already a live instinct of this account
-- (a replace into a text it already holds), the old row merges into it instead, which never
-- demotes an active fact. Returns false (and writes nothing) when the old row is missing,
-- another account's, or no longer active or pending.
create or replace function public.closeout_replace_instinct(p_email text, p_old_id text, p_new jsonb)
returns boolean language plpgsql security invoker set search_path = public, pg_catalog as $$
declare
  v_new public.closeout_instincts;
  v_status text;
begin
  v_new := jsonb_populate_record(null::public.closeout_instincts, p_new);
  if v_new.email is distinct from p_email or v_new.id is not distinct from p_old_id then
    raise exception 'invalid instinct';
  end if;
  select status into v_status from public.closeout_instincts
    where email = p_email and id = p_old_id and status in ('active', 'pending') for update;
  if not found then return false; end if;
  update public.closeout_instincts
    set status = case when status = 'active' or v_status = 'active' then 'active' else 'pending' end, updated_at = now()
    where email = p_email and id = v_new.id and status in ('active', 'pending');
  if not found then
    v_new.status := v_status;
    insert into public.closeout_instincts select v_new.*;
  end if;
  update public.closeout_instincts set status = 'replaced', replaced_by = v_new.id, updated_at = now()
    where email = p_email and id = p_old_id;
  return true;
end;
$$;
revoke all on function public.closeout_replace_instinct(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.closeout_replace_instinct(text, text, jsonb) to service_role;
