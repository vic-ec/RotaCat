// One colour per shift start time, for the roster's Doctor Lanes view.
//
// A lane cell is one small box per day, so it has room for a start time and
// nothing else — "08h", "22h". Letters were tried first (D/L/N) and dropped:
// L for "late" reads as "leave" in a grid that also shows leave.
//
// The six starts are an ordinal series — a day runs 08 -> 12/13 -> 15 ->
// 20/22 — so the colours are a ramp rather than six unrelated hues: the
// teal accent family lightest-to-deepest through the day shifts, then the
// rose family for the two that run into the night. Reading down a lane, a
// run of nights is a block of pink and a run of mornings a block of pale
// teal, without anyone having to learn a key.
//
// Deliberately NOT the flag*/success palette: those are reserved for roster
// state (draft/published/conflict) — see CLAUDE.md. A shift's time of day is
// not a state.
//
// 12h/13h and 15h/20h never appear on the same date (12/15/22 are the
// weekday pattern, 13/20 the weekend one), so their steps sit close
// together in the ramp without ever having to be told apart side by side.

// Every shift code the roster issues, mapped to the hour it starts.
// Weekday and PH-weekday share a clock, as do weekend and PH.
export const SHIFT_START = {
  WD_08: '08', WD_12: '12', WD_15: '15', WD_22: '22',
  PHW_08: '08', PHW_12: '12', PHW_15: '15', PHW_22: '22',
  WE_08: '08', WE_13: '13', WE_20: '20',
  PH_08: '08', PH_13: '13', PH_20: '20',
}

// Ordered morning -> night, which is the order the legend renders in.
export const SHIFT_STARTS = ['08', '12', '13', '15', '20', '22']

// Tailwind classes per start. `fill`/`text` dress a lane cell; `swatch` is
// the legend's block. Tokens live in tailwind.config.js under `shift`, so a
// retheme is one file.
export const SHIFT_BAND = {
  '08': { label: '08h', fill: 'bg-shift-08', text: 'text-accent-dark', swatch: 'bg-shift-08' },
  '12': { label: '12h', fill: 'bg-shift-12', text: 'text-accent-dark', swatch: 'bg-shift-12' },
  '13': { label: '13h', fill: 'bg-shift-13', text: 'text-accent-dark', swatch: 'bg-shift-13' },
  '15': { label: '15h', fill: 'bg-shift-15', text: 'text-accent-dark', swatch: 'bg-shift-15' },
  '20': { label: '20h', fill: 'bg-shift-20', text: 'text-rose-dark', swatch: 'bg-shift-20' },
  '22': { label: '22h', fill: 'bg-shift-22', text: 'text-rose-dark', swatch: 'bg-shift-22' },
}

// The start a code runs at, or null for anything unrecognised (the
// consultant pseudo-code, or a shift type added to the database that the
// frontend has not been taught yet — better a blank cell than a crash).
export function startForCode(code) {
  return SHIFT_START[code] ?? null
}

export function bandForCode(code) {
  const start = startForCode(code)
  return start ? SHIFT_BAND[start] : null
}
