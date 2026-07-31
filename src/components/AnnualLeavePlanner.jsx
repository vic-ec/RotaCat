import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import {
  LEAVE_CAPACITY_COLUMNS, LEAVE_FULL_TIME_CONSTRAINT_KEY, LEAVE_FULL_TIME_DEFAULT_MAX, buildLeaveByDate,
} from '../lib/leaveYearGrid'
import LeaveYearGrid from './LeaveYearGrid'
import InlineRuleHint from './InlineRuleHint'

// Annual Leave planner: approved annual leave only, for every leave-eligible
// doctor (clerks/locums never appear — RLS blocks them from ever having a
// leave_requests row of their own). Mirrors the physical Google Sheet: a
// year at a glance, with a hard cap on how many doctors from the same
// capacity column (MO / Registrar / EC COSMO+Intern / OT COSMO+Intern) can
// be off at once, plus a combined cap across the first three ("full-time
// doctors") — enforced at submission time in leaveRequests.js, just
// surfaced here as a read-only reference.
export default function AnnualLeavePlanner() {
  const { profile } = useAuth()
  const [year, setYear] = useState(new Date().getFullYear())
  const [leaveByDate, setLeaveByDate] = useState(new Map())
  const [publicHolidaysByDate, setPublicHolidaysByDate] = useState(new Map())
  const [maxByColumnKey, setMaxByColumnKey] = useState({})
  const [maxFullTime, setMaxFullTime] = useState(LEAVE_FULL_TIME_DEFAULT_MAX)
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
      supabase.from('constraints').select('key, value').in('key', [...LEAVE_CAPACITY_COLUMNS.map(c => c.constraintKey), LEAVE_FULL_TIME_CONSTRAINT_KEY]),
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
    setMaxFullTime(maxByConstraintKey[LEAVE_FULL_TIME_CONSTRAINT_KEY] ?? LEAVE_FULL_TIME_DEFAULT_MAX)
    setLoading(false)
  }

  return (
    <div>
      <InlineRuleHint
        inline={`Shows approved leave only. At most ${maxByColumnKey.MO ?? 2} MO, ${maxByColumnKey.Registrar ?? 1} Registrar, ${maxByColumnKey.EC_COSMO ?? 1} EC COSMO/Intern, and ${maxByColumnKey.OT_COSMO ?? 1} OT COSMO/Intern may be on leave at once — never more than ${maxFullTime} full-time doctors combined.`}
        bullets={[
          'Applies to everyone working in EC — MOs, Registrars, EC Interns, Psych Interns, and Overtime Interns.',
          'An Annual Leave form must be submitted and approved. 22 days available per yearly cycle.',
          `At most ${maxByColumnKey.MO ?? 2} MO, ${maxByColumnKey.Registrar ?? 1} Registrar, ${maxByColumnKey.EC_COSMO ?? 1} EC COSMO/Intern, and ${maxByColumnKey.OT_COSMO ?? 1} OT COSMO/Intern doctor may be on leave at once (no more than one person per slot).`,
          `No more than ${maxFullTime} full-time doctors (MO + Registrar + EC COSMO/Intern combined) at once — e.g. 1 of each, or 2 MO + 1 of either, but never 2 Registrar or 2 EC COSMO/Intern. Enforced automatically at submission.`,
          "Taking 5 days' leave: weekend either side allowed, but \"on\" weekend hours must be made up elsewhere.",
          "Taking 10 days' leave (2 weeks): if the middle weekend is \"on\", those hours don't need to be made up.",
          'Leave spanning a public holiday: the PH counts as a shift/leave day, or hours are made up elsewhere.',
          'Public holidays are highlighted on the grid; tap or hover the date to see the name.',
          'Pending requests appear on the Special Leave tab instead, not here.',
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
          maxByColumnKey={maxByColumnKey}
          myProfileId={profile?.id}
        />
      )}
    </div>
  )
}
