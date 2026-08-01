import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { todayStr, addDays } from '../lib/dateRange'
import {
  CATEGORY_GROUPS, groupForCategory, saturdaysInRange, saturdaysInMonth, nextWeekendSaturday,
  weekendCoverageSummary, isProfileAssignedToWeekend, groupEntriesByWeekend,
  isEvenWeekend, weekendExceptionRequestsBySaturday,
} from '../lib/weekendPlanner'
import { logWeekendPlannerChange } from '../lib/changeLog'
import WeekendPlannerChangeLogModal from './WeekendPlannerChangeLogModal'
import InlineRuleHint from './InlineRuleHint'

const WEEKS_AHEAD = 26 // ~6 months, enough runway to plan several roster months ahead
// My Schedule is both the default landing filter and leftmost chip; Needs
// planning is admin-only (nothing a non-admin viewer can act on) and sits
// at the far right, appended only for admins rather than shared.
const FILTERS_BASE = [
  { key: 'mine', label: 'My Schedule' },
  { key: 'my-requests', label: 'My Requests' },
  { key: 'all', label: 'All' },
]
const EXCEPTION_STATUS_LABEL = { pending: 'Exception pending', approved: 'Exception approved', rejected: 'Exception rejected' }
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// A weekend's background/text theme always follows even/odd parity — a
// deliberate design choice that "Needs planning" no longer overrides it
// (that's now signalled by a rose pillbox badge and rose open-slot counts
// instead, layered on top of whichever theme applies). Reuses the existing
// accent/flagAmber tokens for their colour values rather than inventing
// near-duplicates, even though flagAmber is otherwise reserved for
// roster-state semantics elsewhere in the app — this view is an explicit,
// deliberate exception to that convention.
function weekendColorScheme(saturday) {
  return isEvenWeekend(saturday)
    ? { bg: 'bg-accent-tint', text: 'text-accent' }
    : { bg: 'bg-flagAmber-bg', text: 'text-flagAmber' }
}

function XIcon(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

function SearchIcon(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="11" cy="11" r="7" strokeLinecap="round" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35" />
    </svg>
  )
}

// One category group's row: assigned surname(s) (or an open-slot count) plus
// the admin add/remove controls. Shared between the mobile card layout and
// the desktop inspector panel so the edit logic exists in exactly one place.
function CategoryGroupRow({
  group, groupEntries, doctorById, availableDoctors, isAdmin, saving, textClass,
  saturday, pickerKey, openPicker, setOpenPicker, addEntry, removeEntry,
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <span className="text-sm text-ink-muted">{group.label}</span>
      <div className="flex items-center gap-2">
        {groupEntries.length === 0 ? (
          <span className="text-xs font-medium text-rose-dark">1 open</span>
        ) : (
          groupEntries.map(entry => {
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
          })
        )}
        {isAdmin && (
          openPicker === pickerKey ? (
            <select
              autoFocus
              className="input-field text-sm"
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
              className={`flex items-center justify-center rounded border border-dashed border-slate-line px-2 py-0.5 text-[10px] ${textClass} hover:bg-canvas-sunken disabled:opacity-40`}
            >
              +
            </button>
          )
        )}
      </div>
    </div>
  )
}

