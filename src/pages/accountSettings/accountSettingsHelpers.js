// Label maps, option lists and small helpers for the account page
// (AccountSettingsPage and its pieces in this folder), moved here as they were.
import { categoryValuesForRole, OT_SUBTYPE_LABELS } from '../../lib/staffDefaults'

// ── Display label maps ──────────────────────────────────────
// Role = account type (drives which pages/features are visible)
// ROLE_LABELS and ROLE_OPTIONS: lib/usePendingApprovalReview exports the
// same two, so they are imported from there.


// Category = clinical subtype. Doctor: any of these. Locum: MO/Registrar only
// (this is what makes shift-claim eligibility possible). Clerk: none.
export const CATEGORY_LABELS = {
  MO:         'Medical Officer',
  Registrar:  'Registrar',
  COSMO:      'COSMO',
  COSMOPsych: 'COSMO (Psych)',
  Intern:     'Intern',
  Consultant: 'Consultant',
}
// Which categories each role may hold lives in staffDefaults.js, shared
// with AddStaffModal's creation form — an admin creating an account and an
// admin editing one must never be offered different sets. Only the labels
// are local.
export function categoryOptionsForRole(role) {
  return categoryValuesForRole(role).map(value => ({ value, label: CATEGORY_LABELS[value] || value }))
}

// 'hours' requests store a JSON-encoded {contract_type, subtype} in
// requested_value (role/category requests just store the plain string) —
// this renders either shape back into a short human label for the pending
// banner and request-history list below.
export function formatRequestedValue(request) {
  if (request.request_type !== 'hours') return request.requested_value
  try {
    const { contract_type, subtype } = JSON.parse(request.requested_value)
    const hoursLabel = contract_type === 'Junior_Doctor_Overtime' ? 'OT' : 'EC'
    return subtype ? `${hoursLabel} (${OT_SUBTYPE_LABELS[subtype] || subtype})` : hoursLabel
  } catch {
    return request.requested_value
  }
}

export const NOTIFICATION_LABELS = {
  roster_published:    'Roster published',
  leave_approved:      'Leave request approved',
  leave_rejected:      'Leave request rejected',
  leave_cancelled:     'Leave cancelled',
  swap_request:        'New swap request',
  swap_accepted:       'Swap accepted by colleague',
  swap_rejected:       'Swap rejected by colleague',
  swap_admin_approved: 'Swap approved by admin',
  shift_claimed:       'Advertised locum shift claimed',
  shift_cancelled:     'Advertised locum shift cancelled',
  account_approved:    'Account approved',
  account_rejected:    'Account rejected',
  reminder:            'Reminders',
  general:             'General notifications',
}
export const NOTIFICATION_ORDER = [
  'roster_published', 'leave_approved', 'leave_rejected', 'leave_cancelled',
  'swap_request', 'swap_accepted', 'swap_rejected', 'swap_admin_approved',
  'shift_claimed', 'shift_cancelled', 'account_approved', 'account_rejected',
  'reminder', 'general',
]

// Category-level grouping shown by default; individual events move under "Advanced".
export const NOTIFICATION_GROUPS = [
  { key: 'roster',  label: 'Roster',            keys: ['roster_published'] },
  { key: 'leave',   label: 'Leave',              keys: ['leave_approved', 'leave_rejected', 'leave_cancelled'] },
  { key: 'swaps',   label: 'Swaps',              keys: ['swap_request', 'swap_accepted', 'swap_rejected', 'swap_admin_approved'] },
  { key: 'shifts',  label: 'Open shifts',        keys: ['shift_claimed', 'shift_cancelled'] },
  { key: 'account', label: 'Account',            keys: ['account_approved', 'account_rejected'] },
  { key: 'general', label: 'Reminders & general', keys: ['reminder', 'general'] },
]

export const REQUEST_STATUS_BADGE = {
  pending:  'bg-flagAmber-bg text-flagAmber',
  approved: 'bg-success-bg text-success',
  rejected: 'bg-flagRed-bg text-flagRed',
}


// Birthday only ever needs day + month (it's used to keep someone off shift
// on their recurring birthday, not to compute an age) — stored as a date
// with a fixed placeholder year so the column stays a plain `date`. 2000 is
// a leap year so 29 February stays a selectable day for everyone.
// Admin "Delete account" runs in two guarded steps: the admin must type
// the person's surname (so a slip on the wrong row can't go through), and
// the delete itself only fires after a short countdown with an Undo
// button. Seconds, not ms, because the countdown is shown to the admin.
export const DELETE_UNDO_SECONDS = 10

const BIRTHDAY_YEAR = 2000
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
export const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
export const DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))
export const MONTH_OPTIONS = MONTH_NAMES.map((name, i) => ({ value: String(i + 1), label: name }))

export function birthdayToDayMonth(iso) {
  if (!iso) return { day: '', month: '' }
  const [, month, day] = iso.split('-')
  return { day: String(Number(day)), month: String(Number(month)) }
}
export function dayMonthToBirthday(day, month) {
  if (!day || !month) return ''
  return `${BIRTHDAY_YEAR}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
export function formatBirthdayDisplay(iso) {
  const { day, month } = birthdayToDayMonth(iso)
  if (!day || !month) return null
  return `${day} ${MONTH_NAMES[Number(month) - 1]}`
}

// Briefly shows "Saved." on an Update button in place of its normal label.
const SAVED_FLASH_MS = 2500
export function flashSaved(setJustSaved) {
  setJustSaved(true)
  setTimeout(() => setJustSaved(false), SAVED_FLASH_MS)
}

// Plain-language load failures for an admin viewing someone else's account.
// Supabase's raw messages ("Cannot coerce the result to a single JSON
// object" for a row that isn't there) mean nothing to a reader; the
// no-row case is by far the most common — the account was just deleted,
// typically from this very panel — so it gets a message of its own.
export const MISSING_ACCOUNT_MESSAGE =
  'This account no longer exists. It may have been deleted, or the link you followed is out of date.'

export function describeTargetLoadError(error) {
  if (error?.code === 'PGRST116') return MISSING_ACCOUNT_MESSAGE
  if (error?.code === '42501' || /permission denied|row-level security/i.test(error?.message || '')) {
    return "You don't have permission to view this account."
  }
  return `We couldn't load this account right now. Please try again in a moment. (${error?.message || 'Unknown error'})`
}
