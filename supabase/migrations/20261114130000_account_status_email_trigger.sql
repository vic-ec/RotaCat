-- Email a self-registered person when an administrator approves or rejects
-- their registration. Until now the decision only flipped a flag, and the
-- pending screen's promise of a notification was never kept: the person
-- found out by trying to sign in again.
--
-- The email is sent by the account-status-email Edge Function; this
-- trigger calls it through pg_net after the row changes, so it works from
-- whichever screen made the decision and cannot be lost to a flaky admin
-- connection. Two Vault secrets tell the trigger where to call and how to
-- authenticate (see supabase/functions/account-status-email/README.md):
--
--   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/account-status-email', 'account_status_email_url');
--   select vault.create_secret('<long random string>', 'account_status_email_secret');
--
-- Nothing here can block an approval: every failure (missing secrets,
-- pg_net unavailable, network) is caught and logged as a warning, and the
-- profile update still commits.

create extension if not exists pg_net with schema extensions;

-- The admin's optional note on rejection. reject() used to put it only in
-- an in-app notification, which a rejected person can never sign in to
-- read; storing it on the row lets the email carry it.
alter table public.profiles add column if not exists rejection_note text;

create or replace function public.notify_account_status_email()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  v_event  text;
  v_url    text;
  v_secret text;
begin
  -- Only the two transitions that mean "a decision was made". An admin
  -- editing an already-approved profile, or re-saving a rejection, sends
  -- nothing.
  if new.is_approved = true and coalesce(old.is_approved, false) = false then
    v_event := 'approved';
  elsif new.is_rejected = true and coalesce(old.is_rejected, false) = false then
    v_event := 'rejected';
  else
    return new;
  end if;

  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'account_status_email_url'    limit 1;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'account_status_email_secret' limit 1;
  if v_url is null or v_secret is null then
    raise warning 'account-status-email: Vault secrets account_status_email_url / account_status_email_secret are not set; no % email sent for profile %', v_event, new.id;
    return new;
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-rotacat-webhook-secret', v_secret
    ),
    body    := jsonb_build_object('event', v_event, 'profile_id', new.id),
    timeout_milliseconds := 15000
  );
  return new;
exception when others then
  raise warning 'account-status-email: could not queue % email for profile %: %', v_event, new.id, sqlerrm;
  return new;
end;
$$;

revoke all on function public.notify_account_status_email() from public;

drop trigger if exists account_status_email on public.profiles;
create trigger account_status_email
  after update of is_approved, is_rejected on public.profiles
  for each row
  execute function public.notify_account_status_email();