// The desktop split view's right-hand panel: full detail + actions for
// whichever weekend is selected in the grid, so editing happens without
// losing the grid's scroll position or context — "click a cell to inspect
// ... and actions without losing grid context" per the desktop workspace
// design review.
function WeekendInspector({
  saturday, bySaturday, doctors, doctorById, isAdmin, saving, myRequest,
  assignedIds, openPicker, setOpenPicker, addEntry, removeEntry,
}) {
  const coverage = weekendCoverageSummary(bySaturday)
  const needsPlanning = coverage.openGroups.length > 0
  const scheme = weekendColorScheme(saturday)

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Selected weekend</p>
      <p className={`mt-0.5 text-base font-semibold ${scheme.text}`}>{saturday} → {addDays(saturday, 1)}</p>
      <p className="mt-1 text-sm text-ink-light">
        {coverage.filledGroups} of {coverage.totalGroups} groups planned
        {needsPlanning && (
          <> — <span className="text-rose-dark">{coverage.openGroups.map(k => CATEGORY_GROUPS.find(g => g.key === k)?.label).join(', ')} still open</span></>
        )}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {needsPlanning && (
          <span className="rounded-full bg-rose-light px-2 py-0.5 text-xs font-medium text-rose-dark">Needs planning</span>
        )}
        {myRequest && (
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {EXCEPTION_STATUS_LABEL[myRequest.status] ?? myRequest.status}
          </span>
        )}
      </div>

      <div className="mt-4 divide-y divide-slate-line border-t border-slate-line">
        {CATEGORY_GROUPS.map(group => {
          const groupEntries = bySaturday[group.key] || []
          const availableDoctors = doctors
            .filter(d => groupForCategory(d.category) === group.key)
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
// a dedicated dense workspace instead — sticky header row + first column,
// a surname search, and a split view (scannable grid on the left, a
// selected-weekend inspector with the actual add/remove controls on the
// right) rather than the same cards just laid out wider, per a UX review
// that specifically flagged the old "enlarged mobile page" desktop layout
// as too bulky. The inspector's split is a fixed two-pane layout, not
// drag-resizable — logged as a possible follow-up rather than built here.
export default function WeekendPlannerView() {
  const { isAdmin, isClerk, profile } = useAuth()
  const [doctors, setDoctors] = useState([])
  const [entries, setEntries] = useState([])
  const [myWeekendRequests, setMyWeekendRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openPicker, setOpenPicker] = useState(null) // `${saturday}:${groupKey}` or null
  const [saving, setSaving] = useState(false)
  const [showChangeLog, setShowChangeLog] = useState(false)
  // Clerks have no personal weekend assignments/requests of their own, so
  // "My Schedule" (the default for everyone else) would always land them on
  // an empty view — they land on "All weekends" instead.
  const [filter, setFilter] = useState(() => (isClerk ? 'all' : 'mine'))
  const [searchQuery, setSearchQuery] = useState('') // desktop-only: filter grid rows by assigned surname
  const [selectedSaturday, setSelectedSaturday] = useState(null) // desktop-only: which row the inspector shows
  const today = todayStr()
  const [viewYear, setViewYear] = useState(() => Number(today.slice(0, 4)))
  const [viewMonth, setViewMonth] = useState(() => Number(today.slice(5, 7)))

  // Needs planning is nothing a non-admin viewer can act on, so it's
  // appended for admins only rather than shared across both roles. Clerks
  // get no filter chips at all — My Schedule/My Requests are meaningless
  // for them (no personal assignments), and All is the only view they'd
  // ever want, so it's just the permanent, unfiltered landing state.
  const filters = isAdmin ? [...FILTERS_BASE, { key: 'needs-planning', label: 'Needs planning' }] : isClerk ? [] : FILTERS_BASE

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps -- load is redefined every render; nothing it closes over (profile) changes within a session

  async function load() {
    setLoading(true)
    setError('')
    const fromDate = todayStr()
    const throughDate = addDays(fromDate, WEEKS_AHEAD * 7)

    const [profilesRes, entriesRes, myRequestsRes] = await Promise.all([
      supabase.from('profiles').select('id, name, surname, category')
        .eq('is_approved', true).eq('is_active', true),
      supabase.from('weekend_planner_entries').select('id, weekend_saturday, profile_id, category')
        .gte('weekend_saturday', fromDate).lte('weekend_saturday', throughDate),
      supabase.from('leave_requests').select('id, date_from, status')
        .eq('profile_id', profile?.id ?? '').eq('leave_type', 'weekend_exception')
        .gte('date_from', fromDate).lte('date_from', throughDate),
    ])
    if (profilesRes.error) { setError(profilesRes.error.message); setLoading(false); return }
    if (entriesRes.error) { setError(entriesRes.error.message); setLoading(false); return }
    if (myRequestsRes.error) { setError(myRequestsRes.error.message); setLoading(false); return }

    setDoctors((profilesRes.data || []).filter(p => groupForCategory(p.category)))
    setEntries(entriesRes.data || [])
    setMyWeekendRequests(myRequestsRes.data || [])
    setLoading(false)
  }

  const saturdays = useMemo(
    () => saturdaysInRange(todayStr(), addDays(todayStr(), WEEKS_AHEAD * 7)),
    []
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
      category: doctor.category,
      created_by: profile?.id ?? null,
    }).select().single()
    setSaving(false)
    if (err) { setError(err.message); return }
    setOpenPicker(null)
    setEntries(prev => [...prev, data])
    await logWeekendPlannerChange({
      weekendSaturday: saturday, category: doctor.category, action: 'add',
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
    <div className="flex items-center gap-2">
      <button type="button" onClick={goPrevMonth} disabled={!canGoPrevMonth} className="btn-secondary px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-40" aria-label="Previous month">←</button>
      <span className="font-display text-base font-semibold text-ink">{MONTH_LABELS[viewMonth - 1]} {viewYear}</span>
      <button type="button" onClick={goNextMonth} disabled={!canGoNextMonth} className="btn-secondary px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-40" aria-label="Next month">→</button>
      <button type="button" onClick={goToday} className="btn-secondary px-2 py-1 text-xs">Today</button>
    </div>
  )

  // Nothing to show for a clerk (no chips, and Review log is admin-only) —
  // render nothing rather than an empty bordered pill.
  const filterChips = filters.length > 0 ? (
    <div className="flex items-center gap-1 rounded-lg border border-slate-line bg-canvas-raised p-0.5">
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
      {/* Not a filter itself (doesn't touch `filter` state) — appended at
          the far right of the same tab bar, admin-only, separated by a
          divider so it reads as a distinct action rather than a 5th chip. */}
      {isAdmin && (
        <button
          type="button"
          onClick={() => setShowChangeLog(true)}
          className="ml-1 rounded border-l border-slate-line px-2.5 py-1 pl-3 text-xs font-medium text-ink-light transition-colors hover:bg-canvas-sunken"
        >
          Review log
        </button>
      )}
    </div>
  ) : null

  return (
    <div>
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
              <p className={`mt-0.5 text-base font-semibold ${nextWeekendScheme.text}`}>{nextWeekend} → {addDays(nextWeekend, 1)}</p>
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
                const sunday = addDays(saturday, 1)
                const myRequest = myRequestsBySaturday.get(saturday)
                const scheme = weekendColorScheme(saturday)

                return (
                  <div
                    key={saturday}
                    className={`card p-4 ${scheme.bg}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-sm font-medium ${scheme.text}`}>{saturday} → {sunday}</p>
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
                          .filter(d => groupForCategory(d.category) === group.key)
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

          {/* ── Desktop: dense workspace — sticky toolbar/grid + a split-view inspector, not a stretched mobile page ── */}
          <div className="hidden lg:block" data-testid="weekend-desktop">
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-slate-line pb-3">
              {monthNav}
              <div className="flex items-center gap-3">
                <span className="relative">
                  <SearchIcon className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search surname…"
                    aria-label="Search by surname"
                    className="input-field w-40 py-1 pl-7 text-sm"
                  />
                </span>
                {filterChips}
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-ink-muted">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-accent" /> Even weekend</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-flagAmber" /> Odd weekend</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-rose-dark" /> Needs planning / open slot</span>
            </div>

            <div className="mt-4 flex items-start gap-4">
              <div className="max-h-[60vh] flex-1 overflow-auto rounded-lg border border-slate-line">
                <table className="w-full min-w-[640px] border-collapse text-sm">
                  <thead>
                    <tr className="text-left text-xs text-ink-muted">
                      <th className="sticky top-0 left-0 z-20 bg-canvas-raised px-3 py-2 font-medium">Weekend</th>
                      {CATEGORY_GROUPS.map(group => (
                        <th key={group.key} className="sticky top-0 z-10 bg-canvas-raised px-3 py-2 font-medium">{group.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-line">
                    {desktopSaturdays.length === 0 ? (
                      <tr>
                        <td colSpan={CATEGORY_GROUPS.length + 1} className="px-3 py-6 text-center text-ink-muted">
                          {monthSaturdays.length === 0 ? 'No weekends to plan in this month yet.' : 'No weekends match this filter/search.'}
                        </td>
                      </tr>
                    ) : desktopSaturdays.map(saturday => {
                      const bySaturday = byWeekend.get(saturday) || {}
                      const coverage = weekendCoverageSummary(bySaturday)
                      const needsPlanning = coverage.openGroups.length > 0
                      const scheme = weekendColorScheme(saturday)
                      const isSelected = saturday === inspectorSaturday

                      return (
                        <tr
                          key={saturday}
                          onClick={() => setSelectedSaturday(saturday)}
                          aria-selected={isSelected}
                          className={`cursor-pointer ${isSelected ? 'ring-2 ring-inset ring-accent' : ''}`}
                        >
                          <td className={`sticky left-0 z-10 px-3 py-2 font-medium ${scheme.bg} ${scheme.text}`}>
                            <div className="flex items-center gap-2">
                              {saturday} → {addDays(saturday, 1)}
                              {needsPlanning && (
                                <span className="rounded-full bg-rose-light px-1.5 py-0.5 text-[10px] font-medium text-rose-dark">Needs planning</span>
                              )}
                            </div>
                          </td>
                          {CATEGORY_GROUPS.map(group => {
                            const groupEntries = bySaturday[group.key] || []
                            return (
                              <td key={group.key} className={`px-3 py-2 ${scheme.bg}`}>
                                {groupEntries.length === 0 ? (
                                  <span className="text-xs font-medium text-rose-dark">1 open</span>
                                ) : (
                                  <span className={scheme.text}>
                                    {groupEntries.map(e => doctorById.get(e.profile_id)?.surname ?? '(unknown)').join(', ')}
                                  </span>
                                )}
                              </td>
                            )
                          })}
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
                    bySaturday={byWeekend.get(inspectorSaturday) || {}}
                    doctors={doctors}
                    doctorById={doctorById}
                    isAdmin={isAdmin}
                    saving={saving}
                    myRequest={myRequestsBySaturday.get(inspectorSaturday)}
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
    </div>
  )
}
