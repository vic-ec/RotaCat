-- Locums on the roster who have no RotaCat account yet.
--
-- A locum confirmed over the phone has to go on the roster at once, and an
-- account needs an email address the admin may not have to hand. A
-- placeholder holds the little that IS known (name, mobile) so the shift can
-- be assigned now; when the account is made later every shift filed under
-- the placeholder moves onto it (see linkLocumPlaceholder in the frontend).
--
-- Admin-only: it carries a phone number. The roster row itself only ever
-- shows the name (roster_entries.locum_name), as locum rows always have.

create table if not exists public.locum_placeholders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  surname text not null,
  phone text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  linked_profile_id uuid references public.profiles(id) on delete set null,
  linked_at timestamptz
);

alter table public.locum_placeholders enable row level security;

drop policy if exists locum_placeholders_admin_all on public.locum_placeholders;
create policy locum_placeholders_admin_all on public.locum_placeholders
  for all
  to authenticated
  using (is_admin())
  with check (is_admin());

alter table public.roster_entries
  add column if not exists locum_placeholder_id uuid references public.locum_placeholders(id) on delete set null;

create index if not exists roster_entries_locum_placeholder_id_idx
  on public.roster_entries (locum_placeholder_id)
  where locum_placeholder_id is not null;
