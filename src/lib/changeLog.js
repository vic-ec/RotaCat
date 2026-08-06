// Insert wrappers and display formatters for the two audit-log tables
// (roster_entry_changes, weekend_planner_changes). The insert helpers are
// deliberately not called from anywhere near roster generation — only from
// the admin edit code paths in RosterGridPage, RosterVacancyModal, and
// WeekendPlannerPage — so scheduler-generated entries are never logged,
// only what a human changed afterward. Failures are swallowed
// (fire-and-forget): a log write should never block or roll back the
// actual edit it's recording.
import { supabase } from './supabase'
import { parseLocalDate } from './dateRange'
import { CATEGORY_GROUPS, groupEntriesByWeekend, planBatchRestore } from './weekendPlanner'

export async function logRosterEntryChange({
  rosterMonthId, rosterEntryId = null, entryDate, shiftCode, action,
  profileIdBefore = null, profileIdAfter = null,
  dateBefore = null, shiftCodeBefore = null, advertised = false,
  changedBy,
}) {
  const { error } = await supabase.from('roster_entry_changes').insert({
    roster_month_id: rosterMonthId,
    roster_entry_id: rosterEntryId,
    entry_date: entryDate,
    shift_code: shiftCode,
    action,
    profile_id_before: profileIdBefore,
    profile_id_after: profileIdAfter,
    date_before: dateBefore,
    shift_code_before: shiftCodeBefore,
    advertised,
    changed_by: changedBy,
  })
  if (error) console.error('Failed to log roster entry change:', error.message)
}

// batchId groups every row written by one user action (a single manual
// add/remove is a batch of one; a paste/clear covering many
// weekends/groups shares one batchId across all of them) so the whole
// action can be found and reversed together later — see
// fetchWeekendPlannerBatches/restoreWeekendPlannerBatch below. Optional
// (defaults to null) only because historical rows predate the column;
// every call site in this codebase should pass one.
export async function logWeekendPlannerChange({ weekendSaturday, category, action, profileId, changedBy, batchId = null }) {
  const { error } = await supabase.from('weekend_planner_changes').insert({
    weekend_saturday: weekendSaturday,
    category,
    action,
    profile_id: profileId,
    changed_by: changedBy,
    batch_id: batchId,
  })
  if (error) console.error('Failed to log weekend planner change:', error.message)
}

// Resolves a set of profile ids to { name, surname, role } for display in a
// log — a plain map lookup (fetched fresh per log view) rather than baking
// names into each logged row, so a later name change or reactivation
// doesn't leave the log showing a stale/wrong name. Carrying `role` lets the
// log flag locum-involving edits without a schema change: a locum edit is
// just one whose profile_id happens to resolve to role === 'locum'.
export async function fetchProfilesById(ids) {
  const map = new Map()
  const uniqueIds = [...new Set([...ids].filter(Boolean))]
  if (uniqueIds.length === 0) return map
  const { data } = await supabase.from('profiles').select('id, name, surname, role').in('id', uniqueIds)
  for (const p of (data || [])) map.set(p.id, p)
  return map
}

export function nameMapFromProfiles(profilesById) {
  const map = new Map()
  for (const [id, p] of profilesById) map.set(id, `${p.name} ${p.surname}`)
  return map
}

// Options for the admin/doctor filter dropdowns — fetched once per modal
// open rather than derived from the loaded page of changes, so the filter
// list stays complete even before any filter narrows the result set.
export async function fetchAdminOptions() {
  const { data } = await supabase.from('profiles').select('id, name, surname').eq('is_admin', true).order('name')
  return (data || []).map(p => ({ value: p.id, label: `${p.name} ${p.surname}` }))
}

export async function fetchDoctorOptions() {
  const { data } = await supabase.from('profiles').select('id, name, surname, role').order('name')
  return (data || []).map(p => ({
    value: p.id,
    label: p.role === 'locum' ? `${p.name} ${p.surname} (Locum)` : `${p.name} ${p.surname}`,
    role: p.role,
  }))
}

export const ROLE_FILTER_OPTIONS = [
  { value: '', label: 'All roles' },
  { value: 'doctor', label: 'Doctors only' },
  { value: 'locum', label: 'Locums only' },
]

