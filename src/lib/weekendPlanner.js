// Shared helpers for the Weekend Planner (weekend_planner_entries) — a
// flat, admin-populated calendar of who works which weekend, replacing
// the old computed weekend_offset projection formerly used for both the
// planner UI and the Leave submission overlap hint.
import { addDays, dayOfWeek, monthBounds, parseLocalDate } from './dateRange'

// Column groupings for the planner grid. The scheduler backend's real
// junior-doctor split is EC (full hours) vs OT (Junior Doctor Overtime
// hours, contract_type-driven) — COSMOPsych, EC_COSMO/OT_COSMO, and
// EC_COSMO_Intern/OT_COSMO_Intern are all still-recognised legacy/dormant
// category values grouped down to match those same two buckets; MO/
// Registrar are unambiguous on their own. Consultant/Locum never appear
// (not part of weekend rotation).
export const CATEGORY_GROUPS = [
  { key: 'MO', label: 'MO', categories: ['MO'] },
  { key: 'Registrar', label: 'Registrar', categories: ['Registrar'] },
  { key: 'COSMO', label: 'EC Intern', categories: ['COSMO', 'EC_COSMO', 'EC_COSMO_Intern', 'Intern'] },
  { key: 'COSMOPsych', label: 'OT Intern', categories: ['COSMOPsych', 'OT_COSMO', 'OT_COSMO_Intern'] },
]

const GROUP_BY_CATEGORY = new Map(
  CATEGORY_GROUPS.flatMap(g => g.categories.map(c => [c, g.key]))
)

// Returns the grid column key for a staff_category value, or null for a
// category that doesn't participate in weekend rotation (Consultant,
// Locum) or isn't recognised. This is safe to use directly on a raw
// weekend_planner_entries row's own `category` — see
// resolvedCategoryForDoctor below for why a *doctor's* category needs
// extra handling first.
export function groupForCategory(category) {
  return GROUP_BY_CATEGORY.get(category) ?? null
}

// Only COSMO and Intern are actually ambiguous without contract_type —
// every other legacy value (COSMOPsych, EC_COSMO, OT_COSMO,
// EC_COSMO_Intern, OT_COSMO_Intern) already unambiguously says EC or OT
// via its own name/history. Mirrors the identical set in leaveYearGrid.js.
const AMBIGUOUS_CATEGORIES = new Set(['COSMO', 'Intern'])
const OT_HOURS_CONTRACT_TYPES = new Set(['Junior_Doctor_Overtime'])

// The effective category for a DOCTOR (a profiles row, not a raw
// weekend_planner_entries row) — for most categories this is just
// doctor.category unchanged, but for COSMO/Intern specifically it resolves
// through contract_type first. Two uses: (1) filtering the assignment
// dropdown by group (groupForCategory(resolvedCategoryForDoctor(d))), and
// (2) the value actually WRITTEN onto a new weekend_planner_entries row —
// entries are grouped by their own category, which can be a deliberate
// override (see groupEntriesByWeekend below), so writing 'COSMOPsych' for
// an OT-hours doctor here doesn't have to literally match their live
// profile category; it just has to land in the right bucket, and doing it
// this way means groupForCategory keeps working unmodified on every
// existing/historical entry.
export function resolvedCategoryForDoctor(doctor) {
  if (AMBIGUOUS_CATEGORIES.has(doctor?.category)) {
    return OT_HOURS_CONTRACT_TYPES.has(doctor?.contract_type) ? 'COSMOPsych' : 'COSMO'
  }
  return doctor?.category ?? null
}

// Every Saturday "YYYY-MM-DD" from fromDate through throughDate
// (inclusive of any Saturday whose date falls in range).
export function saturdaysInRange(fromDate, throughDate) {
  const saturdays = []
  let cursor = fromDate
  const offsetToSaturday = (6 - dayOfWeek(cursor) + 7) % 7
  cursor = addDays(cursor, offsetToSaturday)
  while (cursor <= throughDate) {
    saturdays.push(cursor)
    cursor = addDays(cursor, 7)
  }
  return saturdays
}

// Every Saturday landing in a given calendar month — a weekend "belongs"
// to whichever month its Saturday falls in, even if the Sunday spills into
// the next month. Powers the Weekend Planner's month-at-a-time view (was
// previously one long ~6-month scroll of every card at once).
export function saturdaysInMonth(year, month) {
  const { start, end } = monthBounds(year, month)
  return saturdaysInRange(start, end)
}

// The Saturday of the next upcoming weekend from fromDate (today, normally)
// — same "advance to the next Saturday on/after this date" rule
// saturdaysInRange uses, so it's always consistent with what the month list
// would show as the soonest weekend. Powers the planner's persistent "Next
// weekend" summary card, shown regardless of which month is being viewed.
export function nextWeekendSaturday(fromDate) {
  const offsetToSaturday = (6 - dayOfWeek(fromDate) + 7) % 7
  return addDays(fromDate, offsetToSaturday)
}

// Coverage of one weekend's category groups: how many of the 4 rotation
// groups (MO/Registrar/EC COSMO+Intern/OT COSMO+Intern) have at least one
// person assigned, and which ones are still open. bySaturdayEntries is the
// { [groupKey]: [entry, ...] } shape from groupEntriesByWeekend.get(saturday).
export function weekendCoverageSummary(bySaturdayEntries) {
  const openGroups = CATEGORY_GROUPS.filter(g => !bySaturdayEntries?.[g.key]?.length).map(g => g.key)
  return { filledGroups: CATEGORY_GROUPS.length - openGroups.length, totalGroups: CATEGORY_GROUPS.length, openGroups }
}

