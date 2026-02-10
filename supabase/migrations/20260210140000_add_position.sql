alter table tasks add column if not exists position integer;

-- Set initial positions based on due date order, per person
with ranked as (
  select id, row_number() over (partition by person order by due asc nulls last, id) as pos
  from tasks
)
update tasks set position = ranked.pos from ranked where tasks.id = ranked.id;
