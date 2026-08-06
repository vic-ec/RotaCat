-- Groups every row written by a single user action (one manual add/remove,
-- or one paste/clear covering multiple weekends/groups) so the whole
-- action can be found and reversed together — the durable-undo mechanism
-- for the Weekend Planner's Copy/Paste/Clear tools. Reads from this table
-- rather than transient React state, so a restore still works minutes
-- later, across navigation, or after a page reload. Nullable: historical
-- rows written before this column existed have no batch to restore by.

alter table public.weekend_planner_changes add column batch_id uuid;

create index weekend_planner_changes_batch_id_idx
  on public.weekend_planner_changes (batch_id)
  where batch_id is not null;

comment on column public.weekend_planner_changes.batch_id is
  'Groups every row written by a single user action (one manual add/remove, or one paste/clear covering multiple weekends/groups) so the whole action can be found and reversed together. Null for historical rows written before this column existed.';
