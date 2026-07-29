import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchProfileNames, formatRosterChangeLine } from '../lib/changeLog'

// Read-only audit trail for one roster_month_id — every manual edit
// (assign/unassign/remove/move) logged by RosterGridPage/RosterVacancyModal,
// newest first. Scheduler-generated entries never appear here since nothing
// in the generation flow writes to roster_entry_changes.
export default function RosterChangeLogModal({ rosterMonthId, monthLabel, onClose }) {
  const [changes, setChanges] = useState([])
  const [nameById, setNameById] = useState(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load is redefined every render; including it would refetch in a loop
  }, [rosterMonthId])

  async function load() {
    setLoading(true)
    setError('')
    const { data, error: err } = await supabase
      .from('roster_entry_changes')
      .select('*')
      .eq('roster_month_id', rosterMonthId)
      .order('changed_at', { ascending: false })
    if (err) { setError(err.message); setLoading(false); return }

    const ids = (data || []).flatMap(c => [c.changed_by, c.profile_id_before, c.profile_id_after])
    setNameById(await fetchProfileNames(ids))
    setChanges(data || [])
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 px-4" onClick={onClose}>
      <div className="card w-full max-w-2xl max-h-[80vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-ink">Review log — {monthLabel}</h2>
          <button onClick={onClose} className="text-ink-muted hover:text-ink" aria-label="Close review log">×</button>
        </div>

        {loading && <p className="mt-4 text-sm text-ink-muted">Loading…</p>}
        {error && <p className="mt-4 text-sm text-flagRed">{error}</p>}
        {!loading && !error && changes.length === 0 && (
          <p className="mt-4 text-sm text-ink-muted">No manual edits recorded for this roster yet.</p>
        )}
        {!loading && !error && changes.length > 0 && (
          <ul className="mt-4 space-y-2 text-sm text-ink-light">
            {changes.map(c => (
              <li key={c.id} className="border-b border-slate-line pb-2 last:border-0">
                {formatRosterChangeLine(c, nameById, monthLabel)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