// True if profileId is assigned to any group of this weekend — powers the
// "My Schedule" filter and the "Next weekend" card's "you're on rotation"
// messaging. bySaturdayEntries is the same shape as weekendCoverageSummary.
export function isProfileAssignedToWeekend(bySaturdayEntries, profileId) {
  return Object.values(bySaturdayEntries || {}).flat().some(e => e.profile_id === profileId)
}

// Deterministic even/odd parity for a Saturday, used purely for alternating
// background styling on the planner grid so consecutive weekends read as
// distinct rows — not a real calendar week number, just guaranteed to flip
// between any two consecutive Saturdays (always exactly 7 days apart) so
// the same weekend renders the same colour regardless of which month view
// or filter is active.
export function isEvenWeekend(saturday) {
  const daysSinceEpoch = Math.floor(parseLocalDate(saturday).getTime() / 86400000)
  return Math.floor(daysSinceEpoch / 7) % 2 === 0
}

// Maps a Saturday to the signed-in doctor's own weekend_exception
// leave_requests row for that weekend (leave_type='weekend_exception',
// date_from is the Saturday per isValidWeekendExceptionRange) — powers the
// "My Requests" filter and its status badge. Last request wins if somehow
// more than one exists for the same weekend (e.g. a resubmission after
// rejection); that's a rare edge case, not something callers need to
// disambiguate further.
export function weekendExceptionRequestsBySaturday(requests) {
  return new Map(requests.map(r => [r.date_from, r]))
}

// Shift codes that land on the Saturday/Sunday of a real weekend — used
// to derive "who actually worked this weekend" from a draft roster's own
// roster_entries, for comparison against the Weekend Planner.
const WEEKEND_DAY_CODES = new Set(['WE_08', 'WE_13', 'WE_20', 'PH_08', 'PH_13', 'PH_20'])

// Compares a DRAFT roster's actual weekend assignments (rosterEntries,
// raw roster_entries rows) against the Weekend Planner's CURRENT state
// (plannerEntries, raw weekend_planner_entries rows) to detect drift —
// the planner was edited after this draft was generated, so the draft no
// longer reflects it. Only meaningful for a draft; a published roster is
// the historical record of what actually happened, not something to
// compare forward against.
//
// Returns [{ saturday, added, removed }] sorted chronologically — added/
// removed are arrays of profile_id no longer matching between the two
// (added = now in the planner but not in the draft, removed = in the
// draft but no longer in the planner). Empty when nothing has drifted.
export function computeWeekendPlannerDrift(rosterEntries, plannerEntries, shiftTypeCodes) {
  const actualBySaturday = new Map()
  for (const entry of rosterEntries) {
    if (!entry.profile_id) continue
    const code = shiftTypeCodes[entry.shift_type_id]
    if (!WEEKEND_DAY_CODES.has(code)) continue
    const saturday = dayOfWeek(entry.date) === 0 ? addDays(entry.date, -1) : entry.date
    if (!actualBySaturday.has(saturday)) actualBySaturday.set(saturday, new Set())
    actualBySaturday.get(saturday).add(entry.profile_id)
  }

  const plannedBySaturday = new Map()
  for (const entry of plannerEntries) {
    if (!plannedBySaturday.has(entry.weekend_saturday)) plannedBySaturday.set(entry.weekend_saturday, new Set())
    plannedBySaturday.get(entry.weekend_saturday).add(entry.profile_id)
  }

  const allSaturdays = new Set([...actualBySaturday.keys(), ...plannedBySaturday.keys()])
  const drifted = []
  for (const saturday of allSaturdays) {
    const actual = actualBySaturday.get(saturday) || new Set()
    const planned = plannedBySaturday.get(saturday) || new Set()
    const added = [...planned].filter(id => !actual.has(id))
    const removed = [...actual].filter(id => !planned.has(id))
    if (added.length > 0 || removed.length > 0) {
      drifted.push({ saturday, added, removed })
    }
  }
  return drifted.sort((a, b) => a.saturday.localeCompare(b.saturday))
}

// True if [dateFrom, dateTo] covers the Saturday or Sunday of any of this
// doctor's weekend_planner_entries rows. `entries` is that profile's rows
// already narrowed to the relevant window (see leaveRequests.js) —
// { weekend_saturday }. Replaces the old weekend_offset-projected
// overlapsRosteredWeekend so the Leave submission hint agrees with what
// the scheduler backend actually reads off the planner.
export function overlapsPlannedWeekend(entries, dateFrom, dateTo) {
  return entries.some(({ weekend_saturday: saturday }) => {
    const sunday = addDays(saturday, 1)
    return sunday >= dateFrom && saturday <= dateTo
  })
}

// Groups raw weekend_planner_entries rows into
// { [saturday]: { [groupKey]: [entry, ...] } } for the grid to render.
// Entries are grouped by their OWN category (not the doctor's profile
// category) since an entry can be a deliberate override (e.g. a
// Registrar covering a COSMO slot) — see the column comment on
// weekend_planner_entries.category in the migration.
export function groupEntriesByWeekend(entries) {
  const byWeekend = new Map()
  for (const entry of entries) {
    const groupKey = groupForCategory(entry.category)
    if (!groupKey) continue
    if (!byWeekend.has(entry.weekend_saturday)) byWeekend.set(entry.weekend_saturday, {})
    const bySaturday = byWeekend.get(entry.weekend_saturday)
    if (!bySaturday[groupKey]) bySaturday[groupKey] = []
    bySaturday[groupKey].push(entry)
  }
  return byWeekend
}
