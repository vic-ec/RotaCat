-- First-sign-in onboarding for interns and registrars: set your own
-- password, confirm your contact details, and lay out your rotation
-- blocks before the app lets you in.
--
-- The rotation half is the point. intern_rotations is what resolves an
-- intern to the EC or OT pool on any given date (see
-- resolve_effective_category), and it was being filled in only when an
-- admin got round to it — 5 of 17 active interns and all 6 registrars had
-- no rotation row at all when this was written. Asking the person who
-- actually knows their placement dates, at the one moment they're paying
-- attention, fills it at the source.
alter table public.profiles
  add column onboarding_completed_at timestamptz null;

comment on column public.profiles.onboarding_completed_at is
  'When this person finished first-sign-in onboarding (password, contact details, rotation blocks). Null on an Intern/Registrar means the app routes them to /welcome before anything else. Backfilled for everyone who predates the flow, so it only ever gates accounts created after it shipped.';

-- Everyone already on the system has been working for months; they are not
-- made to re-onboard. Only accounts created from here on start with null.
update public.profiles set onboarding_completed_at = now();

-- ── Submission ──────────────────────────────────────────────────────
-- intern_rotations is admin-only under RLS (intern_rotations_admin_all),
-- and profiles_update_own pins is_active to its current value — both
-- correct, and both mean an intern cannot file their own rotation plan
-- with ordinary client calls. This is the narrow, audited exception:
-- SECURITY DEFINER, acting only on auth.uid()'s own row, callable only by
-- an Intern or Registrar who hasn't onboarded yet, and only once.
--
-- Doing it in one function also makes it atomic. Split across client
-- calls, a failure between "rotations inserted" and "profile updated"
-- would leave someone permanently stuck on the welcome screen with
-- half-written rotation history behind them.
create or replace function public.complete_onboarding(
  p_phone     text,
  p_rotations jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid           uuid := auth.uid();
  v_category      staff_category;
  v_role          user_role;
  v_done          timestamptz;
  v_sched_active  date;
  v_active        boolean;
  v_rot           jsonb;
  v_type          text;
  v_subtype       text;
  v_start         date;
  v_end           date;
  v_current_type  text;
  v_current_sub   text;
  v_contract      contract_type;
  v_min           int;
  v_max           int;
begin
  if v_uid is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;

  select category, role, onboarding_completed_at, scheduled_active_date, is_active
    into v_category, v_role, v_done, v_sched_active, v_active
  from public.profiles where id = v_uid;

  if not found then
    raise exception 'No profile for this account.' using errcode = '42501';
  end if;
  if v_done is not null then
    raise exception 'Onboarding has already been completed for this account.' using errcode = '22023';
  end if;
  if v_role <> 'doctor' or v_category not in ('Intern', 'Registrar') then
    raise exception 'Onboarding is only for intern and registrar accounts.' using errcode = '42501';
  end if;
  if p_rotations is null or jsonb_typeof(p_rotations) <> 'array' or jsonb_array_length(p_rotations) = 0 then
    raise exception 'Add at least one rotation block.' using errcode = '22023';
  end if;

  -- Replace rather than append. The form is pre-filled with whatever
  -- blocks already exist (an admin may have entered a first one at
  -- account creation), so what comes back is the complete picture as the
  -- person confirmed it — appending would duplicate those rows.
  delete from public.intern_rotations where doctor_id = v_uid;

  for v_rot in select value from jsonb_array_elements(p_rotations) loop
    v_type    := nullif(trim(v_rot->>'rotation_type'), '');
    v_subtype := nullif(trim(v_rot->>'subtype'), '');
    v_start   := (v_rot->>'start_date')::date;
    v_end     := (v_rot->>'end_date')::date;

    if v_type is null or v_type not in ('EC', 'OT') then
      raise exception 'Rotation type must be EC or OT.' using errcode = '22023';
    end if;
    -- Registrars are EC-only: the OT band belongs to the
    -- Junior_Doctor_Overtime contract, which a registrar never carries.
    if v_category = 'Registrar' and v_type <> 'EC' then
      raise exception 'Registrar rotations are EC only.' using errcode = '22023';
    end if;
    if v_type = 'EC' then
      v_subtype := null;
    elsif v_subtype is null or v_subtype not in ('DPM_BCH', 'LRCHC', 'PSYCH') then
      raise exception 'Choose which OT rotation this is.' using errcode = '22023';
    end if;
    if v_start is null then
      raise exception 'Every rotation needs a start date.' using errcode = '22023';
    end if;
    if v_end is not null and v_end < v_start then
      raise exception 'A rotation cannot end before it starts.' using errcode = '22023';
    end if;

    -- Overlaps make resolve_effective_category ambiguous for the dates in
    -- question, so they are rejected here rather than silently resolved
    -- by its most-recently-started tie-break.
    if exists (
      select 1 from public.intern_rotations r
      where r.doctor_id = v_uid
        and r.start_date <= coalesce(v_end, 'infinity'::date)
        and coalesce(r.end_date, 'infinity'::date) >= v_start
    ) then
      raise exception 'Rotation dates overlap each other. Check the start and end dates.' using errcode = '22023';
    end if;

    insert into public.intern_rotations (doctor_id, rotation_type, subtype, start_date, end_date, created_by)
    values (v_uid, v_type, v_subtype, v_start, v_end, v_uid);
  end loop;

  -- Cache the band they're on today onto the profile, the same four
  -- fields syncProfileFromCurrentRotation writes (internRotations.js).
  -- Falls forward to the earliest block that hasn't started yet when none
  -- covers today, so someone onboarding before their start date still
  -- gets the right hours rather than the 0/0 the trigger left.
  select rotation_type, subtype into v_current_type, v_current_sub
  from public.intern_rotations
  where doctor_id = v_uid
    and start_date <= current_date
    and (end_date is null or end_date >= current_date)
  order by start_date desc
  limit 1;

  if v_current_type is null then
    select rotation_type, subtype into v_current_type, v_current_sub
    from public.intern_rotations
    where doctor_id = v_uid and start_date > current_date
    order by start_date asc
    limit 1;
  end if;

  v_contract := case when v_current_type = 'OT' then 'Junior_Doctor_Overtime'::contract_type else 'full'::contract_type end;
  v_min      := case when v_current_type = 'OT' then 64  else 220 end;
  v_max      := case when v_current_type = 'OT' then 72  else 246 end;

  update public.profiles
  set phone                   = nullif(trim(coalesce(p_phone, '')), ''),
      contract_type           = v_contract,
      psych_subcategory       = case when v_current_type = 'OT' then v_current_sub else null end,
      min_hours               = v_min,
      max_hours               = v_max,
      onboarding_completed_at = now(),
      -- Same rule as the apply-scheduled-status-changes cron, applied now
      -- rather than at 00:05 tomorrow: someone whose start date has
      -- already arrived shouldn't finish onboarding and still be excluded
      -- from scheduling. A future start date is left for the cron.
      is_active               = v_active or (v_sched_active is not null and v_sched_active <= current_date),
      scheduled_active_date   = case when v_sched_active is not null and v_sched_active <= current_date then null else v_sched_active end
  where id = v_uid;
end;
$function$;

comment on function public.complete_onboarding(text, jsonb) is
  'Files an intern/registrar''s own rotation plan and contact details at first sign-in, then marks onboarding done. SECURITY DEFINER because intern_rotations is admin-only under RLS and profiles_update_own pins is_active; acts only on auth.uid(), only for an Intern/Registrar, and only once.';

-- Signed-in accounts only. Left executable by anon, this would be an
-- unauthenticated entry point into a definer function.
revoke execute on function public.complete_onboarding(text, jsonb) from public, anon;
grant execute on function public.complete_onboarding(text, jsonb) to authenticated;
