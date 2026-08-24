// Admin-initiated staff account creation and password regeneration.
//
// Both actions live in one function because they are the same operation
// with different starting points: generate a policy-compliant password
// server-side, attach it to an auth user, flag the profile as
// must_change_password, and email the person their credentials. Splitting
// them would mean two deployed bundles duplicating the generator, the
// email template and the admin check.
//
//   POST { action: 'create',     ...form fields }  → new auth user + profile
//   POST { action: 'regenerate', profileId }       → new password for an existing one
//
// This runs with the service role key and is therefore the only place in
// the system that can mint credentials. Every request is authenticated as
// a real signed-in user (verify_jwt is on) AND checked against
// profiles.is_admin before anything is created — the JWT alone only proves
// "some logged-in account", which is not enough to create staff.
//
// The generated password is never logged, never stored, and never returned
// to the caller except in the single case where the email failed to send,
// so the admin can relay it by hand. See email.ts.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { generatePassword, meetsPasswordPolicy } from './password.ts'
import { sendWelcomeEmail } from './email.ts'
import {
  defaultHoursForCategory,
  defaultSwapGroupForCategory,
  annualLeaveDaysForCategory,
  STAFF_CATEGORIES,
  USER_ROLES,
  CONTRACT_TYPES,
  ROTATION_CATEGORIES,
} from './defaults.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

// Admin-typed dates arrive as plain YYYY-MM-DD from <input type="date">;
// anything else is a malformed payload rather than a date this function
// should try to coerce.
function optionalDate(value: unknown, field: string): string | null {
  const v = trimmed(value)
  if (!v) return null
  if (!DATE_PATTERN.test(v)) throw new ValidationError(`${field} must be a YYYY-MM-DD date.`)
  return v
}

class ValidationError extends Error {}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Server is misconfigured: service role credentials are unavailable.' }, 500)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // ── Caller must be a signed-in admin ────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '')
  if (!jwt) return json({ error: 'Not signed in.' }, 401)

  const { data: caller, error: callerError } = await admin.auth.getUser(jwt)
  if (callerError || !caller?.user) return json({ error: 'Not signed in.' }, 401)

  const { data: callerProfile, error: callerProfileError } = await admin
    .from('profiles')
    .select('is_admin')
    .eq('id', caller.user.id)
    .single()
  if (callerProfileError || callerProfile?.is_admin !== true) {
    return json({ error: 'Only an admin can issue staff credentials.' }, 403)
  }

  let payload: Record<string, unknown>
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Request body must be JSON.' }, 400)
  }

  // APP_URL wins when set (a stable, canonical login link); otherwise the
  // admin's own origin is the app they are standing in, which is the right
  // link for the person they are inviting.
  const appUrl = Deno.env.get('APP_URL') ?? req.headers.get('origin') ?? null

  try {
    if (payload.action === 'create') return await handleCreate(admin, payload, caller.user.id, appUrl)
    if (payload.action === 'regenerate') return await handleRegenerate(admin, payload, appUrl)
    return json({ error: 'Unknown action.' }, 400)
  } catch (err) {
    if (err instanceof ValidationError) return json({ error: err.message }, 400)
    console.error('admin-staff-credentials failed:', err instanceof Error ? err.message : String(err))
    return json({ error: 'Something went wrong creating the account. Nothing was saved.' }, 500)
  }
})

// Sends the credentials email and reports whether it went out, rather than
// throwing — creating the account and delivering the password are two
// steps that fail independently, and a delivery failure must not read as
// "the account wasn't created". The caller surfaces the password to the
// admin in that case so they can relay it by hand.
async function deliver(input: { to: string; firstName: string; password: string; appUrl: string | null; isReset: boolean }) {
  try {
    await sendWelcomeEmail(input)
    return { emailSent: true as const }
  } catch (err) {
    // Recipient and outcome only — never the body, never the password.
    console.error(`Credentials email to ${input.to} failed:`, err instanceof Error ? err.message : String(err))
    return {
      emailSent: false as const,
      emailError: err instanceof Error ? err.message : 'Unknown email error.',
    }
  }
}

