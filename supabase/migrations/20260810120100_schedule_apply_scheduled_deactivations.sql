-- Daily job that finalizes a pre-scheduled deactivation once its date
-- arrives (see profiles.scheduled_inactive_date and the Intern Rotations
-- Planner's end-of-rotation queue, which sets that column). Runs at
-- 00:05 UTC so it's clear of midnight-rollover edge cases on
-- current_date. Requires pg_cron (already enabled on this project).
select cron.schedule(
  'apply-scheduled-deactivations',
  '5 0 * * *',
  $$
    update public.profiles
    set is_active = false, scheduled_inactive_date = null
    where scheduled_inactive_date is not null
      and scheduled_inactive_date <= current_date
      and is_active = true;
  $$
);
