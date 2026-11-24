import { datesInRange } from './dateRange'

// The contracted minimum for a month, lowered for leave the same way the
// roster engine does (RotaCatScheduler, solver.py: the hours floor and the
// Tier 4c target): the minimum times the share of the month's days the
// doctor is available, rounded as Python rounds (half to even). A day
// counts once however many leave requests cover it.
//
// The engine also counts doctors' calendar blocks as unavailable. That
// table is empty and only its owner can read it, so approved leave is
// what's counted here.

// Python's round(): halves go to the even neighbour (round(2.5) === 2).
export function roundHalfEven(x) {
  const floor = Math.floor(x)
  const diff = x - floor
  if (Math.abs(diff - 0.5) > 1e-9) return Math.round(x)
  return floor % 2 === 0 ? floor : floor + 1
}

// Distinct days in [monthStart, monthEnd] covered by any of `ranges`
// ({ date_from, date_to }).
export function unavailableDaysInMonth(ranges, monthStart, monthEnd) {
  const days = new Set()
  for (const r of ranges || []) {
    const from = r.date_from > monthStart ? r.date_from : monthStart
    const to = r.date_to < monthEnd ? r.date_to : monthEnd
    if (from > to) continue
    for (const d of datesInRange(from, to)) days.add(d)
  }
  return days.size
}

export function leaveAdjustedMinimum(minHours, unavailableDays, daysInMonth) {
  const min = Number(minHours)
  if (!min) return 0
  if (!unavailableDays || !daysInMonth) return min
  const fraction = Math.max(0, daysInMonth - unavailableDays) / daysInMonth
  return Math.max(0, roundHalfEven(min * fraction))
}
