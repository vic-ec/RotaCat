-- Retires the four COSMO-named staff_category values (COSMO, COSMOPsych,
-- EC_COSMO_Intern, OT_COSMO_Intern), leaving one junior-doctor identity —
-- Intern — plus the two resolved EC/OT pools it fans out into.
--
-- Why: the enum carried two parallel vocabularies for the same thing. A
-- junior doctor's identity was COSMO *or* Intern depending on when they
-- were added, and their EC/OT placement was expressed as
-- COSMO/COSMOPsych by one write path (weekendPlanner.js's
-- resolvedCategoryForDoctor) and EC_Intern/OT_Intern by another (the
-- date-aware resolveEffectiveCategory + this file's
-- resolve_effective_category). Both landed in the same two buckets
-- everywhere they were read, so the duplication bought nothing and made
-- the category picker unreadable.
--
-- After this migration:
--   profiles.category          — who someone IS: MO, Registrar, Intern,
--                                Consultant (locums/clerks carry null)
--   EC_Intern / OT_Intern      — what an Intern RESOLVES TO on a given
--                                date, from contract_type + their
--                                intern_rotations block. Written onto
--                                weekend_planner rows and used as the two
--                                junior leave-capacity pools; never
--                                assigned to a person directly.
--
-- The remap is lossless in meaning: every read path already grouped
-- COSMO with EC_Intern and COSMOPsych with OT_Intern (see
-- LEAVE_CAPACITY_COLUMNS in leaveYearGrid.js and CATEGORY_GROUPS in
-- weekendPlanner.js), so these rows land in exactly the bucket they were
-- already counted in.

-- ── Reversibility ───────────────────────────────────────────────────
-- Every row this migration rewrites is recorded first. RLS on with no
-- policies: unreachable through the API, readable only by the service
-- role, so retired category history can't leak into the app.
create table if not exists public.category_cleanup_backup_2026_08 (
  id           bigint generated always as identity primary key,
  source_table text        not null,
  row_id       uuid        not null,
  old_category text        not null,
  backed_up_at timestamptz not null default now()
);
alter table public.category_cleanup_backup_2026_08 enable row level security;

comment on table public.category_cleanup_backup_2026_08 is
  'Pre-migration snapshot for 20260822140000_retire_cosmo_categories: every row whose staff_category was rewritten off a COSMO-named value. Kept so the remap can be undone; safe to drop once the new vocabulary has bedded in.';

insert into public.category_cleanup_backup_2026_08 (source_table, row_id, old_category)
select 'profiles', id, category::text from public.profiles
  where category::text in ('COSMO', 'COSMOPsych', 'EC_COSMO_Intern', 'OT_COSMO_Intern')
union all
select 'staff_reference', id, category::text from public.staff_reference
  where category::text in ('COSMO', 'COSMOPsych', 'EC_COSMO_Intern', 'OT_COSMO_Intern')
union all
select 'weekend_planner_entries', id, category::text from public.weekend_planner_entries
  where category::text in ('COSMO', 'COSMOPsych', 'EC_COSMO_Intern', 'OT_COSMO_Intern')
union all
select 'weekend_planner_changes', id, category::text from public.weekend_planner_changes
  where category::text in ('COSMO', 'COSMOPsych', 'EC_COSMO_Intern', 'OT_COSMO_Intern');

-- ── Remap ───────────────────────────────────────────────────────────
-- profiles/staff_reference hold a person's identity, so a COSMO doctor
-- becomes an Intern. Their EC/OT band is untouched — it already lives in
-- contract_type + psych_subcategory + intern_rotations, which is exactly
-- what now resolves them to the EC or OT pool.
update public.profiles        set category = 'Intern' where category::text = 'COSMO';
update public.staff_reference set category = 'Intern' where category::text = 'COSMO';

-- weekend_planner rows hold a RESOLVED category, not an identity, so
-- theirs map onto the surviving pool values instead.
update public.weekend_planner_entries set category = 'EC_Intern'
  where category::text in ('COSMO', 'EC_COSMO_Intern');
update public.weekend_planner_entries set category = 'OT_Intern'
  where category::text in ('COSMOPsych', 'OT_COSMO_Intern');
