// A shift's actual times. A roster row normally works the shift type's
// standard hours; a row with start_time_override / end_time_override works
// those instead (a doctor who came in at 10h00 to cover a gap and stayed
// to 20h00). The row keeps its shift type either way — it is still that
// shift for the grid column and for night and public-holiday counts.

const pad = n => String(n).padStart(2, '0')

// "HH:MM:SS" or "HH:MM" → minutes since midnight; null for nothing.
export function timeToMinutes(time) {
  if (!time) return null
  const [h, m] = time.split(':').map(Number)
  if (Number.isNaN(h)) return null
  return h * 60 + (m || 0)
}

export function minutesToTime(minutes) {
  return `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}:00`
}

export function hasTimeOverride(entry) {
  return Boolean(entry?.start_time_override && entry?.end_time_override)
}

// { start, end, adjusted } as "HH:MM:SS", from the row's own times when it
// has them, else the shift type's.
export function effectiveTimes(entry, shiftType) {
  if (hasTimeOverride(entry)) return { start: entry.start_time_override, end: entry.end_time_override, adjusted: true }
  return { start: shiftType?.start_time ?? null, end: shiftType?.end_time ?? null, adjusted: false }
}

// Hours between two clock times, rolling past midnight when the end is not
// after the start (22:00 → 10:00 is 12 hours).
export function hoursBetween(start, end) {
  const s = timeToMinutes(start)
  const e = timeToMinutes(end)
  if (s == null || e == null) return 0
  const span = e > s ? e - s : e + 24 * 60 - s
  return Math.round((span / 60) * 100) / 100
}

// What a row's shift is worth in hours: its adjusted length when it has
// one, else the shift type's duration. extra_hours is added by the caller,
// as before.
export function entryDurationHours(entry, shiftType) {
  if (hasTimeOverride(entry)) return hoursBetween(entry.start_time_override, entry.end_time_override)
  return Number(shiftType?.duration_hours || 0)
}

// "10h" / "10h30"
export function hourLabel(time) {
  const m = timeToMinutes(time)
  if (m == null) return ''
  const h = Math.floor(m / 60)
  const mm = m % 60
  return mm ? `${pad(h)}h${pad(mm)}` : `${pad(h)}h`
}

// "10h–20h" for the grid chip and the lanes title.
export function timeRangeLabel(start, end) {
  if (!start || !end) return ''
  return `${hourLabel(start)}–${hourLabel(end)}`
}

// The label a row gets after its name when its times are adjusted; '' when
// they are standard.
export function adjustedTimesLabel(entry) {
  return hasTimeOverride(entry) ? timeRangeLabel(entry.start_time_override, entry.end_time_override) : ''
}

// Rows joined with `shift_type` (the dashboard's shape): the same rows with
// each shift_type's start/end replaced by the row's own when adjusted, so
// every reader downstream sees the real hours without knowing about the
// override.
export function applyTimeOverrides(rows) {
  return (rows || []).map(row => {
    if (!hasTimeOverride(row) || !row.shift_type) return row
    return { ...row, shift_type: { ...row.shift_type, start_time: row.start_time_override, end_time: row.end_time_override } }
  })
}

// Validation for the "Change times" form. "HH:MM" inputs.
export function validateTimes(start, end) {
  if (!start && !end) return null
  if (!start || !end) return 'Enter both a start and an end time.'
  if (timeToMinutes(start) === timeToMinutes(end)) return 'The start and end cannot be the same time.'
  return null
}
