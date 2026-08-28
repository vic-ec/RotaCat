-- One-time "you're still on the password an admin generated for you" flag,
-- set whenever an admin issues a password on someone's behalf (initial
-- admin-created account, and every subsequent password regeneration) and
-- cleared the moment that person sets their own password.
--
-- Deliberately NOT conflated with is_approved, which answers a different
-- question entirely: is_approved is "has an admin vetted that this person
-- belongs in the system", which for an admin-created account is already
-- settled at creation (the admin typed the person's real details — there's
-- no stranger to vet, unlike self-registration where anyone with an email
-- can sign up). must_change_password is security hygiene on the credential
-- itself and never re-opens the identity question: clearing it leaves
-- is_approved untouched.
--
-- The profiles_update_own RLS policy already permits this column (it pins
-- role/category/is_admin/is_super_admin/is_approved/is_active to their
-- current values and leaves everything else writable by the row's owner),
-- so a user clearing their own flag after setting a password needs no new
-- policy.
alter table public.profiles
  add column must_change_password boolean not null default false;

comment on column public.profiles.must_change_password is
  'True while the account is still using a password an admin generated for it. Login forces a mandatory set-your-own-password screen before any other route is reachable; clearing it does not touch is_approved.';
