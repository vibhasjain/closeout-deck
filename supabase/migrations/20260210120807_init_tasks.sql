-- People
create table if not exists people (
  id text primary key,
  name text not null,
  color text not null
);

-- Clients
create table if not exists clients (
  id text primary key,
  name text not null,
  color text not null
);

-- Tasks
create table if not exists tasks (
  id serial primary key,
  title text not null,
  description text,
  person text references people(id),
  client text references clients(id),
  status text not null default 'todo',
  due date,
  doc text
);

-- Disable RLS on all tables (open access, no auth)
alter table people enable row level security;
drop policy if exists "Allow all access to people" on people;
create policy "Allow all access to people" on people for all using (true) with check (true);

alter table clients enable row level security;
drop policy if exists "Allow all access to clients" on clients;
create policy "Allow all access to clients" on clients for all using (true) with check (true);

alter table tasks enable row level security;
drop policy if exists "Allow all access to tasks" on tasks;
create policy "Allow all access to tasks" on tasks for all using (true) with check (true);

-- Seed people
insert into people values
  ('thomas', 'Thomas', '#06b6d4'),
  ('saurabh', 'Saurabh', '#f59e0b'),
  ('vibhas', 'Vibhas', '#a855f7')
on conflict (id) do nothing;

-- Seed clients
insert into clients values
  ('gigsmart', 'GigSmart', '#f43f5e'),
  ('wonolo', 'Wonolo', '#3b82f6')
on conflict (id) do nothing;

-- Seed tasks
insert into tasks (id, title, description, person, client, status, due, doc) values
  (1, 'Get API documentation over to GigSmart', null, 'thomas', 'gigsmart', 'in-progress', '2025-02-09', null),
  (8, 'Expand attestation gate for break violations', 'Trigger attestation for: breaks <30 min, breaks outside compliant window (after 5th hour), and missed punches. Prompt worker with legally required certification language.', 'saurabh', 'wonolo', 'todo', '2025-02-10', 'wonolo-meal-break-requirements.pdf'),
  (9, 'Add guardrails against coercive nudging', 'Agent must never link meal break collection to clocking out, ending shift, or receiving payment. Existential compliance risk.', 'saurabh', 'wonolo', 'todo', '2025-02-10', 'wonolo-meal-break-requirements.pdf'),
  (10, 'Standardize compliance messaging', 'All reminders must consistently include a succinct compliance-focused statement. Audit and standardize across all agent messages.', 'saurabh', 'wonolo', 'todo', '2025-02-11', 'wonolo-meal-break-requirements.pdf'),
  (11, 'Proactive reach-out based on break window timing', 'Send follow-up before the 5th hour of shift (CA compliance). Use movement patterns — if worker is idle 20 min during shift, ask if they are taking a meal break.', 'saurabh', 'wonolo', 'todo', '2025-02-11', 'wonolo-meal-break-requirements.pdf'),
  (12, 'Retroactive collection for previous shift', 'If worker did not report meal break in previous shift for same engagement, include a reminder to collect it when starting collection flow for new shift.', 'saurabh', 'wonolo', 'todo', '2025-02-12', 'wonolo-meal-break-requirements.pdf'),
  (2, 'Make closeout login map to HyperTrack login', null, 'thomas', null, 'todo', '2025-02-12', null),
  (4, 'Design wizard that accepts org reconciliation rules', 'Almost like a Claude Code interview — walks through an org''s rules step by step', 'vibhas', null, 'todo', '2025-02-10', null),
  (5, 'Show reconciliation process in timeline', 'Highlight time comparisons and the rule being applied', 'vibhas', null, 'todo', '2025-02-11', null),
  (6, 'Display the timesheets', null, 'vibhas', null, 'todo', '2025-02-12', null),
  (7, 'Design main dashboard view', 'Action hub for the operations person. Actionable, clear, concise, not verbose.', 'vibhas', null, 'todo', '2025-02-13', null)
on conflict (id) do nothing;

-- Reset sequence
select setval('tasks_id_seq', (select max(id) from tasks));

-- Enable realtime on tasks table
alter publication supabase_realtime add table tasks;
