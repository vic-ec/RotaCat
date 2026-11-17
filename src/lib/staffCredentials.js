// Frontend half of the admin-staff-credentials Edge Function — the only
// path in the app that creates an auth user, issues a password or changes
// a login email on someone else's behalf. All of it lives behind the
// service role key, so none can be done with a plain supabase-js call
// from here.
//
// Both calls report the two outcomes separately on purpose: creating the
// account and delivering the password are independent steps, and an email
// that bounces must not read as "the account wasn't created". When
// delivery fails the function hands the generated password back once, in
// this response only, so the admin can relay it by hand — it is never
// persisted and never logged.
import { supabase } from './supabase'

const FUNCTION_NAME = 'admin-staff-credentials'

// supabase-js surfaces a non-2xx function response as an error with the
// real body tucked away on error.context — without this, every server-side
// validation message ("An account with that email address already exists")
// would reach the admin as the generic "Edge Function returned a non-2xx
// status code".
async function readError(error) {
  try {
    const body = await error.context?.json?.()
    if (body?.error) return body.error
  } catch {
    /* not a JSON body — fall through to the generic message */
  }
  return error.message || 'Something went wrong. Please try again.'
}

async function invoke(body) {
  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, { body })
  if (error) return { ok: false, error: await readError(error) }
  if (!data?.ok) return { ok: false, error: data?.error || 'Something went wrong. Please try again.' }
  return data
}

/**
 * Creates a confirmed auth user with a generated password, fills in their
 * profile from the admin's form, and emails them their credentials.
 * Resolves to { ok, profileId, emailSent, password?, emailError?, rotationError? }
 * or { ok: false, error }.
 */
export async function createStaffAccount(fields) {
  return invoke({ action: 'create', ...fields })
}

/**
 * Issues a fresh password for an existing account, invalidating the
 * previous one, and re-flags it for a forced password change. Repeatable
 * as often as needed — there's no link involved — but the password itself
 * is temporary: valid for TEMP_PASSWORD_VALIDITY_DAYS (see tempPassword.js)
 * from the moment it is issued.
 */
export async function regenerateStaffPassword(profileId) {
  return invoke({ action: 'regenerate', profileId })
}

/**
 * Super-admin only: replaces another person's login email, effective
 * immediately and with no confirmation email. With sendCredentials true it
 * also issues a fresh temporary password to the new address; with false
 * the password is left alone. Not for the caller's own email — that is the
 * self-service supabase.auth.updateUser flow on the Account page.
 * Resolves to { ok, profileId, email, credentialsIssued, emailSent?,
 * emailError?, password?, credentialsError? } or { ok: false, error }.
 */
export async function changeStaffEmail(profileId, email, sendCredentials) {
  return invoke({ action: 'change_email', profileId, email, sendCredentials: sendCredentials === true })
}

/**
 * Permanently removes an account: the auth user and, by cascade, the
 * profile and the person's own leave, rotation and planner rows. Refused
 * for admins, for the caller's own account, and for anyone with roster
 * history (deactivate those instead). Resolves to { ok } or { ok: false, error }.
 */
export async function deleteStaffAccount(profileId) {
  return invoke({ action: 'delete', profileId })
}
