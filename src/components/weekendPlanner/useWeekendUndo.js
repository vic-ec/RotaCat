import { useEffect, useState } from 'react'
import { restoreWeekendPlannerBatch } from '../../lib/changeLog'

// The post-action Undo toast's state and actions, moved out of
// WeekendPlannerView as they were.
export function useWeekendUndo({ profile, setError, load }) {
  // The post-action Undo toast — every mutating action (single add/remove,
  // paste, clear, any granularity) sets this so the common "just did
  // something, tap Undo now" case is one tap away, right where the action
  // happened. Reaching further back than the single most recent action is
  // the Review log's job (WeekendPlannerChangeLogModal's "Recent actions"
  // panel) — that one already restores any recent batch, not just the
  // latest, persists across reloads, and now has its own confirm step, so
  // there's no separate in-page history to duplicate it. Deliberately NOT
  // persisted (no sessionStorage/localStorage) and reset whenever the
  // signed-in profile changes (see the effect below) — both a real page
  // reload AND an admin switching accounts in the same tab must start with
  // no pending toast, since Paul's undo must never be able to revert
  // George's action or vice versa.
  const [lastAction, setLastAction] = useState(null) // { batchId, label } or null
  const [toastVisible, setToastVisible] = useState(false)
  const [undoing, setUndoing] = useState(false)
  useEffect(() => { setLastAction(null); setToastVisible(false) }, [profile?.id])

  // Records the most recent mutating action and surfaces the toast for it
  // — the single call every action above/below routes through, so the
  // toast can never drift out of sync with what actually just happened.
  function pushUndo(batchId, label) {
    setLastAction({ batchId, label })
    setToastVisible(true)
  }

  // The toast's own action — identical to "Restore this" in
  // WeekendPlannerChangeLogModal's Recent actions list (which also now
  // confirms before writing), just triggered inline right after the
  // action instead of from the review log. Calls restoreWeekendPlannerBatch
  // with nothing but the batchId (see changeLog.js for why it re-fetches
  // everything fresh rather than trusting this component's own
  // already-loaded state) — the restore logic is identical either way.
  async function undoLastAction() {
    if (!lastAction) return
    setUndoing(true)
    const result = await restoreWeekendPlannerBatch({ batchId: lastAction.batchId, changedBy: profile?.id ?? null })
    setUndoing(false)
    if (result.error) { setError(result.error); setToastVisible(false); return }
    setLastAction(null)
    setToastVisible(false)
    await load()
  }

  return { lastAction, toastVisible, setToastVisible, undoing, pushUndo, undoLastAction }
}
