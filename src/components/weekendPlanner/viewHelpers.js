// Plain helpers and constant lists for the Weekend Planner month view
// (WeekendPlannerView and its pieces in this folder), moved here as they were.
import { monthBounds, MONTH_ABBR } from '../../lib/dateRange'
import { isEvenWeekend } from '../../lib/weekendPlanner'

export const WEEKS_AHEAD = 26 // ~6 months, enough runway to plan several roster months ahead
const MONTHS_PADDING = 3 // either side of a freshly-navigated-to month — see boundsAroundMonth below

// (year, month) shifted by `delta` months, handling year rollover for any
// delta (not just ±1 — unlike DateStepper's own stepMonth, this needs to
// jump straight to a month several steps away for boundsAroundMonth below).
function shiftMonth(year, month, delta) {
  const d = new Date(year, month - 1 + delta, 1)
  return [d.getFullYear(), d.getMonth() + 1]
}

// A fresh (not ever-growing) fetch window centred on (year, month), used
// whenever navigation lands somewhere outside what's currently loaded — see
// goToMonth's own comment for why this is recomputed from scratch each time
// rather than merged with whatever was already loaded.
export function boundsAroundMonth(year, month) {
  const [fromYear, fromMonth] = shiftMonth(year, month, -MONTHS_PADDING)
  const [throughYear, throughMonth] = shiftMonth(year, month, MONTHS_PADDING)
  return { from: monthBounds(fromYear, fromMonth).start, through: monthBounds(throughYear, throughMonth).end }
}
// My weekends is both the default landing filter and leftmost chip for a
// non-admin viewer. Needs planning is admin-only (nothing a non-admin
// viewer can act on) and sits at the far right, appended only for admins
// rather than shared. For an admin, All weekends leads instead — an admin's
// default concern is the whole roster, not just their own rotation — so
// ADMIN_FILTERS reorders FILTERS_BASE to put it first rather than sharing
// the same leftmost chip as everyone else.
export const FILTERS_BASE = [
  { key: 'mine', label: 'My weekends' },
  { key: 'all', label: 'All weekends' },
]
export const ADMIN_FILTERS = [
  FILTERS_BASE.find(f => f.key === 'all'),
  ...FILTERS_BASE.filter(f => f.key !== 'all'),
  { key: 'needs-planning', label: 'Needs planning' },
]
// Clerks are read-only "All" access only — "My weekends" is a personal view
// that doesn't apply to them.
export const CLERK_FILTERS = [FILTERS_BASE.find(f => f.key === 'all')]
// The viewer's own weekend-off request, as it reads on a weekend card, the
// inspector and the detail sheet: "Ellis • Weekend off approved". Named
// rather than a bare status, because under the My requests filter a column
// of statuses says what happened without ever saying whose request it was —
// and these lines only ever describe the signed-in doctor's own request, so
// the name is theirs. Sentence case, not the uppercase these small labels
// usually take: a surname shouted in caps reads as a different word.
const EXCEPTION_STATUS_LABEL = { pending: 'Weekend off pending', approved: 'Weekend off approved', rejected: 'Weekend off rejected', cancelled: 'Weekend off cancelled' }
export function myRequestLine(status, name) {
  const outcome = EXCEPTION_STATUS_LABEL[status] ?? status
  return name ? `${name} • ${outcome}` : outcome
}
export const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
// The 3 consecutive months starting at (year, month) — "whichever month is
// currently viewed, plus the next 2" — for Copy quarter/Paste quarter/Clear
// quarter, all keyed off whatever the toolbar's month nav is currently
// showing at the moment each is triggered.
export function quarterMonthsFrom(year, month) {
  const months = []
  for (let i = 0; i < 3; i++) {
    let m = month + i
    let y = year
    while (m > 12) { m -= 12; y += 1 }
    months.push({ year: y, month: m })
  }
  return months
}

// "Jan-Mar 2026" (same year throughout) or "Nov 2026-Jan 2027" (crosses a
// year boundary) for a quarterMonthsFrom() result.
export function quarterLabel(quarterMonths) {
  const [first, , last] = quarterMonths
  const firstLabel = first.year === last.year ? MONTH_ABBR[first.month - 1] : `${MONTH_ABBR[first.month - 1]} ${first.year}`
  return `${firstLabel}-${MONTH_ABBR[last.month - 1]} ${last.year}`
}

// The "Next weekend" panel's own background follows coverage
// health, not parity — same red/amber/green thresholds and -bg fills as the
// year overview's legend (WeekendYearOverview's HEALTH_STYLE/StatCell), so
// a fully-staffed next weekend reads as unambiguously "good" at a glance.
export function weekendHealthScheme(coverage) {
  if (coverage.filledGroups === coverage.totalGroups) return { bg: 'bg-success-bg', text: 'text-success' }
  if (coverage.filledGroups === 0) return { bg: 'bg-flagRed-bg', text: 'text-flagRed' }
  return { bg: 'bg-flagAmber-bg', text: 'text-flagAmber' }
}

// Desktop's weekend-parity badge — a small labelled pill ("Wknd 2 · Odd"),
// never a background wash. Uses groupEven/groupOdd — a dedicated parity
// color family, not flagAmber/success (reserved for the Status column's "N
// gaps" chip, a genuine roster-state signal that parity mixing into would
// blur) and not accent/rose (a status-adjacent pairing that read as one
// more roster-state signal rather than its own thing — see tailwind.config.js).
export function weekendBadge(saturday, weekendIndex) {
  const even = isEvenWeekend(saturday)
  return {
    label: `Wknd ${weekendIndex} · ${even ? 'Even' : 'Odd'}`,
    chip: even ? 'bg-groupEven-tint text-groupEven' : 'bg-groupOdd-tint text-groupOdd',
  }
}

// Live status pill for a weekend's own coverage — Complete (success) / "N
// roles open" (flagAmber) / Empty (flagRed) — always derived fresh from
// weekendCoverageSummary rather than cached, so it updates the instant a
// role is filled or cleared. The mobile card's top-right pill (Part 3);
// desktop keeps its own existing "N gaps"/"Fully planned" chip unchanged.
export function weekendStatusPill(coverage) {
  if (coverage.filledGroups === coverage.totalGroups) return { label: 'Complete', tone: 'success' }
  if (coverage.filledGroups === 0) return { label: 'Empty', tone: 'danger' }
  return { label: `${coverage.openGroups.length} role${coverage.openGroups.length === 1 ? '' : 's'} open`, tone: 'warning' }
}
