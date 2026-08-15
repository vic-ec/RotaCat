-- Audit round 1 — 1.7: pin search_path on the eight functions flagged by
-- Supabase's Security Advisor (function_search_path_mutable). Logic is
-- unchanged; is_clerk/is_locum additionally get their `profiles` reference
-- schema-qualified, since both are SECURITY DEFINER.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $function$
  select exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
$function$;

CREATE OR REPLACE FUNCTION public.is_clerk()
RETURNS boolean LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $function$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'clerk')
$function$;

CREATE OR REPLACE FUNCTION public.is_locum()
RETURNS boolean LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $function$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'locum')
$function$;

CREATE OR REPLACE FUNCTION public.is_consultant()
RETURNS boolean LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $function$
  select exists (select 1 from public.profiles where id = auth.uid() and category = 'Consultant')
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.protect_admin_integrity()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public
AS $function$
begin
  if new.is_super_admin is distinct from old.is_super_admin
     and coalesce(current_setting('rotacat.allow_super_admin_change', true), 'false') != 'true' then
    raise exception 'Super-admin status can only change via transfer_super_admin()';
  end if;

  if old.is_super_admin and new.is_admin = false then
    raise exception 'Cannot remove admin from the super-admin account';
  end if;

  if old.is_admin and new.is_admin = false then
    if not exists (select 1 from public.profiles where is_admin and id != old.id) then
      raise exception 'Cannot remove the last remaining admin';
    end if;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.transfer_super_admin(new_super_admin_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $function$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_super_admin) then
    raise exception 'Only the current super-admin can transfer this role';
  end if;
  if not exists (select 1 from public.profiles where id = new_super_admin_id and is_admin) then
    raise exception 'The new super-admin must already be an admin';
  end if;
  if new_super_admin_id = auth.uid() then
    raise exception 'Already the super-admin';
  end if;

  perform set_config('rotacat.allow_super_admin_change', 'true', true);

  update public.profiles set is_super_admin = false where id = auth.uid();
  update public.profiles set is_super_admin = true where id = new_super_admin_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_effective_category(p_doctor_id uuid, p_target_date date)
RETURNS staff_category LANGUAGE plpgsql STABLE
SET search_path = public
AS $function$
declare
  v_base_category staff_category;
  v_rotation_type text;
begin
  select category into v_base_category
  from public.profiles
  where id = p_doctor_id;

  -- Only Intern and COSMO are date-dependent (per AMBIGUOUS_CATEGORIES on the frontend).
  -- Everyone else passes through unchanged.
  if v_base_category is null or v_base_category not in ('Intern', 'COSMO') then
    return v_base_category;
  end if;

  -- Most specific / most recently entered rotation wins if rows overlap
  -- (seen in real data: doctor 598ccb0a... has two overlapping rows for Aug 5-31).
  select rotation_type into v_rotation_type
  from public.intern_rotations
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
$function$;
