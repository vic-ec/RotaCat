import { readGenerationReport, reportMatchesDraft } from '../../lib/generationReport'
import { buildDoctorDisplayNames } from '../../lib/doctorNames'
import { leaveByDate } from '../../lib/rosterLeaveColumn'
import { labelForLeaveCategory } from '../../lib/leaveYearGrid'
import { entryAbsence, absenceSummary, leaveRequestForAbsence } from '../../lib/rosterVacancy'
import { leaveRangeOn } from '../../lib/approvedLeave'
import { locumDisplayName } from '../../lib/locumCover'
import { shiftOption, shiftHasStarted } from '../../lib/lateArrivals'

// The lookups the grid draws with: doctors by id, display names, who is
// away each day, the filter's options and test, the struck-through names'
// absences, the generation report, and which shifts can take a late
// arrival. Moved out of RosterGridPage as they were.
export function useRosterLookups({
  id, isAdmin, rosterMonth, entries, profiles, consultantProfiles, leaveByProfile, visibleDays, search,
  filterCategory, showOnly, setSearch, setFilterCategory, setShowOnly, locumProfiles, shiftTypeRows,
}) {
  // Profiles lookup by id — `profiles` covers every schedulable doctor
  // regardless of is_active, so this resolves names for historical entries
  // too. assignableProfiles is the active-only subset actually offered for
  // NEW assignment (the cell dropdown, the vacancy-reassignment manager) —
  // a deactivated doctor can't be newly rostered, but their history stays
  // intact and fully named.
  const profileMap = Object.fromEntries(profiles.map(p => [p.id, p]))
  // From the roster itself (shared between admins); the device-local copy
  // only stands in when that save failed.
  const savedReport = isAdmin && rosterMonth?.status === 'draft'
    ? (rosterMonth.generation_report || readGenerationReport(id))
    : null
  const generationReport = savedReport && reportMatchesDraft(savedReport, entries) ? savedReport : null
  const assignableProfiles = profiles.filter(p => p.is_active)

  // Same-surname disambiguation ("J. Nolan" vs "P. Nolan") for every
  // surname-only label on this page — built from the combined shift +
  // Consultant pools so a collision between the two still resolves, even
  // though they're assigned via separate columns/dropdowns.
  const displayNames = buildDoctorDisplayNames([...profiles, ...consultantProfiles])
  const awayByDate = leaveByDate(leaveByProfile, visibleDays.map(d => d.dateStr), pid => displayNames.get(pid) ?? profileMap[pid]?.surname)

  // One filter drives both layouts: Lanes drops the rows that don't match,
  // Rows keeps every chip but dims the ones that don't — hiding a name from
  // a day's staffing would misreport the day, where dimming just answers
  // "where am I".
  const categoryOptions = [...new Set(
    [...profiles, ...consultantProfiles].map(p => p.category).filter(Boolean)
  )].sort().map(c => ({ value: c, label: labelForLeaveCategory(c) || c }))

  // Search and Category dim the chips that don't match; "Show only" dims
  // whole cells. Either counts as the Filter being in use.
  const chipFilterActive = Boolean(search.trim()) || filterCategory.size > 0
  const filtersActive = chipFilterActive || showOnly.size > 0

  function matchesFilter(profile) {
    if (!profile) return false
    if (filterCategory.size > 0 && !filterCategory.has(profile.category)) return false
    const q = search.trim().toLowerCase()
    if (!q) return true
    const shown = displayNames?.get(profile.id) ?? profile.surname ?? ''
    return `${profile.name ?? ''} ${profile.surname ?? ''} ${shown}`.toLowerCase().includes(q)
  }

  const lanesProfiles = [...profiles, ...consultantProfiles]
    .filter(p => p.is_active !== false)
    .filter(matchesFilter)

  function clearFilters() {
    setSearch('')
    setFilterCategory(new Set())
    setShowOnly(new Set())
  }

  // Everything the struck-through name's popup says, for one entry — or
  // null when the entry shows nothing unusual.
  const nameById = id => {
    const p = profileMap[id] || consultantProfiles.find(c => c.id === id)
    return p ? `${p.name} ${p.surname}` : null
  }
  // The type of the leave a doctor was taken off this shift for, if any.
  function vacatedLeaveType(entry) {
    if (!entry?.vacated_profile_id || entry.vacated_reason !== 'leave') return null
    const ranges = leaveByProfile?.[entry.vacated_profile_id] || []
    const range = ranges.find(r => r[3] && r[3] === entry.vacated_leave_request_id) || leaveRangeOn(leaveByProfile, entry.vacated_profile_id, entry.date)
    if (!range && entry.vacated_leave_request_id) return 'cancelled'
    return range?.[2] || null
  }
  function absenceFor(entry) {
    const absence = entryAbsence(entry, leaveByProfile)
    if (!absence) return null
    const doctor = profileMap[absence.profileId]
    return {
      ...absence,
      shortName: doctor ? (displayNames?.get(doctor.id) ?? doctor.surname) : 'Doctor',
      summary: absenceSummary({
        absence,
        leaveByProfile,
        doctorName: nameById(absence.profileId),
        coverName: absence.kind === 'vacated' ? (entry.is_locum ? (locumDisplayName(entry.locum_name) ? `${locumDisplayName(entry.locum_name)} (locum)` : null) : nameById(entry.profile_id)) : null,
        byName: nameById(absence.byId),
        canSeeNote: isAdmin,
      }),
      // Admins can cancel leave from the struck-through name (leave
      // recorded in error).
      cancelRequest: isAdmin ? leaveRequestForAbsence(absence, leaveByProfile, nameById(absence.profileId)) : null,
    }
  }

  // The shift a late arrival can be logged against, or null: a published
  // roster, somebody actually on the shift (not an open slot, not a
  // struck-through name), and a shift that has started.
  function lateOptionFor(entry) {
    if (!isAdmin || !entry || !['published', 'archived'].includes(rosterMonth?.status)) return null
    if (absenceFor(entry)?.kind === 'on_leave') return null
    const person = entry.profile_id ? (profileMap[entry.profile_id] || locumProfiles.find(l => l.id === entry.profile_id) || null) : null
    const option = shiftOption({ ...entry, roster_month_id: id }, shiftTypeRows[entry.shift_type_id], person)
    return option && shiftHasStarted(option.date, option.shiftStart) ? option : null
  }

  return {
    profileMap, generationReport, assignableProfiles, displayNames, awayByDate, categoryOptions, chipFilterActive,
    filtersActive, matchesFilter, lanesProfiles, clearFilters, nameById, vacatedLeaveType, absenceFor, lateOptionFor,
  }
}
