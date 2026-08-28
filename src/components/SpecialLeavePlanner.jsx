import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { buildLeaveByDate } from '../lib/leaveYearGrid'
import { fetchInternRotationsForDoctorIds, groupRotationsByDoctorId } from '../lib/internRotations'
import { SPECIAL_LEAVE_TYPES, SPECIAL_LEAVE_SOFT_CAP, countSpecialLeavePressureDaysInYear } from '../lib/leaveRequests'
import { buildDoctorDisplayNames } from '../lib/doctorNames'
import LeaveYearGrid from './LeaveYearGrid'

// Special Leave planner: every non-annual leave type (single day, special
// leave, course/CPD, sick) at any status, PLUS any pending request
// regardless of type — including pending annual leave, which doesn't show
// on the Annual Leave tab until approved. Weekend exceptions are the one
// deliberate exclusion at every status: they belong to the Weekend Planner,
// not here (see the fetch below). No concurrency cap is enforced in code
// here (that rule only covers annual leave) — the EC Leave Planner sheet
// does cap special leave at 3 doctors (any category) concurrently, but
// that's currently a documented guideline only, not a submission-time
// check.
const RULE_INTRO = "Single days off, courses/CPD, and special leave don't count against the 22-day annual leave allowance. Shows every status, plus any pending request of any type."

const RULE_BULLETS = [
  'Covers single days off, courses/CPD, and special leave requests — these do not count against the 22-day annual leave allowance.',
  'The requested day/shift is made up elsewhere, unless it\'s flagged as a "special leave day."',
  'Shows every non-annual leave type at any status, plus any pending request of any type — including pending annual leave not yet approved onto the Annual Leave tab.',
  'Weekend exceptions are not shown here — they swap which weekend you work rather than reducing your hours. Request and track them on the Weekend planner; approval still runs through Planners → Requests.',
  'Italicised entries are pending admin approval.',
  'Guideline: no more than 3 doctors (any category) applying for special leave at the same time — not yet checked automatically at submission, unlike the Annual Leave cap (see the Annual Leave tab).',
]

export default function SpecialLeavePlanner() {
  const { profile, isClerk } = useAuth()
  const [year, setYear] = useState(new Date().getFullYear())
  const [leaveByDate, setLeaveByDate] = useState(new Map())
  const [displayNames, setDisplayNames] = useState(new Map())
  const [publicHolidaysByDate, setPublicHolidaysByDate] = useState(new Map())
  const [rotationsByDoctorId, setRotationsByDoctorId] = useState(new Map())
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
        .select('profile_id, date_from, date_to, leave_type, status, annual_leave_days, profiles!leave_requests_profile_id_fkey(name, surname, category)')
        .or('leave_type.neq.annual,status.eq.pending')
        // ...but never weekend exceptions, at any status. A weekend
        // exception swaps WHICH weekend a doctor works rather than reducing
        // required hours, so it is not special leave (SPECIAL_LEAVE_TYPES
        // excludes it, and it carries no special-leave capacity weight).
        // It is approved through Planners -> Requests like any other
        // request, and read on the Weekend Planner's Selected month panel,
        // which lists approved and pending exceptions for the month —
        // including a month-straddling weekend, under both its months. This
        // chains as AND with the .or() above, so a PENDING weekend
        // exception is excluded here too, rather than slipping back in via
        // the "any pending request" arm.
        .neq('leave_type', 'weekend_exception')
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
    // Surname alone, unless it collides with another doctor with a
    // non-annual/pending leave entry sometime this year (any category) —
    // see buildDoctorDisplayNames. Built from this same fetch, deduped by
    // profile, rather than a separate roster fetch.
    const doctorsById = new Map()
    for (const e of leaveRes.data || []) {
      if (!doctorsById.has(e.profile_id)) doctorsById.set(e.profile_id, { id: e.profile_id, name: e.profiles?.name, surname: e.profiles?.surname })
    }
    setDisplayNames(buildDoctorDisplayNames([...doctorsById.values()]))
    setPublicHolidaysByDate(new Map((phRes.data || []).map(ph => [ph.date, ph.name])))

    try {
      const rotations = await fetchInternRotationsForDoctorIds((leaveRes.data || []).map(e => e.profile_id))
      setRotationsByDoctorId(groupRotationsByDoctorId(rotations))
    } catch {
      setRotationsByDoctorId(new Map()) // degrade to static category bucketing, same as leave_requests fetch failures elsewhere
    }

    setLoading(false)
  }

  // The real number behind the InlineRuleHint's "no more than 3 doctors…"
  // guideline sentence — reuses leaveByDate rather than a separate fetch,
  // since it's already loaded for the whole year; just narrowed to
  // SPECIAL_LEAVE_TYPES entries first (leaveByDate itself also carries
  // sick/pending-annual rows the guideline isn't about).
  const pressureDaysThisYear = useMemo(() => {
    const specialOnlyByDate = new Map(
      [...leaveByDate].map(([date, entries]) => [date, entries.filter(e => SPECIAL_LEAVE_TYPES.includes(e.leaveType))])
    )
    return countSpecialLeavePressureDaysInYear({ year, byDate: specialOnlyByDate, profileIdOf: e => e.profileId })
  }, [leaveByDate, year])

  return (
    <div>
      {!loading && !error && pressureDaysThisYear > 0 && (
        <p className="mt-2 text-xs text-ink-muted">
          <span className="font-semibold text-flagAmber">{pressureDaysThisYear}</span> day{pressureDaysThisYear === 1 ? '' : 's'} in {year} already {pressureDaysThisYear === 1 ? 'has' : 'have'} {SPECIAL_LEAVE_SOFT_CAP}+ doctors on special leave at once — above the informal guideline.
        </p>
      )}

      {loading && <p className="mt-6 text-sm text-ink-muted">Loading…</p>}
      {error && <p className="mt-6 text-sm text-flagRed">{error}</p>}
      {!loading && !error && (
        <LeaveYearGrid
          year={year}
          onYearChange={setYear}
          // Folded into the grid's own Legend sheet rather than sitting in a
          // permanently-open card above it — one entry point to both the
          // category key and the rules, matching the Annual planner (see
          // LegendSheet.jsx, which exists to retire exactly this
          // "legend button + separate info icon" split).
          ruleIntro={RULE_INTRO}
          ruleBullets={RULE_BULLETS}
          leaveByDate={leaveByDate}
          displayNames={displayNames}
          publicHolidaysByDate={publicHolidaysByDate}
          rotationsByDoctorId={rotationsByDoctorId}
          // A clerk's access here is read-only "All" only — no personal
          // leave of their own to filter to — so omitting myProfileId hides
          // the My leave/All toggle entirely for them (see LeaveYearGrid).
          myProfileId={isClerk ? null : profile?.id}
        />
      )}
    </div>
  )
}
