// Undo for roster edits. Copies the Weekend Planner's model (see
// restoreWeekendPlannerBatch in lib/changeLog.js): every edit is logged
// under a batch_id with the row before and after, and an undo reads THAT
// back rather than anything held in memory — so "Undo last" minutes later
// and "Undo" from History work the same way as the toast.
//
// Guard: a batch is reversed only while every row it touched still matches
// its entry_after. Otherwise it is refused with CHANGED_SINCE_MESSAGE and
// nothing is written — an undo never overwrites a later change.
//
// Side effects are reversed into their opposites (a captured leave is
// cancelled, a created advert cancelled, a cancelled advert reopened), and
// the undo is logged as a new batch of 'undo' rows carrying those
// opposites, so it can itself be undone.
import { supabase } from './supabase'
import { logRosterEntryChange } from './changeLog'
import { cancelLeaveRequest } from './leaveCancellation'
import { CHANGED_SINCE_MESSAGE, emptySideEffects, newBatchId, shiftLabel } from './rosterEdits'

// Timestamps come back from Postgres as "+00:00" and go in as "Z", and the
// page slices dates to ten characters: compare by meaning, not spelling.
function canon(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
    const t = Date.parse(value)
    return Number.isNaN(t) ? value : t
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
  if (value === undefined) return null
  return value
}

