// First-sign-in onboarding for interns and registrars — the flow behind
// /welcome. Pure logic and the one write path; the screen itself is
// WelcomePage.jsx.
//
// Why it exists: intern_rotations is what resolves an intern to the EC or
// OT pool on any given date, and it only ever got filled in when an admin
// remembered to. The person who actually knows their placement dates is
// the intern, and first sign-in is the one moment they're paying
// attention.
import { supabase } from './supabase'
import { ROTATION_TYPE_KEY_OPTIONS } from './staffDefaults'

// The categories whose placement is a dated rotation timeline they can
// describe themselves. Everyone else (MO, Consultant, locums, clerks)
// skips onboarding entirely — there's nothing to ask them.
export const ONBOARDING_CATEGORIES = new Set(['Intern', 'Registrar'])

/**
 * True when this profile should be routed to /welcome ahead of anything
 * else. Backfilled `onboarding_completed_at` (see the migration) is what
 * keeps everyone who predates the flow out of it — only accounts created
 * after it shipped have a null there.
 */
export function needsOnboarding(profile) {
  if (!profile) return false
  if (profile.role !== 'doctor') return false
  if (!ONBOARDING_CATEGORIES.has(profile.category)) return false
  return !profile.onboarding_completed_at
}

// The rotation choices offered on the form: EC, plus the three real OT
// placements. Derived from ROTATION_TYPE_KEY_OPTIONS rather than
// redeclared, minus the bare 'OT' key — that one exists for the admin
// Matrix to represent "OT with no subtype assigned yet", which is a state
// an admin can leave a block in but not something to offer someone
// describing their own placement.
export const ONBOARDING_ROTATION_OPTIONS = ROTATION_TYPE_KEY_OPTIONS.filter(o => o.key !== 'OT')

// Registrars are EC-only — the OT band belongs to the
// Junior_Doctor_Overtime contract, which a registrar never carries. Same
// rule as rotationTypeOptionsForCategory, and the RPC rejects an OT block
// from a registrar server-side too.
export function rotationOptionsForOnboarding(category) {
  return category === 'Registrar'
    ? ONBOARDING_ROTATION_OPTIONS.filter(o => o.key === 'EC')
    : ONBOARDING_ROTATION_OPTIONS
}

export function optionForKey(key) {
  return ONBOARDING_ROTATION_OPTIONS.find(o => o.key === key) ?? ONBOARDING_ROTATION_OPTIONS[0]
}

/**
 * Client-side check over the whole set of blocks, so the form can say
 * what's wrong inline instead of bouncing off the RPC's exception. The
 * RPC re-validates all of this — this is the friendly half, not the
 * enforcing one.
 *
 * Returns a user-facing string, or null when the set is submittable.
 */
export function rotationsProblem(rows, category) {
  if (!rows || rows.length === 0) return 'Add at least one rotation.'

  for (const [i, row] of rows.entries()) {
    const which = rows.length > 1 ? `Rotation ${i + 1}: ` : ''
    if (!row.startDate) return `${which}pick a start date.`
    if (!row.endDate) return `${which}pick an end date.`
    if (row.endDate < row.startDate) return `${which}the end date is before the start date.`
    const option = optionForKey(row.key)
    if (category === 'Registrar' && option.rotationType !== 'EC') {
      return `${which}registrar rotations are EC only.`
    }
  }

  // Overlaps would make the EC/OT answer ambiguous for the overlapping
  // dates, so they're caught here rather than resolved by a tie-break.
  const sorted = [...rows].sort((a, b) => a.startDate.localeCompare(b.startDate))
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].startDate <= sorted[i - 1].endDate) {
      return 'Two rotations overlap. Each one should start after the previous ends.'
    }
  }
  return null
}

// Form rows -> the RPC's jsonb shape.
export function toRotationPayload(rows) {
  return rows.map(row => {
    const option = optionForKey(row.key)
    return {
      rotation_type: option.rotationType,
      subtype: option.subtype,
      start_date: row.startDate,
      end_date: row.endDate,
    }
  })
}

// Existing intern_rotations rows -> form rows, so the form opens showing
// whatever an admin already entered rather than a blank slate the person
// would unknowingly replace.
export function toFormRows(rotations) {
  return (rotations || [])
    .slice()
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
    .map(r => ({
      key: r.rotation_type === 'OT' ? (r.subtype ? `OT_${r.subtype}` : 'OT') : 'EC',
      startDate: r.start_date,
      endDate: r.end_date ?? '',
    }))
}

/**
 * Files the rotation plan and contact number, marks onboarding done, and
 * activates the account if its start date has already arrived — all in one
 * transaction server-side (see complete_onboarding). Resolves to
 * { ok: true } or { ok: false, error }.
 */
export async function submitOnboarding({ phone, rotations }) {
  const { error } = await supabase.rpc('complete_onboarding', {
    p_phone: phone || null,
    p_rotations: rotations,
  })
  if (error) return { ok: false, error: error.message || 'Could not save your details. Please try again.' }
  return { ok: true }
}

/**
 * The rotation blocks already on file for this person. An admin may have
 * entered a first one when creating the account.
 */
export async function fetchOwnRotations(profileId) {
  const { data, error } = await supabase
    .from('intern_rotations')
    .select('id, rotation_type, subtype, start_date, end_date')
    .eq('doctor_id', profileId)
    .order('start_date', { ascending: true })
  if (error) return []
  return data || []
}