export const ROSTER_ACTION_OPTIONS = [
  { value: '', label: 'All change types' },
  { value: 'assign', label: 'Assigned' },
  { value: 'unassign', label: 'Unassigned' },
  { value: 'remove', label: 'Removed' },
  { value: 'move', label: 'Moved' },
]

export const WEEKEND_ACTION_OPTIONS = [
  { value: '', label: 'All change types' },
  { value: 'add', label: 'Added' },
  { value: 'remove', label: 'Removed' },
]

// Same grouping the Weekend Planner grid itself uses (see CATEGORY_GROUPS
// in lib/weekendPlanner.js) — filtering by the grid's own columns rather
// than the raw staff_category enum, so "EC COSMO / Intern" matches every
// underlying category that group actually covers.
export const WEEKEND_CATEGORY_FILTER_OPTIONS = [
  { value: '', label: 'All categories' },
  ...CATEGORY_GROUPS.map(g => ({ value: g.key, label: g.label })),
]

// A profile id that can never match a real row — used to force an empty
// result set when a role filter is active but no profile has that role
// (e.g. no locums on staff), instead of falling through to "no filter".
const NO_MATCH_ID = '00000000-0000-0000-0000-000000000000'

// Builds a filtered, server-side query against roster_entry_changes.
// doctorId takes precedence over role — filtering to one specific doctor
// already answers whether a locum is involved.
export function queryRosterChanges({ rosterMonthId, dateFrom, dateTo, adminId, doctorId, action, role, roleIds = [] }) {
  let query = supabase.from('roster_entry_changes').select('*').eq('roster_month_id', rosterMonthId)
  if (dateFrom) query = query.gte('entry_date', dateFrom)
  if (dateTo) query = query.lte('entry_date', dateTo)
  if (adminId) query = query.eq('changed_by', adminId)
  if (action) query = query.eq('action', action)
  if (doctorId) {
    query = query.or(`profile_id_before.eq.${doctorId},profile_id_after.eq.${doctorId}`)
  } else if (role) {
    const list = (roleIds.length > 0 ? roleIds : [NO_MATCH_ID]).join(',')
    query = query.or(`profile_id_before.in.(${list}),profile_id_after.in.(${list})`)
  }
  return query.order('changed_at', { ascending: false }).limit(500)
}

// Builds a filtered, server-side query against weekend_planner_changes.
// categoryGroup is one of CATEGORY_GROUPS' keys (MO/Registrar/COSMO/
// COSMOPsych) — matched against every underlying staff_category value that
// group covers, not just the literal enum value.
export function queryWeekendPlannerChanges({ dateFrom, dateTo, adminId, doctorId, action, categoryGroup, limit = 300 }) {
  let query = supabase.from('weekend_planner_changes').select('*')
  if (dateFrom) query = query.gte('weekend_saturday', dateFrom)
  if (dateTo) query = query.lte('weekend_saturday', dateTo)
  if (adminId) query = query.eq('changed_by', adminId)
  if (action) query = query.eq('action', action)
  if (doctorId) query = query.eq('profile_id', doctorId)
  if (categoryGroup) {
    const group = CATEGORY_GROUPS.find(g => g.key === categoryGroup)
    query = query.in('category', group ? group.categories : [categoryGroup])
  }
  return query.order('changed_at', { ascending: false }).limit(limit)
}

