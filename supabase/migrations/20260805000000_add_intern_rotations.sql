-- Interns rotate between two EC Cosmo sub-types (EC / OT) in blocks of
-- roughly one to two months across their four-month placement — which
-- applies is date-driven, not a static profiles.category value the way
-- every other category is. This table lets an admin lay down those blocks
-- per doctor, freely editable (including last-minute swaps) since the
-- leave planner always reads it live rather than caching a snapshot.
-- Dormant until interns are reactivated in January 2027 (see profiles
-- category enum), same as the rest of the Intern category machinery.

create table public.intern_rotations (
  id uuid primary key default uuid_generate_v4(),
  doctor_id uuid not null references public.profiles(id) on delete cascade,
  rotation_type text not null check (rotation_type in ('EC', 'OT')),
  start_date date not null,
  end_date date not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint intern_rotations_valid_range check (end_date >= start_date)
);

create index intern_rotations_doctor_id_idx on public.intern_rotations(doctor_id);
create index intern_rotations_date_range_idx on public.intern_rotations(start_date, end_date);

create trigger intern_rotations_updated_at
  before update on public.intern_rotations
  for each row execute function update_updated_at();

alter table public.intern_rotations enable row level security;

-- Same shape as weekend_planner_entries: admins get full CRUD, everyone
-- else (bar locums, who never touch the leave/rotation planners at all)
-- gets read-only — every capacity-counting call site needs to resolve a
-- rotation for doctors other than the viewer, not just their own.
create policy intern_rotations_admin_all on public.intern_rotations
  for all
  to authenticated
  using (is_admin())
  with check (is_admin());

create policy intern_rotations_select on public.intern_rotations
  for select
  to authenticated
  using (not is_locum());
