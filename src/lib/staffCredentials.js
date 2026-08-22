// Frontend half of the admin-staff-credentials Edge Function — the only
// path in the app that creates an auth user or issues a password on
// someone else's behalf. Both live behind the service role key, so
// neither can be done with a plain supabase-js call from here.
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
 * as often as needed — there's no link and no expiry involved.
 */
export async function regenerateStaffPassword(profileId) {
  return invoke({ action: 'regenerate', profileId })
}
