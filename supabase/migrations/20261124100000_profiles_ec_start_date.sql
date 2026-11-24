-- The date a doctor started working in the Emergency Centre. Rosters
-- before 2026 were rebuilt from the paper ones, so an MO who joined
-- part-way through the year shows no shifts for the months before:
-- the hours checks treat days before this date as "not here", the same
-- way they treat leave, instead of flagging them as under their hours.
-- Interns and registrars use their rotation dates instead.
alter table public.profiles add column if not exists ec_start_date date;
comment on column public.profiles.ec_start_date is
  'First day in the Emergency Centre. Days before it are not counted against the contracted minimum.';