// True when the live row still holds every value the snapshot recorded.
// Columns the snapshot does not know about (added later) are ignored.
export function rowMatchesSnapshot(current, snapshot) {
  if (!snapshot) return !current
  if (!current) return false
  return Object.keys(snapshot).every(key => valuesMatch(current[key], snapshot[key]))
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
function valuesMatch(live, snap) {
  // A date column: the snapshot holds "YYYY-MM-DD", the live row may spell
  // it with a midnight time.
  if (typeof snap === 'string' && DATE_ONLY.test(snap) && typeof live === 'string') return live.slice(0, 10) === snap
  if (typeof live === 'string' && DATE_ONLY.test(live) && typeof snap === 'string') return snap.slice(0, 10) === live
  return canon(live) === canon(snap)
}

async function fetchRow(id) {
  const { data, error } = await supabase.from('roster_entries').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

function entryIdOf(change) {
  return change.entry_after?.id ?? change.entry_before?.id ?? change.roster_entry_id ?? null
}

// Pure: given a batch's rows and the live rows they point at (by id),
// which can be reversed and which are blocked.
export function checkBatch(changes, liveById) {
  const blocked = changes.filter(c => !rowMatchesSnapshot(liveById.get(entryIdOf(c)) ?? null, c.entry_after))
  return { ok: blocked.length === 0, blocked }
}

async function reverseSideEffects(effects) {
  const reversed = emptySideEffects()
  if (!effects) return reversed
  if (effects.leave_request_captured || effects.leave_request_reapproved) {
    const id = effects.leave_request_captured || effects.leave_request_reapproved
    await cancelLeaveRequest(id, 'Roster change undone')
    reversed.leave_request_cancelled = id
  }
  if (effects.leave_request_cancelled) {
    const { error } = await supabase.from('leave_requests').update({ status: 'approved' }).eq('id', effects.leave_request_cancelled)
    if (error) throw new Error(error.message)
    reversed.leave_request_reapproved = effects.leave_request_cancelled
  }
  const toCancel = [effects.advert_created, ...(effects.adverts_reopened || [])].filter(Boolean)
  if (toCancel.length > 0) {
    const { error } = await supabase.from('shift_advertisements').update({ status: 'cancelled' }).in('id', toCancel)
    if (error) throw new Error(error.message)
    reversed.adverts_cancelled = toCancel
  }
  const toReopen = (effects.adverts_cancelled || []).filter(Boolean)
  if (toReopen.length > 0) {
    const { error } = await supabase.from('shift_advertisements').update({ status: 'open' }).in('id', toReopen)
    if (error) throw new Error(error.message)
    reversed.adverts_reopened = toReopen
  }
  return reversed
}

// Reverses one batch. Resolves to { error } or { error: null, batchId,
// description }. `changedBy` is the admin undoing; the batch may be anyone's
// (History lets any admin undo any admin's) — the toast's own-actions-only
// rule is the caller's.
export async function undoRosterBatch({ batchId, changedBy }) {
  const { data: changes, error: fetchErr } = await supabase
    .from('roster_entry_changes').select('*').eq('batch_id', batchId).order('changed_at', { ascending: true })
  if (fetchErr) return { error: fetchErr.message }
  if (!changes || changes.length === 0) return { error: 'Nothing to undo — this change no longer exists.' }
  if (changes.some(c => c.entry_before === undefined || (c.entry_before === null && c.entry_after === null))) {
    return { error: 'This change was made before undo existed, so it cannot be undone from here.' }
  }

  // Guard every row first; only then write anything.
  const liveById = new Map()
  for (const change of changes) {
    const id = entryIdOf(change)
    if (id && !liveById.has(id)) liveById.set(id, await fetchRow(id))
  }
  const { ok } = checkBatch(changes, liveById)
  if (!ok) return { error: CHANGED_SINCE_MESSAGE }

  const undoBatchId = newBatchId()
  // Newest row first, so a chain (a replacement that vacated the
  // replacement's own shift) unwinds in the opposite order it was made.
  for (const change of [...changes].reverse()) {
    const before = change.entry_before
    const after = change.entry_after
    const id = entryIdOf(change)
    try {
      if (!before && after) {
        const { error } = await supabase.from('roster_entries').delete().eq('id', id)
        if (error) throw new Error(error.message)
      } else if (before && !after) {
        // Re-insert with its original id, so later log rows still point at it.
        const { error } = await supabase.from('roster_entries').insert(before)
        if (error) throw new Error(error.message)
      } else if (before && after) {
        // eslint-disable-next-line no-unused-vars
        const { id: _id, created_at: _created, ...patch } = before
        const { error } = await supabase.from('roster_entries').update(patch).eq('id', id)
        if (error) throw new Error(error.message)
      }
      const reversed = await reverseSideEffects(change.side_effects)
      reversed.reverses_batch_id = batchId
      await logRosterEntryChange({
        rosterMonthId: change.roster_month_id,
        rosterEntryId: before ? id : null,
        entryDate: before?.date?.slice(0, 10) ?? change.entry_date,
        shiftCode: change.shift_code_before && before ? change.shift_code_before : change.shift_code,
        action: 'undo',
        profileIdBefore: change.profile_id_after,
        profileIdAfter: change.profile_id_before,
        changedBy,
        note: `Undid: ${change.action}`,
        batchId: undoBatchId,
        entryBefore: after,
        entryAfter: before,
        sideEffects: reversed,
      })
    } catch (err) {
      return { error: `Undo stopped part way: ${err.message}. Open History to review.` }
    }
  }
  const first = changes[0]
  return { error: null, batchId: undoBatchId, description: `Change to ${shiftLabel(first.entry_date, first.shift_code)} undone` }
}

// Recent batches for one roster month, newest first, for History's
// "Recent actions" panel. Grouped client-side like the planner's.
export async function fetchRosterBatches({ rosterMonthId, limit = 300 }) {
  const { data, error } = await supabase
    .from('roster_entry_changes').select('*')
    .eq('roster_month_id', rosterMonthId)
    .not('batch_id', 'is', null)
    .order('changed_at', { ascending: false })
    .limit(limit)
  if (error) return { batches: [], error: error.message }
  const byBatch = new Map()
  for (const row of data || []) {
    if (!byBatch.has(row.batch_id)) byBatch.set(row.batch_id, [])
    byBatch.get(row.batch_id).push(row)
  }
  const batches = [...byBatch.entries()].map(([batchId, changes]) => ({
    batchId,
    changes,
    changedAt: changes.reduce((latest, c) => (c.changed_at > latest ? c.changed_at : latest), changes[0].changed_at),
    changedBy: changes[0].changed_by,
    undoable: changes.every(c => c.entry_before !== undefined && !(c.entry_before === null && c.entry_after === null)),
  })).sort((a, b) => b.changedAt.localeCompare(a.changedAt))
  return { batches, error: null }
}

const ACTION_VERBS = {
  assign: 'Assigned', unassign: 'Vacated', remove: 'Removed', move: 'Moved',
  slot_add: 'Cover added', slot_remove: 'Locum slot removed', reinstate: 'Put back',
  advertise: 'Advertised', unadvertise: 'Advert stopped', undo: 'Undone',
}

// One line per batch: "Vacated · Mon 10 Aug · WD 08h-18h · Sam Rivers",
// with "(+1 more)" for a chain.
export function summarizeRosterBatch({ changes }, nameById = new Map()) {
  const first = [...changes].sort((a, b) => a.changed_at.localeCompare(b.changed_at))[0]
  const who = nameById.get(first.profile_id_before) || nameById.get(first.profile_id_after) || first.locum_name || null
  const parts = [ACTION_VERBS[first.action] || first.action, shiftLabel(first.entry_date, first.shift_code)]
  if (who) parts.push(who)
  if (changes.length > 1) parts.push(`+${changes.length - 1} more`)
  return parts.join(' · ')
}
