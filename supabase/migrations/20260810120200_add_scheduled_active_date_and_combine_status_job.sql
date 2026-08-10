-- Adds the counterpart to scheduled_inactive_date so a future activation
-- (a new registrant's start date, or reactivating a returning doctor) can
-- be scheduled the same way a deactivation already is, and combines both
-- directions into a single daily job — replacing
-- apply-scheduled-deactivations (see
-- 20260810120100_schedule_apply_scheduled_deactivations.sql) rather than
-- running two separate jobs.
alter table public.profiles
  add column scheduled_active_date date null;

comment on column public.profiles.scheduled_active_date is
  'If set and <= current date, the daily status job sets is_active=true and clears this column. Lets an admin schedule a future start (new registrant) or a reactivation (returning doctor) without exposing them to scheduling before that date.';

select cron.unschedule('apply-scheduled-deactivations');

select cron.schedule(
  'apply-scheduled-status-changes',
  '5 0 * * *',
  $$
    update public.profiles
    set is_active = true, scheduled_active_date = null
    where scheduled_active_date is not null
      and scheduled_active_date <= current_date
      and is_active = false;

    update public.profiles
    set is_active = false, scheduled_inactive_date = null
    where scheduled_inactive_date is not null
      and scheduled_inactive_date <= current_date
      and is_active = true;
  $$
);
