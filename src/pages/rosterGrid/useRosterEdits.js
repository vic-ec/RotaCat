import { useEffect, useState } from 'react'
import { setLogErrorListener } from '../../lib/changeLog'
import * as rosterEdits from '../../lib/rosterEdits'
import { undoRosterBatch } from '../../lib/rosterUndo'

// Editing the roster: every edit run through runEdit (Undo toast, notice,
// quiet re-read), Undo itself, covering a shift, and drag and drop.
// Moved out of RosterGridPage as it was.
export function useRosterEdits({ id, user, entries, shiftTypes, nameById, refreshEntries, refreshLeave, refreshLocums }) {
  // The post-change Undo toast and "Undo last" — the Weekend Planner's
  // model. Held in memory only, per signed-in user: reset on reload and
  // whenever the account changes, so one admin's undo can never reverse
  // another's change.
  const [lastAction, setLastAction] = useState(null) // { batchId, label, byUserId }
  const [toastVisible, setToastVisible] = useState(false)
  const [undoing, setUndoing] = useState(false)
  // A non-blocking notice under the edit bar: a refused edit or undo, or a
  // log row that failed to land.
  const [editNotice, setEditNotice] = useState('')
  useEffect(() => { setLastAction(null); setToastVisible(false) }, [user?.id])
  useEffect(() => {
    setLogErrorListener(message => setEditNotice(`This change was saved, but could not be written to History (${message}).`))
    return () => setLogErrorListener(null)
  }, [])

  // Drag state
  const [dragSource, setDragSource] = useState(null) // {entryId, profileId, date, shiftCode}

  const shiftTypeIdFor = code => Object.entries(shiftTypes).find(([, c]) => c === code)?.[0]
  const nameOf = nameById

  // Every edit ends here: the toast for it, and a quiet re-read.
  function pushUndo(result) {
    if (!result) return
    setLastAction({ batchId: result.batchId, label: `Saved — ${result.description}`, byUserId: user.id })
    setToastVisible(true)
    setEditNotice(result.logError ? `This change was saved, but could not be written to History (${result.logError}).` : '')
  }
  async function runEdit(fn) {
    try {
      const result = await fn()
      pushUndo(result)
    } catch (err) {
      setEditNotice(err.message)
    }
    await refreshEntries()
  }
  const editArgs = entry => ({ rosterMonthId: id, entry, shiftCode: shiftTypes[entry.shift_type_id] || 'UNKNOWN', adminId: user.id, nameOf })

  function assignCover(cover, date, shiftCode, entryBefore) {
    const shiftTypeId = shiftTypeIdFor(shiftCode)
    if (!shiftTypeId) return
    runEdit(() => rosterEdits.assignCover({ rosterMonthId: id, cover, date, shiftCode, shiftTypeId, entryBefore, adminId: user.id, nameOf }))
      .then(() => { if (cover.kind === 'contact') refreshLocums() })
  }

  async function undoBatch(batchId) {
    setUndoing(true)
    const result = await undoRosterBatch({ batchId, changedBy: user.id })
    setUndoing(false)
    if (result.error) { setEditNotice(result.error); setToastVisible(false); return }
    setLastAction(null)
    setToastVisible(false)
    setEditNotice('')
    await refreshEntries()
    await refreshLeave()
  }
  function undoLastAction() {
    if (!lastAction || lastAction.byUserId !== user.id) return
    undoBatch(lastAction.batchId)
  }

  // Drag and drop
  function handleDragStart(entry, shiftCode) {
    setDragSource({ entryId: entry.id, profileId: entry.profile_id, date: entry.date, shiftCode })
  }

  async function handleDrop(targetDate, targetShiftCode) {
    if (!dragSource) return
    const targetShiftTypeId = shiftTypeIdFor(targetShiftCode)
    const entry = entries.find(e => e.id === dragSource.entryId)
    setDragSource(null)
    if (!targetShiftTypeId || !entry) return
    if (entry.date === targetDate && (shiftTypes[entry.shift_type_id] === targetShiftCode)) return
    await runEdit(() => rosterEdits.moveEntry({
      rosterMonthId: id, entry, shiftCodeBefore: dragSource.shiftCode, targetDate, targetShiftCode, targetShiftTypeId, entries, adminId: user.id, nameOf,
    }))
  }

  return {
    lastAction, toastVisible, setToastVisible, undoing, editNotice, pushUndo, runEdit, editArgs, assignCover,
    undoLastAction, handleDragStart, handleDrop, shiftTypeIdFor, nameOf,
  }
}
