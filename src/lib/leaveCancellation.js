// Cancelling leave — the one path, for doctors and admins alike, that takes a
// pending or approved request out of play. The rules are enforced by the
// cancel_leave_request() database function (see migration
// 20261115130100); this module mirrors them so the UI can show or hide the
// action and explain why, and wraps the call so every caller surfaces the
// same plain-language error.
//
// Rules: pending or approved only; a reason is always required; doctors may
// cancel their own leave only while it is still in the future; admins may
// cancel anyone's, including leave that has started. Balances and capacity
// are derived from approved rows, so a cancel needs no other unwinding.
import { supabase } from './supabase'

export const CANCELLABLE_STATUSES = ['pending', 'approved']
export const CANCEL_REASON_MIN_LENGTH = 3

// Whether `viewer` may cancel `request`, and if not, a sentence saying why.
// `todayStr` is YYYY-MM-DD; a request whose date_from is today or earlier
// counts as started.
export function cancelEligibility(request, { isAdmin = false, viewerId = null, todayStr }) {
  if (!request) return { allowed: false, reason: 'No leave request selected.' }
  if (request.status === 'cancelled') return { allowed: false, reason: 'This leave has already been cancelled.' }
  if (!CANCELLABLE_STATUSES.includes(request.status)) {
    return { allowed: false, reason: 'Only pending or approved leave can be cancelled.' }
  }
  if (isAdmin) return { allowed: true, reason: '' }
  if (!viewerId || request.profile_id !== viewerId) {
    return { allowed: false, reason: 'You can only cancel your own leave.' }
  }
  if (todayStr && request.date_from <= todayStr) {
    return { allowed: false, reason: 'Leave that has already started can only be cancelled by an admin.' }
  }
  return { allowed: true, reason: '' }
}

export function isValidCancelReason(reason) {
  return (reason || '').trim().length >= CANCEL_REASON_MIN_LENGTH
}

// Every {year, month} a date range touches, in order — the roster months a
// cancellation might leave a gap in.
export function rosterMonthsForRange(dateFrom, dateTo) {
  const months = []
  let [y, m] = dateFrom.slice(0, 7).split('-').map(Number)
  const [endY, endM] = dateTo.slice(0, 7).split('-').map(Number)
  while (y < endY || (y === endY && m <= endM)) {
    months.push({ year: y, month: m })
    m += 1
    if (m > 12) { m = 1; y += 1 }
  }
  return months
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// Roster months (draft or published, not deleted) overlapping the leave —
// shown as a warning before cancelling, since the scheduler already treated
// those days as unavailable and nothing re-fills them automatically.
export async function fetchRosterMonthsAffected(dateFrom, dateTo) {
  const wanted = rosterMonthsForRange(dateFrom, dateTo)
  if (wanted.length === 0) return []
  const years = [...new Set(wanted.map(w => w.year))]
  const { data, error } = await supabase
    .from('roster_months')
    .select('year, month, status, deleted_at')
    .in('year', years)
    .in('status', ['draft', 'published'])
    .is('deleted_at', null)
  if (error) return []
  const wantedKeys = new Set(wanted.map(w => `${w.year}-${w.month}`))
  return (data || [])
    .filter(r => wantedKeys.has(`${r.year}-${r.month}`))
    .sort((a, b) => a.year - b.year || a.month - b.month)
}

// "The roster for March 2027 has already been published." etc. Empty
// string when there is nothing to warn about.
export function rosterWarningText(affected) {
  if (!affected || affected.length === 0) return ''
  const label = r => `${MONTH_NAMES[r.month - 1]} ${r.year}`
  const published = affected.filter(r => r.status === 'published').map(label)
  const drafts = affected.filter(r => r.status === 'draft').map(label)
  const parts = []
  if (published.length) parts.push(`The roster for ${published.join(' and ')} has already been published`)
  if (drafts.length) parts.push(`A draft roster already exists for ${drafts.join(' and ')}`)
  return `${parts.join(', and ')}. Cancelling this leave does not change any shifts: the admins will need to update the roster by hand if they want this person rostered on those days.`
}

// Cancels the request. Resolves to the updated row; throws an Error whose
// message is already written for a person (the database function raises
// plain sentences, e.g. "Leave that has already started can only be
// cancelled by an admin.").
export async function cancelLeaveRequest(requestId, reason) {
  const { data, error } = await supabase.rpc('cancel_leave_request', {
    p_request_id: requestId,
    p_reason: (reason || '').trim(),
  })
  if (error) throw new Error(humanizeRpcError(error.message))
  return data
}

// Postgres wraps a RAISE in nothing extra, but a permission or network
// failure arrives as its own jargon; keep ours and translate the rest.
function humanizeRpcError(message) {
  if (!message) return 'Could not cancel this leave. Please try again.'
  if (/permission denied|row-level security/i.test(message)) return "You don't have permission to cancel this leave."
  if (/function .*cancel_leave_request.* does not exist/i.test(message)) return 'Cancelling leave is not available yet. Please ask an admin to finish the update.'
  return message
}
