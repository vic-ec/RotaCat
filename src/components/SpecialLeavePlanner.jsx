import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { buildLeaveByDate } from '../lib/leaveYearGrid'
import LeaveYearGrid from './LeaveYearGrid'
import InlineRuleHint from './InlineRuleHint'

// Special Leave planner: every non-annual leave type (single day, special
// leave, course/CPD, sick, weekend exception) at any status, PLUS any
// pending request regardless of type — including pending annual leave,
// which doesn't show on the Annual Leave tab until approved. No concurrency
// cap applies here (that rule only covers annual leave).
export default function SpecialLeavePlanner() {
  const { profile } = useAuth()
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
        .select('profile_id, date_from, date_to, leave_type, status, annual_leave_days, profiles!leave_requests_profile_id_fkey(surname, category)')
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
        dateFrom: e.date_from, dateTo: e.date_to, leaveType: e.leave_type, annualLeaveDays: e.annual_leave_days,
      })))
    }
    setLeaveByDate(reshaped)
    setPublicHolidaysByDate(new Map((phRes.data || []).map(ph => [ph.date, ph.name])))
    setLoading(false)
  }

  return (
    <div>
      <InlineRuleHint
        inline="Single days off, courses/CPD, and special leave don't count against the 22-day annual leave allowance. Shows every status, plus any pending request of any type."
        bullets={[
          "Covers single days off, courses/CPD, and special leave requests — these do not count against the 22-day annual leave allowance.",
          "The requested day/shift is made up elsewhere, unless it's flagged as a \"special leave day.\"",
          'Shows every non-annual leave type at any status, plus any pending request of any type — including pending annual leave not yet approved onto the Annual Leave tab.',
          'Italicised entries are pending admin approval.',
          'No concurrent-leave limit applies here — that cap only covers approved annual leave (see the Annual Leave tab).',
        ]}
      />

      {loading && <p className="mt-6 text-sm text-ink-muted">Loading…</p>}
      {error && <p className="mt-6 text-sm text-flagRed">{error}</p>}
      {!loading && !error && (
        <LeaveYearGrid
          year={year}
          onYearChange={setYear}
          leaveByDate={leaveByDate}
          publicHolidaysByDate={publicHolidaysByDate}
          myProfileId={profile?.id}
        />
      )}
    </div>
  )
}
