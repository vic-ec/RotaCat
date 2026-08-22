// Server-side mirror of the category defaults in src/lib/staffDefaults.js.
//
// The frontend's copy stays the canonical one — it is what every screen in
// the app reads, and what an admin approving a self-registration writes.
// This file exists only because an Edge Function is a separately deployed
// Deno bundle that cannot import from src/, and an admin-created account
// has to land on exactly the same hours/swap-group/leave defaults an
// approved self-registration does, written in the same transaction as the
// rest of the profile so a half-configured account is never left behind.
//
// Drift between the two is guarded by a test, not by discipline: see
// supabase/functions/admin-staff-credentials/defaults.test.js, which
// imports both and asserts they are identical. Change one, change both.

export const DEFAULT_HOURS: Record<string, { min: number; max: number }> = {
  MO:              { min: 220, max: 246 },
  Registrar:       { min: 220, max: 246 },
  EC_Intern:       { min: 220, max: 246 },
  Intern:          { min: 220, max: 246 },
  OT_Intern:       { min: 64,  max: 72  },
  Consultant:      { min: 0,   max: 0   },
  Locum:           { min: 0,   max: 0   },
}

export const DEFAULT_SWAP_GROUP: Record<string, string> = {
  MO:              'senior',
  Registrar:       'senior',
  EC_Intern:       'junior',
  Intern:          'junior',
  OT_Intern:       'junior',
  Consultant:      'senior',
  Locum:           'locum',
}

// Intern is the one category that doesn't say EC or OT in its own name —
// that comes from contract_type and the doctor's rotation block.
export const AMBIGUOUS_CATEGORIES = new Set(['Intern'])

const OT_HOURS = { min: 64, max: 72 }

export function defaultHoursForCategory(category: string | null, contractType: string | null) {
  if (category && AMBIGUOUS_CATEGORIES.has(category) && contractType === 'Junior_Doctor_Overtime') {
    return OT_HOURS
  }
  return DEFAULT_HOURS[category ?? ''] || { min: 220, max: 246 }
}

export function defaultSwapGroupForCategory(category: string | null): string {
  return DEFAULT_SWAP_GROUP[category ?? ''] || 'junior'
}

export const ANNUAL_LEAVE_DAYS_DEFAULT = 22
const NO_ANNUAL_LEAVE_CATEGORIES = new Set(['Consultant', 'Locum'])

// Consultants and locums are outside the standard doctor leave cycle and
// get no allotment row at all.
export function annualLeaveDaysForCategory(category: string | null): number | null {
  if (!category || NO_ANNUAL_LEAVE_CATEGORIES.has(category)) return null
  return ANNUAL_LEAVE_DAYS_DEFAULT
}

// The staff_category enum, in its post-2026-08 form — validated
// server-side so a malformed payload is rejected before it reaches
// auth.admin.createUser and leaves an orphaned auth user behind with no
// usable profile. Only the identity values are ever assigned to a person
// (EC_Intern/OT_Intern are resolved values that live on weekend_planner
// rows), but the full list is what the column will accept, so it's what
// gets validated against; DOCTOR_CATEGORY_VALUES in
// src/lib/staffDefaults.js is the narrower set the form offers.
export const STAFF_CATEGORIES = [
  'MO', 'Registrar', 'Consultant', 'EC_Intern', 'OT_Intern', 'Intern', 'Locum',
]

export const USER_ROLES = ['doctor', 'locum', 'clerk']

export const CONTRACT_TYPES = ['full', 'five_eighths', 'Junior_Doctor_Overtime']

// Categories whose placement is tracked as a dated rotation timeline
// (intern_rotations) rather than a static profiles field. Registrar is
// included here — unlike src/lib/internRotations.js's narrower
// ROTATION_TRACKED_CATEGORIES, which answers "does an hours change write a
// rotation block", this list answers "does the Add Staff form offer a
// starting rotation", and a registrar's rotation is planned the same way an
// intern's is (EC-only — see rotationTypeOptionsForCategory).
export const ROTATION_CATEGORIES = ['Intern', 'Registrar']
