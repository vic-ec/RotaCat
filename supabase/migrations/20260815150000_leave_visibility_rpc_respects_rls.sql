-- Audit 1.6, resolved: doctors' leave is visible to doctors, clerks and admins,
-- but not to locums.
--
-- The leave_select policy on leave_requests already encodes exactly that rule
-- (plus the separate consultant-leave restriction from
-- 20260801085358_restrict_consultant_leave_visibility). The problem was that
-- this RPC was SECURITY DEFINER, so it bypassed that policy entirely and
-- applied only an is_approved check -- meaning any approved locum could read
-- every doctor currently on leave. Verified before the change: a locum got all
-- 4 doctors then on leave.
--
-- Switching to SECURITY INVOKER makes leave_select the single source of truth
-- rather than restating the rule here, where it had already drifted. The
-- is_approved() gate is kept explicitly, since leave_select does not check it.
--
-- Verified after: locum 0, doctor 4, clerk 4, admin 4.
CREATE OR REPLACE FUNCTION public.get_current_leave_profile_ids()
RETURNS TABLE(profile_id uuid)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  select lr.profile_id
  from public.leave_requests lr
  where lr.status = 'approved'
    and lr.date_from <= current_date
    and lr.date_to >= current_date
    and public.is_approved()
$$;
