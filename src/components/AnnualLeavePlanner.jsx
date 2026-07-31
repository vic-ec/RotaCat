import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { LEAVE_CAPACITY_COLUMNS, buildLeaveByDate } from '../lib/leaveYearGrid'
import LeaveYearGrid from './LeaveYearGrid'

// Annual Leave planner: approved annual leave only, for every leave-eligible
// doctor (clerks/locums never appear — RLS blocks them from ever having a
// leave_requests row of their own). Mirrors the physical Google Sheet: a
// year at a glance, with a hard cap on how many doctors from the same
// capacity column (MO / Registrar / OT COSMO+Intern) can be off at once —
// enforced at submission time in leaveRequests.js, just surfaced here as a
// read-only reference.
export default function AnnualLeavePlanner() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [leaveByDate, setLeaveByDate] = useState(new Map())
  const [publicHolidaysByDate, setPublicHolidaysByDate] = useState(new Map())
  const [maxByColumnKey, setMaxByColumnKey] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [year]) // eslint-disable-line react-hooks/exhaustive-deps -- load is redefined every render; including it would refetch in a loop

  async function load() {
    setLoading(true)
    setError('')
    const yearStart = `${year}-01-01`
    const yearEnd = `${year}-12-31`

    const [leaveRes, phRes, constraintsRes] = await Promise.all([
      supabase
        .from('leave_requests')
        .select('profile_id, date_from, date_to, profiles!leave_requests_profile_id_fkey(surname, category)')
        .eq('leave_type', 'annual')
        .eq('status', 'approved')
        .lte('date_from', yearEnd)
        .gte('date_to', yearStart),
      supabase.from('public_holidays').select('date, name').gte('date', yearStart).lte('date', yearEnd),
      supabase.from('constraints').select('key, value').in('key', LEAVE_CAPACITY_COLUMNS.map(c => c.constraintKey)),
    ])
    if (leaveRes.error) { setError(leaveRes.error.message); setLoading(false); return }
    if (phRes.error) { setError(phRes.error.message); setLoading(false); return }

    const byDate = buildLeaveByDate(leaveRes.data || [], { yearFrom: year, yearTo: year })
    const reshaped = new Map()
    for (const [date, entries] of byDate) {
      reshaped.set(date, entries.map(e => ({
        profileId: e.profile_id, surname: e.profiles?.surname ?? '?', category: e.profiles?.category, status: 'approved',
      })))
    }
    setLeaveByDate(reshaped)
    setPublicHolidaysByDate(new Map((phRes.data || []).map(ph => [ph.date, ph.name])))

    const maxByConstraintKey = Object.fromEntries((constraintsRes.data || []).map(c => [c.key, Number(c.value)]))
    setMaxByColumnKey(Object.fromEntries(
      LEAVE_CAPACITY_COLUMNS.map(col => [col.key, maxByConstraintKey[col.constraintKey] ?? col.defaultMax])
    ))
    setLoading(false)
  }

  return (
    <div>
      <div className="card bg-canvas-sunken p-4 text-sm text-ink-light">
        <p className="font-semibold text-ink">Rules</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          <li>Shows <strong>approved</strong> annual leave only — pending requests appear on the Special Leave tab instead.</li>
          <li>At most {maxByColumnKey.MO ?? 2} MO, {maxByColumnKey.Registrar ?? 2} Registrar, and {maxByColumnKey.OT_COSMO ?? 1} OT COSMO/Intern doctor{(maxByColumnKey.OT_COSMO ?? 1) === 1 ? '' : 's'} may be on leave at the same time — enforced when a request is submitted.</li>
          <li>Public holidays are highlighted; tap or hover the date to see the name.</li>
        </ul>
      </div>

      {loading && <p className="mt-6 text-sm text-ink-muted">Loading…</p>}
      {error && <p className="mt-6 text-sm text-flagRed">{error}</p>}
      {!loading && !error && (
        <LeaveYearGrid
          year={year}
          onYearChange={setYear}
          leaveByDate={leaveByDate}
          publicHolidaysByDate={publicHolidaysByDate}
          maxByColumnKey={maxByColumnKey}
        />
      )}
    </div>
  )
}
