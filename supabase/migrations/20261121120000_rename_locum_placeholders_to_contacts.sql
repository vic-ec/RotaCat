-- "Placeholder" already means something else on the roster: an open locum
-- slot nobody is on yet ("[ ]"). The table added in 20261121110000 holds
-- PEOPLE — locums known by name and mobile only, with no account yet — so it
-- is renamed to say so, before anything depends on the old name.
--
-- Idempotent: each step is skipped when already done.

do $$
begin
  if to_regclass('public.locum_placeholders') is not null and to_regclass('public.locum_contacts') is null then
    alter table public.locum_placeholders rename to locum_contacts;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'roster_entries' and column_name = 'locum_placeholder_id'
  ) then
    alter table public.roster_entries rename column locum_placeholder_id to locum_contact_id;
  end if;

  if to_regclass('public.roster_entries_locum_placeholder_id_idx') is not null then
    alter index public.roster_entries_locum_placeholder_id_idx rename to roster_entries_locum_contact_id_idx;
  end if;

  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'locum_contacts' and policyname = 'locum_placeholders_admin_all') then
    alter policy locum_placeholders_admin_all on public.locum_contacts rename to locum_contacts_admin_all;
  end if;

  if exists (select 1 from pg_constraint where conname = 'locum_placeholders_pkey') then
    alter table public.locum_contacts rename constraint locum_placeholders_pkey to locum_contacts_pkey;
  end if;
  if exists (select 1 from pg_constraint where conname = 'locum_placeholders_created_by_fkey') then
    alter table public.locum_contacts rename constraint locum_placeholders_created_by_fkey to locum_contacts_created_by_fkey;
  end if;
  if exists (select 1 from pg_constraint where conname = 'locum_placeholders_linked_profile_id_fkey') then
    alter table public.locum_contacts rename constraint locum_placeholders_linked_profile_id_fkey to locum_contacts_linked_profile_id_fkey;
  end if;
  if exists (select 1 from pg_constraint where conname = 'roster_entries_locum_placeholder_id_fkey') then
    alter table public.roster_entries rename constraint roster_entries_locum_placeholder_id_fkey to roster_entries_locum_contact_id_fkey;
  end if;
end $$;
