-- When an admin-issued password was handed out, so it can expire.
--
-- Set by the admin-staff-credentials function alongside
-- must_change_password (account creation and every Regenerate password),
-- cleared with it when the person sets their own. The window itself (14
-- days) lives in the app (src/lib/tempPassword.js) and the function's
-- email copy; sign-in and the set-password screen both refuse an expired
-- one and point the person at an admin.
--
-- Backfilled to now() rather than to each account's creation date: the
-- accounts still on a temporary password today were issued under the old
-- "never expires" promise, and some belong to doctors whose start date is
-- still ahead. Everyone gets one full window from the day this ships.
alter table public.profiles
  add column if not exists temp_password_issued_at timestamptz;

update public.profiles
   set temp_password_issued_at = now()
 where must_change_password = true
   and temp_password_issued_at is null;

comment on column public.profiles.temp_password_issued_at is
  'When the current admin-issued password was set (see must_change_password). The app treats it as expired 14 days later; null once the person has set their own password.';
