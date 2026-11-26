-- Accounts an admin has handed over that nobody has used yet: approved,
-- not rejected, current (active, or with a start date still to come),
-- issued a temporary password (must_change_password), and no sign-in on
-- record in auth.users.
--
-- must_change_password alone is not the test: it is also set when an admin
-- issues a new temporary password to someone who has signed in before (a
-- forgotten password), and that person's account is not new. And a missing
-- sign-in alone is not either: staff profiles set up for the roster before
-- anyone was given a password have never signed in, but were never handed
-- over.
--
-- Admin only (empty for anyone else). Read by the admin dashboard's
-- "accounts have not signed in yet" row and the Staff list's
-- "Not signed in yet" filter.
create or replace function public.never_signed_in_profile_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
    from public.profiles p
    join auth.users u on u.id = p.id
   where public.is_admin()
     and p.is_approved = true
     and coalesce(p.is_rejected, false) = false
     and (p.is_active = true or p.scheduled_active_date is not null)
     and p.must_change_password = true
     and u.last_sign_in_at is null
$$;

revoke all on function public.never_signed_in_profile_ids() from public, anon;
grant execute on function public.never_signed_in_profile_ids() to authenticated;
