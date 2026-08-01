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

// The Weekend Planner's grid + edit logic, factored out of WeekendPlannerPage
// so it can render both at its own /weekend route (unchanged nav entry) and
// nested inside the Leave page's "Planners" tab group — per the Planners-tabs
// restructure, without duplicating the assign/remove logic in two places.
// Callers own the page-level heading/locum-redirect; this is just the
// review-log button + rules + grid.
//
// Redesigned per a UX review of the old "one long scroll of every weekend
// card for 6 months" layout: a persistent "Next weekend" status card so the
// most urgent question (who's on this coming weekend?) never needs
// scrolling to answer; one month at a time instead of ~26 cards at once;
// My Schedule/My Requests/All(/Needs planning, admin-only) filters instead
// of a wall of red; denser role-row cards with open-slot counts, surnames
// only, and alternating teal/amber backgrounds+text per weekend so
// consecutive weekends read as distinct rows; a rose "Needs planning"
// pillbox and rose open-slot counts layered on top, reserving that
// stronger colour for the genuinely actionable signal rather than red.
export default function WeekendPlannerView() {
  const { isAdmin, profile } = useAuth()
  const [doctors, setDoctors] = useState([])
  const [entries, setEntries] = useState([])
  const [myWeekendRequests, setMyWeekendRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openPicker, setOpenPicker] = useState(null) // `${saturday}:${groupKey}` or null
  const [saving, setSaving] = useState(false)
  const [showChangeLog, setShowChangeLog] = useState(false)
  const [filter, setFilter] = useState('mine')
  const today = todayStr()
  const [viewYear, setViewYear] = useState(() => Number(today.slice(0, 4)))
  const [viewMonth, setViewMonth] = useState(() => Number(today.slice(5, 7)))

  // Needs planning is nothing a non-admin viewer can act on, so it's
  // appended for admins only rather than shared across both roles.
  const filters = isAdmin ? [...FILTERS_BASE, { key: 'needs-planning', label: 'Needs planning' }] : FILTERS_BASE

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

  const nextWeekend = nextWeekendSaturday(today)
  const nextWeekendCoverage = weekendCoverageSummary(byWeekend.get(nextWeekend))
  const nextWeekendMine = isProfileAssignedToWeekend(byWeekend.get(nextWeekend), profile?.id)
  const nextWeekendScheme = weekendColorScheme(nextWeekend)

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

  return (
    <div>
      {isAdmin && (
        <div className="flex justify-end">
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
            <div className="flex items-center gap-2">
              <button type="button" onClick={goPrevMonth} disabled={!canGoPrevMonth} className="btn-secondary px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-40" aria-label="Previous month">←</button>
              <span className="font-display text-base font-semibold text-ink">{MONTH_LABELS[viewMonth - 1]} {viewYear}</span>
              <button type="button" onClick={goNextMonth} disabled={!canGoNextMonth} className="btn-secondary px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-40" aria-label="Next month">→</button>
              <button type="button" onClick={goToday} className="btn-secondary px-2 py-1 text-xs">Today</button>
            </div>

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
                      const pickerKey = `${saturday}:${group.key}`
                      const availableDoctors = doctors
                        .filter(d => groupForCategory(d.category) === group.key)
                        .filter(d => !assignedIds.has(d.id))

                      return (
                        <div key={group.key} className="flex items-center justify-between gap-2 py-1.5">
                          <span className="text-sm text-ink-muted">{group.label}</span>
                          <div className="flex items-center gap-2">
                            {groupEntries.length === 0 ? (
                              <span className="text-xs font-medium text-rose-dark">1 open</span>
                            ) : (
                              groupEntries.map(entry => {
                                const doctor = doctorById.get(entry.profile_id)
                                return (
                                  <span key={entry.id} className={`flex items-center gap-1 text-sm ${scheme.text}`}>
                                    {doctor ? doctor.surname : '(unknown)'}
                                    {isAdmin && (
                                      <button
                                        type="button"
                                        onClick={() => removeEntry(entry.id)}
                                        disabled={saving}
                                        className={`${scheme.text} hover:text-flagRed`}
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
                                  className={`flex items-center justify-center rounded border border-dashed border-slate-line px-2 py-0.5 text-[10px] ${scheme.text} hover:bg-canvas-sunken disabled:opacity-40`}
                                >
                                  +
                                </button>
                              )
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {showChangeLog && <WeekendPlannerChangeLogModal onClose={() => setShowChangeLog(false)} />}
    </div>
  )
}

function XIcon(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}
