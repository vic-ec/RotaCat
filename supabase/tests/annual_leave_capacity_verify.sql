-- Verification for migration 20261110120000_annual_leave_capacity_rpc_and_over_capacity.sql
--
-- Run in the Supabase SQL editor (service role) AFTER applying the migration.
-- Nothing here writes: every block is a SELECT, or a transaction that is
-- rolled back. Replace the :params marked <<...>> before running.
--
-- ─────────────────────────────────────────────────────────────────────────
-- 1. Schema landed
-- ─────────────────────────────────────────────────────────────────────────
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'leave_requests'
  and column_name in ('over_capacity', 'capacity_breach');
-- expect 2 rows: over_capacity boolean NOT NULL default false,
--                capacity_breach text nullable

select p.proname, p.prosecdef as security_definer, p.proconfig
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('annual_leave_capacity', 'annual_leave_capacity_column');
-- expect annual_leave_capacity: security_definer = true, proconfig = {search_path=public}
--        annual_leave_capacity_column: security_definer = false, proconfig = {search_path=public}

select grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public' and routine_name = 'annual_leave_capacity';
-- expect authenticated (and the owner); NOT anon, NOT PUBLIC

-- ─────────────────────────────────────────────────────────────────────────
-- 2. The RPC agrees with an independent recount
--    Pick a doctor and a range where other doctors have annual leave
--    (pending AND approved) — e.g. a week you can see on the Annual planner.
-- ─────────────────────────────────────────────────────────────────────────
-- 2a. The RPC's own per-day counts (as the service role, no auth.uid(); the
--     admin guard is skipped because is_admin() is evaluated for the
--     service role — if it returns false in your project, run this block
--     wrapped in the "as admin" transaction of step 4 instead).
select d.value->>'date' as day,
       (d.value->>'MO')::int as mo, (d.value->>'Registrar')::int as registrar,
       (d.value->>'EC_Intern')::int as ec_intern, (d.value->>'OT_Intern')::int as ot_intern
from jsonb_array_elements(
  public.annual_leave_capacity('<<DOCTOR_PROFILE_UUID>>', '<<YYYY-MM-DD>>', '<<YYYY-MM-DD>>')->'day_counts'
) d;

-- 2b. The same thing recounted by hand, straight off leave_requests. The two
--     result sets must be identical, row for row.
with days as (
  select generate_series('<<YYYY-MM-DD>>'::date, '<<YYYY-MM-DD>>'::date, interval '1 day')::date as day
),
per_doctor_day as (
  select distinct days.day, lr.profile_id
  from days
  join public.leave_requests lr
    on lr.leave_type = 'annual'
   and lr.status in ('pending', 'approved')
   and lr.profile_id <> '<<DOCTOR_PROFILE_UUID>>'
   and lr.date_from <= days.day and lr.date_to >= days.day
)
select days.day,
       count(*) filter (where public.annual_leave_capacity_column(pd.profile_id, days.day) = 'MO') as mo,
       count(*) filter (where public.annual_leave_capacity_column(pd.profile_id, days.day) = 'Registrar') as registrar,
       count(*) filter (where public.annual_leave_capacity_column(pd.profile_id, days.day) = 'EC_Intern') as ec_intern,
       count(*) filter (where public.annual_leave_capacity_column(pd.profile_id, days.day) = 'OT_Intern') as ot_intern
from days
left join per_doctor_day pd on pd.day = days.day
group by days.day
order by days.day;

-- 2c. The headline fields for the same call.
select r->>'column_key' as column_key, r->>'column_max' as column_max, r->>'fulltime_max' as fulltime_max,
       r->>'pooled' as pooled, r->'worst' as worst, r->>'breach' as breach, r->'breach_dates' as breach_dates, r->'limits' as limits
