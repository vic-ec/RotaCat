import { useMemo } from 'react'
import {
  saturdaysInRange, saturdaysInMonth, groupEntriesByWeekend, weekendExceptionRequestsBySaturday,
  nextSaturdayToRequestOff, weekendCoverageSummary,
} from '../../lib/weekendPlanner'
import { buildDoctorDisplayNames } from '../../lib/doctorNames'
import { quarterMonthsFrom } from './viewHelpers'

// Everything the month view derives from the loaded data: weekends,
// entries by weekend, names, requests and exceptions by weekend, and the
// month's counts. Moved out of WeekendPlannerView as it was.
export function useWeekendMonthData({ fetchBounds, entries, doctors, myWeekendRequests, weekendExceptions, profile, today, viewYear, viewMonth }) {
  const saturdays = useMemo(
    () => saturdaysInRange(fetchBounds.from, fetchBounds.through),
    [fetchBounds]
  )
  const byWeekend = useMemo(() => groupEntriesByWeekend(entries), [entries])
  // `doctors` deliberately holds every rotation-eligible profile regardless
  // of is_active — doctorById/displayNames resolve names for historical
  // entries too, so a deactivated doctor's past weekends still show their
  // real name instead of "(unknown)". assignableDoctors is the active-only
  // subset actually offered for NEW assignment (the add-doctor picker,
  // paste-forward) — a deactivated doctor can't be newly rostered, but
  // their history stays intact.
  const doctorById = useMemo(() => new Map(doctors.map(d => [d.id, d])), [doctors])
  // Surname alone, unless it collides with another rotation-eligible
  // doctor (any category — MO/Registrar/EC/OT all share one namespace
  // here), in which case a first initial (or, if that collides too, the
  // full first name) disambiguates — see buildDoctorDisplayNames.
  const displayNames = useMemo(() => buildDoctorDisplayNames(doctors), [doctors])
  const assignableDoctors = useMemo(() => doctors.filter(d => d.is_active), [doctors])
  const activeDoctorIds = useMemo(() => new Set(assignableDoctors.map(d => d.id)), [assignableDoctors])
  const myRequestsBySaturday = useMemo(() => weekendExceptionRequestsBySaturday(myWeekendRequests), [myWeekendRequests])
  // Whatever the roster itself calls this doctor (surname, or surname plus
  // first name where it collides) — the same name their own assignments
  // render under, so a request line and an assignment read as one person.
  const myName = profile ? (displayNames.get(profile.id) ?? profile.surname) : null
  // The weekend a request would be about: the next one this doctor works,
  // searched from today across everything fetched rather than just the
  // month on screen — "let me off the next one" doesn't change because you
  // scrolled back to July.
  const requestSaturday = nextSaturdayToRequestOff({
    saturdays: [...byWeekend.keys()].sort(),
    byWeekend,
    profileId: profile?.id,
    today,
  })

  // Only Saturdays actually in the fetched window are shown — this
  // naturally excludes both already-passed weekends this month (the fetch
  // starts from today) and anything beyond the fetch's runway, without
  // separate min/max bounds logic.
  const fetchedSet = useMemo(() => new Set(saturdays), [saturdays])
  // Exceptions falling on one of this month's weekends. Keyed by Saturday
  // (date_from is always the Saturday — see isValidWeekendExceptionRange),
  // which is also how a weekend straddling a month boundary stays attached
  // to the month whose Saturday it is, rather than being listed twice in a
  // view that is explicitly one month of weekends.
  const monthExceptions = useMemo(() => {
    const saturdays = new Set(saturdaysInMonth(viewYear, viewMonth))
    return weekendExceptions
      .filter(r => saturdays.has(r.date_from))
      .sort((a, b) => a.date_from.localeCompare(b.date_from) || String(a.id).localeCompare(String(b.id)))
  }, [weekendExceptions, viewYear, viewMonth])

  // Keyed by Saturday: the card icons need "does this weekend have any",
  // and the sheet needs the rows themselves, so one map serves both rather
  // than a Set alongside a second lookup.
  const exceptionsBySaturday = useMemo(() => {
    const map = new Map()
    for (const req of monthExceptions) {
      if (!map.has(req.date_from)) map.set(req.date_from, [])
      map.get(req.date_from).push(req)
    }
    return map
  }, [monthExceptions])

  // Doctors excluded from rostering a given weekend because their exception
  // was APPROVED. Built from the full fetched range, not monthExceptions,
  // so it stays correct for any weekend the picker can reach rather than
  // only the month currently on screen.
  //
  // Approved only, deliberately: a pending request has not been granted, so
  // the doctor is still rosterable until an admin decides. Excluding on
  // pending would let anyone remove themselves from a weekend simply by
  // asking.
  const excusedBySaturday = useMemo(() => {
    const map = new Map()
    for (const req of weekendExceptions) {
      if (req.status !== 'approved') continue
      if (!map.has(req.date_from)) map.set(req.date_from, new Set())
      map.get(req.date_from).add(req.profile_id)
    }
    return map
  }, [weekendExceptions])

  const monthSaturdays = useMemo(
    () => saturdaysInMonth(viewYear, viewMonth).filter(s => fetchedSet.has(s)),
    [viewYear, viewMonth, fetchedSet]
  )
  // Total assignments currently on the board across the viewed month — the
  // "Clear month" button's disabled state and the confirm modal's count.
  const monthEntryCount = useMemo(
    () => monthSaturdays.reduce((sum, s) => sum + Object.values(byWeekend.get(s) || {}).flat().length, 0),
    [monthSaturdays, byWeekend]
  )
  // Same, across the quarter starting at the viewed month — "Clear
  // quarter"'s disabled state and confirm-modal count.
  const quarterEntryCount = useMemo(
    () => quarterMonthsFrom(viewYear, viewMonth).reduce((sum, { year, month }) =>
      sum + saturdaysInMonth(year, month).filter(s => fetchedSet.has(s)).reduce((s2, s) => s2 + Object.values(byWeekend.get(s) || {}).flat().length, 0), 0),
    [viewYear, viewMonth, fetchedSet, byWeekend]
  )
  // Part 4's compact coverage indicator — dot+count per status, across the
  // viewed month (not the search/filter-narrowed list, so it always reads
  // as "the whole month's state" regardless of what's currently filtered).
  const monthStatusCounts = useMemo(() => {
    let complete = 0, open = 0, empty = 0
    for (const s of monthSaturdays) {
      const cov = weekendCoverageSummary(byWeekend.get(s))
      if (cov.filledGroups === cov.totalGroups) complete++
      else if (cov.filledGroups === 0) empty++
      else open++
    }
    return { complete, open, empty }
  }, [monthSaturdays, byWeekend])

  return {
    byWeekend, doctorById, displayNames, assignableDoctors, activeDoctorIds, myRequestsBySaturday, myName,
    requestSaturday, fetchedSet, exceptionsBySaturday, excusedBySaturday, monthSaturdays, monthEntryCount,
    quarterEntryCount, monthStatusCounts,
  }
}
