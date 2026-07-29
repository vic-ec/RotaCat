// Pure "who's working right now" logic for the clerk Dashboard view.
// A shift's actual [start, end) window can cross midnight (e.g. WD_22
// 22:00-10:00), so it isn't enough to compare against roster_entries.date
// alone -- the window has to be computed from the shift's start/end times
// relative to that date, rolling the end into the next calendar day when
// end <= start.

// `dateStr` "YYYY-MM-DD", `startTime`/`endTime` "HH:MM:SS" -- both parsed
// as local time (no timezone suffix), matching the rest of the app's
// date-handling convention.
function shiftWindow(dateStr, startTime, endTime) {
  const start = new Date(`${dateStr}T${startTime}`)
  let end = new Date(`${dateStr}T${endTime}`)
  if (endTime <= startTime) end = new Date(end.getTime() + 24 * 60 * 60 * 1000)
  return { start, end }
}

export function isShiftActiveAt(entryDate, shiftType, at) {
  const { start, end } = shiftWindow(entryDate, shiftType.start_time, shiftType.end_time)
  return at >= start && at < end
}

export function shiftStartsWithinHours(entryDate, shiftType, at, hours) {
  const { start } = shiftWindow(entryDate, shiftType.start_time, shiftType.end_time)
  const diffMs = start - at
  return diffMs > 0 && diffMs <= hours * 60 * 60 * 1000
}

// Splits a batch of roster_entries (each with a joined `shift_type` object
// carrying start_time/end_time) into who's currently on shift and who
// starts within the next `hoursAhead` hours (excluding anyone already
// active, so the two lists never overlap). Entries are sorted by shift
// start time; ties don't matter for display.
export function splitByShiftStatus(entries, at, hoursAhead = 24) {
  const active = []
  const upcoming = []
  for (const entry of entries) {
    if (!entry.shift_type) continue
    const { start } = shiftWindow(entry.date, entry.shift_type.start_time, entry.shift_type.end_time)
    if (isShiftActiveAt(entry.date, entry.shift_type, at)) {
      active.push({ ...entry, _start: start })
    } else if (shiftStartsWithinHours(entry.date, entry.shift_type, at, hoursAhead)) {
      upcoming.push({ ...entry, _start: start })
    }
  }
  active.sort((a, b) => a._start - b._start)
  upcoming.sort((a, b) => a._start - b._start)
  return { active, upcoming }
}
