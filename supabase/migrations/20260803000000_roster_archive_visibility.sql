-- Lets any approved user (not just admins) see published AND archived
-- rosters, and archive/unarchive the ones they can see — supports the
-- doctor-facing Active/Archive tabs on the Roster page. Previously
-- roster_months_select only exposed 'published' rows to non-admins, which
-- also had the side effect of still showing a soft-deleted ('published' +
-- deleted_at set) roster to non-admins since deleted_at was never checked.

drop policy if exists roster_months_select on public.roster_months;
create policy roster_months_select on public.roster_months
  for select
  to authenticated
  using (
    (deleted_at is null and status in ('published', 'archived'))
    or is_admin()
  );

-- Non-admin write access is deliberately an RPC rather than a broader
-- UPDATE policy — mirrors permanently_delete_roster_months's SECURITY
-- DEFINER pattern, so the only column changes a non-admin can make
-- (status/archived_at, and only between published <-> archived) are
-- enforced in one guarded place instead of a WITH CHECK expression that
-- has to pin every other column to its previous value.
create or replace function public.set_roster_months_archived(p_ids uuid[], p_archived boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_approved = true) then
    raise exception 'not authorized';
  end if;

  update public.roster_months
  set status = case when p_archived then 'archived'::roster_status else 'published'::roster_status end,
      archived_at = case when p_archived then now() else null end
  where id = any(p_ids)
    and deleted_at is null
    and status in ('published', 'archived');
end;
$$;
