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

// Resolves a set of profile ids to "Name Surname" for display in a log —
// a plain map lookup (fetched fresh per log view) rather than baking
// names into each logged row, so a later name change or reactivation
// doesn't leave the log showing a stale/wrong name.
export async function fetchProfileNames(ids) {
  const map = new Map()
  const uniqueIds = [...new Set([...ids].filter(Boolean))]
  if (uniqueIds.length === 0) return map
  const { data } = await supabase.from('profiles').select('id, name, surname').in('id', uniqueIds)
  for (const p of (data || [])) map.set(p.id, `${p.name} ${p.surname}`)
  return map
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

// One human-readable line per roster_entry_changes row, e.g.:
// "[29 Jul 2026, 19:45:03] Claude Codespace edited August 2026 roster: 7 Aug 2026 WD_12 Exford → Venter"
export function formatRosterChangeLine(change, nameById, monthLabel) {
  const actor = nameById.get(change.changed_by) || 'Unknown'
  const dateFmt = formatDisplayDate(change.entry_date)
  const before = nameById.get(change.profile_id_before) || null
  const after = nameById.get(change.profile_id_after) || null

  let detail
  if (change.action === 'move') {
    detail = `moved ${after ?? '(unassigned)'} from ${formatDisplayDate(change.date_before)} ${change.shift_code_before} to ${dateFmt} ${change.shift_code}`
  } else if (change.action === 'remove') {
    detail = `removed ${before ?? '(unassigned)'} from ${dateFmt} ${change.shift_code}`
  } else if (change.action === 'unassign') {
    detail = `vacated ${dateFmt} ${change.shift_code} (was ${before ?? '(unassigned)'})${change.advertised ? ' and opened it for locum cover' : ''}`
  } else if (before) {
    detail = `${dateFmt} ${change.shift_code} ${before} → ${after ?? '(unassigned)'}`
  } else {
    detail = `assigned ${after ?? '(unassigned)'} to ${dateFmt} ${change.shift_code}`
  }

  return `[${formatTimestamp(change.changed_at)}] ${actor} edited ${monthLabel} roster: ${detail}`
}

// One human-readable line per weekend_planner_changes row.
export function formatWeekendPlannerChangeLine(change, nameById) {
  const actor = nameById.get(change.changed_by) || 'Unknown'
  const subject = nameById.get(change.profile_id) || 'Unknown'
  const satFmt = formatDisplayDate(change.weekend_saturday)
  const verb = change.action === 'add' ? 'added' : 'removed'
  const prep = change.action === 'add' ? 'to' : 'from'
  return `[${formatTimestamp(change.changed_at)}] ${actor} ${verb} ${subject} ${prep} ${change.category} for the ${satFmt} weekend`
}
