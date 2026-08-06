import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Pencil, Users, CircleCheck, CircleAlert } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { todayStr, addDays, parseLocalDate, monthBounds } from '../lib/dateRange'
import {
  CATEGORY_GROUPS, groupForCategory, resolvedCategoryForDoctor, saturdaysInRange, saturdaysInMonth, nextWeekendSaturday,
  weekendCoverageSummary, isProfileAssignedToWeekend, groupEntriesByWeekend,
  isEvenWeekend, weekendExceptionRequestsBySaturday,
} from '../lib/weekendPlanner'
import { logWeekendPlannerChange } from '../lib/changeLog'
import WeekendPlannerChangeLogModal from './WeekendPlannerChangeLogModal'
import InlineRuleHint from './InlineRuleHint'

const WEEKS_AHEAD = 26 // ~6 months, enough runway to plan several roster months ahead
// My weekends is both the default landing filter and leftmost chip for a
// non-admin viewer. Needs planning is admin-only (nothing a non-admin
// viewer can act on) and sits at the far right, appended only for admins
// rather than shared. For an admin, All weekends leads instead — an admin's
// default concern is the whole roster, not just their own rotation — so
// ADMIN_FILTERS reorders FILTERS_BASE to put it first rather than sharing
// the same leftmost chip as everyone else.
const FILTERS_BASE = [
  { key: 'mine', label: 'My weekends' },
  { key: 'my-requests', label: 'My requests' },
  { key: 'all', label: 'All weekends' },
]
const ADMIN_FILTERS = [
  FILTERS_BASE.find(f => f.key === 'all'),
  ...FILTERS_BASE.filter(f => f.key !== 'all'),
  { key: 'needs-planning', label: 'Needs planning' },
]
// Clerks are read-only "All" access only — "My weekends"/"My requests" are
// personal/actionable views that don't apply to them.
const CLERK_FILTERS = [FILTERS_BASE.find(f => f.key === 'all')]
const EXCEPTION_STATUS_LABEL = { pending: 'Exception pending', approved: 'Exception approved', rejected: 'Exception rejected' }
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Mobile's alternating card background always follows even/odd parity —
// unrelated to the desktop badge scheme below, which deliberately doesn't
// tint anything (see the desktop section's own comment for why).
function weekendColorScheme(saturday) {
  return isEvenWeekend(saturday)
    ? { bg: 'bg-accent-tint', text: 'text-accent' }
    : { bg: 'bg-flagAmber-bg', text: 'text-flagAmber' }
}

// Desktop's weekend-parity badge — a small labelled pill ("Wknd 2 · Odd"),
// never a background wash. Uses accent/rose (not accent/flagAmber like the
// mobile scheme above) because flagAmber is spoken for on desktop: it's the
// Status column's "N gaps" chip, a genuine roster-state signal, and mixing
// it into parity too would blur that meaning.
function weekendBadge(saturday, weekendIndex) {
  const even = isEvenWeekend(saturday)
  return {
    label: `Wknd ${weekendIndex} · ${even ? 'Even' : 'Odd'}`,
    chip: even ? 'bg-accent-tint text-accent' : 'bg-rose-tint text-rose-dark',
  }
}

function XIcon(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

// "2026-08-15" → "Sat 15 - Sun 16 Aug 2026" (or "Sat 31 Aug - Sun 1 Sep 2026"
// when the weekend straddles a month boundary) — replaces the verbose
// YYYY-MM-DD → YYYY-MM-DD range everywhere a weekend is displayed.
function formatWeekendRange(saturday) {
  const sunday = addDays(saturday, 1)
  const satDate = parseLocalDate(saturday)
  const sunDate = parseLocalDate(sunday)
  const sunMonth = sunDate.toLocaleDateString('en-GB', { month: 'short' })
  const sunYear = sunDate.getFullYear()
  const sameMonth = satDate.getMonth() === sunDate.getMonth() && satDate.getFullYear() === sunDate.getFullYear()
  if (sameMonth) return `Sat ${satDate.getDate()} - Sun ${sunDate.getDate()} ${sunMonth} ${sunYear}`
  const satMonth = satDate.toLocaleDateString('en-GB', { month: 'short' })
  return `Sat ${satDate.getDate()} ${satMonth} - Sun ${sunDate.getDate()} ${sunMonth} ${sunYear}`
}

// Splits a list into rows of (at most) 2 — used to lay assigned names out as
// two lines (e.g. a 4-person MO group) instead of one line that can overflow
// a fixed-width column/panel.
function chunkInPairs(items) {
  const rows = []
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2))
  return rows
}

