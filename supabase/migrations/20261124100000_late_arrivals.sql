-- Late arrivals, and the settings the "My year" page reads.
--
-- Additive only: one new table, one function, one trigger, three
-- app_settings rows. Nothing existing is renamed, altered or dropped
-- (ph_lieu_ledger stays as it is, unused). Safe to apply before the
-- frontend that uses it deploys.

-- ── late_arrivals ──────────────────────────────────────────────────────
-- One record per rostered shift someone arrived late for. Logged by an
-- admin against a roster entry; the date, shift and shift start are copied
-- onto the record so it survives later edits to the roster.
create table if not exists public.late_arrivals (
  id uuid primary key default gen_random_uuid(),
  roster_entry_id uuid references public.roster_entries(id) on delete set null,
  profile_id uuid references public.profiles(id) on delete set null,
  locum_contact_id uuid references public.locum_contacts(id) on delete set null,
  locum_name text,
  entry_date date not null,
  shift_code text not null,
  shift_start time not null,
  arrived_at time not null,
  minutes_late integer not null check (minutes_late between 1 and 720),
  reason_given text,
  logged_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz
);

comment on table public.late_arrivals is
  'Late arrivals for rostered shifts. Admins read and write every row. Nobody else can read the table: a doctor sees only their own records, and only date, shift, shift start, arrival time, minutes late and reason given, through get_my_late_arrivals() — never who logged it — and only while app_settings.attendance_visible_to_staff is ''true''. Deletes are soft (deleted_at).';

-- One live record per roster entry.
create unique index if not exists late_arrivals_one_per_entry
  on public.late_arrivals (roster_entry_id)
  where deleted_at is null and roster_entry_id is not null;
create index if not exists late_arrivals_profile_date on public.late_arrivals (profile_id, entry_date);
create index if not exists late_arrivals_entry_date on public.late_arrivals (entry_date);

-- Who and when is stamped here, not trusted from the browser.
create or replace function public.late_arrivals_stamp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.logged_by := coalesce(auth.uid(), new.logged_by);
    new.created_at := now();
    new.updated_by := null;
    new.updated_at := null;
    new.deleted_by := null;
    new.deleted_at := null;
    return new;
  end if;

  new.logged_by := old.logged_by;
  new.created_at := old.created_at;
  if new.deleted_at is not null and old.deleted_at is null then
    new.deleted_at := now();
    new.deleted_by := coalesce(auth.uid(), new.deleted_by);
  elsif new.deleted_at is null then
    new.deleted_by := null;
  else
    new.deleted_at := old.deleted_at;
    new.deleted_by := old.deleted_by;
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

drop trigger if exists late_arrivals_stamp on public.late_arrivals;
create trigger late_arrivals_stamp
  before insert or update on public.late_arrivals
  for each row execute function public.late_arrivals_stamp();

-- Access: admins only, directly. No delete policy — deletes are soft.
alter table public.late_arrivals enable row level security;

revoke all on public.late_arrivals from anon;
revoke all on public.late_arrivals from authenticated;
grant select, insert, update on public.late_arrivals to authenticated;

drop policy if exists late_arrivals_admin_select on public.late_arrivals;
create policy late_arrivals_admin_select on public.late_arrivals
  for select to authenticated using (public.is_admin());

drop policy if exists late_arrivals_admin_insert on public.late_arrivals;
create policy late_arrivals_admin_insert on public.late_arrivals
  for insert to authenticated with check (public.is_admin());

drop policy if exists late_arrivals_admin_update on public.late_arrivals;
create policy late_arrivals_admin_update on public.late_arrivals
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- A doctor's own records: six columns, nothing about who logged them, and
-- nothing at all once staff visibility is switched off.
create or replace function public.get_my_late_arrivals(p_year integer)
returns table (
  entry_date date,
  shift_code text,
  shift_start time,
  arrived_at time,
  minutes_late integer,
  reason_given text
)
language sql
stable
security definer
set search_path = public
as $$
  select l.entry_date, l.shift_code, l.shift_start, l.arrived_at, l.minutes_late, l.reason_given
  from public.late_arrivals l
  where l.profile_id = auth.uid()
    and l.deleted_at is null
    and l.entry_date >= make_date(p_year, 1, 1)
    and l.entry_date <= make_date(p_year, 12, 31)
    and exists (
      select 1 from public.app_settings s
      where s.key = 'attendance_visible_to_staff' and s.value = 'true'
    )
  order by l.entry_date desc
$$;

revoke all on function public.get_my_late_arrivals(integer) from public;
revoke all on function public.get_my_late_arrivals(integer) from anon;
grant execute on function public.get_my_late_arrivals(integer) to authenticated;

-- ── Settings ───────────────────────────────────────────────────────────
insert into public.app_settings (key, value) values
  ('attendance_visible_to_staff', 'true'),
  ('my_year_long_break_days', '120'),
  ('lieu_count_night_before_ph', 'false')
on conflict (key) do nothing;

-- Verification (run after applying):
--   -- 1. The table, its columns and its check.
--   select column_name, data_type, is_nullable from information_schema.columns
--   where table_schema = 'public' and table_name = 'late_arrivals' order by ordinal_position;
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'public.late_arrivals'::regclass;
--   -- 2. RLS is on, with three admin-only policies and none for delete.
--   select relrowsecurity from pg_class where oid = 'public.late_arrivals'::regclass;
--   select policyname, cmd, qual, with_check from pg_policies
--   where schemaname = 'public' and tablename = 'late_arrivals';
--   -- 3. One live record per roster entry.
--   select indexdef from pg_indexes where indexname = 'late_arrivals_one_per_entry';
--   -- 4. The function: security definer, six columns, not callable by anon.
--   select prosecdef, pg_get_function_result(oid) from pg_proc where proname = 'get_my_late_arrivals';
--   select has_function_privilege('anon', 'public.get_my_late_arrivals(integer)', 'execute');          -- false
--   select has_function_privilege('authenticated', 'public.get_my_late_arrivals(integer)', 'execute'); -- true
--   select has_table_privilege('anon', 'public.late_arrivals', 'select');                               -- false
--   -- 5. The three settings.
--   select key, value from public.app_settings
--   where key in ('attendance_visible_to_staff', 'my_year_long_break_days', 'lieu_count_night_before_ph');
