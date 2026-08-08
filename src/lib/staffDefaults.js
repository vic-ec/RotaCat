// Category-based defaults applied when an admin approves a pending
// registration — single source of truth shared by StaffListPage and
// PendingApprovalReviewPage (previously duplicated in both, which is how
// COSMOPsych ended up silently falling through to the MO/Registrar default:
// the duplicated maps keyed it as "COSMO_Psych", which doesn't match the
// staff_category enum value "COSMOPsych").
export const DEFAULT_HOURS = {
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

export const DEFAULT_SWAP_GROUP = {
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

// Only COSMO and Intern are actually ambiguous without contract_type —
// mirrors the identical set in leaveYearGrid.js/weekendPlanner.js.
const AMBIGUOUS_CATEGORIES = new Set(['COSMO', 'Intern'])
const OT_HOURS = { min: 64, max: 72 }

// Single source of truth for the EC/OT "Hours" picker — previously
// duplicated inline in PendingApprovalReviewPage.jsx, now also used by
// AccountSettingsPage.jsx (admin edit + self-service request) and
// StaffListPage.jsx (request approval + display).
export function categoryNeedsContractChoice(category) {
  return AMBIGUOUS_CATEGORIES.has(category)
}

export const CONTRACT_TYPE_OPTIONS = [
  { value: 'full', label: 'EC — full hours (~220–246h/month)' },
  { value: 'Junior_Doctor_Overtime', label: 'OT — Junior Doctor Overtime (~64–72h/month)' },
]

// Only meaningful when contract_type is Junior_Doctor_Overtime — matches
// intern_rotations.subtype / profiles.psych_subcategory / the backend's
// PsychSubcategory enum exactly, so these values pass through untranslated.
export const OT_SUBTYPE_OPTIONS = [
  { value: 'LRCHC',   label: 'LRCHC' },
  { value: 'DPM_BCH', label: 'DPM/BCH' },
  { value: 'PSYCH',   label: 'Psych' },
]

export const OT_SUBTYPE_LABELS = Object.fromEntries(OT_SUBTYPE_OPTIONS.map(o => [o.value, o.label]))

// Contract-type-aware hours lookup — the one PendingApprovalReviewPage and
// StaffListPage should actually call now. Category alone is only enough
// for MO/Registrar/Consultant/Locum and the already-unambiguous legacy OT/
// EC-specific values; COSMO/Intern need contractType to know which of the
// two hours bands applies. Falls back to the raw DEFAULT_HOURS table
// (still exported below, unchanged, for anything reading it directly).
export function defaultHoursForCategory(category, contractType) {
  if (AMBIGUOUS_CATEGORIES.has(category) && contractType === 'Junior_Doctor_Overtime') {
    return OT_HOURS
  }
  return DEFAULT_HOURS[category] || { min: 220, max: 246 }
}

export function defaultSwapGroupForCategory(category) {
  return DEFAULT_SWAP_GROUP[category] || 'junior'
}

// Categories that get the standard annual leave allotment on approval.
// Consultant/Locum are excluded — not part of the standard doctor leave cycle.
export const ANNUAL_LEAVE_DAYS_DEFAULT = 22
const NO_ANNUAL_LEAVE_CATEGORIES = new Set(['Consultant', 'Locum'])

export function annualLeaveDaysForCategory(category) {
  if (!category || NO_ANNUAL_LEAVE_CATEGORIES.has(category)) return null
  return ANNUAL_LEAVE_DAYS_DEFAULT
}
