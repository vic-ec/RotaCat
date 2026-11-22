// Display helpers shared by the two review logs (roster and weekend
// planner). Both render through ReviewLogList: one row per change, grouped
// under a date header, four columns — Time, Type, Change, By. This file
// turns raw log rows into that shape; it never touches Supabase.
import { parseLocalDate } from './dateRange'
import { labelForShiftCode } from './shiftLabels'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const pad = n => String(n).padStart(2, '0')

// "20:55" in the viewer's own time zone.
export function logTime(iso) {
  const d = new Date(iso)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Local calendar day of a timestamp, as YYYY-MM-DD.
export function logDayKey(iso) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// "Fri 20 Nov 2026" for a YYYY-MM-DD day key.
export function logDayLabel(dayKey) {
  const d = parseLocalDate(dayKey)
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

// "Sun 1 Nov" for a YYYY-MM-DD date; the year is added only when it isn't
// `contextYear` (the year the change was made), so a log full of this
// year's shifts doesn't repeat it on every line.
export function shortDate(dateStr, contextYear = null) {
  const d = parseLocalDate(dateStr)
  const base = `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
  return contextYear != null && d.getFullYear() !== contextYear ? `${base} ${d.getFullYear()}` : base
}

// Groups already-sorted (newest first) items under one header per local
// day, keeping their order: [{ key, label, items }].
export function groupByDay(items, getIso) {
  const groups = []
  for (const item of items) {
    const key = logDayKey(getIso(item))
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.items.push(item)
    else groups.push({ key, label: logDayLabel(key), items: [item] })
  }
  return groups
}

// The "By" column: initials ("PX") for each admin id, with the full name
// on hover/tap. Two admins sharing initials both fall back to first name +
// surname initial ("Paul X.") so the column never shows two identical
// badges for different people.
export function adminInitialsMap(profilesById, adminIds) {
  const people = [...new Set(adminIds)].filter(Boolean).map(id => profilesById.get(id)).filter(Boolean)
  const initialsOf = p => `${(p.name || '?')[0] ?? '?'}${(p.surname || '')[0] ?? ''}`.toUpperCase()
  const counts = new Map()
  for (const p of people) counts.set(initialsOf(p), (counts.get(initialsOf(p)) || 0) + 1)
  const map = new Map()
  for (const p of people) {
    const initials = initialsOf(p)
    map.set(p.id, counts.get(initials) > 1 ? `${p.name} ${(p.surname || '')[0] ?? ''}.`.trim() : initials)
  }
  return map
}

// ── Roster log ──────────────────────────────────────────────────────────
// One roster_entry_changes row → { type, shift, moveFrom, before, after,
// advertised, afterName, personName, reason }. `type` names what actually
// happened rather than echoing the stored action: an 'assign' over someone
// else is a replacement.
//
// afterName / personName: a locum put on the shift who has no account, and
// so no profile id to look a name up by (roster_entry_changes.locum_name).
// reason: why a doctor came off a published shift, as one short phrase.
export const ROSTER_TYPES = {
  assigned: 'Assigned',
  replaced: 'Replaced',
  vacated: 'Vacated',
  removed: 'Removed',
  moved: 'Moved',
  slot_added: 'Cover added',
  slot_removed: 'Slot removed',
  reinstated: 'Put back',
  advertised: 'Advertised',
  unadvertised: 'Advert stopped',
  undone: 'Undone',
  times: 'Times changed',
}

const REASON_LABELS = { leave: 'Leave', swap: 'Swap', no_show: 'No-show', other: 'Other' }

// "Sick leave", "No-show: did not answer", "Swap". The note carries the
// detail: for leave it is the leave type, since `reason` only says 'leave'.
export function rosterReasonLabel(change) {
  if (!change.reason) return null
  const label = REASON_LABELS[change.reason] || change.reason
  const note = (change.note || '').trim()
  if (!note) return label
  return change.reason === 'leave' || change.reason === 'other' ? note : `${label}: ${note}`
}

export function rosterLogParts(change) {
  return withReason(rosterLogCore(change), change)
}

function withReason(parts, change) {
  const reason = rosterReasonLabel(change)
  return reason ? { ...parts, reason } : parts
}

function rosterLogCore(change) {
  const contextYear = new Date(change.changed_at).getFullYear()
  const shift = `${shortDate(change.entry_date, contextYear)} · ${labelForShiftCode(change.shift_code)}`
  const before = change.profile_id_before || null
  const after = change.profile_id_after || null
  const afterName = !after && change.locum_name ? change.locum_name : null

  if (change.action === 'move') {
    return {
      type: 'moved',
      moveFrom: change.date_before ? `${shortDate(change.date_before, contextYear)} · ${labelForShiftCode(change.shift_code_before)}` : null,
      shift,
      person: after ?? before,
    }
  }
  if (change.action === 'remove') return { type: 'removed', shift, person: before, personName: !before && change.locum_name ? change.locum_name : null }
  if (change.action === 'unassign') return { type: 'vacated', shift, person: before, advertised: Boolean(change.advertised) }
  // The rows that act on a vacated doctor's slot name that doctor in
  // profile_id_before, so History shows who the change affected.
  if (change.action === 'slot_add') {
    return after || afterName
      ? { type: 'slot_added', shift, before, after, afterName, covered: true }
      : { type: 'slot_added', shift, person: before, advertised: Boolean(change.advertised) }
  }
  if (change.action === 'slot_remove') return { type: 'slot_removed', shift, person: before }
  if (change.action === 'reinstate') return { type: 'reinstated', shift, person: after ?? before, note: change.note || null }
  if (change.action === 'advertise') return { type: 'advertised', shift, person: before, advertised: true }
  if (change.action === 'unadvertise') return { type: 'unadvertised', shift, person: before }
  if (change.action === 'times') return { type: 'times', shift, person: after ?? before, personName: !after && change.locum_name ? change.locum_name : null, note: change.note || null }
  if (change.action === 'undo') return { type: 'undone', shift, person: after ?? before, note: change.note || null }
  if (before && after && before !== after) return { type: 'replaced', shift, before, after }
  // A locum with no account taking over, or filling an empty slot: named
  // from the row, never mistaken for the doctor who came off.
  if (afterName) {
    return before
      ? { type: 'replaced', shift, before, after: null, afterName }
      : { type: 'assigned', shift, person: null, personName: afterName }
  }
  return { type: 'assigned', shift, person: after ?? before }
}

// ── Weekend planner log ─────────────────────────────────────────────────
// Every edit to the planner is logged with a batch_id (one manual add or
// remove is a batch of one; a paste/clear shares one id across all its
// rows). The log shows a batch of one as an ordinary row and a bigger
// batch as one summary row whose changes fold underneath. Rows logged
// before batch_id existed have none and are always ordinary rows.
//
// `changes` is the (filtered, newest-first) page of rows the log fetched;
// `batchesById` holds full batches from fetchWeekendPlannerBatches, used
// for the summary and the restore so a filter that hides some of a
// batch's rows doesn't misstate what Restore will undo.
export function weekendLogEntries(changes, batchesById = new Map()) {
  const entries = []
  const byBatch = new Map()
  for (const change of changes) {
    if (!change.batch_id) {
      entries.push({ id: change.id, kind: 'single', at: change.changed_at, changedBy: change.changed_by, change, batch: null })
      continue
    }
    if (byBatch.has(change.batch_id)) {
      byBatch.get(change.batch_id).visible.push(change)
      continue
    }
    const entry = {
      id: `batch-${change.batch_id}`,
      kind: 'single',
      at: change.changed_at,
      changedBy: change.changed_by,
      change,
      visible: [change],
      batch: batchesById.get(change.batch_id) ?? null,
      batchId: change.batch_id,
    }
    byBatch.set(change.batch_id, entry)
    entries.push(entry)
  }
  for (const entry of byBatch.values()) {
    const all = entry.batch?.changes ?? entry.visible
    if (all.length > 1) entry.kind = 'batch'
  }
  return entries
}

// Summary of a multi-row batch: type chip, which weekends, which
// categories (all of them, listed), and the counts.
export function weekendBatchParts(changes) {
  const addCount = changes.filter(c => c.action === 'add').length
  const removeCount = changes.filter(c => c.action === 'remove').length
  const contextYear = new Date(changes[0].changed_at ?? Date.now()).getFullYear()
  const saturdays = [...new Set(changes.map(c => c.weekend_saturday))].sort()
  const categories = [...new Set(changes.map(c => c.category))].sort()
  const type = addCount > 0 && removeCount > 0 ? 'overwrote' : removeCount > 0 ? 'removed' : 'added'
  const weekends = saturdays.length === 1
    ? `${shortDate(saturdays[0], contextYear)} weekend`
    : `${saturdays.length} weekends · ${shortDate(saturdays[0], contextYear)} – ${shortDate(saturdays[saturdays.length - 1], contextYear)}`
  const counts = [addCount > 0 && `${addCount} added`, removeCount > 0 && `${removeCount} removed`].filter(Boolean).join(' · ')
  return { type, weekends, categories, counts }
}

export const WEEKEND_TYPES = {
  added: 'Added',
  removed: 'Removed',
  overwrote: 'Overwrote',
}

// One weekend_planner_changes row → its weekend + category line.
export function weekendChangeLine(change) {
  const contextYear = new Date(change.changed_at).getFullYear()
  return `${shortDate(change.weekend_saturday, contextYear)} weekend · ${change.category}`
}
