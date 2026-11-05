-- A doctor can now give their activity period (the dates they are eligible
-- for shifts) on the Create-account form. It travels in the auth user's
-- metadata as active_from / active_until and lands on the profile as the
-- scheduled start/end, so the approving admin sees it pre-filled in the
-- Configure access period step. Nothing activates here: is_active stays
-- false until approval, which decides between "active now" and "scheduled"
-- from these dates the same way it always has.
--
-- Everything else in handle_new_user is unchanged from the live function.
create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_role     user_role;
  v_category staff_category;
  v_palette  text[] := array[
    '#E17055','#00B894','#6C5CE7','#0984E3','#FDCB6E','#E84393',
    '#16A085','#636E72','#A29BFE','#FF7675','#55EFC4','#FAB1A0',
    '#FD79A8','#F9CA24','#F0932B','#EB4D4B','#6AB04C','#22A6B3',
    '#4834D4','#7ED6DF',
    '#F368E0','#FF9F43','#EE5A24','#0FB9B1','#10AC84','#5F27CD',
    '#341F97','#C0392B','#8E44AD','#2C3E50','#27AE60','#2980B9',
    '#D35400','#FFC312','#B33771','#182C61','#12CBC4','#EA2027',
    '#5758BB','#009432'
  ];
  v_patterns text[] := array['dots','hearts','stars','diamonds','checkerboard','squares','spirals','triangles'];
  v_idx1 int;
  v_idx2 int;
  v_pattern_pick text;
  v_taken text[];
  v_attempts int := 0;
  v_active_from  date;
  v_active_until date;
begin
  v_role := case
    when new.raw_user_meta_data->>'role' = 'locum'  then 'locum'::user_role
    when new.raw_user_meta_data->>'role' = 'clerk'  then 'clerk'::user_role
    else 'doctor'::user_role
  end;

  v_category := case
    when v_role in ('locum', 'clerk') then null
    when new.raw_user_meta_data->>'category' is not null
      then (new.raw_user_meta_data->>'category')::staff_category
    else null
  end;

  -- The activity period is a doctor's to give; a malformed value is
  -- dropped rather than failing the sign-up over a date.
  if v_role = 'doctor' then
    begin
      v_active_from  := nullif(new.raw_user_meta_data->>'active_from', '')::date;
      v_active_until := nullif(new.raw_user_meta_data->>'active_until', '')::date;
    exception when others then
      v_active_from  := null;
      v_active_until := null;
    end;
    if v_active_from is not null and v_active_until is not null and v_active_until < v_active_from then
      v_active_until := null;
    end if;
  end if;

  -- Combos already in use by active profiles — recycled automatically once a
  -- profile goes inactive, since only active rows are considered "taken".
  select coalesce(array_agg(color_code || '|' || coalesce(pattern_type, '')), array[]::text[])
    into v_taken
    from public.profiles where is_active = true;

  loop
    v_idx1 := 1 + floor(random() * array_length(v_palette,1))::int;
    v_pattern_pick := v_patterns[1 + floor(random() * array_length(v_patterns,1))::int];
    v_attempts := v_attempts + 1;
    exit when v_attempts >= 30 or not ((v_palette[v_idx1] || '|' || v_pattern_pick) = any(v_taken));
  end loop;

  loop
    v_idx2 := 1 + floor(random() * array_length(v_palette,1))::int;
    exit when v_idx2 <> v_idx1;
  end loop;

  insert into public.profiles (
    id, name, surname, phone, role, category,
    is_active, is_approved, swap_group, min_hours, max_hours,
    color_code, pattern_dot_color, has_pattern, pattern_type,
    email_verified,
    scheduled_active_date, scheduled_inactive_date
  ) values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', ''),
    coalesce(new.raw_user_meta_data->>'surname', ''),
    nullif(new.raw_user_meta_data->>'phone', ''),
    v_role,
    v_category,
    false, false,
    case when v_role = 'locum' then 'locum' else 'senior' end,
    0, 0,
    v_palette[v_idx1], v_palette[v_idx2], true,
    v_pattern_pick,
    new.email_confirmed_at is not null,
    v_active_from, v_active_until
  );
  return new;
end;
$function$;
