import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import {
  LEAVE_CAPACITY_COLUMNS, LEAVE_FULL_TIME_CONSTRAINT_KEY, LEAVE_FULL_TIME_DEFAULT_MAX,
  buildLeaveByDate, countByColumnPerDate,
} from '../lib/leaveYearGrid'
import AnnualPlannerOverview from './AnnualPlannerOverview'
import MonthWorkspace from './MonthWorkspace'
import InlineRuleHint from './InlineRuleHint'

const ELIGIBLE_CATEGORIES = [...new Set(LEAVE_CAPACITY_COLUMNS.flatMap(col => col.categories))]

function reshapeByDate(byDate) {
  const reshaped = new Map()
  for (const [date, entries] of byDate) {
    reshaped.set(date, entries.map(e => ({
      profileId: e.profile_id, surname: e.profiles?.surname ?? '?', category: e.profiles?.category, status: e.status,
      dateFrom: e.date_from, dateTo: e.date_to, leaveType: e.leave_type, annualLeaveDays: e.annual_leave_days,
    })))
  }
  return reshaped
}

// Annual Leave planner: every leave-eligible doctor's annual leave — both
// approved and pending, so an admin can weigh a pending request against
// the same cap-aware picture the approved data already gives ("could I
// approve this without breaching the concurrency cap?"), not just the
// settled record. Mirrors the physical Google Sheet's rules: a hard cap on
// how many doctors from the same capacity column (MO / Registrar / EC
// COSMO+Intern / OT COSMO+Intern) can be off at once, plus a combined cap
// across the first three ("full-time doctors") — enforced at submission
// time in leaveRequests.js, just surfaced here as a read-only reference.
//
// Two views share this one fetch: AnnualPlannerOverview (the default
// landing view — a 12-month "where does this need my attention" summary)
// and MonthWorkspace (a full calendar for one month — reading surnames,
// checking capacity, reviewing/approving pending requests, and submitting
// new leave — opened via the overview's "Open month workspace" action, its
// Month toggle, or clicking an already-selected month card, all of which
// hand over whichever month was selected). deepLinkMonth/deepLinkHighlightDate
// are a third, external way in: the Requests queue's "View Calendar" action
// (LeaveApprovalQueue.jsx) navigates here with `?month=YYYY-MM&highlight=
// YYYY-MM-DD` so an admin reviewing a pending request can jump straight to
// that request's month with its day pre-opened, instead of hunting for it
// manually — LeavePlannerPage.jsx reads those query params and passes them
// through as these props, then clears them via onDeepLinkConsumed once
// they've seeded this component's own persisted state below (a one-shot
// hand-off, not a live-bound value).
//
// year/mode/workspaceMonth live in the URL (`ayear`/`aview`/`amonth`), not
// plain useState — mirrors LeavePlannerPage.jsx's `?tab=&sub=` (see the
// comment there for why: a backgrounded mobile browser/PWA can get killed
// and reloaded by the OS at any time, which remounts this component from
// scratch; plain state would silently drop the user back at the
// current-month overview every time that happens). MonthWorkspace.jsx does
// the same for which day's review sheet is open.
export default function AnnualLeavePlanner({ deepLinkMonth, deepLinkHighlightDate, onDeepLinkConsumed }) {
  const { profile } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const year = deepLinkMonth ? Number(deepLinkMonth.slice(0, 4)) : Number(searchParams.get('ayear')) || new Date().getFullYear()
  const mode = (deepLinkMonth || searchParams.get('aview') === 'workspace') ? 'workspace' : 'overview'
  const workspaceMonth = deepLinkMonth ? Number(deepLinkMonth.slice(5, 7)) : Number(searchParams.get('amonth')) || new Date().getMonth() + 1
  const [highlightDate, setHighlightDate] = useState(deepLinkHighlightDate || null)
  const [approvedByDate, setApprovedByDate] = useState(new Map())
  const [pendingByDate, setPendingByDate] = useState(new Map())
  const [approvedRows, setApprovedRows] = useState([])
  const [pendingRows, setPendingRows] = useState([])
  const [countsByColumn, setCountsByColumn] = useState(new Map())
  const [publicHolidaysByDate, setPublicHolidaysByDate] = useState(new Map())
  const [maxByColumnKey, setMaxByColumnKey] = useState({})
  const [maxFullTime, setMaxFullTime] = useState(LEAVE_FULL_TIME_DEFAULT_MAX)
  const [eligibleHeadcount, setEligibleHeadcount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [year]) // eslint-disable-line react-hooks/exhaustive-deps -- load is redefined every render; including it would refetch in a loop

  // One-shot: a deep link (from the Requests queue's "View Calendar" action)
  // seeds this component's own persisted ayear/aview/amonth params (so it
  // keeps surviving reloads the same way regular navigation does), then
  // tells the caller so it can strip `month`/`highlight` back out of the
  // URL — otherwise switching planner sub-tabs and back would re-open this
  // same stale workspace/highlight again.
  useEffect(() => {
    if (deepLinkMonth) {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev)
        next.set('ayear', String(year))
        next.set('aview', 'workspace')
        next.set('amonth', String(workspaceMonth))
        return next
      }, { replace: true })
      onDeepLinkConsumed?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only ever run once on mount, deliberately not re-run if these props change later
  }, [])

  async function load() {
    setLoading(true)
    setError('')
    const yearStart = `${year}-01-01`
    const yearEnd = `${year}-12-31`

    const [leaveRes, phRes, constraintsRes, headcountRes] = await Promise.all([
      supabase
        .from('leave_requests')
        .select('id, profile_id, date_from, date_to, leave_type, status, annual_leave_days, notes, profiles!leave_requests_profile_id_fkey(name, surname, category)')
        .eq('leave_type', 'annual')
        .in('status', ['approved', 'pending'])
        .lte('date_from', yearEnd)
        .gte('date_to', yearStart),
      supabase.from('public_holidays').select('date, name').gte('date', yearStart).lte('date', yearEnd),
      supabase.from('constraints').select('key, value').in('key', [...LEAVE_CAPACITY_COLUMNS.map(c => c.constraintKey), LEAVE_FULL_TIME_CONSTRAINT_KEY]),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('is_approved', true).eq('is_active', true).in('category', ELIGIBLE_CATEGORIES),
    ])
    if (leaveRes.error) { setError(leaveRes.error.message); setLoading(false); return }
    if (phRes.error) { setError(phRes.error.message); setLoading(false); return }

    const allRows = leaveRes.data || []
    const approvedRawRows = allRows.filter(r => r.status === 'approved')
    const pendingRawRows = allRows.filter(r => r.status === 'pending')

    const approvedRawByDate = buildLeaveByDate(approvedRawRows, { yearFrom: year, yearTo: year })
    const pendingRawByDate = buildLeaveByDate(pendingRawRows, { yearFrom: year, yearTo: year })
    // The real concurrency cap (checkAnnualLeaveCapacity in leaveRequests.js)
    // is checked against pending+approved combined at submission time — a
    // pending request already occupies a slot, blocking anyone else from
    // even submitting an overlapping one. So "at capacity" here has to
    // count both, not approved alone, to match what the cap actually means.
    const combinedRawByDate = buildLeaveByDate(allRows, { yearFrom: year, yearTo: year })

    setApprovedByDate(reshapeByDate(approvedRawByDate))
    setPendingByDate(reshapeByDate(pendingRawByDate))
    setApprovedRows(approvedRawRows)
    setPendingRows(pendingRawRows)
    setCountsByColumn(countByColumnPerDate(combinedRawByDate, entry => entry.profiles?.category))
    setPublicHolidaysByDate(new Map((phRes.data || []).map(ph => [ph.date, ph.name])))
    setEligibleHeadcount(headcountRes.count ?? 0)

    const maxByConstraintKey = Object.fromEntries((constraintsRes.data || []).map(c => [c.key, Number(c.value)]))
    setMaxByColumnKey(Object.fromEntries(
      LEAVE_CAPACITY_COLUMNS.map(col => [col.key, maxByConstraintKey[col.constraintKey] ?? col.defaultMax])
    ))
    setMaxFullTime(maxByConstraintKey[LEAVE_FULL_TIME_CONSTRAINT_KEY] ?? LEAVE_FULL_TIME_DEFAULT_MAX)
    setLoading(false)
  }

  function setYear(newYear) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('ayear', String(newYear))
      return next
    }, { replace: true })
  }

  function openWorkspace(month) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('amonth', String(month))
      next.set('aview', 'workspace')
      return next
    }, { replace: true })
  }

  function changeWorkspaceMonth(newYear, newMonth) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('ayear', String(newYear))
      next.set('amonth', String(newMonth))
      return next
    }, { replace: true })
  }

  function backToOverview() {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.delete('aview')
      return next
    }, { replace: true })
  }

  return (
    <div>
      <InlineRuleHint
        inline="Shows approved and pending annual leave, subject to category caps."
        intro={`Never more than ${maxFullTime} doctors on leave at a time.`}
        bullets={[
          'Applies to everyone working in EC — MOs, Registrars, EC Interns, Psych Interns, and Overtime Interns.',
          'An Annual Leave form must be submitted and approved. 22 days available per yearly cycle.',
          "You're unavailable for rostering for the whole date range requested, but only the days you enter as \"annual leave\" reduce your balance — e.g. a 7-day request covering a padding weekend might only be 5 annual leave days; the other 2 still need their hours made up elsewhere.",
          `At most ${maxByColumnKey.MO ?? 2} MO, ${maxByColumnKey.Registrar ?? 1} Registrar, ${maxByColumnKey.EC_COSMO ?? 2} EC COSMO/Intern, and ${maxByColumnKey.OT_COSMO ?? 1} OT COSMO/Intern doctor(s) may be on leave at once.`,
          `No more than ${maxFullTime} full-time EC doctors (MO + Registrar + EC COSMO/Intern + OT COSMO/Intern combined) on leave at once — e.g. 2 MO + 1 Registrar, 2 MO + 1 EC COSMO/Intern, 2 MO + 1 OT COSMO/Intern, 2 EC COSMO/Intern + 1 Registrar, 2 EC COSMO/Intern + 1 OT COSMO/Intern, or 1 MO + 1 Registrar + 1 EC/OT COSMO/Intern — never 2 Registrar or 2 OT COSMO/Intern at once. Enforced automatically at submission.`,
          "Taking 5 days' leave: weekend either side allowed, but \"on\" weekend hours must be made up elsewhere.",
          "Taking 10 days' leave (2 weeks): if the middle weekend is \"on\", those hours don't need to be made up.",
          'Leave spanning a public holiday: the PH counts as a shift/leave day, or hours are made up elsewhere.',
          'Public holidays are highlighted on the grid; tap or hover the date to see the name.',
          'Pending requests count toward the cap too, not just approved ones — once a category is full, submitting another overlapping request for it is blocked until one already pending is decided.',
        ]}
      />

      {loading && <p className="mt-6 text-sm text-ink-muted">Loading…</p>}
      {error && <p className="mt-6 text-sm text-flagRed">{error}</p>}
      {!loading && !error && (
        mode === 'overview' ? (
          <AnnualPlannerOverview
            year={year}
            onYearChange={setYear}
            approvedByDate={approvedByDate}
            pendingByDate={pendingByDate}
            approvedRows={approvedRows}
            pendingRows={pendingRows}
            countByColumnPerDate={countsByColumn}
            publicHolidaysByDate={publicHolidaysByDate}
            maxByColumnKey={maxByColumnKey}
            maxFullTime={maxFullTime}
            eligibleHeadcount={eligibleHeadcount}
            myProfileId={profile?.id}
            onOpenWorkspace={openWorkspace}
          />
        ) : (
          <MonthWorkspace
            year={year}
            month={workspaceMonth}
            onMonthChange={changeWorkspaceMonth}
            approvedByDate={approvedByDate}
            pendingByDate={pendingByDate}
            approvedRows={approvedRows}
            pendingRows={pendingRows}
            countByColumnPerDate={countsByColumn}
            publicHolidaysByDate={publicHolidaysByDate}
            highlightDate={highlightDate}
            onHighlightConsumed={() => setHighlightDate(null)}
            maxByColumnKey={maxByColumnKey}
            maxFullTime={maxFullTime}
            onDataChanged={load}
            onBack={backToOverview}
          />
        )
      )}
    </div>
  )
}