async function handleCreate(
  admin: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
  actorId: string,
  appUrl: string | null,
) {
  const email = trimmed(payload.email).toLowerCase()
  const name = trimmed(payload.name)
  const surname = trimmed(payload.surname)
  const phone = trimmed(payload.phone)
  const role = trimmed(payload.role) || 'doctor'
  const rawCategory = trimmed(payload.category)
  const contractType = trimmed(payload.contractType) || 'full'
  const subtype = trimmed(payload.subtype) || null

  if (!EMAIL_PATTERN.test(email)) throw new ValidationError('Enter a valid email address.')
  if (!name) throw new ValidationError('First name is required.')
  if (!surname) throw new ValidationError('Surname is required.')
  if (!phone) throw new ValidationError('Mobile number is required.')
  if (!USER_ROLES.includes(role)) throw new ValidationError('Role must be doctor, locum or clerk.')
  if (!CONTRACT_TYPES.includes(contractType)) throw new ValidationError('Unrecognised contract type.')

  // Same role/category rule the approval flow applies (see approveOne in
  // StaffListPage.jsx), and the same one the profiles category_role_rules
  // CHECK constraint enforces: a clerk has no doctor category at all, and a
  // locum only carries one when it is MO or Registrar.
  const category =
    role === 'doctor' ? (rawCategory || null) :
    role === 'locum'  ? (['MO', 'Registrar'].includes(rawCategory) ? rawCategory : null) :
    null
  if (role === 'doctor' && !category) throw new ValidationError('Category is required for a doctor account.')
  if (category && !STAFF_CATEGORIES.includes(category)) throw new ValidationError('Unrecognised category.')

  const activeFrom = optionalDate(payload.activeFrom, 'Active from')
  const activeUntil = optionalDate(payload.activeUntil, 'Active until')
  if (!activeFrom) throw new ValidationError('Active from is required.')
  if (activeUntil && activeUntil < activeFrom) throw new ValidationError('Active until must be on or after Active from.')

  // Rotations are optional even for the categories that support them — an
  // admin may not know the incoming intern's placements yet. When they do,
  // the whole year can be planned up front as a run of blocks rather than
  // just an opening one, which is what the Rotations planner would
  // otherwise be opened to do straight after creating the account.
  const rotations = parseRotations(payload.rotations ?? payload.rotation, category, subtype)

  const password = generatePassword()
  // Belt and braces: the generator guarantees this by construction, but a
  // password that somehow failed the policy would be rejected by
  // createUser with a far less obvious error.
  if (!meetsPasswordPolicy(password)) {
    return json({ error: 'Failed to generate a compliant password. Nothing was created.' }, 500)
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    // Confirmed on the spot: an admin-created account is usable
    // immediately, with no verification link that could expire before the
    // person's start date.
    email_confirm: true,
    user_metadata: { name, surname, phone, role, ...(category ? { category } : {}) },
  })

  if (createError || !created?.user) {
    const message = createError?.message ?? 'Could not create the account.'
    const alreadyExists = /already|registered|exists/i.test(message)
    throw new ValidationError(
      alreadyExists ? 'An account with that email address already exists.' : message
    )
  }

  const userId = created.user.id

  // handle_new_user() has already inserted the profile row from the auth
  // user's metadata, with is_active/is_approved false and 0/0 hours. Every
  // admin-supplied value wins over those defaults, written here in one
  // update so the account is never briefly visible as an unapproved
  // registration in the pending queue.
  const hours = defaultHoursForCategory(category, contractType)
  const { error: profileError } = await admin
    .from('profiles')
    .update({
      name,
      surname,
      phone,
      role,
      category,
      contract_type: contractType,
      psych_subcategory: contractType === 'Junior_Doctor_Overtime' ? subtype : null,
      min_hours: hours.min,
      max_hours: hours.max,
      swap_group: defaultSwapGroupForCategory(category),
      // Vetting is not in question here — an admin typed this person's
      // real details, so is_approved is settled at creation and there is
      // no pending-approval step for admin-created accounts.
      is_approved: true,
      approved_by: actorId,
      approved_at: new Date().toISOString(),
      // Activation is date-driven, not immediate: the existing
      // apply-scheduled-status-changes cron flips is_active once
      // scheduled_active_date arrives.
      is_active: false,
      scheduled_active_date: activeFrom,
      scheduled_inactive_date: activeUntil,
      must_change_password: true,
      email_verified: true,
    })
    .eq('id', userId)

  if (profileError) {
    // Roll the auth user back rather than leaving a half-configured
    // account behind that would surface in the pending-approval queue as
    // if someone had self-registered.
    await admin.auth.admin.deleteUser(userId).catch(() => {})
    throw new Error(`Profile update failed: ${profileError.message}`)
  }

  // Same allotment an approved self-registration gets — without it an
  // admin-created doctor would start with no annual leave balance at all.
  const leaveDays = annualLeaveDaysForCategory(category)
  if (leaveDays !== null) {
    await admin.from('annual_leave_balances').upsert(
      { profile_id: userId, year: new Date().getFullYear(), days_allotted: leaveDays },
      { onConflict: 'profile_id,year' },
    )
  }

  if (rotations.length) {
    const { error: rotationError } = await admin.from('intern_rotations').insert(
      rotations.map(r => ({
        doctor_id: userId,
        rotation_type: r.rotationType,
        subtype: r.subtype,
        start_date: r.startDate,
        end_date: r.endDate,
        created_by: actorId,
      })),
    )
    // A failed rotation insert is not worth destroying a good account
    // over — the admin can add the blocks in the Rotations planner.
    // Reported alongside the success so it isn't silent. Inserted as one
    // statement, so this is all-or-nothing: never a half-planned year.
    if (rotationError) {
      const delivery = await deliver({ to: email, firstName: name, password, appUrl, isReset: false })
      return json({
        ok: true,
        profileId: userId,
        rotationError: rotationError.message,
        ...delivery,
        ...(delivery.emailSent ? {} : { password }),
      })
    }
  }

  const delivery = await deliver({ to: email, firstName: name, password, appUrl, isReset: false })
  return json({
    ok: true,
    profileId: userId,
    ...delivery,
    // Only ever returned when the email did not go out, so the admin has
    // some way to hand the password over. Not persisted anywhere.
    ...(delivery.emailSent ? {} : { password }),
  })
}

