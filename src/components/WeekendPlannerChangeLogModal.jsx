import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchProfileNames, formatWeekendPlannerChangeLine } from '../lib/changeLog'

const RECENT_LIMIT = 200

// Read-only audit trail of add/remove edits to weekend_planner_entries,
// newest first. The planner is one continuous calendar rather than
// per-month like the roster, so this shows recent activity across it
// rather than being scoped to a single log.
export default function WeekendPlannerChangeLogModal({ onClose }) {
  const [changes, setChanges] = useState([])
  const [nameById, setNameById] = useState(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setError('')
    const { data, error: err } = await supabase
      .from('weekend_planner_changes')
      .select('*')
      .order('changed_at', { ascending: false })
      .limit(RECENT_LIMIT)
    if (err) { setError(err.message); setLoading(false); return }

    const ids = (data || []).flatMap(c => [c.changed_by, c.profile_id])
    setNameById(await fetchProfileNames(ids))
    setChanges(data || [])
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 px-4" onClick={onClose}>
      <div className="card w-full max-w-2xl max-h-[80vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-ink">Review log — Weekend planner</h2>
          <button onClick={onClose} className="text-ink-muted hover:text-ink" aria-label="Close review log">×</button>
        </div>
        <p className="mt-1 text-xs text-ink-muted">Most recent {RECENT_LIMIT} edits.</p>

        {loading && <p className="mt-4 text-sm text-ink-muted">Loading…</p>}
        {error && <p className="mt-4 text-sm text-flagRed">{error}</p>}
        {!loading && !error && changes.length === 0 && (
          <p className="mt-4 text-sm text-ink-muted">No edits recorded yet.</p>
        )}
        {!loading && !error && changes.length > 0 && (
          <ul className="mt-4 space-y-2 text-sm text-ink-light">
            {changes.map(c => (
              <li key={c.id} className="border-b border-slate-line pb-2 last:border-0">
                {formatWeekendPlannerChangeLine(c, nameById)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
