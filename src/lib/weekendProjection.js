// Projects a doctor's future "on" weekends from their weekend_patterns row.
//
// weekend_patterns is NOT a materialised calendar — it's a rolling
// last-known-state row per doctor (last_worked_weekend, last_weekend_type,
// next_weekend_type), updated after each roster publish. The doctor works
// every second weekend, strictly alternating days/nights each time (see the
// table's own "STRICT" column comment) — so future working weekends can be
// extrapolated in pure JS by stepping 14 days at a time from
// last_worked_weekend, without needing a stored reference date or a second
// table. Used by both the Leave submission overlap check (Phase 2) and the
// Weekend Planner (Phase 4).
import { addDays } from './dateRange'

// Returns [{ saturday, sunday, type }] for every projected working weekend
// whose Saturday falls within [fromDate, throughDate] (inclusive,
// "YYYY-MM-DD" strings). Returns [] if the doctor has no tracked history yet
// (a brand-new profile with no last_worked_weekend) — nothing to project.
export function projectWorkingWeekends(pattern, { fromDate, throughDate }) {
  if (!pattern?.last_worked_weekend || !pattern?.next_weekend_type) return []

  const results = []
  let saturday = addDays(pattern.last_worked_weekend, 14)
  let type = pattern.next_weekend_type

  // Guard against a corrupt/missing throughDate causing an infinite loop.
  let iterations = 0
  while (saturday <= throughDate && iterations < 520) { // ~10 years of weekends
    const sunday = addDays(saturday, 1)
    // Keep the weekend if either of its two days falls in range — a leave
    // range starting on the Sunday of a working weekend would otherwise miss
    // it, since only the Saturday is used to advance the cursor.
    if (sunday >= fromDate && saturday <= throughDate) {
      results.push({ saturday, sunday, type })
    }
    saturday = addDays(saturday, 14)
    type = type === 'days' ? 'nights' : 'days'
    iterations++
  }
  return results
}

// True if [dateFrom, dateTo] covers the Saturday or Sunday of any projected
// working weekend for this doctor. Informational only — per the
// overlaps_rostered_weekend column comment, this does not block submission
// or force a re-sync of the alternation pattern.
export function overlapsRosteredWeekend(pattern, dateFrom, dateTo) {
  return projectWorkingWeekends(pattern, { fromDate: dateFrom, throughDate: dateTo }).length > 0
}

// Team-wide view for the Weekend Planner: projects every doctor's pattern
// row and groups the results by weekend, splitting each into who's on days
// vs nights. `patternRows` is [{ profile_id, name, surname,
// last_worked_weekend, next_weekend_type, ... }] — projectWorkingWeekends
// only reads the three pattern fields it needs, so the full weekend_patterns
// + profiles join row can be passed straight through.
export function projectTeamWeekends(patternRows, { fromDate, throughDate }) {
  const byWeekend = new Map()
  for (const row of patternRows) {
    const weekends = projectWorkingWeekends(row, { fromDate, throughDate })
    for (const w of weekends) {
      if (!byWeekend.has(w.saturday)) {
        byWeekend.set(w.saturday, { saturday: w.saturday, sunday: w.sunday, days: [], nights: [] })
      }
      byWeekend.get(w.saturday)[w.type].push({ profileId: row.profile_id, name: row.name, surname: row.surname })
    }
  }
  return [...byWeekend.values()].sort((a, b) => a.saturday.localeCompare(b.saturday))
}
