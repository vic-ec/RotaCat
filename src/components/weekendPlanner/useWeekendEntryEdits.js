import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { CATEGORY_GROUPS, groupForCategory, resolveWeekendCategoryForDoctor, formatWeekendRange } from '../../lib/weekendPlanner'
import { logWeekendPlannerChange } from '../../lib/changeLog'

// Adding and removing planner entries (one at a time and in bulk), each
// write logged and handed to the Undo toast. Moved out of
// WeekendPlannerView as it was.
export function useWeekendEntryEdits({ entries, setEntries, setError, profile, doctorById, rotationsByDoctorId, displayNames, pushUndo }) {
  const [saving, setSaving] = useState(false)

  // Patches local state directly from the write's own result rather than
  // reloading — load() flips `loading` back to true, which unmounts the
  // whole grid for a "Loading…" placeholder. One shared batchId across
  // every profile added in the same submit (behind WeekendAddDoctorsSheet,
  // both viewports' now-only add mechanism), so adding 3 MOs in one go is a
  // single undoable action, not 3 — see deleteEntries/insertEntries below
  // for why every write, single or bulk, is tagged this way.
  async function addEntries(saturday, groupKey, profileIds) {
    if (profileIds.length === 0) return
    const toInsert = profileIds.map(profileId => {
      const doctor = doctorById.get(profileId)
      const { category } = resolveWeekendCategoryForDoctor({ doctor, targetDate: saturday, rotationsByDoctorId })
      return { weekendSaturday: saturday, profileId, category }
    })
    setSaving(true)
    const batchId = crypto.randomUUID()
    const ok = await insertEntries(toInsert, batchId)
    setSaving(false)
    if (!ok) return
    const group = CATEGORY_GROUPS.find(g => g.key === groupKey)
    const label = profileIds.length === 1
      ? `Added ${displayNames.get(profileIds[0]) ?? 'doctor'} to ${group?.label ?? groupKey} (${formatWeekendRange(saturday)})`
      : `Added ${profileIds.length} doctors to ${group?.label ?? groupKey} (${formatWeekendRange(saturday)})`
    pushUndo(batchId, label)
  }

  async function removeEntry(entryId) {
    setSaving(true)
    const removed = entries.find(e => e.id === entryId)
    const { error: err } = await supabase.from('weekend_planner_entries').delete().eq('id', entryId)
    setSaving(false)
    if (err) { setError(err.message); return }
    setEntries(prev => prev.filter(e => e.id !== entryId))
    if (removed) {
      const batchId = crypto.randomUUID()
      await logWeekendPlannerChange({
        weekendSaturday: removed.weekend_saturday, category: removed.category, action: 'remove',
        profileId: removed.profile_id, changedBy: profile?.id ?? null, batchId,
      })
      const group = CATEGORY_GROUPS.find(g => g.key === groupForCategory(removed.category))
      pushUndo(batchId, `Removed ${displayNames.get(removed.profile_id) ?? 'doctor'} from ${group?.label ?? removed.category} (${formatWeekendRange(removed.weekend_saturday)})`)
    }
  }

  // Bulk-write helpers behind Copy/Paste and Clear weekend/month/quarter —
  // same "patch local state from the write's own result, log one
  // weekend_planner_changes row per affected entry" pattern as
  // addEntry/removeEntry above, just batched under a single shared batchId
  // per call (the caller generates it once and passes it into both, when a
  // paste needs both a delete and an insert leg — see handleConfirmPaste).
  // Reuses the existing 'add'/'remove' actions (weekend_planner_changes.action
  // has a CHECK constraint limited to exactly those two values) rather than
  // introducing a new bulk-specific action. Return a boolean so callers can
  // decide whether to proceed to a dependent second write.
  async function deleteEntries(entriesToDelete, batchId) {
    if (entriesToDelete.length === 0) return true
    const ids = entriesToDelete.map(e => e.id)
    const { error: err } = await supabase.from('weekend_planner_entries').delete().in('id', ids)
    if (err) { setError(err.message); return false }
    const idSet = new Set(ids)
    setEntries(prev => prev.filter(e => !idSet.has(e.id)))
    await Promise.all(entriesToDelete.map(e => logWeekendPlannerChange({
      weekendSaturday: e.weekend_saturday, category: e.category, action: 'remove',
      profileId: e.profile_id, changedBy: profile?.id ?? null, batchId,
    })))
    return true
  }

  async function insertEntries(toInsert, batchId) {
    if (toInsert.length === 0) return true
    const payload = toInsert.map(t => ({
      weekend_saturday: t.weekendSaturday, profile_id: t.profileId, category: t.category, created_by: profile?.id ?? null,
    }))
    const { data, error: err } = await supabase.from('weekend_planner_entries').insert(payload).select()
    if (err) { setError(err.message); return false }
    setEntries(prev => [...prev, ...(data || [])])
    await Promise.all(toInsert.map(t => logWeekendPlannerChange({
      weekendSaturday: t.weekendSaturday, category: t.category, action: 'add',
      profileId: t.profileId, changedBy: profile?.id ?? null, batchId,
    })))
    return true
  }

  return { saving, setSaving, addEntries, removeEntry, deleteEntries, insertEntries }
}
