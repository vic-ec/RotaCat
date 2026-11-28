import ShiftMenu from '../../components/ShiftMenu'
import * as rosterEdits from '../../lib/rosterEdits'
import { workedNightShiftPreviousDay, isOnApprovedLeave } from '../../lib/rosterAssignmentEligibility'
import { findSameDayConflict } from '../../lib/rosterVacancy'
import { leaveRangeOn } from '../../lib/approvedLeave'
import { locumDisplayName } from '../../lib/locumCover'
import { monthBounds } from '../../lib/dateRange'
import { labelForShiftCode } from '../../lib/shiftLabels'
import { getShiftsForDay } from './rosterGridHelpers'

// The one shift menu, wired to the roster's edits: who may be offered for
// the shift and what each action runs. Moved out of RosterGridPage as it was.
export default function RosterShiftMenu({
  menu, setMenu, rosterMonth, entries, assignableProfiles, shiftTypes, leaveByProfile, displayNames,
  locumProfiles, locumContacts, user, nameOf, advertisedIds, shiftTypeRows, setActiveVacancy, assignCover,
  runEdit, editArgs, refreshLocums, refreshLeave, shiftTypeIdFor, calendarDays, id, absenceFor,
  setCancelLeaveFor, setNewLocumFor, lateOptionFor, lateByEntryId, setLateFor, profileMap,
}) {
  return (
    <ShiftMenu
      entry={menu.entry}
      date={menu.date}
      shiftCode={menu.shiftCode}
      rosterStatus={rosterMonth.status}
      anchorRect={menu.anchorRect}
      entries={entries}
      profiles={assignableProfiles.filter(p =>
        // Already working a different shift this same day (§1.3)
        !findSameDayConflict({ entries, date: menu.date, profileId: p.id, excludeEntryId: menu.entry?.id })
        // Worked a night shift the day before — needs post-call rest (§1.4)
        && !workedNightShiftPreviousDay({ entries, shiftTypes, date: menu.date, profileId: p.id })
        // On approved leave this date (§1.2)
        && !isOnApprovedLeave({ leaveByProfile, profileId: p.id, date: menu.date }),
      )}
      displayNames={displayNames}
      leaveByProfile={leaveByProfile}
      // A locum already on another shift that day is left out, as a
      // doctor is.
      locums={locumProfiles.filter(l => l.is_active !== false && !findSameDayConflict({
        entries, date: menu.date, profileId: l.id, excludeEntryId: menu.entry?.id,
      }))}
      contacts={locumContacts}
      adminId={user.id}
      nameOf={nameOf}
      hasOpenAdvert={menu.entry ? advertisedIds.has(menu.entry.id) : false}
      shiftType={menu.entry ? shiftTypeRows[menu.entry.shift_type_id] ?? null : null}
      onVacancy={entry => setActiveVacancy({ entryId: entry.id, date: menu.date, shiftCode: menu.shiftCode, currentProfileId: entry.profile_id })}
      onAssign={(cover, entry) => assignCover(cover, menu.date, menu.shiftCode, entry)}
      onRemoveEntry={entry => runEdit(() => rosterEdits.removeEntry(editArgs(entry)))}
      onRemoveLocum={entry => runEdit(() => rosterEdits.removeLocum(editArgs(entry)))}
      onAddCover={(entry, mode, cover = null) => runEdit(() => rosterEdits.addCover({ ...editArgs(entry), mode, cover })).then(() => { if (cover?.kind === 'contact') refreshLocums() })}
      onRemoveSlot={entry => runEdit(() => rosterEdits.removeSlot(editArgs(entry)))}
      onAdvertise={entry => runEdit(() => rosterEdits.advertise(editArgs(entry)))}
      onUnadvertise={entry => runEdit(() => rosterEdits.unadvertise(editArgs(entry)))}
      onChangeTimes={(entry, { start, end }) => runEdit(() => rosterEdits.changeTimes({ ...editArgs(entry), start, end }))}
      onReinstate={(entry, { cancelLeave, overCover = false }) => runEdit(() => rosterEdits.reinstate({ ...editArgs(entry), entries, cancelLeave, overCover })).then(refreshLeave)}
      onRemoveCover={(entry, mode) => runEdit(() => rosterEdits.removeCover({ ...editArgs(entry), mode }))}
      onMoveCover={(entry, { date: targetDate, code }) => runEdit(() => rosterEdits.moveCover({
        ...editArgs(entry), targetDate, targetShiftCode: code, targetShiftTypeId: shiftTypeIdFor(code), entries,
      }))}
      onChangeReason={(entry, opts) => runEdit(() => rosterEdits.changeAbsenceReason({
        ...editArgs(entry), ...opts,
        existingLeaveId: leaveRangeOn(leaveByProfile, entry.vacated_profile_id, entry.date)?.[3] || null,
      })).then(refreshLeave)}
      shiftsForDate={date => {
        const day = calendarDays.find(d => d.dateStr === date)
        return day ? getShiftsForDay(day.dayType) : []
      }}
      onSwap={(entry, other, otherCode) => runEdit(() => rosterEdits.swapEntries({
        rosterMonthId: id, a: entry, b: other, shiftCodeA: menu.shiftCode, shiftCodeB: otherCode, entries,
        isOnLeave: (profileId, date) => isOnApprovedLeave({ leaveByProfile, profileId, date }),
        adminId: user.id, nameOf,
      }))}
      shiftCodeOf={e => shiftTypes[e.shift_type_id] || 'UNKNOWN'}
      monthStart={monthBounds(rosterMonth.year, rosterMonth.month).start}
      monthEnd={monthBounds(rosterMonth.year, rosterMonth.month).end}
      isOnLeave={(profileId, date) => isOnApprovedLeave({ leaveByProfile, profileId, date })}
      cancelLeaveRequest={menu.entry ? absenceFor(menu.entry)?.cancelRequest ?? null : null}
      onCancelLeave={setCancelLeaveFor}
      onNewLocum={(entry, mode) => setNewLocumFor({ date: menu.date, shiftCode: menu.shiftCode, entry, mode })}
      lateArrival={menu.entry && lateOptionFor(menu.entry) ? { exists: lateByEntryId.has(menu.entry.id) } : null}
      onLateArrival={entry => setLateFor(lateOptionFor(entry))}
      onMove={(entry, { date: targetDate, code, leave, cover = null }) => runEdit(() => rosterEdits.moveDoctor({
        ...editArgs(entry), targetDate, targetShiftCode: code, targetShiftTypeId: shiftTypeIdFor(code), entries, leave, cover,
      })).then(() => { if (cover?.kind === 'contact') refreshLocums() })}
      onRemoveFromShift={(entry, mode) => runEdit(() => rosterEdits.removeFromShift({ ...editArgs(entry), mode }))}
      occupants={(date, code) => entries
        .filter(e => e.date === date && shiftTypes[e.shift_type_id] === code && (e.profile_id || (e.is_locum && locumDisplayName(e.locum_name))))
        .map(e => (e.profile_id && !e.is_locum ? (displayNames?.get(e.profile_id) ?? profileMap[e.profile_id]?.surname ?? 'Doctor') : `[${locumDisplayName(e.locum_name) || displayNames?.get(e.profile_id) || 'Locum'}]`))
        .join(', ')}
      moveWarnings={(entry, date) => {
        const notes = []
        const other = findSameDayConflict({ entries, date, profileId: entry.profile_id, excludeEntryId: entry.id })
        if (other) notes.push(`Already on ${labelForShiftCode(shiftTypes[other.shift_type_id] || '')} that day: the move will be refused.`)
        if (workedNightShiftPreviousDay({ entries: entries.filter(e => e.id !== entry.id), shiftTypes, date, profileId: entry.profile_id })) notes.push('Worked a night shift the day before (rest after a night).')
        if (isOnApprovedLeave({ leaveByProfile, profileId: entry.profile_id, date })) notes.push('On approved leave that day.')
        return notes
      }}
      onClose={() => setMenu(null)}
    />
  )
}
