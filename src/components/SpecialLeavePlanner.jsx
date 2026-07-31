import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { buildLeaveByDate } from '../lib/leaveYearGrid'
import LeaveYearGrid from './LeaveYearGrid'

// Special Leave planner: every non-annual leave type (single day, special
// leave, course/CPD, sick, weekend exception) at any status, PLUS any
// pending request regardless of type — including pending annual leave,
// which doesn't show on the Annual Leave tab until approved. No concurrency
// cap applies here (that rule only covers annual leave).
export default function SpecialLeavePlanner() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [leaveByDate, setLeaveByDate] = useState(new Map())
  const [publicHolidaysByDate, setPublicHolidaysByDate] = useState(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [year]) // eslint-disable-line react-hooks/exhaustive-deps -- load is redefined every render; including it would refetch in a loop

  async function load() {
    setLoading(true)
    setError('')
    const yearStart = `${year}-01-01`
    const yearEnd = `${year}-12-31`

    const [leaveRes, phRes] = await Promise.all([
      supabase
        .from('leave_requests')
        .select('profile_id, date_from, date_to, leave_type, status, profiles!leave_requests_profile_id_fkey(surname, category)')
        .or('leave_type.neq.annual,status.eq.pending')
        .lte('date_from', yearEnd)
        .gte('date_to', yearStart),
      supabase.from('public_holidays').select('date, name').gte('date', yearStart).lte('date', yearEnd),
    ])
    if (leaveRes.error) { setError(leaveRes.error.message); setLoading(false); return }
    if (phRes.error) { setError(phRes.error.message); setLoading(false); return }

    const byDate = buildLeaveByDate(leaveRes.data || [], { yearFrom: year, yearTo: year })
    const reshaped = new Map()
    for (const [date, entries] of byDate) {
      reshaped.set(date, entries.map(e => ({
        profileId: e.profile_id, surname: e.profiles?.surname ?? '?', category: e.profiles?.category, status: e.status,
      })))
    }
    setLeaveByDate(reshaped)
    setPublicHolidaysByDate(new Map((phRes.data || []).map(ph => [ph.date, ph.name])))
    setLoading(false)
  }

  return (
    <div>
      <div className="card bg-canvas-sunken p-4 text-sm text-ink-light">
        <p className="font-semibold text-ink">Rules</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          <li>Shows every non-annual leave type (single day, special leave, course/CPD, sick, weekend exception) at any status, plus any <em>pending</em> request of any type — including pending annual leave not yet approved.</li>
          <li className="italic text-ink-muted">Italicised entries are pending admin approval.</li>
          <li>No concurrent-leave limit applies here — that cap only covers approved annual leave (see the Annual Leave tab).</li>
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
        />
      )}
    </div>
  )
}
