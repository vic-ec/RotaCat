-- Roster editing: undo, and the new "vacated, no cover" state.
--
-- NOT APPLIED BY THE FRONTEND DEPLOY. Apply by hand, then run the
-- verification queries at the bottom. Safe to apply before the frontend
-- that uses it ships: every column is nullable, every existing action value
-- is kept, and nothing is renamed.
--
-- 1. batch_id groups every roster_entry_changes row written by one user
--    action (a replacement that vacates the replacement's own shift is one
--    batch), the same model weekend_planner_changes already uses.
-- 2. entry_before / entry_after hold the full roster_entries row before and
--    after the change (null where the row did not exist), so an undo can
--    restore the row exactly and refuse when it has changed since.
-- 3. side_effects lists ids of anything the action created or changed
--    elsewhere, so an undo can reverse those too:
--      { "leave_request_captured": uuid|null,
--        "advert_created": uuid|null,
--        "advert_cancelled": uuid|null,
--        "reverses_batch_id": uuid|null }   -- on an 'undo' row
-- 4. New action values (the four existing ones are kept):
--      slot_add     cover added to a no-cover row
--      slot_remove  the locum slot removed, the doctor stays struck through
--      reinstate    "Put back": the vacated doctor returns to the shift
--      advertise    an advert started from the shift menu
--      unadvertise  an advert cancelled from the shift menu
--      undo         a batch was reversed
--
-- The "vacated, no cover" roster_entries state needs no new column: it is
-- vacated_profile_id set, profile_id null, is_locum false, locum_name null.

alter table public.roster_entry_changes
  add column if not exists batch_id uuid,
  add column if not exists entry_before jsonb,
  add column if not exists entry_after jsonb,
  add column if not exists side_effects jsonb;

comment on column public.roster_entry_changes.batch_id is
  'Groups every row written by one user action, so the action can be undone as a whole.';
comment on column public.roster_entry_changes.entry_before is
  'The roster_entries row before this change (null when it did not exist).';
comment on column public.roster_entry_changes.entry_after is
  'The roster_entries row after this change (null when it was deleted).';
comment on column public.roster_entry_changes.side_effects is
  'Ids of rows this action created or changed elsewhere (leave request captured, advert created or cancelled).';

create index if not exists idx_roster_entry_changes_batch_id
  on public.roster_entry_changes (batch_id)
  where batch_id is not null;

alter table public.roster_entry_changes
  drop constraint if exists roster_entry_changes_action_check;
alter table public.roster_entry_changes
  add constraint roster_entry_changes_action_check
  check (action in (
    'assign', 'unassign', 'remove', 'move',
    'slot_add', 'slot_remove', 'reinstate', 'advertise', 'unadvertise', 'undo'
  ));

-- ── Verification (run after applying) ───────────────────────────────────
-- Expect four rows: batch_id uuid, entry_before jsonb, entry_after jsonb,
-- side_effects jsonb, all nullable.
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'roster_entry_changes'
--     and column_name in ('batch_id', 'entry_before', 'entry_after', 'side_effects');
--
-- Expect the check to list all ten action values.
--   select pg_get_constraintdef(oid) from pg_constraint
--   where conname = 'roster_entry_changes_action_check';
--
-- Expect one index.
--   select indexname from pg_indexes
--   where tablename = 'roster_entry_changes' and indexname = 'idx_roster_entry_changes_batch_id';
--
-- Expect the existing rows untouched (same count as before applying).
--   select action, count(*) from public.roster_entry_changes group by action;
