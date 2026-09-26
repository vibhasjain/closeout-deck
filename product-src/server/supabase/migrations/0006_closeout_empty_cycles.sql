-- The empty-week memo (DataService.recompute). A cycle whose overlapping files build no time entries
-- publishes no run, so its input hash lives here: a restart skips the rebuild only while every input is the same.
-- A table, not a Storage object: an overwritten object can read stale from another connection.
-- Only the Fly server (service role) touches it; RLS is on with no policies. Additive.

create table if not exists closeout_empty_cycles (
  email       text not null references closeout_state(email) on delete cascade,
  cycle_id    date not null,                                   -- period end, as closeout_runs
  input_hash  text not null,                                   -- pipelineInputHash of the empty build
  primary key (email, cycle_id)
);

alter table closeout_empty_cycles enable row level security;
