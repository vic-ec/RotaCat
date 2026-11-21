-- Roster: remember who was originally on a shift, and why they came off it.
--
-- Opening or reassigning a published shift used to overwrite profile_id and
-- leave the reason nowhere: the change log said who replaced whom, never
-- why. A doctor who phones in sick now stays on the roster, struck through,
-- beside whoever covers them.
--
-- 1. roster_entries.vacated_*: the doctor taken off this shift, the reason
--    (deliberately coarse: 'leave' never says WHICH leave; the type is read
--    from leave_requests under its own RLS, so someone who may not see that
--    doctor's leave reads only "On leave"), and the leave row it links to.
-- 2. roster_entry_changes gains the same reason/note/leave link, so the log
--    carries the why.
-- 3. approved_leave_ranges(): which doctors hold approved leave in a date
--    range, WITHOUT the type or any other detail. The roster strikes through
--    anyone on leave for a shift they still hold, and that has to read the
--    same for every viewer: leave_select hides leave from locums entirely
--    and consultants' leave from juniors, and a roster that showed some
--    people an absent doctor as working would be unsafe. SECURITY DEFINER to
--    read past that policy, returning only who and when.

alter table public.roster_entries
  add column if not exists vacated_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists vacated_reason text,
  add column if not exists vacated_note text,
  add column if not exists vacated_leave_request_id uuid references public.leave_requests(id) on delete set null,
  add column if not exists vacated_by uuid references public.profiles(id) on delete set null,
  add column if not exists vacated_at timestamptz;

alter table public.roster_entries
  drop constraint if exists roster_entries_vacated_reason_check;
alter table public.roster_entries
  add constraint roster_entries_vacated_reason_check
  check (vacated_reason is null or vacated_reason in ('leave', 'swap', 'no_show', 'other'));

alter table public.roster_entry_changes
  add column if not exists reason text,
  add column if not exists note text,
  add column if not exists leave_request_id uuid references public.leave_requests(id) on delete set null;

alter table public.roster_entry_changes
  drop constraint if exists roster_entry_changes_reason_check;
alter table public.roster_entry_changes
  add constraint roster_entry_changes_reason_check
  check (reason is null or reason in ('leave', 'swap', 'no_show', 'other'));

create or replace function public.approved_leave_ranges(p_from date, p_to date)
returns table (profile_id uuid, date_from date, date_to date)
language sql
stable
security definer
set search_path to 'public'
as $$
  select lr.profile_id, lr.date_from, lr.date_to
  from public.leave_requests lr
  where lr.status = 'approved'
    and lr.date_from <= p_to
    and lr.date_to >= p_from
    and (public.is_approved() or public.is_admin())
$$;

revoke all on function public.approved_leave_ranges(date, date) from public, anon;
grant execute on function public.approved_leave_ranges(date, date) to authenticated;
