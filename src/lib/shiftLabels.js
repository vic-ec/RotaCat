// Human-readable names for the shift codes stored in `shift_types.code`.
//
// The stored codes (WD_08, PHW_22, …) are database identifiers: they key
// entryMap, drive the night-shift and eligibility rules, and are what the
// OR-Tools backend speaks. They were never meant to be read by a doctor
// looking for their next shift, and "WD_15" doesn't say when to turn up.
// This file is the one place that turns a code into something that does —
// nothing here renames a stored value.
//
// The public-holiday prefixes are deliberately NOT the stored ones. The
// database uses PHW_* for a holiday falling on a *weekday* (the four-shift
// clock) and PH_* for one falling on a *weekend* (the three-shift clock);
// the labels read the other way round — PH for the weekday set and PHW,
// "public holiday, weekend", for the weekend set, which is how the unit
// says it out loud. The times are the giveaway either way:
// 08h-18h/12h-22h/15h-01h/22h-10h is always the weekday clock and
// 08h-20h/13h-23h/20h-10h always the weekend one.
//
// Split into prefix and time range because the two live in different
// places: the roster grid interleaves all four day types down one table
// and needs the prefix to tell a WD column from a PHW one, while Hours
// Summary already groups its columns under a "Weekday"/"PH (Weekend)"
// header row and only needs the range.
const SHIFT_PARTS = {
  // Weekday
  WD_08: ['WD', '08h-18h'],
  WD_12: ['WD', '12h-22h'],
  WD_15: ['WD', '15h-01h'],
  WD_22: ['WD', '22h-10h'],
  // Weekend
  WE_08: ['WE', '08h-20h'],
  WE_13: ['WE', '13h-23h'],
  WE_20: ['WE', '20h-10h'],
  // Public holiday falling on a weekday — stored PHW_*, shown as PH
  PHW_08: ['PH', '08h-18h'],
  PHW_12: ['PH', '12h-22h'],
  PHW_15: ['PH', '15h-01h'],
  PHW_22: ['PH', '22h-10h'],
  // Public holiday falling on a weekend — stored PH_*, shown as PHW
  PH_08: ['PHW', '08h-20h'],
  PH_13: ['PHW', '13h-23h'],
  PH_20: ['PHW', '20h-10h'],
}

export const SHIFT_LABEL = Object.fromEntries(
  Object.entries(SHIFT_PARTS).map(([code, [prefix, range]]) => [code, `${prefix} ${range}`])
)

// The full label for a code ("WD 08h-18h"), falling back to the code
// itself. A shift type added to the database that the frontend hasn't been
// taught still has to render as *something* — the raw code is ugly but
// it's true, where a blank or an "Unknown" would lose which shift a
// review-log line is even about.
export function labelForShiftCode(code) {
  if (!code) return ''
  return SHIFT_LABEL[code] ?? code
}

// Just the hours ("08h-18h"), for a table that already says which day type
// its columns belong to. Same code fallback as above.
export function shiftTimeRange(code) {
  if (!code) return ''
  return SHIFT_PARTS[code]?.[1] ?? code
}

// `[{ code, label }]` for a run of codes — the shape the roster grid and
// the hours summary both build their column headers from. `labelFn` picks
// which of the two forms above the headers get.
export function shiftColumns(codes, labelFn = labelForShiftCode) {
  return codes.map(code => ({ code, label: labelFn(code) }))
}
