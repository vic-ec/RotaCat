-- Supports the searchable/filterable review-log UI (RosterChangeLogModal,
-- WeekendPlannerChangeLogModal): filters by date range, admin, doctor, and
-- change type against roster_entry_changes / weekend_planner_changes.
-- Both tables are tiny today (audit rows only, no bulk writes), so this is
-- headroom for years of growth rather than a fix for a current slow query.

create index if not exists idx_roster_entry_changes_month_changed_at
  on public.roster_entry_changes (roster_month_id, changed_at desc);

create index if not exists idx_roster_entry_changes_entry_date
  on public.roster_entry_changes (entry_date);

create index if not exists idx_roster_entry_changes_changed_by
  on public.roster_entry_changes (changed_by);

create index if not exists idx_roster_entry_changes_profile_before
  on public.roster_entry_changes (profile_id_before);

create index if not exists idx_roster_entry_changes_profile_after
  on public.roster_entry_changes (profile_id_after);

create index if not exists idx_roster_entry_changes_action
  on public.roster_entry_changes (action);

create index if not exists idx_weekend_planner_changes_changed_at
  on public.weekend_planner_changes (changed_at desc);

create index if not exists idx_weekend_planner_changes_weekend_saturday
  on public.weekend_planner_changes (weekend_saturday);

create index if not exists idx_weekend_planner_changes_changed_by
  on public.weekend_planner_changes (changed_by);

create index if not exists idx_weekend_planner_changes_profile_id
  on public.weekend_planner_changes (profile_id);

create index if not exists idx_weekend_planner_changes_action
  on public.weekend_planner_changes (action);

-- Speeds up the "locums only" filter, which resolves role='locum' profile
-- ids before querying the change-log tables.
create index if not exists idx_profiles_role
  on public.profiles (role);
