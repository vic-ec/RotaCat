// Lightweight, no-external-service heuristics for flagging a registration
// that looks like bot/junk submission — surfaced as extra rows in the
// pending-approval review's Account checks (see AccountChecks.jsx via
// usePendingApprovalReview.js). Never blocks approval on its own, just
// gives the reviewer a heads-up; a false positive is still one click away
// from Approve.

// A name that's a single character repeated (e.g. "a a"), or under 2
// letters — the pattern seen on real spam signups, not a legitimate short
// name (the shortest real names are still 2+ letters).
function isPlaceholderName(value) {
  const trimmed = (value || '').trim()
  if (trimmed.length < 2) return true
  return /^(.)\1*$/i.test(trimmed.replace(/\s+/g, ''))
}

export function looksLikeFakeName(name, surname) {
  return isPlaceholderName(name) || isPlaceholderName(surname)
}

// Placeholder/test phone numbers bots and lazy form-fillers default to:
// every digit the same, or the classic ascending/descending sequence.
const PLACEHOLDER_PHONES = new Set([
  '1234567890', '0123456789', '0000000000', '1111111111', '2222222222',
  '3333333333', '4444444444', '5555555555', '6666666666', '7777777777',
  '8888888888', '9999999999',
])

export function looksLikeFakePhone(phone) {
  const digits = (phone || '').replace(/\D/g, '')
  if (digits.length !== 10) return false
  return PLACEHOLDER_PHONES.has(digits)
}
