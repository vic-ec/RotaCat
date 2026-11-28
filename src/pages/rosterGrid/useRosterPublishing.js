import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { syncWeekendPatternsFromEntries } from '../../lib/weekendPatternSync'
import { MONTH_NAMES } from './rosterGridHelpers'

// Publish, Undo Publish and Delete for the roster month. Moved out of
// RosterGridPage as they were.
export function useRosterPublishing({ id, rosterMonth, entries, shiftTypes, loadAll, navigate, setShowPublishConfirm }) {
  const [publishing, setPublishing] = useState(false)

  async function handlePublish() {
    setShowPublishConfirm(false)
    setPublishing(true)
    await supabase.from('roster_months').update({
      status: 'published',
      published_at: new Date().toISOString(),
    }).eq('id', id)
    await syncWeekendPatternsFromEntries(entries, shiftTypes)
    await loadAll()
    setPublishing(false)
  }

  // Reverts a published roster back to draft. Only undoes the roster_months
  // status itself — the weekend-planner pattern sync that publishing
  // triggers is a downstream side effect on a different table, and
  // unwinding it isn't part of what "undo the publish" was asked for here.
  async function handleUnpublish() {
    setPublishing(true)
    await supabase.from('roster_months').update({
      status: 'draft',
      published_at: null,
    }).eq('id', id)
    await loadAll()
    setPublishing(false)
  }

  // Delete (soft): the same deleted_at the dashboard's Delete uses, so the
  // roster lands in its Recently deleted list and can be restored from
  // there. Lives only in the ⋮ menu, behind a confirm.
  async function handleDelete() {
    if (!window.confirm(`Delete the ${MONTH_NAMES[rosterMonth.month]} ${rosterMonth.year} roster? It can be restored from the Rosters page for a while.`)) return
    const { error } = await supabase.from('roster_months').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (error) { alert('Could not delete roster: ' + error.message); return }
    navigate('/roster')
  }

  return { publishing, handlePublish, handleUnpublish, handleDelete }
}
