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
// every other legacy value (COSMOPsych, EC_Intern, OT_Intern,
// EC_COSMO_Intern, OT_COSMO_Intern) already unambiguously says EC or OT
// via its own name/history. Canonical home: leaveYearGrid.js and
// weekendPlanner.js import this rather than redeclaring it.
export const AMBIGUOUS_CATEGORIES = new Set(['COSMO', 'Intern'])
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

// Combined rotation-type + OT-subtype options for the Intern Rotations
// Matrix's single per-block type dropdown — collapses rotation_type +
// subtype into one selectable value (e.g. picking "OT · Psych" writes both
// rotation_type='OT' and subtype='PSYCH' in one step), unlike the Table
// view's two separate dropdowns. Also backs the Matrix's 5-colour bar/
// legend mapping — one visual state per key here, including the real
// "OT with no subtype assigned yet" case (key 'OT').
export const ROTATION_TYPE_KEY_OPTIONS = [
  { key: 'EC', rotationType: 'EC', subtype: null, label: 'EC' },
  { key: 'OT', rotationType: 'OT', subtype: null, label: 'OT' },
  { key: 'OT_LRCHC', rotationType: 'OT', subtype: 'LRCHC', label: 'OT · LRCHC' },
  { key: 'OT_DPM_BCH', rotationType: 'OT', subtype: 'DPM_BCH', label: 'OT · DPM/BCH' },
  { key: 'OT_PSYCH', rotationType: 'OT', subtype: 'PSYCH', label: 'OT · Psych' },
]

export function rotationTypeKey(rotationType, subtype) {
  if (rotationType !== 'OT') return 'EC'
  if (!subtype) return 'OT'
  return `OT_${subtype}`
}

// Registrar rotations are EC-only — the OT/subtype concept is tied to the
// Junior_Doctor_Overtime contract type, which doesn't apply to
// registrars. Every place a rotation-type option list is offered for a
// specific doctor (Table view's dropdowns, the Matrix's block editor)
// filters through this first so a Registrar is never offered an OT option
// at all, rather than relying on validation to reject it after the fact.
export function rotationTypeOptionsForCategory(category) {
  return category === 'Registrar'
    ? ROTATION_TYPE_KEY_OPTIONS.filter(o => o.key === 'EC')
    : ROTATION_TYPE_KEY_OPTIONS
}

// Distinct colour per rotation-type key, for the Matrix's bars/legend.
// Deliberately NOT reusing the flag*/success/danger tokens — those are
// reserved strictly for roster-state semantics elsewhere in this app (see
// tailwind.config.js) and a rotation type isn't a good/bad state, just a
// category, same reasoning as the groupEven/groupOdd weekend-parity
// colours having their own dedicated, non-status family.
export const ROTATION_TYPE_COLOR = {
  EC: '#2563EB',         // blue
  OT: '#64748B',         // slate — OT, no subtype assigned yet
  OT_LRCHC: '#7C3AED',   // violet
  OT_DPM_BCH: '#EA580C', // orange
  OT_PSYCH: '#DB2777',   // pink
}

// The staff_category values an admin actually assigns today, and which of
// them apply to each role — shared by every admin surface that assigns a
// category (AccountSettingsPage's admin edit, AddStaffModal's creation
// form) so a category can never be offerable in one and not the other.
//
// Deliberately narrower than the staff_category enum: the EC_*/OT_* values
// in categoryLabels.js are dormant until Jan 2027 and are not offered
// anywhere in the UI yet, and 'Locum' is expressed as a role rather than
// as a doctor's category (see the real data — every locum profile carries
// a null category). A locum is limited to MO/Registrar, which is what
// makes shift-claim eligibility resolvable; a clerk has no category at all.
//
// COSMO and COSMOPsych are absent because they are no longer staff_category
// enum values at all — the COSMO→Intern retirement dropped them, and the
// EC/OT distinction they used to carry now lives on contract_type plus the
// doctor's rotation block. AccountSettingsPage was still offering them in
// its edit dropdown, where picking one is rejected by the database; sharing
// this list is what stops the new creation form inheriting that.
// CATEGORY_LABELS in categoryLabels.js deliberately still knows the old
// labels, so historical text elsewhere keeps rendering.
export const DOCTOR_CATEGORY_VALUES = ['MO', 'Registrar', 'Intern', 'Consultant']
export const LOCUM_CATEGORY_VALUES = ['MO', 'Registrar']

export function categoryValuesForRole(role) {
  if (role === 'doctor') return DOCTOR_CATEGORY_VALUES
  if (role === 'locum') return LOCUM_CATEGORY_VALUES
  return []
}

// Categories whose EC/OT placement is planned as a dated rotation block in
// intern_rotations, and so can be given a starting rotation at creation
// time. Wider than ROTATION_TRACKED_CATEGORIES in internRotations.js, which
// answers the different question of whether an hours change writes a
// rotation block: a registrar's rotation is planned in the same planner,
// just EC-only (see rotationTypeOptionsForCategory above).
export const ROTATION_PLANNED_CATEGORIES = new Set(['Intern', 'Registrar'])

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
