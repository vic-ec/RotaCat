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

export async function logWeekendPlannerChange({ weekendSaturday, category, action, profileId, changedBy }) {
  const { error } = await supabase.from('weekend_planner_changes').insert({
    weekend_saturday: weekendSaturday,
    category,
    action,
    profile_id: profileId,
    changed_by: changedBy,
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
    isLocum: p.role === 'locum',
  }))
}

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

// Builds a filtered, server-side query against roster_entry_changes.
// doctorId takes precedence over locumOnly — filtering to one specific
// doctor already answers whether locums are involved.
export function queryRosterChanges({ rosterMonthId, dateFrom, dateTo, adminId, doctorId, action, locumOnly, locumIds = [] }) {
  let query = supabase.from('roster_entry_changes').select('*').eq('roster_month_id', rosterMonthId)
  if (dateFrom) query = query.gte('entry_date', dateFrom)
  if (dateTo) query = query.lte('entry_date', dateTo)
  if (adminId) query = query.eq('changed_by', adminId)
  if (action) query = query.eq('action', action)
  if (doctorId) {
    query = query.or(`profile_id_before.eq.${doctorId},profile_id_after.eq.${doctorId}`)
  } else if (locumOnly && locumIds.length > 0) {
    const list = locumIds.join(',')
    query = query.or(`profile_id_before.in.(${list}),profile_id_after.in.(${list})`)
  }
  return query.order('changed_at', { ascending: false }).limit(500)
}

// Builds a filtered, server-side query against weekend_planner_changes.
export function queryWeekendPlannerChanges({ dateFrom, dateTo, adminId, doctorId, action, locumOnly, locumIds = [], limit = 300 }) {
  let query = supabase.from('weekend_planner_changes').select('*')
  if (dateFrom) query = query.gte('weekend_saturday', dateFrom)
  if (dateTo) query = query.lte('weekend_saturday', dateTo)
  if (adminId) query = query.eq('changed_by', adminId)
  if (action) query = query.eq('action', action)
  if (doctorId) {
    query = query.eq('profile_id', doctorId)
  } else if (locumOnly && locumIds.length > 0) {
    query = query.in('profile_id', locumIds)
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
