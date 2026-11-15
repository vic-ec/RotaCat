-- Cancel leave (pending or approved), from either side, with a reason.
--
-- Doctors could never cancel before: leave_update_own_pending forces a row
-- to stay pending, and nothing in the app offered a cancel at all. Admins
-- could approve or reject but never undo an approval. Both now go through
-- one SECURITY DEFINER function so the rules live in one place and so a
-- doctor's cancellation can notify the admins (notif_insert does not let a
-- doctor write another person's notification).
--
-- Rules (agreed 2026-11-15):
--   * Only pending or approved leave can be cancelled; rejected stays as is.
--   * A reason is required from everyone.
--   * Doctors may cancel their own future leave only (starts after today),
--     pending or approved, with no cut-off. Locums and clerks cannot.
--   * Admins may cancel anyone's leave, including leave already started —
--     the correction path for "came back early" or a retro mistake.
--   * The row is kept with status 'cancelled' plus who/when/why; the
--     original reviewed_by/reviewed_at are left intact for the audit trail.
--   * Balances and capacity are derived from approved rows, so nothing else
--     needs unwinding.
-- Notifications: an admin cancelling someone else's leave notifies that
-- person; a doctor cancelling their own notifies every active admin.

alter table public.leave_requests
  add column if not exists cancelled_at  timestamptz,
  add column if not exists cancelled_by  uuid references public.profiles(id) on delete set null,
  add column if not exists cancel_reason text;

comment on column public.leave_requests.cancel_reason is
  'Why the leave was cancelled (required). Set together with cancelled_at/cancelled_by by cancel_leave_request(); reviewed_by/reviewed_at keep the original decision.';

create or replace function public.cancel_leave_request(p_request_id uuid, p_reason text)
returns public.leave_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller      uuid := auth.uid();
  v_admin       boolean := public.is_admin();
  v_reason      text := nullif(btrim(coalesce(p_reason, '')), '');
  v_req         public.leave_requests;
  v_prev_status public.request_status;
  v_type_label  text;
  v_period      text;
  v_actor_name  text;
  v_owner_name  text;
begin
  if v_caller is null then
    raise exception 'You must be signed in to cancel leave.';
  end if;
  if v_reason is null or length(v_reason) < 3 then
    raise exception 'Please give a reason for cancelling this leave.';
  end if;

  select * into v_req from public.leave_requests where id = p_request_id for update;
  if not found then
    raise exception 'This leave request no longer exists.';
  end if;
  if v_req.status = 'cancelled' then
    raise exception 'This leave has already been cancelled.';
  end if;
  if v_req.status not in ('pending', 'approved') then
    raise exception 'Only pending or approved leave can be cancelled.';
  end if;

  if not v_admin then
    if v_req.profile_id <> v_caller then
      raise exception 'You can only cancel your own leave.';
    end if;
    if public.is_locum() or public.is_clerk() then
      raise exception 'Your account cannot cancel leave. Please ask an admin.';
    end if;
    if v_req.date_from <= current_date then
      raise exception 'Leave that has already started can only be cancelled by an admin.';
    end if;
  end if;

  v_prev_status := v_req.status;

  update public.leave_requests
     set status        = 'cancelled',
         cancelled_at  = now(),
         cancelled_by  = v_caller,
         cancel_reason = v_reason
   where id = p_request_id
  returning * into v_req;

  -- ── Notify ────────────────────────────────────────────────────────────
  v_type_label := replace(v_req.leave_type::text, '_', ' ');
  v_period := to_char(v_req.date_from, 'DD Mon YYYY')
              || case when v_req.date_to <> v_req.date_from then ' to ' || to_char(v_req.date_to, 'DD Mon YYYY') else '' end;
  select btrim(coalesce(name, '') || ' ' || coalesce(surname, '')) into v_actor_name from public.profiles where id = v_caller;
  select btrim(coalesce(name, '') || ' ' || coalesce(surname, '')) into v_owner_name from public.profiles where id = v_req.profile_id;

  if v_caller <> v_req.profile_id then
    insert into public.notifications (profile_id, type, title, body, link)
    values (
      v_req.profile_id,
      'leave_cancelled',
      'Your leave was cancelled',
      format('Your %s leave (%s) was cancelled by %s. Reason: %s',
             v_type_label, v_period, coalesce(nullif(v_actor_name, ''), 'an admin'), v_reason),
      '/leave'
    );
  else
    insert into public.notifications (profile_id, type, title, body, link)
    select p.id,
           'leave_cancelled',
           format('%s cancelled %s leave', coalesce(nullif(v_owner_name, ''), 'A doctor'),
                  case when v_prev_status = 'approved' then 'approved' else 'a pending' end),
           format('%s cancelled their %s leave (%s). Reason: %s',
                  coalesce(nullif(v_owner_name, ''), 'A doctor'), v_type_label, v_period, v_reason),
           '/leave?tab=team'
      from public.profiles p
     where p.is_admin = true
       and coalesce(p.is_active, true)
       and p.id <> v_caller;
  end if;

  return v_req;
end;
$$;

revoke all on function public.cancel_leave_request(uuid, text) from public;
grant execute on function public.cancel_leave_request(uuid, text) to authenticated;
