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
  COSMO:           { min: 220, max: 246 },
  EC_Intern:       { min: 220, max: 246 },
  EC_COSMO_Intern: { min: 220, max: 246 },
  Intern:          { min: 220, max: 246 },
  COSMOPsych:      { min: 64,  max: 72  },
  OT_Intern:       { min: 64,  max: 72  },
  OT_COSMO_Intern: { min: 64,  max: 72  },
  Consultant:      { min: 0,   max: 0   },
  Locum:           { min: 0,   max: 0   },
}

export const DEFAULT_SWAP_GROUP: Record<string, string> = {
  MO:              'senior',
  Registrar:       'senior',
  COSMO:           'junior',
  EC_Intern:       'junior',
  EC_COSMO_Intern: 'junior',
  Intern:          'junior',
  COSMOPsych:      'junior',
  OT_Intern:       'junior',
  OT_COSMO_Intern: 'junior',
  Consultant:      'senior',
  Locum:           'locum',
}

// Only COSMO and Intern are ambiguous without contract_type — every other
// value already says EC or OT in its own name.
export const AMBIGUOUS_CATEGORIES = new Set(['COSMO', 'Intern'])

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

// staff_category enum values, and the user_role values an account can be
// created as — validated server-side so a malformed payload is rejected
// before it reaches auth.admin.createUser and leaves an orphaned auth user
// behind with no usable profile.
export const STAFF_CATEGORIES = [
  'MO', 'COSMO', 'Registrar', 'COSMOPsych', 'Consultant',
  'EC_Intern', 'OT_Intern', 'EC_COSMO_Intern', 'OT_COSMO_Intern', 'Intern', 'Locum',
]

export const USER_ROLES = ['doctor', 'locum', 'clerk']

export const CONTRACT_TYPES = ['full', 'five_eighths', 'Junior_Doctor_Overtime']

// Categories whose EC/OT placement is tracked as a dated rotation timeline
// (intern_rotations) rather than a static profiles field. Registrar is
// included here — unlike src/lib/internRotations.js's narrower
// ROTATION_TRACKED_CATEGORIES, which answers "does an hours change write a
// rotation block", this list answers "does the Add Staff form offer a
// starting rotation", and a registrar's rotation is planned the same way an
// intern's is (EC-only — see rotationTypeOptionsForCategory).
export const ROTATION_CATEGORIES = ['Intern', 'Registrar', 'COSMO']
