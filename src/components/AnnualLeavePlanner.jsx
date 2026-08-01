import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import {
  LEAVE_CAPACITY_COLUMNS, LEAVE_FULL_TIME_CONSTRAINT_KEY, LEAVE_FULL_TIME_DEFAULT_MAX,
  buildLeaveByDate, countByColumnPerDate,
} from '../lib/leaveYearGrid'
import LeaveYearGrid from './LeaveYearGrid'
import AnnualPlannerOverview from './AnnualPlannerOverview'
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
// and the original day-row LeaveYearGrid spreadsheet, demoted to a
// "workspace" view for when a genuine per-day read is actually needed
// (opened via the overview's "Open month workspace" action or its Month
// toggle) rather than thrown away.
export default function AnnualLeavePlanner() {
  const { profile } = useAuth()
  const [year, setYear] = useState(new Date().getFullYear())
  const [mode, setMode] = useState('overview') // 'overview' | 'workspace'
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

  async function load() {
    setLoading(true)
    setError('')
    const yearStart = `${year}-01-01`
    const yearEnd = `${year}-12-31`

    const [leaveRes, phRes, constraintsRes, headcountRes] = await Promise.all([
      supabase
        .from('leave_requests')
        .select('profile_id, date_from, date_to, leave_type, status, annual_leave_days, profiles!leave_requests_profile_id_fkey(surname, category)')
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

    setApprovedByDate(reshapeByDate(approvedRawByDate))
    setPendingByDate(reshapeByDate(pendingRawByDate))
    setApprovedRows(approvedRawRows)
    setPendingRows(pendingRawRows)
    setCountsByColumn(countByColumnPerDate(approvedRawByDate, entry => entry.profiles?.category))
    setPublicHolidaysByDate(new Map((phRes.data || []).map(ph => [ph.date, ph.name])))
    setEligibleHeadcount(headcountRes.count ?? 0)

    const maxByConstraintKey = Object.fromEntries((constraintsRes.data || []).map(c => [c.key, Number(c.value)]))
    setMaxByColumnKey(Object.fromEntries(
      LEAVE_CAPACITY_COLUMNS.map(col => [col.key, maxByConstraintKey[col.constraintKey] ?? col.defaultMax])
    ))
    setMaxFullTime(maxByConstraintKey[LEAVE_FULL_TIME_CONSTRAINT_KEY] ?? LEAVE_FULL_TIME_DEFAULT_MAX)
    setLoading(false)
  }

  // The old grid's own capacity display only makes sense for approved
  // leave (pending isn't "using up" the cap yet) — the LeaveYearGrid
  // workspace view keeps showing approved-only, same as before this round.
  const approvedOnlyForWorkspace = new Map(approvedByDate)

  return (
    <div>
      <InlineRuleHint
        inline={`Shows approved and pending annual leave. At most ${maxByColumnKey.MO ?? 2} MO, ${maxByColumnKey.Registrar ?? 1} Registrar, ${maxByColumnKey.EC_COSMO ?? 1} EC COSMO/Intern, and ${maxByColumnKey.OT_COSMO ?? 1} OT COSMO/Intern may be on leave at once — never more than ${maxFullTime} full-time doctors combined.`}
        bullets={[
          'Applies to everyone working in EC — MOs, Registrars, EC Interns, Psych Interns, and Overtime Interns.',
          'An Annual Leave form must be submitted and approved. 22 days available per yearly cycle.',
          "You're unavailable for rostering for the whole date range requested, but only the days you enter as \"annual leave\" reduce your balance — e.g. a 7-day request covering a padding weekend might only be 5 annual leave days; the other 2 still need their hours made up elsewhere.",
          `At most ${maxByColumnKey.MO ?? 2} MO, ${maxByColumnKey.Registrar ?? 1} Registrar, ${maxByColumnKey.EC_COSMO ?? 1} EC COSMO/Intern, and ${maxByColumnKey.OT_COSMO ?? 1} OT COSMO/Intern doctor may be on leave at once (no more than one person per slot).`,
          `No more than ${maxFullTime} full-time doctors (MO + Registrar + EC COSMO/Intern combined) at once — e.g. 1 of each, or 2 MO + 1 of either, but never 2 Registrar or 2 EC COSMO/Intern. Enforced automatically at submission.`,
          "Taking 5 days' leave: weekend either side allowed, but \"on\" weekend hours must be made up elsewhere.",
          "Taking 10 days' leave (2 weeks): if the middle weekend is \"on\", those hours don't need to be made up.",
          'Leave spanning a public holiday: the PH counts as a shift/leave day, or hours are made up elsewhere.',
          'Public holidays are highlighted on the grid; tap or hover the date to see the name.',
          'Pending requests here show as a "pressure" signal only — the concurrency cap itself is only ever enforced against approved leave.',
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
            maxByColumnKey={maxByColumnKey}
            maxFullTime={maxFullTime}
            eligibleHeadcount={eligibleHeadcount}
            myProfileId={profile?.id}
            onOpenWorkspace={() => setMode('workspace')}
          />
        ) : (
          <div className="mt-4">
            <button type="button" onClick={() => setMode('overview')} className="btn-secondary text-sm">
              ← Back to overview
            </button>
            <LeaveYearGrid
              year={year}
              onYearChange={setYear}
              leaveByDate={approvedOnlyForWorkspace}
              publicHolidaysByDate={publicHolidaysByDate}
              maxByColumnKey={maxByColumnKey}
              myProfileId={profile?.id}
            />
          </div>
        )
      )}
    </div>
  )
}
