-- Audit round 1 — Phase 1: RLS & function hardening
-- Applied to project fdivkvaevroibcupwaeb via Supabase MCP; recorded here for review.

-- 1.2 helper: mirrors the existing is_admin()/is_consultant() shape.
CREATE OR REPLACE FUNCTION public.is_approved()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_approved = true)
$$;

-- 1.1: profiles_select_all (qual `true`) made the approval check on
-- profiles_select meaningless, since RLS policies OR together.
DROP POLICY profiles_select_all ON public.profiles;

-- 1.1 follow-up: the surviving qual's `is_approved = true` tests the TARGET
-- row's approval, not the CALLER's, so dropping profiles_select_all alone still
-- let an unapproved account read every approved profile. Gate on the caller.
ALTER POLICY profiles_select ON public.profiles
USING (
  id = auth.uid()
  OR (is_approved() AND is_approved = true)
  OR is_admin()
);

-- 1.2: require an approved profile on the remaining SELECT policies,
-- always OR'd with is_admin() so admins are never excluded.
ALTER POLICY roster_entries_select ON public.roster_entries
USING (
  is_approved() AND EXISTS (
    SELECT 1 FROM public.roster_months rm
    WHERE rm.id = roster_entries.roster_month_id
      AND rm.status IN ('published', 'archived')
  ) OR is_admin()
);

ALTER POLICY roster_months_select ON public.roster_months
USING (
  is_approved() AND deleted_at IS NULL AND status IN ('published', 'archived')
  OR is_admin()
);

ALTER POLICY weekend_patterns_select ON public.weekend_patterns
USING (is_approved() AND NOT is_locum() OR is_admin());

ALTER POLICY intern_rotations_select ON public.intern_rotations
USING (is_approved() AND NOT is_locum() OR is_admin());

ALTER POLICY weekend_planner_entries_select ON public.weekend_planner_entries
USING (is_approved() AND NOT is_locum() OR is_admin());

-- Reference data: gated for consistency so an unapproved account reads nothing.
ALTER POLICY shift_types_select ON public.shift_types
USING (is_approved() OR is_admin());

ALTER POLICY public_holidays_select ON public.public_holidays
USING (is_approved() OR is_admin());

ALTER POLICY constraints_select ON public.constraints
USING (is_approved() OR is_admin());

-- 1.3: SECURITY DEFINER function that DELETEs with no caller check. Only the
-- cron job needs it, and cron runs as postgres. Note that Postgres grants
-- EXECUTE to PUBLIC by default and anon/authenticated inherit it, so the
-- PUBLIC grant must be revoked too -- revoking the two roles alone is a no-op.
REVOKE EXECUTE ON FUNCTION public.purge_old_binned_rosters() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.purge_old_binned_rosters() FROM PUBLIC;

-- 1.4: archive/unarchive is an admin action; it was only checking is_approved.
CREATE OR REPLACE FUNCTION public.set_roster_months_archived(p_ids uuid[], p_archived boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;

  update public.roster_months
  set status = case when p_archived then 'archived'::roster_status else 'published'::roster_status end,
      archived_at = case when p_archived then now() else null end
  where id = any(p_ids)
    and deleted_at is null
    and status in ('published', 'archived');
end;
$function$;

-- 1.5: UPDATE policy with no WITH CHECK let any authenticated user rewrite any
-- field on any open ad.
ALTER POLICY ads_claim ON public.shift_advertisements
WITH CHECK (claimed_by = auth.uid() AND status = 'claimed');

-- 1.9: swaps_select_own duplicated swaps_select_involved verbatim;
-- swaps_update_target_or_admin silently defeated the NOT is_clerk() guard.
DROP POLICY swaps_select_own ON public.swap_requests;
DROP POLICY swaps_update_target ON public.swap_requests;
DROP POLICY swaps_update_target_or_admin ON public.swap_requests;

CREATE POLICY swaps_update_target ON public.swap_requests
FOR UPDATE
USING ((target_id = auth.uid() AND NOT is_clerk()) OR is_admin());
