-- A permanent record of every staff account an admin deletes from the app.
--
-- Deletion removes the auth user and, by cascade, the profile — so once
-- it has happened nothing in the database says the person ever existed.
-- This table keeps a snapshot of who was removed, by whom and when. It is
-- written only by the admin-staff-credentials Edge Function (service
-- role), immediately after the delete succeeds; there is deliberately no
-- INSERT/UPDATE/DELETE policy, so nothing signed in as an ordinary user
-- can add to or tidy up the history. Admins can read it (Staff list →
-- "Recently deleted").
create table if not exists public.account_deletion_log (
  id                 uuid primary key default gen_random_uuid(),
  deleted_profile_id uuid not null,
  name               text,
  surname            text,
  email              text,
  role               text,
  category           text,
  -- Who clicked delete. Set to null rather than cascading if that admin's
  -- own account is ever removed: the log entry must outlive everyone in it.
  deleted_by         uuid references public.profiles(id) on delete set null,
  deleted_at         timestamptz not null default now()
);

comment on table public.account_deletion_log is
  'Snapshot of each staff account deleted via the app, written by the admin-staff-credentials function. Read-only for admins; never written from the client.';

create index if not exists account_deletion_log_deleted_at_idx
  on public.account_deletion_log (deleted_at desc);

alter table public.account_deletion_log enable row level security;

drop policy if exists account_deletion_log_admin_select on public.account_deletion_log;
create policy account_deletion_log_admin_select
  on public.account_deletion_log
  for select
  using (is_admin());

revoke all on public.account_deletion_log from anon;
grant select on public.account_deletion_log to authenticated;