type ParsedRotation = { rotationType: string; subtype: string | null; startDate: string; endDate: string | null }

// Validates the form's rotation blocks into rows for intern_rotations.
// Blocks with no start date are the form's own empty rows — an admin who
// added a block and didn't date it — and are dropped rather than rejected.
function parseRotations(input: unknown, category: string | null, subtype: string | null): ParsedRotation[] {
  // `rotation` (one object) was the shape before the form could add more
  // than one block. Still accepted so a browser running a cached copy of
  // the old frontend against this function doesn't have its rotation
  // silently dropped — the two deploys are independent.
  const blocks = Array.isArray(input) ? input : input ? [input] : []
  if (blocks.length === 0) return []

  const parsed: ParsedRotation[] = []
  for (const raw of blocks) {
    const block = (raw ?? {}) as Record<string, unknown>
    if (!trimmed(block.startDate)) continue

    if (!category || !ROTATION_CATEGORIES.includes(category)) {
      throw new ValidationError('Only Intern and Registrar accounts can start with a rotation.')
    }
    const rotationType = trimmed(block.rotationType) || 'EC'
    if (!['EC', 'OT'].includes(rotationType)) throw new ValidationError('Rotation type must be EC or OT.')
    // Registrar rotations are EC-only — the OT concept belongs to the
    // Junior_Doctor_Overtime contract, which registrars never carry (see
    // rotationTypeOptionsForCategory in src/lib/staffDefaults.js).
    if (category === 'Registrar' && rotationType === 'OT') {
      throw new ValidationError('Registrar rotations are EC only.')
    }
    const startDate = optionalDate(block.startDate, 'Rotation start')!
    const endDate = optionalDate(block.endDate, 'Rotation end')
    if (endDate && endDate < startDate) throw new ValidationError('Rotation end must be on or after its start.')

    // A per-block subtype wins; the profile-level one is the fallback for a
    // caller that only sends the block's type. Either way it is dropped on
    // an EC block, which the subtype_only_for_ot CHECK would reject.
    const blockSubtype = block.subtype === undefined ? subtype : (trimmed(block.subtype) || null)
    parsed.push({
      rotationType,
      subtype: rotationType === 'OT' ? blockSubtype : null,
      startDate,
      endDate,
    })
  }

  // Nothing downstream resolves overlapping blocks — rotationForDate takes
  // the first match — so two blocks covering one day would silently pick a
  // winner. Rejected here as well as in the form: this is the only check
  // that holds for any caller.
  const dated = [...parsed].sort((a, b) => a.startDate.localeCompare(b.startDate))
  for (let i = 1; i < dated.length; i++) {
    const prev = dated[i - 1]
    if (prev.endDate === null || prev.endDate >= dated[i].startDate) {
      throw new ValidationError('Rotations overlap — give each block an end date before the next one starts.')
    }
  }

  return parsed
}

async function handleRegenerate(
  admin: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
  appUrl: string | null,
) {
  const profileId = trimmed(payload.profileId)
  if (!profileId) throw new ValidationError('profileId is required.')

  const { data: target, error: targetError } = await admin.auth.admin.getUserById(profileId)
  if (targetError || !target?.user?.email) {
    throw new ValidationError('No account found for that person.')
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('name, surname')
    .eq('id', profileId)
    .single()

  const password = generatePassword()
  if (!meetsPasswordPolicy(password)) {
    return json({ error: 'Failed to generate a compliant password. Nothing was changed.' }, 500)
  }

  // Replacing the password invalidates the previous one immediately —
  // this can be repeated as often as needed, with no link and no expiry
  // to race against.
  const { error: updateError } = await admin.auth.admin.updateUserById(profileId, { password })
  if (updateError) throw new Error(`Password update failed: ${updateError.message}`)

  const { error: flagError } = await admin
    .from('profiles')
    .update({ must_change_password: true })
    .eq('id', profileId)
  // is_approved is deliberately untouched: a reissued password is a
  // credential change, not a re-vetting of who this person is.
  if (flagError) throw new Error(`Could not flag the account for a password change: ${flagError.message}`)

  const delivery = await deliver({
    to: target.user.email,
    firstName: profile?.name || 'there',
    password,
    appUrl,
    isReset: true,
  })

  return json({
    ok: true,
    profileId,
    ...delivery,
    ...(delivery.emailSent ? {} : { password }),
  })
}