// One category group's row: assigned surname(s) (or an open-slot count) plus
// the admin add/remove controls. Shared between the mobile card layout and
// the desktop inspector's edit mode so the edit logic exists in exactly one
// place.
function CategoryGroupRow({
  group, groupEntries, doctorById, availableDoctors, isAdmin, saving, textClass,
  saturday, pickerKey, openPicker, setOpenPicker, addEntry, removeEntry,
}) {
  const rows = chunkInPairs(groupEntries)
  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-ink-muted">{group.label}</span>
        {groupEntries.length === 0 && <span className="text-xs font-medium text-rose-dark">1 open</span>}
      </div>

      {rows.length > 0 && (
        <div className="mt-1 space-y-1">
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-3">
              {row.map(entry => {
                const doctor = doctorById.get(entry.profile_id)
                return (
                  <span key={entry.id} className={`flex items-center gap-1 text-sm ${textClass}`}>
                    {doctor ? doctor.surname : '(unknown)'}
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => removeEntry(entry.id)}
                        disabled={saving}
                        className={`${textClass} hover:text-flagRed`}
                        aria-label={`Remove ${doctor?.surname ?? 'doctor'} from ${saturday}`}
                      >
                        <XIcon className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                )
              })}
            </div>
          ))}
        </div>
      )}

      {isAdmin && (
        <div className="mt-1.5 flex justify-end">
          {openPicker === pickerKey ? (
            <select
              autoFocus
              className="input-field w-full text-sm"
              disabled={saving}
              defaultValue=""
              onChange={e => {
                if (e.target.value) addEntry(saturday, group.key, e.target.value)
                else setOpenPicker(null)
              }}
              onBlur={() => setOpenPicker(null)}
            >
              <option value="">Select doctor…</option>
              {availableDoctors.map(d => (
                <option key={d.id} value={d.id}>{d.name} {d.surname}</option>
              ))}
            </select>
          ) : (
            <button
              type="button"
              onClick={() => setOpenPicker(pickerKey)}
              disabled={saving || availableDoctors.length === 0}
              className={`rounded border border-dashed border-slate-line px-2 py-1 text-xs ${textClass} hover:bg-canvas-sunken disabled:opacity-40`}
            >
              Add doctor
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// One category's read-only summary row for the desktop inspector's default
// (non-editing) view: label, comma-joined surnames or an "Open" chip, and a
// status icon — no buttons. Editing lives behind the "Edit assignments"
// action instead of always-visible +/x controls, per a desktop UX review
// ("quick actions only on hover/select, not always-visible plus icons
// everywhere").
function AssignmentSummaryRow({ group, groupEntries, doctorById }) {
  const filled = groupEntries.length > 0
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-sm text-ink-muted">{group.label}</span>
      <div className="flex items-center gap-2">
        {filled ? (
          <span className="text-sm text-ink">
            {groupEntries.map(e => doctorById.get(e.profile_id)?.surname ?? '(unknown)').join(', ')}
          </span>
        ) : (
          <span className="rounded-full bg-flagAmber-bg px-2 py-0.5 text-xs font-medium text-flagAmber">Open</span>
        )}
        {filled
          ? <CircleCheck className="h-4 w-4 flex-shrink-0 text-success" />
          : <CircleAlert className="h-4 w-4 flex-shrink-0 text-flagAmber" />}
      </div>
    </div>
  )
}

// The desktop split view's right-hand panel: a summary of whichever weekend
// is selected in the grid, with editing tucked behind an "Edit assignments"
// action instead of always-on inline controls — a proper inspector, not a
// second copy of the mobile card. Editing state is local and resets
// whenever the selected weekend changes, so switching weekends never leaves
// a stale picker open.
function WeekendInspector({
  saturday, weekendIndex, bySaturday, doctors, doctorById, isAdmin, saving, myRequest, canViewRequests,
  assignedIds, openPicker, setOpenPicker, addEntry, removeEntry,
}) {
  const [editing, setEditing] = useState(false)
  useEffect(() => { setEditing(false) }, [saturday])

  const coverage = weekendCoverageSummary(bySaturday)
  const needsPlanning = coverage.openGroups.length > 0
  const badge = weekendBadge(saturday, weekendIndex)

  return (
    <div data-testid="weekend-inspector">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Selected weekend</p>
          <p className="mt-0.5 text-base font-semibold text-ink">{formatWeekendRange(saturday)}</p>
        </div>
        <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.chip}`}>{badge.label}</span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-line pt-3">
        <span className="text-sm text-ink-muted">Overall status</span>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
          needsPlanning ? 'bg-flagAmber-bg text-flagAmber' : 'bg-success-bg text-success'
        }`}>
          {needsPlanning ? <CircleAlert className="h-3.5 w-3.5" /> : <CircleCheck className="h-3.5 w-3.5" />}
          {needsPlanning
            ? `${coverage.openGroups.length} ${coverage.openGroups.length === 1 ? 'gap' : 'gaps'}`
            : `${coverage.filledGroups} of ${coverage.totalGroups} groups planned`}
        </span>
      </div>

      {myRequest && (
        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          {EXCEPTION_STATUS_LABEL[myRequest.status] ?? myRequest.status}
        </p>
      )}

      {!editing ? (
        <>
          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink-muted">Assignments</p>
          <div className="mt-1 divide-y divide-slate-line">
            {CATEGORY_GROUPS.map(group => (
              <AssignmentSummaryRow key={group.key} group={group} groupEntries={bySaturday[group.key] || []} doctorById={doctorById} />
            ))}
          </div>

          <div className={`mt-4 flex items-start gap-2 rounded-lg p-3 text-xs ${needsPlanning ? 'bg-flagAmber-bg text-flagAmber' : 'bg-success-bg text-success'}`}>
            {needsPlanning ? <CircleAlert className="h-4 w-4 flex-shrink-0" /> : <CircleCheck className="h-4 w-4 flex-shrink-0" />}
            <span>
              {needsPlanning
                ? `${coverage.openGroups.map(k => CATEGORY_GROUPS.find(g => g.key === k)?.label).join(', ')} still need${coverage.openGroups.length === 1 ? 's' : ''} a staff member.`
                : 'All required groups have an assigned staff member.'}
            </span>
          </div>

          <div className="mt-4 space-y-2">
            {isAdmin && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="btn-primary flex w-full items-center justify-center gap-1.5 text-sm"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit assignments
              </button>
            )}
            {canViewRequests && (
              <Link to="/leave?tab=planners&sub=requests" className="btn-secondary flex w-full items-center justify-center gap-1.5 text-sm">
                <Users className="h-3.5 w-3.5" /> View requests
              </Link>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="mt-4 divide-y divide-slate-line border-t border-slate-line">
            {CATEGORY_GROUPS.map(group => {
              const groupEntries = bySaturday[group.key] || []
              const availableDoctors = doctors
                .filter(d => groupForCategory(resolvedCategoryForDoctor(d)) === group.key)
                .filter(d => !assignedIds.has(d.id))
              return (
                <CategoryGroupRow
                  key={group.key}
                  group={group}
                  groupEntries={groupEntries}
                  doctorById={doctorById}
                  availableDoctors={availableDoctors}
                  isAdmin={isAdmin}
                  saving={saving}
                  textClass="text-ink"
                  saturday={saturday}
                  pickerKey={`${saturday}:${group.key}`}
                  openPicker={openPicker}
                  setOpenPicker={setOpenPicker}
                  addEntry={addEntry}
                  removeEntry={removeEntry}
                />
              )
            })}
          </div>
          <button type="button" onClick={() => setEditing(false)} className="btn-secondary mt-4 w-full text-sm">
            Done editing
          </button>
        </>
      )}
    </div>
  )
}

// Mobile-only read-only quick-glance for a weekend, opened by tapping a
// card's date header — mirrors LeaveYearGrid.jsx's DayDetailSheet (fixed
// inset-0, bg-ink/20, items-end on mobile / items-center on desktop). This
// is deliberately NOT a replacement for the mobile card's own
// always-expanded, fully editable breakdown below it (which stays exactly
// as-is): that inline view already has everything, admin controls
// included, so a sheet re-showing the identical thing behind an extra tap
// would just be a redundant detour. This is a condensed alternative for a
// fast glance — status + assignments only, reusing WeekendInspector's own
// read-only AssignmentSummaryRow rather than rebuilding that breakdown a
// second time.
function WeekendDetailSheet({ saturday, weekendIndex, bySaturday, doctorById, myRequest, onClose }) {
  const coverage = weekendCoverageSummary(bySaturday)
  const needsPlanning = coverage.openGroups.length > 0
  const badge = weekendBadge(saturday, weekendIndex)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/20 sm:items-center sm:px-4" onClick={onClose}>
      <div className="card w-full max-w-md rounded-b-none p-5 sm:rounded-b-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="font-display text-base font-bold text-ink">{formatWeekendRange(saturday)}</h2>
            <span className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.chip}`}>{badge.label}</span>
          </div>
          <button onClick={onClose} className="text-ink-muted hover:text-ink" aria-label="Close">×</button>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-line pt-3">
          <span className="text-sm text-ink-muted">Overall status</span>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
            needsPlanning ? 'bg-flagAmber-bg text-flagAmber' : 'bg-success-bg text-success'
          }`}>
            {needsPlanning ? <CircleAlert className="h-3.5 w-3.5" /> : <CircleCheck className="h-3.5 w-3.5" />}
            {needsPlanning
              ? `${coverage.openGroups.length} ${coverage.openGroups.length === 1 ? 'gap' : 'gaps'}`
              : `${coverage.filledGroups} of ${coverage.totalGroups} groups planned`}
          </span>
        </div>

        {myRequest && (
          <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {EXCEPTION_STATUS_LABEL[myRequest.status] ?? myRequest.status}
          </p>
        )}

        <div className="mt-3 divide-y divide-slate-line">
          {CATEGORY_GROUPS.map(group => (
            <AssignmentSummaryRow key={group.key} group={group} groupEntries={bySaturday[group.key] || []} doctorById={doctorById} />
          ))}
        </div>
      </div>
    </div>
  )
}

