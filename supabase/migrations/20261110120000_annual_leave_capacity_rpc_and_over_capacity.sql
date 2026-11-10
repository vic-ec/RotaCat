-- Annual-leave capacity, counted server-side.
--
-- Why: checkAnnualLeaveCapacity (src/lib/leaveRequests.js) used to count
-- the other doctors' overlapping annual leave in the browser. The
-- leave_select RLS policy hides every OTHER doctor's PENDING request from a
-- non-admin, so a doctor submitting never saw pending leave at all and two
-- overlapping requests both passed the cap. This RPC runs as SECURITY
-- DEFINER so it sees every pending/approved row, and returns COUNTS ONLY —
-- never a name, a profile id or a date range of anyone else's leave — so it
-- gives away nothing the policy was protecting.
--
-- It is the single source of truth for three callers in the app:
--   - submission (checkAnnualLeaveCapacity): a breach no longer blocks; the
--     row is inserted with over_capacity = true and capacity_breach set, for
--     an admin to approve as overbooked leave
--   - the request form's live preview (fetchAnnualCapacityPreview), so the
--     preview and the submission can never disagree
--   - approval (getApprovalWarnings): a live re-check with
--     p_exclude_request_id = the request under review, independent of the
--     stored over_capacity flag
--
-- ── Bucketing rules: SQL and JS side by side ──────────────────────────────
-- Keep these two in sync. The JS half is columnForLeaveCategory
-- (src/lib/leaveYearGrid.js) + resolveLeaveCapacityColumn
-- (src/lib/internRotations.js); the SQL half is annual_leave_capacity_column
-- below, built on the existing resolve_effective_category(doctor_id, date).
--
--   effective category (per doctor, per date)   JS column    SQL column
--   MO                                           MO           MO
--   Registrar                                    Registrar    Registrar
--   EC_Intern                                    EC_Intern    EC_Intern
--   OT_Intern                                    OT_Intern    OT_Intern
--   Intern with a rotation covering the date     EC/OT by     EC/OT by
--                                                rotation     rotation
--   Intern/COSMO with NO rotation on the date    contract_type = 'Junior_Doctor_Overtime'
--                                                  -> OT_Intern, else EC_Intern (both)
--   EC_COSMO_Intern / OT_COSMO_Intern (legacy,   (JS never     EC_Intern /
--     only ever produced for a COSMO base         produces      OT_Intern
--     category, retired Aug 2026)                 them)
--   Consultant, Locum, anything else             null         null
--                                                (no cap)     (no cap)
--
--   Shared pool ("full-time EC doctors"):  MO + Registrar + EC_Intern,
--     capped by constraints.leave_max_concurrent_fulltime (default 2).
--   OT_Intern: its own independent cap, not part of the pool.
--   Per-column caps: constraints.leave_max_concurrent_{mo,registrar,
--     ec_intern,ot_intern}; defaults 2 / 2 / 2 / 1 (LEAVE_CAPACITY_COLUMNS).
--   A doctor occupies one column on a day at most, however many of their
--     rows overlap that day (countByColumnPerDate's seenProfiles / the
--     DISTINCT below).
--   Only status in ('pending','approved') counts; rejected/withdrawn never.
--   Breach: on any day, others_in_column + 1 > column_max  -> 'column';
--     else, for a pooled column, others_in_pool + 1 > fulltime_max
--     -> 'fulltime'. A column breach outranks a fulltime one, as in the
--     old JS (findLeaveCapacityBreach ran before findFullTimeAggregateBreach).
--
--   Known, deliberate differences:
--   - JS resolved every OTHER doctor's column once per ROW, off that row's
--     own date_from; SQL resolves per DAY, so an Intern whose rotation flips
--     mid-request is counted in the right pool on each side of the flip.
--   - JS picked the first rotation row covering the date in fetch order;
--     resolve_effective_category picks the most recently STARTED one when
--     rows overlap. Overlapping rotation rows are a data error either way.
--
-- Verification: supabase/tests/annual_leave_capacity_verify.sql.

-- ── 1. The column a doctor's annual leave counts against on a given date ──
create or replace function public.annual_leave_capacity_column(
  p_profile_id uuid,
  p_date date
)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_category text;
  v_contract text;
begin
  select contract_type::text into v_contract
  from public.profiles
  where id = p_profile_id;

  v_category := public.resolve_effective_category(p_profile_id, p_date)::text;

  return case v_category
    when 'MO' then 'MO'
    when 'Registrar' then 'Registrar'
    when 'EC_Intern' then 'EC_Intern'
    when 'EC_COSMO_Intern' then 'EC_Intern'
    when 'OT_Intern' then 'OT_Intern'
    when 'OT_COSMO_Intern' then 'OT_Intern'
    -- No rotation covers the date (resolve_effective_category fell back to
    -- the base category): the same contract-type default the JS uses.
    when 'Intern' then case when v_contract = 'Junior_Doctor_Overtime' then 'OT_Intern' else 'EC_Intern' end
    when 'COSMO' then case when v_contract = 'Junior_Doctor_Overtime' then 'OT_Intern' else 'EC_Intern' end
    else null
  end;
