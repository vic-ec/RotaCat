// Label maps and small helpers for the Staff list (StaffListPage and its
// pieces in this folder), moved here as they were. ROLE_LABELS is the
// one lib/usePendingApprovalReview already exports.
import { OT_SUBTYPE_LABELS } from '../../lib/staffDefaults'

export const REQUEST_TYPE_LABELS = {
  email: 'Email change',
  phone: 'Mobile change',
  role: 'Role change',
  category: 'Category change',
  hours: 'Hours change',
  deletion: 'Account deletion',
}

// 'hours' requests store a JSON-encoded {contract_type, subtype} in both
// current_value and requested_value (role/category requests just store the
// plain string) — renders either shape into a short human label.
export function formatRequestValue(value, requestType) {
  if (requestType !== 'hours' || !value) return value
  try {
    const { contract_type, subtype } = JSON.parse(value)
    const hoursLabel = contract_type === 'Junior_Doctor_Overtime' ? 'OT' : 'EC'
    return subtype ? `${hoursLabel} (${OT_SUBTYPE_LABELS[subtype] || subtype})` : hoursLabel
  } catch {
    return value
  }
}

export const PERMISSION_LABELS = { admin: 'Admin', super_admin: 'Super-admin' }

// five_eighths and Junior Doctor Overtime (formerly psych_overtime) both
// get a tag — full shows nothing extra. The OT tag matters more than it
// used to: COSMOPsych retiring as a category (2026-08) means a COSMO/
// Intern's category no longer shows EC vs OT at a glance the way it did
// when COSMOPsych was its own category — this tag is now the only
// per-row indicator of that distinction in this list.
export const CONTRACT_TAG_LABEL = { five_eighths: '⅝', Junior_Doctor_Overtime: 'OT' }
export const CONTRACT_TAG_TITLE = { five_eighths: 'Part-time (⅝ contract)', Junior_Doctor_Overtime: 'Junior Doctor Overtime' }

// "OT" alone, or "OT · LRCHC" once a subtype has been assigned (via the
// Intern Rotations Planner or the Accounts page Hours selector).
export function contractTagText(person) {
  const base = CONTRACT_TAG_LABEL[person.contract_type]
  if (!base) return null
  if (person.contract_type === 'Junior_Doctor_Overtime' && person.psych_subcategory) {
    return `${base} · ${OT_SUBTYPE_LABELS[person.psych_subcategory] || person.psych_subcategory}`
  }
  return base
}

export const SORT_MODE_KEY = 'rotacat:staffSortMode'
export const AZ_DIRECTION_KEY = 'rotacat:staffAzDirection'