// The Weekend Planner's grid + edit logic, factored out of WeekendPlannerPage
// so it can render both at its own /weekend route (unchanged nav entry) and
// nested inside the Leave page's "Planners" tab group — per the Planners-tabs
// restructure, without duplicating the assign/remove logic in two places.
// Callers own the page-level heading/locum-redirect; this is just the
// review-log button + rules + grid.
//
// Two genuinely different layouts share the same data/state below, not one
// layout stretched wider: mobile (lg:hidden) keeps the month-at-a-time card
// list from the earlier mobile-first redesign; desktop (hidden lg:block) is
// a weekend-first summary table + inspector, per a desktop UX review that
// flagged the previous desktop attempt (category-first columns, full-row
// parity tinting competing with warning states, an always-editable
// inspector) as fighting its own content instead of supporting it. Rows stay
// neutral/white; parity is a small labelled badge, not a background; a
// dedicated Status column ("Fully planned" / "N gaps") replaces the old
// inline pink pill; and the inspector defaults to a read-only summary with
// editing behind an explicit "Edit assignments" action. Still a fixed
// two-pane split (not drag-resizable) and still one month at a time — those
// scope cuts from the previous round stand.
// initialYear/initialMonth seed the starting viewYear/viewMonth instead of
// always defaulting to today — set when WeekendPlanner.jsx opens this from
// its year overview at a specific month, possibly outside today's rolling
// WEEKS_AHEAD window (a past/future year an admin navigated to). onBackToYear,
// when present, renders a "← Year view" link back to that overview — absent
// when this is reached directly (the standalone /weekend route, or a caller
// with no year overview of its own).
export default function WeekendPlannerView({ initialYear, initialMonth, onBackToYear } = {}) {
  const { isAdmin, isClerk, canSubmitLeave, profile } = useAuth()
  const [doctors, setDoctors] = useState([])
  const [entries, setEntries] = useState([])
  const [myWeekendRequests, setMyWeekendRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openPicker, setOpenPicker] = useState(null) // `${saturday}:${groupKey}` or null
  const [saving, setSaving] = useState(false)
  const [showChangeLog, setShowChangeLog] = useState(false)
  // An admin's default concern is the whole roster, not their own rotation
  // (they may not even be on it) — lands on "All weekends" rather than
  // sharing non-admins' "My weekends" default, matching ADMIN_FILTERS
  // leading with the same chip above.
  const [filter, setFilter] = useState(isAdmin || isClerk ? 'all' : 'mine')
  const [searchQuery, setSearchQuery] = useState('') // desktop-only: filter grid rows by assigned surname
  const [selectedSaturday, setSelectedSaturday] = useState(null) // desktop-only: which row the inspector shows
  const [detailSaturday, setDetailSaturday] = useState(null) // mobile-only: which card's read-only quick-glance sheet is open
  const today = todayStr()
  const [viewYear, setViewYear] = useState(() => initialYear ?? Number(today.slice(0, 4)))
  const [viewMonth, setViewMonth] = useState(() => initialMonth ?? Number(today.slice(5, 7)))

  // The Requests planner tab only exists for admins (approval queue) and
  // doctors (their own history) — matches the same condition LeavePlannerPage
  // uses to decide whether to render that tab at all, so "View requests"
  // never links somewhere that redirects the visitor elsewhere.
  const canViewRequests = isAdmin || canSubmitLeave

  const filters = isAdmin ? ADMIN_FILTERS : isClerk ? CLERK_FILTERS : FILTERS_BASE

  // The default rolling window (today through WEEKS_AHEAD later), widened
  // to also cover initialYear/initialMonth's whole month when that's
  // seeded from further away — otherwise a month the year overview opened
  // from a past/future year would fetch a range that never includes it.
  // Computed once from stable inputs (today/initialYear/initialMonth never
  // change after mount, matching viewYear/viewMonth's own useState
  // initializers above), reused by both load() and the saturdays memo below
  // so what's fetched and what's considered "in range" for prev/next-month
  // bounds always agree.
  const seededBounds = initialYear && initialMonth ? monthBounds(initialYear, initialMonth) : null
  const defaultThroughDate = addDays(today, WEEKS_AHEAD * 7)
  const fetchFromDate = seededBounds && seededBounds.start < today ? seededBounds.start : today
  const fetchThroughDate = seededBounds && seededBounds.end > defaultThroughDate ? seededBounds.end : defaultThroughDate

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps -- load is redefined every render; nothing it closes over (profile, fetchFromDate/fetchThroughDate) changes within a session

  async function load() {
    setLoading(true)
    setError('')

    const [profilesRes, entriesRes, myRequestsRes] = await Promise.all([
      supabase.from('profiles').select('id, name, surname, category, contract_type')
        .eq('is_approved', true).eq('is_active', true),
      supabase.from('weekend_planner_entries').select('id, weekend_saturday, profile_id, category')
        .gte('weekend_saturday', fetchFromDate).lte('weekend_saturday', fetchThroughDate),
      supabase.from('leave_requests').select('id, date_from, status')
        .eq('profile_id', profile?.id ?? '').eq('leave_type', 'weekend_exception')
        .gte('date_from', fetchFromDate).lte('date_from', fetchThroughDate),
    ])
    if (profilesRes.error) { setError(profilesRes.error.message); setLoading(false); return }
    if (entriesRes.error) { setError(entriesRes.error.message); setLoading(false); return }
    if (myRequestsRes.error) { setError(myRequestsRes.error.message); setLoading(false); return }

    setDoctors((profilesRes.data || []).filter(p => groupForCategory(resolvedCategoryForDoctor(p))))
    setEntries(entriesRes.data || [])
    setMyWeekendRequests(myRequestsRes.data || [])
    setLoading(false)
  }

  const saturdays = useMemo(
    () => saturdaysInRange(fetchFromDate, fetchThroughDate),
    [fetchFromDate, fetchThroughDate]
  )
  const byWeekend = useMemo(() => groupEntriesByWeekend(entries), [entries])
  const doctorById = useMemo(() => new Map(doctors.map(d => [d.id, d])), [doctors])
  const myRequestsBySaturday = useMemo(() => weekendExceptionRequestsBySaturday(myWeekendRequests), [myWeekendRequests])

  const firstFetchedSaturday = saturdays[0]
  const lastFetchedSaturday = saturdays[saturdays.length - 1]
  const canGoPrevMonth = firstFetchedSaturday
    && !(viewYear === Number(firstFetchedSaturday.slice(0, 4)) && viewMonth === Number(firstFetchedSaturday.slice(5, 7)))
  const canGoNextMonth = lastFetchedSaturday
    && !(viewYear === Number(lastFetchedSaturday.slice(0, 4)) && viewMonth === Number(lastFetchedSaturday.slice(5, 7)))

  function goPrevMonth() {
    if (viewMonth === 1) { setViewYear(y => y - 1); setViewMonth(12) }
    else setViewMonth(m => m - 1)
  }
  function goNextMonth() {
    if (viewMonth === 12) { setViewYear(y => y + 1); setViewMonth(1) }
    else setViewMonth(m => m + 1)
  }
  function goToday() {
    setViewYear(Number(today.slice(0, 4)))
    setViewMonth(Number(today.slice(5, 7)))
  }

  // Only Saturdays actually in the fetched window are shown — this
  // naturally excludes both already-passed weekends this month (the fetch
  // starts from today) and anything beyond the fetch's runway, without
  // separate min/max bounds logic.
  const fetchedSet = useMemo(() => new Set(saturdays), [saturdays])
  const monthSaturdays = useMemo(
    () => saturdaysInMonth(viewYear, viewMonth).filter(s => fetchedSet.has(s)),
    [viewYear, viewMonth, fetchedSet]
  )
  const visibleSaturdays = monthSaturdays.filter(saturday => {
    const bySaturday = byWeekend.get(saturday)
    if (filter === 'needs-planning') return weekendCoverageSummary(bySaturday).openGroups.length > 0
    if (filter === 'mine') return isProfileAssignedToWeekend(bySaturday, profile?.id)
    if (filter === 'my-requests') return myRequestsBySaturday.has(saturday)
    return true
  })

  // Desktop-only: the surname search narrows the grid further still (any
  // doctor assigned to that weekend, in any group), on top of whichever
  // filter chip is active.
  const searchTerm = searchQuery.trim().toLowerCase()
  const desktopSaturdays = !searchTerm ? visibleSaturdays : visibleSaturdays.filter(saturday => {
    const bySaturday = byWeekend.get(saturday) || {}
    return Object.values(bySaturday).flat().some(e => doctorById.get(e.profile_id)?.surname?.toLowerCase().includes(searchTerm))
  })

  const nextWeekend = nextWeekendSaturday(today)
  const nextWeekendCoverage = weekendCoverageSummary(byWeekend.get(nextWeekend))
  const nextWeekendMine = isProfileAssignedToWeekend(byWeekend.get(nextWeekend), profile?.id)
  const nextWeekendScheme = weekendColorScheme(nextWeekend)

  // The inspector defaults to Next weekend when it's in view, so the most
  // urgent question is answered the moment the page loads — otherwise the
  // first visible row, and whatever the admin last clicked as long as it's
  // still in view after a filter/search/month change.
  const inspectorSaturday = (selectedSaturday && desktopSaturdays.includes(selectedSaturday))
    ? selectedSaturday
    : (desktopSaturdays.includes(nextWeekend) ? nextWeekend : desktopSaturdays[0]) ?? null

  // Doctors already placed SOMEWHERE this weekend (any group) — the DB's
  // unique(weekend_saturday, profile_id) means a doctor can only fill one
  // slot per weekend, so they're excluded from every group's picker once
  // placed, not just their own.
  function assignedDoctorIds(saturday) {
    const bySaturday = byWeekend.get(saturday)
    if (!bySaturday) return new Set()
    return new Set(Object.values(bySaturday).flat().map(e => e.profile_id))
  }

  // Both handlers patch local state directly from the write's own result
  // rather than reloading — load() flips `loading` back to true, which
  // unmounts the whole grid for a "Loading…" placeholder. A single
  // weekend_planner_entries row is simple enough to update in place
  // without a round trip back through the full query.
  async function addEntry(saturday, groupKey, profileId) {
    const doctor = doctorById.get(profileId)
    if (!doctor) return
    setSaving(true)
    const { data, error: err } = await supabase.from('weekend_planner_entries').insert({
      weekend_saturday: saturday,
      profile_id: profileId,
      category: resolvedCategoryForDoctor(doctor),
      created_by: profile?.id ?? null,
    }).select().single()
    setSaving(false)
    if (err) { setError(err.message); return }
    setOpenPicker(null)
    setEntries(prev => [...prev, data])
    await logWeekendPlannerChange({
      weekendSaturday: saturday, category: resolvedCategoryForDoctor(doctor), action: 'add',
      profileId, changedBy: profile?.id ?? null,
    })
  }

  async function removeEntry(entryId) {
    setSaving(true)
    const removed = entries.find(e => e.id === entryId)
    const { error: err } = await supabase.from('weekend_planner_entries').delete().eq('id', entryId)
    setSaving(false)
    if (err) { setError(err.message); return }
    setEntries(prev => prev.filter(e => e.id !== entryId))
    if (removed) {
      await logWeekendPlannerChange({
        weekendSaturday: removed.weekend_saturday, category: removed.category, action: 'remove',
        profileId: removed.profile_id, changedBy: profile?.id ?? null,
      })
    }
  }

  const monthNav = (
    <div className="flex flex-wrap items-center gap-2">
      {onBackToYear && (
        <button type="button" onClick={onBackToYear} className="mr-1 inline-flex items-center gap-1.5 text-sm font-medium text-ink-light hover:text-ink">
          ← Year view
        </button>
      )}
      <button type="button" onClick={goPrevMonth} disabled={!canGoPrevMonth} className="btn-secondary px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-40" aria-label="Previous month">←</button>
      <span className="font-display text-base font-semibold text-ink">{MONTH_LABELS[viewMonth - 1]} {viewYear}</span>
      <button type="button" onClick={goNextMonth} disabled={!canGoNextMonth} className="btn-secondary px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-40" aria-label="Next month">→</button>
      <button type="button" onClick={goToday} className="btn-secondary px-2 py-1 text-xs">Today</button>
    </div>
  )

  const filterChips = (
    <div className="flex gap-1 rounded-lg border border-slate-line bg-canvas-raised p-0.5">
      {filters.map(f => (
        <button
          key={f.key}
          type="button"
          onClick={() => setFilter(f.key)}
          className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
            filter === f.key ? 'bg-accent text-white' : 'text-ink-light hover:bg-canvas-sunken'
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  )

  return (
    <div>
      {isAdmin && (
        <div className="flex justify-end lg:hidden">
          <button onClick={() => setShowChangeLog(true)} className="btn-secondary text-sm">
            Review log
          </button>
        </div>
      )}

      <InlineRuleHint
        inline="No more than one person per slot — a colour marks which weekends you're on for the month."
        bullets={[
          'No more than one person per slot.',
          'If your name is listed in a specific colour for a given month, you work every weekend in that colour that month.',
          'Use surnames when populating the planner.',
        ]}
      />

      {loading && <p className="mt-6 text-sm text-ink-muted">Loading…</p>}
      {error && <p className="mt-6 text-sm text-flagRed">{error}</p>}

      {!loading && !error && (
        <>
          {/* ── Mobile: month-at-a-time card list (unchanged from the earlier mobile-first redesign) ── */}
          <div className="lg:hidden" data-testid="weekend-mobile">
            <div className={`mt-6 card p-4 ${nextWeekendScheme.bg}`}>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Next weekend</p>
              <p className={`mt-0.5 text-base font-semibold ${nextWeekendScheme.text}`}>{formatWeekendRange(nextWeekend)}</p>
              <p className="mt-1 text-sm text-ink-light">
                {nextWeekendCoverage.filledGroups} of {nextWeekendCoverage.totalGroups} groups planned
                {nextWeekendCoverage.openGroups.length > 0 && (
                  <> — <span className="text-rose-dark">{nextWeekendCoverage.openGroups.map(k => CATEGORY_GROUPS.find(g => g.key === k)?.label).join(', ')} still open</span></>
                )}
              </p>
              {nextWeekendMine && <p className="mt-1 text-sm font-medium text-accent">You&rsquo;re on rotation this weekend.</p>}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              {monthNav}
              {filterChips}
            </div>

            <div className="mt-3 space-y-3">
              {visibleSaturdays.length === 0 ? (
                <p className="text-sm text-ink-muted">
                  {monthSaturdays.length === 0 ? 'No weekends to plan in this month yet.' : 'No weekends match this filter.'}
                </p>
              ) : visibleSaturdays.map(saturday => {
                const bySaturday = byWeekend.get(saturday) || {}
                const coverage = weekendCoverageSummary(bySaturday)
                const needsPlanning = coverage.openGroups.length > 0
                const assignedIds = assignedDoctorIds(saturday)
                const myRequest = myRequestsBySaturday.get(saturday)
                const scheme = weekendColorScheme(saturday)

                return (
                  <div
                    key={saturday}
                    className={`card p-4 ${scheme.bg}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      {/* Tapping the date opens a read-only quick-glance sheet
                          (WeekendDetailSheet) — a condensed alternative to
                          scrolling this card's own always-expanded, fully
                          editable breakdown below, not a replacement for it. */}
                      <button
                        type="button"
                        onClick={() => setDetailSaturday(saturday)}
                        className={`text-sm font-medium underline decoration-dotted underline-offset-2 ${scheme.text}`}
                      >
                        {formatWeekendRange(saturday)}
                      </button>
                      <div className="flex items-center gap-2">
                        {myRequest && (
                          <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                            {EXCEPTION_STATUS_LABEL[myRequest.status] ?? myRequest.status}
                          </span>
                        )}
                        {needsPlanning && (
                          <span className="rounded-full bg-rose-light px-2 py-0.5 text-xs font-medium text-rose-dark">
                            Needs planning
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 divide-y divide-slate-line">
                      {CATEGORY_GROUPS.map(group => {
                        const groupEntries = bySaturday[group.key] || []
                        const availableDoctors = doctors
                          .filter(d => groupForCategory(resolvedCategoryForDoctor(d)) === group.key)
                          .filter(d => !assignedIds.has(d.id))

                        return (
                          <CategoryGroupRow
                            key={group.key}
                            group={group}
                            groupEntries={groupEntries}
                            doctorById={doctorById}
                            availableDoctors={availableDoctors}
                            isAdmin={isAdmin}
                            saving={saving}
                            textClass={scheme.text}
                            saturday={saturday}
                            pickerKey={`${saturday}:${group.key}`}
                            openPicker={openPicker}
                            setOpenPicker={setOpenPicker}
                            addEntry={addEntry}
                            removeEntry={removeEntry}
                          />
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Desktop: weekend-first summary table + inspector (see file-level comment for rationale) ── */}
          <div className="hidden lg:block" data-testid="weekend-desktop">
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              {monthNav}
              <span className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search surname…"
                  aria-label="Search by surname"
                  className="input-field w-48 py-1.5 pl-7 text-sm"
                />
              </span>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-b border-slate-line pb-3">
              {filterChips}
              {isAdmin && (
                <button onClick={() => setShowChangeLog(true)} className="btn-secondary text-sm">
                  Review log
                </button>
              )}
            </div>

            <div className="mt-4 flex items-start gap-4">
              <div className="max-h-[60vh] flex-1 overflow-auto rounded-lg border border-slate-line">
                <table className="w-full min-w-[720px] border-collapse text-sm">
                  <thead>
                    <tr className="text-left text-xs text-ink-muted">
                      <th className="sticky top-0 left-0 z-20 bg-canvas-raised px-3 py-2 font-medium">Weekend</th>
                      {CATEGORY_GROUPS.map(group => (
                        <th key={group.key} className="sticky top-0 z-10 bg-canvas-raised px-3 py-2 font-medium">{group.label}</th>
                      ))}
                      <th className="sticky top-0 z-10 bg-canvas-raised px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-line">
                    {desktopSaturdays.length === 0 ? (
                      <tr>
                        <td colSpan={CATEGORY_GROUPS.length + 2} className="px-3 py-6 text-center text-ink-muted">
                          {monthSaturdays.length === 0 ? 'No weekends to plan in this month yet.' : 'No weekends match this filter/search.'}
                        </td>
                      </tr>
                    ) : desktopSaturdays.map(saturday => {
                      const bySaturday = byWeekend.get(saturday) || {}
                      const coverage = weekendCoverageSummary(bySaturday)
                      const needsPlanning = coverage.openGroups.length > 0
                      const badge = weekendBadge(saturday, monthSaturdays.indexOf(saturday) + 1)
                      const isSelected = saturday === inspectorSaturday

                      return (
                        <tr
                          key={saturday}
                          onClick={() => setSelectedSaturday(saturday)}
                          aria-selected={isSelected}
                          className={`group cursor-pointer transition-colors ${isSelected ? 'bg-accent-tint/50' : 'hover:bg-canvas-sunken/40'}`}
                        >
                          <td className={`sticky left-0 z-10 border-l-4 px-3 py-2.5 font-medium text-ink ${
                            isSelected ? 'border-l-accent bg-accent-tint/50' : 'border-l-transparent bg-canvas-raised group-hover:bg-canvas-sunken/40'
                          }`}>
                            <div className="flex flex-col gap-1">
                              <span>{formatWeekendRange(saturday)}</span>
                              <span className={`inline-flex w-fit items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${badge.chip}`}>{badge.label}</span>
                            </div>
                          </td>
                          {CATEGORY_GROUPS.map(group => {
                            const groupEntries = bySaturday[group.key] || []
                            return (
                              <td key={group.key} className="px-3 py-2.5">
                                {groupEntries.length === 0 ? (
                                  <span className="inline-flex items-center rounded-full bg-flagAmber-bg px-2 py-0.5 text-xs font-medium text-flagAmber">Open</span>
                                ) : (
                                  <div className="space-y-0.5">
                                    {chunkInPairs(groupEntries).map((row, i) => (
                                      <div key={i} className="text-ink">{row.map(e => doctorById.get(e.profile_id)?.surname ?? '(unknown)').join(', ')}</div>
                                    ))}
                                  </div>
                                )}
                              </td>
                            )
                          })}
                          <td className="px-3 py-2.5">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                              needsPlanning ? 'bg-flagAmber-bg text-flagAmber' : 'bg-success-bg text-success'
                            }`}>
                              {needsPlanning ? <CircleAlert className="h-3.5 w-3.5" /> : <CircleCheck className="h-3.5 w-3.5" />}
                              {needsPlanning ? `${coverage.openGroups.length} ${coverage.openGroups.length === 1 ? 'gap' : 'gaps'}` : 'Fully planned'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="w-80 flex-shrink-0 rounded-lg border border-slate-line p-4">
                {inspectorSaturday ? (
                  <WeekendInspector
                    saturday={inspectorSaturday}
                    weekendIndex={monthSaturdays.indexOf(inspectorSaturday) + 1}
                    bySaturday={byWeekend.get(inspectorSaturday) || {}}
                    doctors={doctors}
                    doctorById={doctorById}
                    isAdmin={isAdmin}
                    saving={saving}
                    myRequest={myRequestsBySaturday.get(inspectorSaturday)}
                    canViewRequests={canViewRequests}
                    assignedIds={assignedDoctorIds(inspectorSaturday)}
                    openPicker={openPicker}
                    setOpenPicker={setOpenPicker}
                    addEntry={addEntry}
                    removeEntry={removeEntry}
                  />
                ) : (
                  <p className="text-sm text-ink-muted">Select a weekend to see details.</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {showChangeLog && <WeekendPlannerChangeLogModal onClose={() => setShowChangeLog(false)} />}

      {detailSaturday && (
        <WeekendDetailSheet
          saturday={detailSaturday}
          weekendIndex={monthSaturdays.indexOf(detailSaturday) + 1}
          bySaturday={byWeekend.get(detailSaturday) || {}}
          doctorById={doctorById}
          myRequest={myRequestsBySaturday.get(detailSaturday)}
          onClose={() => setDetailSaturday(null)}
        />
      )}
    </div>
  )
}