end;
$$;

revoke execute on function public.annual_leave_capacity_column(uuid, date) from public, anon;

comment on function public.annual_leave_capacity_column(uuid, date) is
'SQL twin of columnForLeaveCategory + resolveLeaveCapacityColumn (src/lib): which Annual Leave capacity column (MO / Registrar / EC_Intern / OT_Intern, or null for an uncapped category) a doctor''s leave counts against on a date. Called by annual_leave_capacity; keep in sync with the JS — see the rules table in migration 20261110120000.';

-- ── 2. The capacity read itself ───────────────────────────────────────────
create or replace function public.annual_leave_capacity(
  p_profile_id uuid,
  p_date_from date,
  p_date_to date,
  p_exclude_request_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_max_mo int;
  v_max_registrar int;
  v_max_ec_intern int;
  v_max_ot_intern int;
  v_max_fulltime int;
  v_own_column_from text;  -- the submitter's column at p_date_from: what the UI labels
  v_own_column text;       -- the submitter's column on the day being scanned
  v_own_max int;
  v_pooled boolean;
  v_day date;
  v_mo int; v_registrar int; v_ec_intern int; v_ot_intern int;
  v_column_taken int;
  v_fulltime_taken int;
  v_headroom int;
  v_day_column_breach boolean;
  v_day_fulltime_breach boolean;
  v_column_breach boolean := false;
  v_fulltime_breach boolean := false;
  v_breach_dates date[] := '{}';
  v_worst_date date;
  v_worst_column_taken int;
  v_worst_fulltime_taken int;
  v_worst_headroom int;
  v_day_counts jsonb := '[]'::jsonb;
begin
  if p_profile_id is null or p_date_from is null or p_date_to is null then
    raise exception 'annual_leave_capacity: p_profile_id, p_date_from and p_date_to are required'
      using errcode = '22023';
  end if;
  if p_date_from > p_date_to then
    raise exception 'annual_leave_capacity: p_date_from must not be after p_date_to'
      using errcode = '22023';
  end if;
  -- A caller may only read their own capacity unless they are an admin.
  if p_profile_id <> auth.uid() and not public.is_admin() then
    raise exception 'annual_leave_capacity: only an admin may check another doctor''s capacity'
      using errcode = '42501';
  end if;

  -- Limits, with the same defaults as LEAVE_CAPACITY_COLUMNS /
  -- LEAVE_FULL_TIME_DEFAULT_MAX in src/lib/leaveYearGrid.js.
  select coalesce(max(nullif(trim(value), '')::int) filter (where key = 'leave_max_concurrent_mo'), 2),
         coalesce(max(nullif(trim(value), '')::int) filter (where key = 'leave_max_concurrent_registrar'), 2),
         coalesce(max(nullif(trim(value), '')::int) filter (where key = 'leave_max_concurrent_ec_intern'), 2),
         coalesce(max(nullif(trim(value), '')::int) filter (where key = 'leave_max_concurrent_ot_intern'), 1),
         coalesce(max(nullif(trim(value), '')::int) filter (where key = 'leave_max_concurrent_fulltime'), 2)
    into v_max_mo, v_max_registrar, v_max_ec_intern, v_max_ot_intern, v_max_fulltime
  from public.constraints
  where key in (
    'leave_max_concurrent_mo', 'leave_max_concurrent_registrar', 'leave_max_concurrent_ec_intern',
    'leave_max_concurrent_ot_intern', 'leave_max_concurrent_fulltime'
  );

  v_own_column_from := public.annual_leave_capacity_column(p_profile_id, p_date_from);

  for v_day in
    select d::date from generate_series(p_date_from, p_date_to, interval '1 day') as d
  loop
    -- Every OTHER doctor with pending/approved annual leave on this day,
    -- once each, bucketed by the column they are in ON THIS DAY.
    select
      count(*) filter (where col = 'MO'),
      count(*) filter (where col = 'Registrar'),
      count(*) filter (where col = 'EC_Intern'),
      count(*) filter (where col = 'OT_Intern')
      into v_mo, v_registrar, v_ec_intern, v_ot_intern
    from (
      select distinct lr.profile_id
      from public.leave_requests lr
      where lr.leave_type = 'annual'
        and lr.status in ('pending', 'approved')
        and lr.profile_id <> p_profile_id
        and (p_exclude_request_id is null or lr.id <> p_exclude_request_id)
        and lr.date_from <= v_day
        and lr.date_to >= v_day
    ) others
    cross join lateral (select public.annual_leave_capacity_column(others.profile_id, v_day) as col) c;

    v_day_counts := v_day_counts || jsonb_build_object(
      'date', v_day, 'MO', v_mo, 'Registrar', v_registrar, 'EC_Intern', v_ec_intern, 'OT_Intern', v_ot_intern
    );

    v_own_column := public.annual_leave_capacity_column(p_profile_id, v_day);
    if v_own_column is null then
      continue; -- no cap applies to this doctor (Consultant/Locum) — nothing to breach
    end if;

    v_own_max := case v_own_column
      when 'MO' then v_max_mo
      when 'Registrar' then v_max_registrar
      when 'EC_Intern' then v_max_ec_intern
      when 'OT_Intern' then v_max_ot_intern
    end;
    v_column_taken := case v_own_column
      when 'MO' then v_mo
      when 'Registrar' then v_registrar
      when 'EC_Intern' then v_ec_intern
      when 'OT_Intern' then v_ot_intern
    end;
    v_pooled := v_own_column in ('MO', 'Registrar', 'EC_Intern');
    v_fulltime_taken := v_mo + v_registrar + v_ec_intern;

    v_day_column_breach := v_column_taken + 1 > v_own_max;
    v_day_fulltime_breach := v_pooled and v_fulltime_taken + 1 > v_max_fulltime;
    if v_day_column_breach then v_column_breach := true; end if;
    if v_day_fulltime_breach then v_fulltime_breach := true; end if;
    if v_day_column_breach or v_day_fulltime_breach then
      v_breach_dates := v_breach_dates || v_day;
    end if;

    -- The day with the least room left, in whichever limit is tighter
    -- (least() ignores the null for an unpooled column). Ties go to the
    -- earliest day, matching the old JS findWorstAnnualCapacitySlot.
    v_headroom := least(v_own_max - v_column_taken,
                        case when v_pooled then v_max_fulltime - v_fulltime_taken end);
    if v_worst_date is null or v_headroom < v_worst_headroom then
      v_worst_date := v_day;
      v_worst_column_taken := v_column_taken;
      v_worst_fulltime_taken := v_fulltime_taken;
      v_worst_headroom := v_headroom;
    end if;
  end loop;

  return jsonb_build_object(
    'column_key', v_own_column_from,
    'column_max', case v_own_column_from
      when 'MO' then v_max_mo
      when 'Registrar' then v_max_registrar
      when 'EC_Intern' then v_max_ec_intern
      when 'OT_Intern' then v_max_ot_intern
    end,
    'fulltime_max', v_max_fulltime,
    'pooled', v_own_column_from in ('MO', 'Registrar', 'EC_Intern'),
    'worst', case when v_worst_date is null then null else jsonb_build_object(
      'date', v_worst_date,
      'column_taken', v_worst_column_taken,
      'fulltime_taken', v_worst_fulltime_taken
    ) end,
    'breach', case when v_column_breach then 'column' when v_fulltime_breach then 'fulltime' else 'none' end,
    'breach_dates', to_jsonb(v_breach_dates),
    -- Counts only, never names: lets the request form preview ANOTHER
    -- column's room ("Checking capacity for" picker) from the same read,
    -- so every reading on screen comes from this one function.
    'limits', jsonb_build_object(
      'MO', v_max_mo, 'Registrar', v_max_registrar, 'EC_Intern', v_max_ec_intern,
      'OT_Intern', v_max_ot_intern, 'fulltime', v_max_fulltime
    ),
    'day_counts', v_day_counts
  );
end;
$$;

revoke execute on function public.annual_leave_capacity(uuid, date, date, uuid) from public, anon;
grant execute on function public.annual_leave_capacity(uuid, date, date, uuid) to authenticated;

comment on function public.annual_leave_capacity(uuid, date, date, uuid) is
'Annual-leave capacity for one doctor over a date range, counted over every OTHER doctor''s pending+approved annual leave regardless of RLS (SECURITY DEFINER; returns counts only, never names). A caller may only pass their own profile id unless is_admin(). Result: { column_key, column_max, fulltime_max, pooled, worst: { date, column_taken, fulltime_taken }, breach: none|column|fulltime, breach_dates, limits, day_counts }. See migration 20261110120000 for the bucketing rules shared with the JS.';

-- ── 3. Over-capacity requests are flagged, not blocked ────────────────────
alter table public.leave_requests
  add column if not exists over_capacity boolean not null default false,
  add column if not exists capacity_breach text null;

alter table public.leave_requests
  drop constraint if exists leave_requests_capacity_breach_check;
alter table public.leave_requests
  add constraint leave_requests_capacity_breach_check
  check (capacity_breach is null or capacity_breach in ('column', 'fulltime'));

comment on column public.leave_requests.over_capacity is
'True when annual_leave_capacity() reported a breach at submission time: the doctor submitted anyway (emergency), and an admin must consciously approve it as overbooked leave. Approval re-checks capacity live; this flag only records what the doctor was told.';
comment on column public.leave_requests.capacity_breach is
'Which limit was breached at submission when over_capacity is true: ''column'' (the doctor''s own category cap) or ''fulltime'' (the shared MO+Registrar+EC Intern pool). Null otherwise.';
