-- 1. roster_entries: the roster_months_select policy (see the previous
-- migration) already exposes archived roster_months rows to non-admins,
-- but roster_entries_select was never extended to match — so opening an
-- archived roster from the non-admin Archive tab returned an empty grid
-- (the roster row was visible, its shifts weren't). Bring it in line.

drop policy if exists roster_entries_select on public.roster_entries;
create policy roster_entries_select on public.roster_entries
  for select
  to authenticated
  using (
    exists (
      select 1 from roster_months rm
      where rm.id = roster_entries.roster_month_id
        and (rm.status in ('published', 'archived') or is_admin())
    )
  );

-- 2. leave_requests: clerks previously only saw approved leave active on
-- today's date (CURRENT_DATE between date_from/date_to) — a "who's off
-- right now" slice, not enough to back the Annual/Special planners' "All"
-- tab. Widen clerks to every approved leave request, for every doctor,
-- year-round — still excluding Consultants, per the standing Consultant
-- leave-privacy rule (see LeaveYearGrid.jsx / EC_LEAVE_PLANNER_RULES.md):
-- only admins and other Consultants can see a Consultant's leave, and a
-- clerk can never itself be a Consultant, so that carve-out is unconditional
-- here (unlike the doctor clause below it, which has an is_consultant()
-- viewer bypass).

drop policy if exists leave_select on public.leave_requests;
create policy leave_select on public.leave_requests
  for select
  to authenticated
  using (
    is_admin()
    or ((not is_locum()) and profile_id = auth.uid())
    or (
      (not is_locum()) and (not is_clerk())
      and status = 'approved'
      and (is_consultant() or not exists (
        select 1 from profiles p where p.id = leave_requests.profile_id and p.category = 'Consultant'
      ))
    )
    or (
      is_clerk()
      and status = 'approved'
      and not exists (
        select 1 from profiles p where p.id = leave_requests.profile_id and p.category = 'Consultant'
      )
    )
  );
