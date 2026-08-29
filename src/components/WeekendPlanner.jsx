import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { groupEntriesByWeekend } from '../lib/weekendPlanner'
import { buildDoctorDisplayNames } from '../lib/doctorNames'
import WeekendYearOverview from './WeekendYearOverview'
import MyWeekendYearOverview from './MyWeekendYearOverview'
import WeekendPlannerView from './WeekendPlannerView'

// Weekend Planner orchestrator — owns the year-scoped fetch and switches
// between the year overview (WeekendYearOverview for admins/clerks,
// MyWeekendYearOverview for everyone else) and the existing month-at-a-time
// grid (WeekendPlannerView, opened via the overview's "Open month" action or
// a month card's second click). Mirrors AnnualLeavePlanner.jsx's role for
// the Annual Leave planner.
//
// year/view/month live in the URL (`wyear`/`wview`/`wmonth`), not plain
// useState — same reasoning as AnnualLeavePlanner's ayear/aview/amonth: a
// backgrounded mobile browser/PWA can get killed and reloaded by the OS at
// any time, which remounts this component from scratch; the URL survives
// that, plain state would silently drop the viewer back at the current-year
// overview every time it happens.
export default function WeekendPlanner() {
  const { isAdmin, isClerk, profile } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const staffingRole = isAdmin || isClerk

  const year = Number(searchParams.get('wyear')) || new Date().getFullYear()
  const view = searchParams.get('wview') === 'month' ? 'month' : 'year'
  const month = Number(searchParams.get('wmonth')) || new Date().getMonth() + 1

  const [entries, setEntries] = useState([])
  const [myWeekendRequests, setMyWeekendRequests] = useState([])
  const [weekendExceptions, setWeekendExceptions] = useState([])
  const [displayNames, setDisplayNames] = useState(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Copy/paste clipboard for WeekendPlannerView's Copy weekend/month/quarter
  // actions — owned here rather than as that component's own local state,
  // because switching between month view and this year overview unmounts
  // WeekendPlannerView entirely (it's a genuinely different child below,
  // not just hidden). Owning it here means it survives that round trip:
  // copy August, check the year overview, open June to paste into.
  const [clipboard, setClipboard] = useState(null)
  // One-shot hand-off for WeekendYearOverview's "Next weekend needing
  // staff" panel — which specific weekend (today or later) its "Plan now"
  // button targets, so WeekendPlannerView can scroll to that card and open
  // its add-doctor picker the moment it mounts. Deliberately plain state,
  // not the URL: losing it to a backgrounded-PWA reload just means the
  // picker doesn't auto-open, which is a fine fallback for what's already a
  // convenience shortcut, not navigational state like year/view/month.
  const [focusSaturday, setFocusSaturday] = useState(null)

  useEffect(() => { load() }, [year]) // eslint-disable-line react-hooks/exhaustive-deps -- load is redefined every render; refetching on staffingRole/profile would loop without changing what's fetched within a session

  // Full calendar year (Jan 1–Dec 31 of `year`), not the rolling 26-week
  // window WeekendPlannerView's own fetch uses — the year overview needs to
  // reach past/future years that window doesn't cover. WeekendPlannerView
  // still does its own independent fetch when opened (widened to include
  // whichever month it's seeded with) rather than reusing this one, since
  // its rolling-window default is what most viewers land on directly (the
  // /weekend route, or Planners' Weekends tab, both default to the month
  // view's own "today" — see its own file-level comment).
  async function load() {
    setLoading(true)
    setError('')
    const yearStart = `${year}-01-01`
    const yearEnd = `${year}-12-31`

    const queries = [
      supabase.from('weekend_planner_entries').select('id, weekend_saturday, profile_id, category')
        .gte('weekend_saturday', yearStart).lte('weekend_saturday', yearEnd),
      supabase.from('profiles').select('id, name, surname')
        .eq('is_approved', true).eq('is_active', true),
    ]
    // A non-staffing viewer only needs their OWN weekend-exception requests
    // (MyWeekendYearOverview's "pending" state). A staffing viewer needs
    // everyone's, approved and pending both, for WeekendYearOverview's
    // Selected month panel — an admin deciding this month's staffing has to
    // see the exceptions that reshape it, including the ones still awaiting
    // their own approval in Planners -> Requests.
    //
    // The staffing query is an OVERLAP range (date_from <= yearEnd AND
    // date_to >= yearStart), not the date_from-only window the personal one
    // uses: a weekend straddling New Year (Sat 31 Dec / Sun 1 Jan) has to be
    // reachable from BOTH years' overviews, and filtering on date_from alone
    // would drop it from the January side. See weekendExceptionsForMonth.
    if (staffingRole) {
      queries.push(
        supabase.from('leave_requests')
          .select('id, profile_id, date_from, date_to, status, profiles!leave_requests_profile_id_fkey(name, surname)')
          .eq('leave_type', 'weekend_exception').in('status', ['approved', 'pending'])
          .lte('date_from', yearEnd).gte('date_to', yearStart)
      )
    } else {
      queries.push(
        supabase.from('leave_requests').select('id, date_from, status')
          .eq('profile_id', profile?.id ?? '').eq('leave_type', 'weekend_exception')
          .gte('date_from', yearStart).lte('date_from', yearEnd)
      )
    }

    const [entriesRes, profilesRes, requestsRes] = await Promise.all(queries)
    if (entriesRes.error) { setError(entriesRes.error.message); setLoading(false); return }
    if (profilesRes.error) { setError(profilesRes.error.message); setLoading(false); return }
    if (requestsRes?.error) { setError(requestsRes.error.message); setLoading(false); return }

    setEntries(entriesRes.data || [])
    setMyWeekendRequests(staffingRole ? [] : (requestsRes?.data || []))
    setWeekendExceptions(staffingRole ? (requestsRes?.data || []) : [])
    // Surname alone unless it collides with another doctor in the same
    // active roster this fetch already loaded — same rule the leave
    // planners use, and scoped to the roster rather than just the doctors
    // holding an exception, so a name never silently changes shape as
    // exceptions come and go across the year.
    setDisplayNames(buildDoctorDisplayNames(profilesRes.data || []))
    setLoading(false)
  }

  function setYear(newYear) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('wyear', String(newYear))
      return next
    }, { replace: true })
  }

  // Plain "open this month" (a month card, or the Selected month panel's own
  // Open month button) never carries a specific weekend to focus — clears
  // any stale focusSaturday left over from a previous "Plan now" hand-off
  // that never actually got consumed (e.g. the admin backed out before it
  // fired), so a later WeekendPlannerView mount can't misfire on it.
  function openMonth(newMonth) {
    setFocusSaturday(null)
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('wmonth', String(newMonth))
      next.set('wview', 'month')
      return next
    }, { replace: true })
  }

  // WeekendYearOverview's "Plan now" button — opens `saturday`'s own month
  // (deriving both year and month from it, since its year always matches
  // whichever year the overview is currently browsing) and hands the exact
  // weekend off via focusSaturday for WeekendPlannerView to scroll to and
  // open on mount.
  function planWeekend(saturday) {
    const y = Number(saturday.slice(0, 4))
    const m = Number(saturday.slice(5, 7))
    setFocusSaturday(saturday)
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('wyear', String(y))
      next.set('wmonth', String(m))
      next.set('wview', 'month')
      return next
    }, { replace: true })
  }

  function backToYear() {
    setFocusSaturday(null)
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.delete('wview')
      return next
    }, { replace: true })
  }

  const byWeekend = useMemo(() => groupEntriesByWeekend(entries), [entries])

  return (
    <div>
      {loading && <p className="mt-6 text-sm text-ink-muted">Loading…</p>}
      {error && <p className="mt-6 text-sm text-flagRed">{error}</p>}
      {!loading && !error && (
        view === 'month' ? (
          <WeekendPlannerView
            initialYear={year}
            initialMonth={month}
            initialFocusSaturday={focusSaturday}
            onBackToYear={backToYear}
            clipboard={clipboard}
            setClipboard={setClipboard}
          />
        ) : staffingRole ? (
          <WeekendYearOverview
            year={year}
            onYearChange={setYear}
            byWeekend={byWeekend}
            weekendExceptions={weekendExceptions}
            displayNames={displayNames}
            onOpenMonth={openMonth}
            onPlanWeekend={planWeekend}
          />
        ) : (
          <MyWeekendYearOverview
            year={year}
            onYearChange={setYear}
            byWeekend={byWeekend}
            myRequests={myWeekendRequests}
            myProfileId={profile?.id}
            onOpenMonth={openMonth}
          />
        )
      )}
    </div>
  )
}
