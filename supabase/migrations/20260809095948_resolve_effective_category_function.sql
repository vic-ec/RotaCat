-- Date-aware EC/OT resolution for Intern/COSMO doctors. profiles.category
-- alone is ambiguous for these two values — the real EC/OT split lives in
-- intern_rotations.rotation_type, keyed by date, not a static profiles
-- field. Powers the Weekend Planner's doctor pickers/grouping (frontend:
-- resolveEffectiveCategory in src/lib/weekendPlanner.js batch-mirrors this
-- same logic client-side rather than firing one RPC call per doctor — see
-- that function's own comment) and is designed to also back the future
-- Leave Planner's resolveLeaveCapacityColumn work.
--
-- Real intern_rotations rows can overlap for the same doctor (seen live) —
-- the most recently STARTED row covering the target date wins. If nothing
-- covers the target date, this falls back to the doctor's plain base
-- category (Intern/COSMO) rather than erroring or guessing; callers should
-- treat that as "needs a rotation record for this date," not a confident
-- resolution.
create or replace function resolve_effective_category(
  p_doctor_id uuid,
  p_target_date date
)
returns staff_category
language plpgsql
stable
as $$
declare
  v_base_category staff_category;
  v_rotation_type text;
begin
  select category into v_base_category
  from profiles
  where id = p_doctor_id;

  -- Only Intern and COSMO are date-dependent (per AMBIGUOUS_CATEGORIES on the frontend).
  -- Everyone else passes through unchanged.
  if v_base_category is null or v_base_category not in ('Intern', 'COSMO') then
    return v_base_category;
  end if;

  -- Most specific / most recently entered rotation wins if rows overlap
  -- (seen in real data: doctor 598ccb0a... has two overlapping rows for Aug 5-31).
  select rotation_type into v_rotation_type
  from intern_rotations
  where doctor_id = p_doctor_id
    and start_date <= p_target_date
    and (end_date is null or end_date >= p_target_date)
  order by start_date desc
  limit 1;

  -- No rotation record covers this date: fall back to the base category.
  -- Callers should treat this as "needs a rotation record for this date," not a
  -- confident resolution -- surface it, don't silently guess.
  if v_rotation_type is null then
    return v_base_category;
  end if;

  if v_base_category = 'Intern' then
    return case v_rotation_type
      when 'EC' then 'EC_Intern'::staff_category
      when 'OT' then 'OT_Intern'::staff_category
      else v_base_category
    end;
  end if;

  if v_base_category = 'COSMO' then
    return case v_rotation_type
      when 'EC' then 'EC_COSMO_Intern'::staff_category
      when 'OT' then 'OT_COSMO_Intern'::staff_category
      else v_base_category
    end;
  end if;

  return v_base_category;
end;
$$;
