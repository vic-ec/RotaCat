// Shared helpers for the Weekend Planner (weekend_planner_entries) — a
// flat, admin-populated calendar of who works which weekend, replacing
// the old computed weekend_offset projection formerly used for both the
// planner UI and the Leave submission overlap hint.
import { addDays, dayOfWeek, monthBounds, parseLocalDate } from './dateRange'

// Column groupings for the planner grid. The scheduler backend's real
// junior-doctor split is EC (full hours) vs OT (Junior Doctor Overtime
// hours, contract_type-driven) — COSMOPsych, EC_Intern/OT_Intern, and
// EC_COSMO_Intern/OT_COSMO_Intern are all still-recognised legacy/dormant
// category values grouped down to match those same two buckets; MO/
// Registrar are unambiguous on their own. Consultant/Locum never appear
// (not part of weekend rotation).
export const CATEGORY_GROUPS = [
  { key: 'MO', label: 'MO', categories: ['MO'] },
  { key: 'Registrar', label: 'Registrar', categories: ['Registrar'] },
  { key: 'COSMO', label: 'EC Intern', categories: ['COSMO', 'EC_Intern', 'EC_COSMO_Intern', 'Intern'] },
  { key: 'COSMOPsych', label: 'OT Intern', categories: ['COSMOPsych', 'OT_Intern', 'OT_COSMO_Intern'] },
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
// every other legacy value (COSMOPsych, EC_Intern, OT_Intern,
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

// Mirrors the DB's resolve_effective_category(doctor_id, target_date)
// Postgres function (see the migration adding it) — the date-aware
// replacement for resolvedCategoryForDoctor wherever a SPECIFIC weekend's
// date matters. resolvedCategoryForDoctor answers "what is this doctor
// right now" (a contract_type snapshot); this answers "what were they on
// the Saturday being planned," which can differ once an Intern/COSMO
// doctor's EC/OT rotation timeline is in play — e.g. planning a weekend
// before their next rotation block starts, or auditing one after a swap.
//
// Deliberately its own scan rather than internRotations.js's
// rotationForDate (Array.find, i.e. first-match) — real intern_rotations
// rows can overlap for the same doctor, and this needs the SQL function's
// exact "most recently started row wins" tie-break, not
// rotationForDate's different first-in-array-order semantics (built for
// the Leave Planner's simpler non-overlapping case).
//
// `rotationsByDoctorId` is internRotations.js's groupRotationsByDoctorId
// output (a Map<doctorId, rotation[]> or plain object) — batch-fetched
// ONCE for every doctor via fetchInternRotationsForDoctorIds, not one RPC
// call per doctor per picker open.
//
// Returns { category, resolved }: resolved=false means the base category
// IS ambiguous (Intern/COSMO) but no intern_rotations row covers
// targetDate — category still falls back to the plain base value (same as
// the DB function), but callers should surface that distinctly (e.g. a
// "needs a rotation record" indicator), not treat it as a confident
// resolution. Every other category passes through unchanged with
// resolved=true, same as the DB function's own early return.
export function resolveEffectiveCategory({ category, profileId, targetDate, rotationsByDoctorId }) {
  if (!AMBIGUOUS_CATEGORIES.has(category)) return { category: category ?? null, resolved: true }

  const rotations = (rotationsByDoctorId?.get ? rotationsByDoctorId.get(profileId) : rotationsByDoctorId?.[profileId]) || []
  const covering = rotations
    .filter(r => r.start_date <= targetDate && (r.end_date == null || targetDate <= r.end_date))
    .sort((a, b) => b.start_date.localeCompare(a.start_date))

  if (covering.length === 0) return { category, resolved: false }

  const rotationType = covering[0].rotation_type
  const byRotationType = category === 'Intern'
    ? { EC: 'EC_Intern', OT: 'OT_Intern' }
    : { EC: 'EC_COSMO_Intern', OT: 'OT_COSMO_Intern' } // category === 'COSMO'
  return { category: byRotationType[rotationType] ?? category, resolved: true }
}

// resolveEffectiveCategory + groupForCategory, for a doctor+weekend pair —
// the single call site everywhere a picker needs to know both "which
// column does this doctor belong in for THIS weekend" and "should I flag
// them as unresolved."
export function resolveWeekendCategoryForDoctor({ doctor, targetDate, rotationsByDoctorId }) {
  const { category, resolved } = resolveEffectiveCategory({
    category: doctor?.category, profileId: doctor?.id, targetDate, rotationsByDoctorId,
  })
  return { category, groupKey: groupForCategory(category), resolved }
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

// 3-state staffing read for one weekend — 'red' (nothing planned yet),
// 'green' (every rotation group filled), 'amber' (anything in between).
// Derived from weekendCoverageSummary rather than re-deriving filled/total
// itself, so the two never disagree about what "filled" means. Powers the
// Weekend Planner's year-overview month cards (weekendYearOverview.js).
export function weekendHealthState(bySaturdayEntries) {
  const { filledGroups, totalGroups } = weekendCoverageSummary(bySaturdayEntries)
  if (filledGroups === 0) return 'red'
  if (filledGroups === totalGroups) return 'green'
  return 'amber'
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

// Pure planning logic behind WeekendPlannerView's Copy/Paste feature — maps
// a copied month's weekends onto a target month's weekends BY POSITION
// (sourceWeekends[i] always lands on targetSaturdays[i]), not by literal
// date, so copying March into May lines up correctly even though the two
// months' actual Saturdays never match. Kept pure/Supabase-free so the
// component just calls this and renders/writes the result.
//
// sourceWeekends[i] is an array of { groupKey, profileId, category } for
// the (i+1)th Saturday of the copied month (see WeekendPlannerView's
// copyMonth). existingByWeekend is the { [saturday]: { [groupKey]:
// [entry,...] } } Map from groupEntriesByWeekend, scoped to the CURRENT
// (pre-paste) state of the target weekends. activeDoctorIds is the Set of
// currently active/approved doctor ids (weekendPlanner_entries.profile_id
// values that no longer resolve to one would be rejected by the DB anyway
// — this is a client-side check to skip those cleanly instead of surfacing
// a raw Supabase error). mode is 'fill-empty' (only insert into a group
// that's currently empty on the target weekend — never partially merges
// into an already-populated group) or 'overwrite' (delete every existing
// entry on each target weekend first, then insert the full copied set).
//
// Returns:
//   toInsert  — [{ weekendSaturday, groupKey, profileId, category }, ...]
//   toDelete  — existing entry rows (from existingByWeekend) to remove
//               first, only non-empty in 'overwrite' mode
//   skipped   — [{ reason: 'inactive' | 'already-assigned', weekendIndex,
//               groupKey, profileId }, ...] — profiles that would have
//               been inserted but weren't, for the paste-confirmation
//               modal's "X skipped" counts. A group skipped for already
//               being filled (the normal 'fill-empty' behaviour) isn't
//               included here — that's expected, not an anomaly.
//   unmatchedSourceCount — how many of the source month's weekends had no
//               matching target position (source longer than target),
//               i.e. how many were silently dropped.
export function planWeekendPaste({ sourceWeekends, targetSaturdays, existingByWeekend, activeDoctorIds, mode = 'fill-empty' }) {
  const toInsert = []
  const toDelete = []
  const skipped = []
  const matchedCount = Math.min(sourceWeekends.length, targetSaturdays.length)

  for (let i = 0; i < matchedCount; i++) {
    const targetSaturday = targetSaturdays[i]
    const existingBySaturday = existingByWeekend.get(targetSaturday) || {}

    if (mode === 'overwrite') {
      for (const groupEntries of Object.values(existingBySaturday)) {
        for (const entry of groupEntries) toDelete.push(entry)
      }
    }

    // In 'overwrite' mode every existing entry above is already queued for
    // deletion, so nothing on the target counts as "filled" or "assigned"
    // going into the insert pass below.
    const filledGroups = mode === 'overwrite'
      ? new Set()
      : new Set(Object.keys(existingBySaturday).filter(k => (existingBySaturday[k] || []).length > 0))
    const assignedProfileIds = mode === 'overwrite'
      ? new Set()
      : new Set(Object.values(existingBySaturday).flat().map(e => e.profile_id))

    for (const { groupKey, profileId, category } of sourceWeekends[i]) {
      if (!activeDoctorIds.has(profileId)) {
        skipped.push({ reason: 'inactive', weekendIndex: i, groupKey, profileId })
        continue
      }
      if (assignedProfileIds.has(profileId)) {
        skipped.push({ reason: 'already-assigned', weekendIndex: i, groupKey, profileId })
        continue
      }
      if (mode === 'fill-empty' && filledGroups.has(groupKey)) continue // expected — not counted as "skipped"

      toInsert.push({ weekendSaturday: targetSaturday, groupKey, profileId, category })
      assignedProfileIds.add(profileId)
    }
  }

  return { toInsert, toDelete, skipped, unmatchedSourceCount: Math.max(0, sourceWeekends.length - targetSaturdays.length) }
}

// Scales planWeekendPaste up to a copied month or quarter without changing
// its own per-month position-mapping logic — the single shared entry point
// WeekendPlannerView uses for weekend/month/quarter paste alike:
//   weekend: sourceMonths = [[oneWeekendsEntries]], targetMonths = [[oneTargetSaturday]]
//   month:   sourceMonths = [monthWeekends],        targetMonths = [targetMonthSaturdays]
//   quarter: sourceMonths = [month1, month2, month3] (each a source month's own
//            weekends array), targetMonths = the target quarter's 3 months'
//            own Saturday lists, in the same order.
// Each source month is position-mapped ONLY against the target month at the
// same index — never flattened into one long cross-month list — so pasting
// a Jan-Mar quarter onto Apr-Jun reproduces Jan's pattern on Apr, Feb's on
// May, and Mar's on Jun, rather than sliding out of alignment the moment
// any month in between has a different weekend count. Results from each
// month are concatenated; a whole source month with no matching target
// month (quarter longer than what's available to paste into) has its
// weekends counted in unmatchedSourceCount same as planWeekendPaste's own
// per-weekend case.
export function planWeekendPasteAcrossMonths({ sourceMonths, targetMonths, existingByWeekend, activeDoctorIds, mode = 'fill-empty' }) {
  const toInsert = []
  const toDelete = []
  const skipped = []
  let unmatchedSourceCount = 0
  const matchedMonthCount = Math.min(sourceMonths.length, targetMonths.length)

  for (let i = 0; i < matchedMonthCount; i++) {
    const monthPlan = planWeekendPaste({
      sourceWeekends: sourceMonths[i], targetSaturdays: targetMonths[i], existingByWeekend, activeDoctorIds, mode,
    })
    toInsert.push(...monthPlan.toInsert)
    toDelete.push(...monthPlan.toDelete)
    skipped.push(...monthPlan.skipped)
    unmatchedSourceCount += monthPlan.unmatchedSourceCount
  }
  for (let i = matchedMonthCount; i < sourceMonths.length; i++) {
    unmatchedSourceCount += sourceMonths[i].length
  }

  return { toInsert, toDelete, skipped, unmatchedSourceCount }
}

// The durable-undo diffing behind "Restore this" (WeekendPlannerChangeLogModal)
// and the post-action Undo toast — both call this the same way, whether the
// batch's rows were just fetched fresh from weekend_planner_changes (works
// minutes later, across navigation, or after a reload, since it never reads
// from transient React state) or were the very rows a paste/clear just wrote.
// batchChanges is raw weekend_planner_changes rows: { weekend_saturday,
// category, profile_id, action }. Reverses EACH row by its own action, not
// a single action for the whole batch — restoring a pure-remove batch
// (a "Clear") re-inserts every row; a pure-add batch (a plain paste) removes
// every row; a MIXED batch (an overwrite paste, which deletes old entries
// then inserts new ones under one batch_id) correctly does both, restoring
// the pre-paste state exactly. Same collision handling as planWeekendPaste's
// fill-empty mode: skip re-inserting a doctor no longer active, or already
// assigned to a different group on that weekend now; silently skip (not
// counted) if the group itself has since been filled by someone else. An
// 'add' row whose entry no longer exists (already removed some other way)
// is silently a no-op, not an error.
export function planBatchRestore({ batchChanges, existingByWeekend, activeDoctorIds }) {
  const toInsert = []
  const toDelete = []
  const skipped = []
  const assignedBySaturday = new Map()
  const filledBySaturday = new Map()

  function assignedFor(saturday) {
    if (!assignedBySaturday.has(saturday)) {
      const bySaturday = existingByWeekend.get(saturday) || {}
      assignedBySaturday.set(saturday, new Set(Object.values(bySaturday).flat().map(e => e.profile_id)))
    }
    return assignedBySaturday.get(saturday)
  }
  function filledFor(saturday) {
    if (!filledBySaturday.has(saturday)) {
      const bySaturday = existingByWeekend.get(saturday) || {}
      filledBySaturday.set(saturday, new Set(Object.keys(bySaturday).filter(k => (bySaturday[k] || []).length > 0)))
    }
    return filledBySaturday.get(saturday)
  }

  for (const change of batchChanges) {
    const saturday = change.weekend_saturday
    const profileId = change.profile_id
    const groupKey = groupForCategory(change.category)

    if (change.action === 'remove') {
      if (!activeDoctorIds.has(profileId)) { skipped.push({ reason: 'inactive', saturday, groupKey, profileId }); continue }
      const assigned = assignedFor(saturday)
      if (assigned.has(profileId)) { skipped.push({ reason: 'already-assigned', saturday, groupKey, profileId }); continue }
      // Checked against the pre-restore snapshot only (never updated as this
      // same pass inserts more restored rows) — a group can legitimately
      // hold several doctors, so restoring two removed entries back into the
      // same group must not treat the first restore as "filling" it against
      // the second.
      if (filledFor(saturday).has(groupKey)) continue // group filled by someone else since — expected, not counted as "skipped"

      toInsert.push({ weekendSaturday: saturday, groupKey, profileId, category: change.category })
      assigned.add(profileId)
    } else if (change.action === 'add') {
      const bySaturday = existingByWeekend.get(saturday) || {}
      const stillThere = (bySaturday[groupKey] || []).find(e => e.profile_id === profileId)
      if (stillThere) toDelete.push(stillThere)
    }
  }

  return { toInsert, toDelete, skipped }
}