update public.weekend_planner_changes set category = 'EC_Intern'
  where category::text in ('COSMO', 'EC_COSMO_Intern');
update public.weekend_planner_changes set category = 'OT_Intern'
  where category::text in ('COSMOPsych', 'OT_COSMO_Intern');

-- ── Swap the enum ───────────────────────────────────────────────────
-- Postgres can't drop a value from an enum in place, so the type is
-- rebuilt. Everything that depends on it has to come off first and go
-- back on identically afterwards: one CHECK constraint, one function
-- whose return type is the enum, and the two RLS policies whose
-- expressions read profiles.category (a policy referencing the column
-- blocks ALTER COLUMN ... TYPE outright).
drop function if exists public.resolve_effective_category(uuid, date);
alter table public.profiles drop constraint if exists category_role_rules;
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists leave_select on public.leave_requests;

alter type public.staff_category rename to staff_category_retired_2026_08;

create type public.staff_category as enum (
  'MO', 'Registrar', 'Consultant', 'EC_Intern', 'OT_Intern', 'Intern', 'Locum'
);

alter table public.profiles
  alter column category type public.staff_category using category::text::public.staff_category;
alter table public.staff_reference
  alter column category type public.staff_category using category::text::public.staff_category;
alter table public.weekend_planner_entries
  alter column category type public.staff_category using category::text::public.staff_category;
alter table public.weekend_planner_changes
  alter column category type public.staff_category using category::text::public.staff_category;

drop type public.staff_category_retired_2026_08;

-- ── Put the dependents back, unchanged ──────────────────────────────
alter table public.profiles add constraint category_role_rules check (
  role = 'doctor'::user_role
  or (role = 'locum'::user_role and (category is null or category = any (array['MO'::staff_category, 'Registrar'::staff_category])))
  or (role = 'clerk'::user_role and category is null)
);

create policy profiles_update_own on public.profiles
  as permissive for update to public
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select p.role from public.profiles p where p.id = auth.uid())
    and not (category is distinct from (select p.category from public.profiles p where p.id = auth.uid()))
    and is_admin = (select p.is_admin from public.profiles p where p.id = auth.uid())
    and is_super_admin = (select p.is_super_admin from public.profiles p where p.id = auth.uid())
    and is_approved = (select p.is_approved from public.profiles p where p.id = auth.uid())
    and is_active = (select p.is_active from public.profiles p where p.id = auth.uid())
  );

create policy leave_select on public.leave_requests
  as permissive for select to authenticated
  using (
    is_admin()
    or (not is_locum() and profile_id = auth.uid())
    or (
      not is_locum() and not is_clerk() and status = 'approved'::request_status
      and (
        is_consultant()
        or not exists (select 1 from public.profiles p where p.id = leave_requests.profile_id and p.category = 'Consultant'::staff_category)
      )
    )
    or (
      is_clerk() and status = 'approved'::request_status
      and not exists (select 1 from public.profiles p where p.id = leave_requests.profile_id and p.category = 'Consultant'::staff_category)
    )
  );

-- Intern is now the only date-dependent category — COSMO's branch is gone
-- along with the value itself. Otherwise identical to the version this
-- replaces, including the "most recently started rotation wins" tie-break
-- for the overlapping rows that exist in real data.
create or replace function public.resolve_effective_category(p_doctor_id uuid, p_target_date date)
returns staff_category
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_base_category staff_category;
  v_rotation_type text;
begin
  select category into v_base_category
  from public.profiles
  where id = p_doctor_id;

  if v_base_category is null or v_base_category <> 'Intern' then
    return v_base_category;
  end if;

  select rotation_type into v_rotation_type
  from public.intern_rotations
  where doctor_id = p_doctor_id
    and start_date <= p_target_date
    and (end_date is null or end_date >= p_target_date)
  order by start_date desc
  limit 1;

  -- No rotation covers this date: fall back to the base category. Callers
  -- should treat that as "needs a rotation record for this date", not a
  -- confident resolution -- surface it, don't silently guess.
  if v_rotation_type is null then
    return v_base_category;
  end if;

  return case v_rotation_type
    when 'EC' then 'EC_Intern'::staff_category
    when 'OT' then 'OT_Intern'::staff_category
    else v_base_category
  end;
end;
$function$;
