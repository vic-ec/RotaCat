// account-status-email — emails a self-registered person when an
// administrator approves or rejects their registration.
//
// Called by the database, not the browser: the trigger in
// supabase/migrations/20261114130000_account_status_email_trigger.sql
// fires after `profiles.is_approved` or `profiles.is_rejected` flips to
// true and POSTs here through pg_net. That is deliberate — the decision
// and the email are then tied to the row changing, so it works whichever
// screen approved, and a flaky admin connection cannot lose the email.
//
// Auth: there is no signed-in user on a database call, so verify_jwt is
// OFF for this function (deploy with --no-verify-jwt). Instead the caller
// must present the shared secret in `x-rotacat-webhook-secret`, matching
// the ACCOUNT_STATUS_EMAIL_SECRET function secret. The same value is
// stored in Supabase Vault for the trigger to read — see the README.
//
// Body: { "event": "approved" | "rejected", "profile_id": "<uuid>" }
// Everything else (name, email, start date, the admin's note) is read
// from the database here, so the payload cannot be used to send an
// arbitrary email to an arbitrary address even if the secret leaked.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { sendApprovedEmail, sendRejectedEmail } from './email.ts'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

// Constant-time comparison so the secret can't be guessed byte by byte
// from response timing.
function secretsMatch(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const x = enc.encode(a), y = enc.encode(b)
  if (x.length !== y.length) return false
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' })

  const expected = Deno.env.get('ACCOUNT_STATUS_EMAIL_SECRET')
  if (!expected) {
    console.error('ACCOUNT_STATUS_EMAIL_SECRET is not set; refusing every call.')
    return json(500, { error: 'Function is not configured.' })
  }
  const presented = req.headers.get('x-rotacat-webhook-secret') ?? ''
  if (!secretsMatch(presented, expected)) return json(401, { error: 'Unauthorized' })

  let body: { event?: string; profile_id?: string }
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'Body must be JSON.' })
  }
  const event = body.event
  const profileId = body.profile_id
  if ((event !== 'approved' && event !== 'rejected') || typeof profileId !== 'string') {
    return json(400, { error: 'Expected { event: "approved" | "rejected", profile_id }.' })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, name, is_approved, is_rejected, is_active, scheduled_active_date, rejection_note')
    .eq('id', profileId)
    .maybeSingle()
  if (profileError) return json(500, { error: profileError.message })
  if (!profile) return json(404, { error: 'No such profile.' })

  // Re-check the state from the row rather than trusting the event name:
  // a stale or replayed call must not send "approved" to someone who was
  // since rejected, or vice versa.
  if (event === 'approved' && profile.is_approved !== true) return json(409, { error: 'Profile is not approved.' })
  if (event === 'rejected' && profile.is_rejected !== true) return json(409, { error: 'Profile is not rejected.' })

  const { data: userData, error: userError } = await admin.auth.admin.getUserById(profileId)
  if (userError || !userData?.user?.email) return json(404, { error: 'No email address for this profile.' })

  const firstName = (profile.name ?? '').trim() || 'there'
  const to = userData.user.email
  const appUrl = Deno.env.get('APP_URL') ?? null

  try {
    if (event === 'approved') {
      // Only mention a start date when the account is actually waiting on
      // one: approve() sets is_active=false with the date for a future
      // "Active from", and true with no date otherwise.
      const activeFrom = profile.is_active === false && profile.scheduled_active_date
        ? String(profile.scheduled_active_date)
        : null
      await sendApprovedEmail({ to, firstName, appUrl, activeFrom })
    } else {
      await sendRejectedEmail({ to, firstName, appUrl, reason: profile.rejection_note ?? null })
    }
  } catch (err) {
    // Log recipient and outcome only — never the body.
    console.error(`account-status-email: ${event} email to ${to} failed:`, err instanceof Error ? err.message : err)
    return json(502, { error: 'Email could not be sent.' })
  }

  console.log(`account-status-email: sent ${event} email to ${to}`)
  return json(200, { ok: true })
})
