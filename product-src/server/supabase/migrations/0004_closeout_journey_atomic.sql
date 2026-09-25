-- Server-only RPCs: each request is one PostgreSQL transaction. They deliberately
-- use SECURITY INVOKER and are executable only by the service role.
create or replace function public.closeout_save_conversation(
  p_email text, p_thread jsonb, p_messages jsonb, p_dispute jsonb default null
) returns void language plpgsql security invoker set search_path = public, pg_catalog as $$
declare
  v_thread public.closeout_threads;
  v_dispute public.closeout_disputes;
begin
  v_thread := jsonb_populate_record(null::public.closeout_threads, p_thread);
  if v_thread.email is distinct from p_email or jsonb_typeof(p_messages) is distinct from 'array' then
    raise exception 'invalid conversation';
  end if;
  if exists (select 1 from jsonb_populate_recordset(null::public.closeout_messages, p_messages) m
             where m.email is distinct from p_email or m.thread_id is distinct from v_thread.id) then
    raise exception 'invalid message owner';
  end if;
  if p_dispute is not null then
    v_dispute := jsonb_populate_record(null::public.closeout_disputes, p_dispute);
    if v_dispute.email is distinct from p_email or v_dispute.id is distinct from v_thread.dispute_id
       or v_dispute.cycle_id is distinct from v_thread.cycle_id then raise exception 'invalid dispute owner'; end if;
    insert into public.closeout_disputes select v_dispute.*
    on conflict (id) do update set worker = excluded.worker, description = excluded.description,
      status = excluded.status, adjustment = excluded.adjustment
    where closeout_disputes.email = p_email and closeout_disputes.cycle_id = excluded.cycle_id;
    if not found then raise exception 'invalid dispute owner'; end if;
  end if;
  insert into public.closeout_threads select v_thread.*
  on conflict (id) do update set counterparty = excluded.counterparty, status = excluded.status,
    shift_id = excluded.shift_id, dispute_id = excluded.dispute_id
  where closeout_threads.email = p_email and closeout_threads.cycle_id = excluded.cycle_id;
  if not found then raise exception 'invalid thread owner'; end if;
  insert into public.closeout_messages
    select * from jsonb_populate_recordset(null::public.closeout_messages, p_messages);
end;
$$;
revoke all on function public.closeout_save_conversation(text, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.closeout_save_conversation(text, jsonb, jsonb, jsonb) to service_role;

-- Legacy aliases are consolidated using the latest at/id before calling this RPC.
-- The replacement is atomic, so a failed insert leaves every old decision intact.
create or replace function public.closeout_replace_decisions(p_email text, p_cycle_id text, p_decisions jsonb)
returns void language plpgsql security invoker set search_path = public, pg_catalog as $$
begin
  if jsonb_typeof(p_decisions) is distinct from 'array' or exists (
    select 1 from jsonb_populate_recordset(null::public.closeout_decisions, p_decisions) d
    where d.email is distinct from p_email or d.cycle_id is distinct from p_cycle_id
  ) then raise exception 'invalid decision owner'; end if;
  delete from public.closeout_decisions where email = p_email and cycle_id = p_cycle_id;
  insert into public.closeout_decisions
    select * from jsonb_populate_recordset(null::public.closeout_decisions, p_decisions);
end;
$$;
revoke all on function public.closeout_replace_decisions(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.closeout_replace_decisions(text, text, jsonb) to service_role;

create index if not exists closeout_messages_order on public.closeout_messages (email, thread_id, at, id);
