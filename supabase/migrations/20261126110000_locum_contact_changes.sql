-- A record of corrections to a rostered locum's contact details (today, the
-- mobile, edited from Staff → Requests → New Users): what it was, what it
-- became, who changed it and when. Written by a trigger, so every path
-- that updates the row is recorded, not only the Staff page's. Admin only,
-- like locum_contacts itself.
create table if not exists public.locum_contact_changes (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.locum_contacts(id) on delete cascade,
  field text not null,
  old_value text,
  new_value text,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now()
);
create index if not exists locum_contact_changes_contact_idx on public.locum_contact_changes (contact_id, changed_at desc);

alter table public.locum_contact_changes enable row level security;
drop policy if exists locum_contact_changes_admin_select on public.locum_contact_changes;
create policy locum_contact_changes_admin_select on public.locum_contact_changes
  for select using (public.is_admin());

create or replace function public.log_locum_contact_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.phone is distinct from old.phone then
    insert into public.locum_contact_changes (contact_id, field, old_value, new_value, changed_by)
    values (new.id, 'phone', old.phone, new.phone, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists locum_contacts_log_change on public.locum_contacts;
create trigger locum_contacts_log_change
  after update on public.locum_contacts
  for each row execute function public.log_locum_contact_change();