from public.annual_leave_capacity('<<DOCTOR_PROFILE_UUID>>', '<<YYYY-MM-DD>>', '<<YYYY-MM-DD>>') r;
-- Check by hand against 2b: with the live limits (MO 2, Registrar 2,
-- EC Intern 2, OT Intern 1, full-time pool 2):
--   breach = 'column'   when, on some day, <own column count> + 1 > column_max
--   breach = 'fulltime' when (pooled) and, on some day, mo+registrar+ec_intern + 1 > 2
--   breach = 'none'     otherwise
--   worst = the day with the least room left (ties: the earliest day)

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Bucketing matches the JS for the tricky cases
-- ─────────────────────────────────────────────────────────────────────────
-- An Intern: EC on one side of a rotation boundary, OT on the other.
select r.start_date, r.end_date, r.rotation_type,
       public.annual_leave_capacity_column(r.doctor_id, r.start_date) as column_on_start,
       public.annual_leave_capacity_column(r.doctor_id, coalesce(r.end_date, r.start_date)) as column_on_end
from public.intern_rotations r
order by r.doctor_id, r.start_date
limit 20;
-- expect EC rotations -> EC_Intern, OT rotations -> OT_Intern

-- An Intern with no rotation on a date falls back to contract type.
select p.id, p.category, p.contract_type,
       public.annual_leave_capacity_column(p.id, '1900-01-01') as column_with_no_rotation
from public.profiles p
where p.category = 'Intern'
limit 10;
-- expect Junior_Doctor_Overtime -> OT_Intern, anything else -> EC_Intern

-- Consultants and locums have no cap.
select p.category, public.annual_leave_capacity_column(p.id, current_date) as column_key
from public.profiles p
where p.category in ('Consultant', 'Locum')
limit 5;
-- expect column_key null for every row

-- ─────────────────────────────────────────────────────────────────────────
-- 4. The guard: a doctor may only read their own capacity
--    (rolled back; nothing is written)
-- ─────────────────────────────────────────────────────────────────────────
begin;
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '<<NON_ADMIN_DOCTOR_UUID>>', 'role', 'authenticated')::text, true);
  -- own id: works
  select public.annual_leave_capacity('<<NON_ADMIN_DOCTOR_UUID>>', current_date, current_date)->>'breach';
  -- another doctor's id: must raise
  --   ERROR: annual_leave_capacity: only an admin may check another doctor's capacity (42501)
  select public.annual_leave_capacity('<<OTHER_DOCTOR_UUID>>', current_date, current_date)->>'breach';
rollback;

begin;
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', '<<ADMIN_UUID>>', 'role', 'authenticated')::text, true);
  -- an admin may read anyone's
  select public.annual_leave_capacity('<<OTHER_DOCTOR_UUID>>', current_date, current_date)->>'breach';
rollback;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Bug 1 regression, end to end (rolled back)
--    Doctor A has a PENDING MO request; doctor B (also MO) checks the same
--    week. Before this migration B's browser could not see A's pending row.
-- ─────────────────────────────────────────────────────────────────────────
begin;
  -- Two pending MO rows from two other MOs fill the full-time pool (2):
  insert into public.leave_requests (profile_id, leave_type, date_from, date_to, status, annual_leave_days)
  values ('<<MO_A_UUID>>', 'annual', '2030-03-04', '2030-03-08', 'pending', 5),
         ('<<MO_C_UUID>>', 'annual', '2030-03-06', '2030-03-06', 'pending', 1);
  select r->>'breach' as breach, r->'breach_dates' as breach_dates, r->'worst' as worst
  from public.annual_leave_capacity('<<MO_B_UUID>>', '2030-03-02', '2030-03-10') r;
  -- expect breach = 'column' (MO 2 + 1 > 2 on 2030-03-06; the MO cap and the
  -- pool cap are both 2, and the column breach is reported first),
  -- breach_dates = ["2030-03-06"], worst.date = 2030-03-06,
  -- worst.column_taken = 2, worst.fulltime_taken = 2
rollback;
