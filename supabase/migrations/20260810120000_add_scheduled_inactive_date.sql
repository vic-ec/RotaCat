-- Lets an admin pre-schedule a deactivation (e.g. a graduating intern's
-- last rotation ending) without excluding them from scheduling before
-- their actual last working day — see the "end-of-rotation" queue on the
-- Intern Rotations Planner's Matrix view.
alter table public.profiles
  add column scheduled_inactive_date date null;

comment on column public.profiles.scheduled_inactive_date is
  'If set and <= current date, the daily deactivation job sets is_active=false and clears this column. Lets an admin pre-schedule a deactivation (e.g. a graduating intern''s last rotation ending) without excluding them from scheduling before their actual last working day.';
