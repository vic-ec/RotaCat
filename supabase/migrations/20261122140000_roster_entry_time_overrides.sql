-- Adjusted shift times: a doctor or locum who works part of a shift, or
-- different hours to its standard ones (came in at 10h00 to cover a gap
-- and stayed to 20h00). The row keeps its shift type — it is still that
-- shift for night and public-holiday counts and for the grid's column —
-- and carries its own start and end when they differ. Both null means the
-- shift type's standard times. Hours pages count the adjusted length.

alter table public.roster_entries
  add column if not exists start_time_override time,
  add column if not exists end_time_override time;

comment on column public.roster_entries.start_time_override is
  'Actual start when it differs from the shift type''s; null means standard.';
comment on column public.roster_entries.end_time_override is
  'Actual end when it differs from the shift type''s; null means standard. May be earlier than the start (overnight).';

alter table public.roster_entries
  drop constraint if exists roster_entries_time_override_pair_check;
alter table public.roster_entries
  add constraint roster_entries_time_override_pair_check
  check ((start_time_override is null) = (end_time_override is null));

-- Verification (run after applying):
--   select column_name, data_type from information_schema.columns
--   where table_schema = 'public' and table_name = 'roster_entries'
--     and column_name in ('start_time_override', 'end_time_override');
--   select pg_get_constraintdef(oid) from pg_constraint
--   where conname = 'roster_entries_time_override_pair_check';

-- The change log gains the matching action.
alter table public.roster_entry_changes
  drop constraint if exists roster_entry_changes_action_check;
alter table public.roster_entry_changes
  add constraint roster_entry_changes_action_check
  check (action in (
    'assign', 'unassign', 'remove', 'move',
    'slot_add', 'slot_remove', 'reinstate', 'advertise', 'unadvertise', 'undo', 'times'
  ));