function formatTimestamp(iso) {
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, '0')
  const mon = d.toLocaleString('en-GB', { month: 'short' })
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${dd} ${mon} ${d.getFullYear()}, ${hh}:${mi}:${ss}`
}

function formatDisplayDate(dateStr) {
  const d = parseLocalDate(dateStr)
  return `${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })} ${d.getFullYear()}`
}

// The detail phrase for one roster_entry_changes row (no actor/timestamp
// prefix) — shared by the full-line formatter below and by the "Details"
// column of the searchable review-log table.
export function rosterChangeDetail(change, nameById) {
  const dateFmt = formatDisplayDate(change.entry_date)
  const before = nameById.get(change.profile_id_before) || null
  const after = nameById.get(change.profile_id_after) || null

  if (change.action === 'move') {
    return `moved ${after ?? '(unassigned)'} from ${formatDisplayDate(change.date_before)} ${change.shift_code_before} to ${dateFmt} ${change.shift_code}`
  }
  if (change.action === 'remove') {
    return `removed ${before ?? '(unassigned)'} from ${dateFmt} ${change.shift_code}`
  }
  if (change.action === 'unassign') {
    return `vacated ${dateFmt} ${change.shift_code} (was ${before ?? '(unassigned)'})${change.advertised ? ' and opened it for locum cover' : ''}`
  }
  if (before) return `${dateFmt} ${change.shift_code} ${before} → ${after ?? '(unassigned)'}`
  return `assigned ${after ?? '(unassigned)'} to ${dateFmt} ${change.shift_code}`
}

// One human-readable line per roster_entry_changes row, e.g.:
// "[29 Jul 2026, 19:45:03] Claude Codespace edited August 2026 roster: 7 Aug 2026 WD_12 Exford → Venter"
export function formatRosterChangeLine(change, nameById, monthLabel) {
  const actor = nameById.get(change.changed_by) || 'Unknown'
  return `[${formatTimestamp(change.changed_at)}] ${actor} edited ${monthLabel} roster: ${rosterChangeDetail(change, nameById)}`
}

// The detail phrase for one weekend_planner_changes row (no actor/timestamp
// prefix) — shared by the full-line formatter below and by the "Details"
// column of the searchable review-log table.
export function weekendChangeDetail(change, nameById) {
  const subject = nameById.get(change.profile_id) || 'Unknown'
  const satFmt = formatDisplayDate(change.weekend_saturday)
  const verb = change.action === 'add' ? 'added' : 'removed'
  const prep = change.action === 'add' ? 'to' : 'from'
  return `${verb} ${subject} ${prep} ${change.category} for the ${satFmt} weekend`
}

// One human-readable line per weekend_planner_changes row.
export function formatWeekendPlannerChangeLine(change, nameById) {
  const actor = nameById.get(change.changed_by) || 'Unknown'
  return `[${formatTimestamp(change.changed_at)}] ${actor} ${weekendChangeDetail(change, nameById)}`
}

// ── Durable undo (batch_id) ──────────────────────────────────────────────
// The Weekend Planner's Copy/Paste/Clear tools write every affected row
// with a shared batch_id (see logWeekendPlannerChange above). Undo reads
// this table directly rather than any in-memory React state, so restoring
// a batch still works minutes later, across navigation, or after a page
// reload — the incident this replaces was exactly an in-memory-only undo
// that vanished the moment the admin moved on.

// Most recent batches (grouped client-side, since Postgres has no
// unbounded array_agg-and-limit-by-group in one simple query here) — the
// "Recent actions" list WeekendPlannerChangeLogModal shows above its
// existing per-row searchable table. `limit` bounds the RAW ROW fetch, not
// the batch count, so it needs to be generous enough that even a
// whole-quarter clear/paste (dozens of rows) doesn't get truncated
// mid-batch; batches are then sorted by their own most-recent row.
export async function fetchWeekendPlannerBatches({ limit = 500 } = {}) {
  const { data, error } = await supabase
    .from('weekend_planner_changes')
    .select('*')
    .not('batch_id', 'is', null)
    .order('changed_at', { ascending: false })
    .limit(limit)
  if (error) return { batches: [], error: error.message }

  const byBatch = new Map()
  for (const row of data || []) {
    if (!byBatch.has(row.batch_id)) byBatch.set(row.batch_id, [])
    byBatch.get(row.batch_id).push(row)
  }
  const batches = [...byBatch.entries()]
    .map(([batchId, changes]) => ({
      batchId,
      changes,
      changedAt: changes.reduce((latest, c) => (c.changed_at > latest ? c.changed_at : latest), changes[0].changed_at),
      changedBy: changes[0].changed_by,
    }))
    .sort((a, b) => b.changedAt.localeCompare(a.changedAt))

  return { batches, error: null }
}

// "Cleared Sat 3 Jan 2026 (9 removed)" / "Added to 4 weekends (12 added)" /
// "Overwrote Sat 3 Jan 2026 (4 added, 9 removed)" for a mixed
// (overwrite-paste) batch — the one-line summary "Recent actions" shows per
// batch. Multiple weekends collapse to a count rather than listing every
// date, matching monthSummaryLine's own "don't enumerate, summarize" approach
// elsewhere in this codebase.
export function summarizeWeekendPlannerBatch({ changes }) {
  const addCount = changes.filter(c => c.action === 'add').length
  const removeCount = changes.filter(c => c.action === 'remove').length
  const weekends = [...new Set(changes.map(c => c.weekend_saturday))].sort()
  const weekendLabel = weekends.length === 1 ? formatDisplayDate(weekends[0]) : `${weekends.length} weekends`

  if (addCount > 0 && removeCount > 0) return `Overwrote ${weekendLabel} (${addCount} added, ${removeCount} removed)`
  if (removeCount > 0) return `Cleared ${weekendLabel} (${removeCount} removed)`
  return `Added to ${weekendLabel} (${addCount} added)`
}

// "2 min ago" / "3 hrs ago" / "5 days ago" for a batch's timestamp — `now`
// is injectable so callers (and tests) don't depend on the real clock.
export function formatRelativeTime(iso, now = new Date()) {
  const diffMin = Math.round((now - new Date(iso)) / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin} min ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr} hr${diffHr === 1 ? '' : 's'} ago`
  const diffDay = Math.round(diffHr / 24)
  return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`
}

// Restores one batch by its id — reverses each row by its OWN action (see
// planBatchRestore in weekendPlanner.js), so a mixed batch (an
// overwrite-paste's delete-then-insert) restores correctly in one call, not
// two. Used identically by the post-action Undo toast (right after a
// paste/clear) and "Restore this" in the Recent actions list minutes/days
// later — both just need a batchId, nothing carried over in memory.
// weekend_planner_entries/profiles are fetched fresh here (never reused
// from a caller's already-loaded state), since the affected weekends can
// fall well outside whatever window the caller currently has loaded — the
// exact gap that let today's incident go unrecovered in the UI.
// The restore itself is logged under a brand-new batchId, so an undo is
// itself undoable the same way as anything else.
export async function restoreWeekendPlannerBatch({ batchId, changedBy }) {
  const { data: batchChanges, error: fetchErr } = await supabase
    .from('weekend_planner_changes')
    .select('weekend_saturday, category, profile_id, action')
    .eq('batch_id', batchId)
  if (fetchErr) return { error: fetchErr.message }
  if (!batchChanges || batchChanges.length === 0) return { error: 'Nothing to restore — this batch no longer exists.' }

  const saturdays = [...new Set(batchChanges.map(c => c.weekend_saturday))]
  const [entriesRes, profilesRes] = await Promise.all([
    supabase.from('weekend_planner_entries').select('id, weekend_saturday, profile_id, category').in('weekend_saturday', saturdays),
    supabase.from('profiles').select('id').eq('is_approved', true).eq('is_active', true),
  ])
  if (entriesRes.error) return { error: entriesRes.error.message }
  if (profilesRes.error) return { error: profilesRes.error.message }

  const existingByWeekend = groupEntriesByWeekend(entriesRes.data || [])
  const activeDoctorIds = new Set((profilesRes.data || []).map(p => p.id))
  const plan = planBatchRestore({ batchChanges, existingByWeekend, activeDoctorIds })
  const restoreBatchId = crypto.randomUUID()

  if (plan.toDelete.length > 0) {
    const { error: delErr } = await supabase.from('weekend_planner_entries').delete().in('id', plan.toDelete.map(e => e.id))
    if (delErr) return { error: delErr.message }
    await Promise.all(plan.toDelete.map(e => logWeekendPlannerChange({
      weekendSaturday: e.weekend_saturday, category: e.category, action: 'remove', profileId: e.profile_id, changedBy, batchId: restoreBatchId,
    })))
  }
  if (plan.toInsert.length > 0) {
    const payload = plan.toInsert.map(t => ({
      weekend_saturday: t.weekendSaturday, profile_id: t.profileId, category: t.category, created_by: changedBy,
    }))
    const { error: insErr } = await supabase.from('weekend_planner_entries').insert(payload)
    if (insErr) return { error: insErr.message }
    await Promise.all(plan.toInsert.map(t => logWeekendPlannerChange({
      weekendSaturday: t.weekendSaturday, category: t.category, action: 'add', profileId: t.profileId, changedBy, batchId: restoreBatchId,
    })))
  }

  return { error: null, inserted: plan.toInsert.length, deleted: plan.toDelete.length, skipped: plan.skipped.length }
}
