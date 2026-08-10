import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { groupEntriesByWeekend } from '../lib/weekendPlanner'
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Copy/paste clipboard for WeekendPlannerView's Copy weekend/month/quarter
  // actions — owned here rather than as that component's own local state,
  // because switching between month view and this year overview unmounts
  // WeekendPlannerView entirely (it's a genuinely different child below,
  // not just hidden). Owning it here means it survives that round trip:
  // copy August, check the year overview, open June to paste into.
  const [clipboard, setClipboard] = useState(null)

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
    // Only a non-staffing viewer's own weekend-exception requests feed
    // MyWeekendYearOverview's "pending" state — an admin/clerk never sees
    // that view, so there's nothing to fetch it for.
    if (!staffingRole) {
      queries.push(
        supabase.from('leave_requests').select('id, date_from, status')
          .eq('profile_id', profile?.id ?? '').eq('leave_type', 'weekend_exception')
          .gte('date_from', yearStart).lte('date_from', yearEnd)
      )
    }

    const [entriesRes, profilesRes, myRequestsRes] = await Promise.all(queries)
    if (entriesRes.error) { setError(entriesRes.error.message); setLoading(false); return }
    if (profilesRes.error) { setError(profilesRes.error.message); setLoading(false); return }
    if (myRequestsRes?.error) { setError(myRequestsRes.error.message); setLoading(false); return }

    setEntries(entriesRes.data || [])
    setMyWeekendRequests(myRequestsRes?.data || [])
    setLoading(false)
  }

  function setYear(newYear) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('wyear', String(newYear))
      return next
    }, { replace: true })
  }

  function openMonth(newMonth) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('wmonth', String(newMonth))
      next.set('wview', 'month')
      return next
    }, { replace: true })
  }

  function backToYear() {
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
            onBackToYear={backToYear}
            clipboard={clipboard}
            setClipboard={setClipboard}
          />
        ) : staffingRole ? (
          <WeekendYearOverview year={year} onYearChange={setYear} byWeekend={byWeekend} onOpenMonth={openMonth} />
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
