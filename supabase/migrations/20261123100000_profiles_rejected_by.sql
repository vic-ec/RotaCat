-- Who declined a sign-up, and when. A rejected registration kept only
-- is_rejected and the note; the Staff page's All Requests history needs
-- the reviewer and the time, as it has for approvals (approved_by /
-- approved_at). Nullable: rejections before this show no reviewer.

alter table public.profiles
  add column if not exists rejected_by uuid references public.profiles(id) on delete set null,
  add column if not exists rejected_at timestamptz;

comment on column public.profiles.rejected_by is 'Admin who declined this sign-up (null for rejections before the column existed).';
comment on column public.profiles.rejected_at is 'When the sign-up was declined.';

-- Verification:
--   select column_name, data_type from information_schema.columns
--   where table_schema = 'public' and table_name = 'profiles' and column_name in ('rejected_by', 'rejected_at');
