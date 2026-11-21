-- Admin capture of leave on a doctor's behalf.
--
-- Until now leave_insert only let a doctor file their own row
-- (profile_id = auth.uid()), so an admin had no way to log leave for someone
-- else: a doctor phoning in sick, or leave being captured after the fact.
--
-- 1. submitted_by records WHO filed the row when that wasn't the doctor
--    themself. NULL means the doctor filed it (every row before this
--    migration, and every self-submitted row after it).
-- 2. leave_insert_admin lets an admin insert a row for any profile, and only
--    with their own id in submitted_by, so the audit field can't name
--    another admin.
-- 3. leave_insert (the doctor's own policy) is re-created with
--    submitted_by IS NULL, so a doctor can't file their own row and attribute
--    it to an admin.

alter table public.leave_requests
  add column if not exists submitted_by uuid references public.profiles(id) on delete set null;

comment on column public.leave_requests.submitted_by is
  'Admin who captured this leave on the doctor''s behalf. NULL when the doctor filed it themself.';

drop policy if exists leave_insert on public.leave_requests;
create policy leave_insert on public.leave_requests
  for insert
  to authenticated
  with check (
    profile_id = auth.uid()
    and (not is_locum())
    and (not is_clerk())
    and submitted_by is null
  );

drop policy if exists leave_insert_admin on public.leave_requests;
create policy leave_insert_admin on public.leave_requests
  for insert
  to authenticated
  with check (
    is_admin()
    and submitted_by = auth.uid()
  );
