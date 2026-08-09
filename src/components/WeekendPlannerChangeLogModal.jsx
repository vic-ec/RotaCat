import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  fetchProfilesById, fetchAdminOptions, fetchDoctorOptions,
  nameMapFromProfiles, queryWeekendPlannerChanges, weekendChangeDetail, WEEKEND_ACTION_OPTIONS, WEEKEND_CATEGORY_FILTER_OPTIONS,
  fetchWeekendPlannerBatches, summarizeWeekendPlannerBatch, formatRelativeTime, restoreWeekendPlannerBatch,
} from '../lib/changeLog'
import DateFieldButton from './DateFieldButton'
import ChangeLogFilterMenu from './ChangeLogFilterMenu'
import DetailInfoButton from './DetailInfoButton'
import LocumBadge from './LocumBadge'

const RECENT_LIMIT = 300
const RECENT_BATCH_DISPLAY_LIMIT = 15
const EMPTY_FILTERS = { dateFrom: '', dateTo: '', adminId: '', doctorId: '', action: '', categoryGroup: '' }

function formatTimestampParts(iso) {
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return { date, time }
}

// Searchable, filterable audit trail of add/remove edits to
// weekend_planner_entries. The planner is one continuous calendar rather
// than per-month like the roster, so this shows recent activity across it
// rather than being scoped to a single log. onDataChanged (optional) lets
// the caller refresh its own already-loaded state after a restore — this
// modal's own batch/restore logic never depends on it: restoreWeekendPlannerBatch
// re-fetches everything it needs fresh, so a restore is correct even if
// this modal is the only thing open (e.g. reached straight after a page
// reload with nothing else mounted).
export default function WeekendPlannerChangeLogModal({ onClose, onDataChanged }) {
  const { profile } = useAuth()
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [changes, setChanges] = useState([])
  const [profilesById, setProfilesById] = useState(new Map())
  const [adminOptions, setAdminOptions] = useState([])
  const [doctorOptions, setDoctorOptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [batches, setBatches] = useState([])
  const [batchesLoading, setBatchesLoading] = useState(true)
  const [batchNameById, setBatchNameById] = useState(new Map())
  const [restoringBatchId, setRestoringBatchId] = useState(null)
  const [restoreMessage, setRestoreMessage] = useState(null) // { type: 'error' | 'success', text }
  const [confirmBatch, setConfirmBatch] = useState(null) // the batch object pending a "restore?" confirmation, or null

  useEffect(() => {
    fetchAdminOptions().then(setAdminOptions)
    fetchDoctorOptions().then(setDoctorOptions)
    loadBatches()
  }, [])

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load closes over filters; refetch whenever it changes
  }, [filters])

  async function load() {
    setLoading(true)
    setError('')
    const { data, error: err } = await queryWeekendPlannerChanges({ ...filters, limit: RECENT_LIMIT })
    if (err) { setError(err.message); setLoading(false); return }

    const ids = (data || []).flatMap(c => [c.changed_by, c.profile_id])
    setProfilesById(await fetchProfilesById(ids))
    setChanges(data || [])
    setLoading(false)
  }

  async function loadBatches() {
    setBatchesLoading(true)
    const { batches: fetched } = await fetchWeekendPlannerBatches()
    const ids = fetched.flatMap(b => b.changes.flatMap(c => [c.changed_by, c.profile_id]))
    setBatchNameById(nameMapFromProfiles(await fetchProfilesById(ids)))
    setBatches(fetched)
    setBatchesLoading(false)
  }

  async function handleRestore(batchId) {
    setRestoringBatchId(batchId)
    setRestoreMessage(null)
    const result = await restoreWeekendPlannerBatch({ batchId, changedBy: profile?.id ?? null })
    setRestoringBatchId(null)
    if (result.error) { setRestoreMessage({ type: 'error', text: result.error }); return }

    const parts = []
    if (result.inserted > 0) parts.push(`${result.inserted} restored`)
    if (result.deleted > 0) parts.push(`${result.deleted} removed`)
    if (result.skipped > 0) parts.push(`${result.skipped} skipped (since changed elsewhere)`)
    setRestoreMessage({ type: 'success', text: parts.length ? parts.join(', ') : 'Nothing left to restore.' })

    await loadBatches()
    onDataChanged?.()
  }

  async function handleConfirmRestore() {
    if (!confirmBatch) return
    const batchId = confirmBatch.batchId
    setConfirmBatch(null)
    await handleRestore(batchId)
  }

  const filtersActive = Object.values(filters).some(Boolean)
  const nameById = nameMapFromProfiles(profilesById)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 px-4" onClick={onClose}>
      <div className="card flex w-full max-w-5xl max-h-[85vh] flex-col p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-ink">Review log — Weekend planner</h2>
          <button onClick={onClose} className="text-ink-muted hover:text-ink" aria-label="Close review log">×</button>
        </div>
        <p className="mt-1 text-xs text-ink-muted">Most recent {RECENT_LIMIT} matching edits.</p>

        {/* Recent actions (restorable) — grouped by batch_id, newest first.
            Sits above the searchable per-row table below since this is the
            actionable "undo" surface; the table remains the full audit
            detail for anything not covered by a recent batch. */}
        <div className="mt-4 border-t border-slate-line pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Recent actions</p>
          {restoreMessage && (
            <p className={`mt-1 text-xs ${restoreMessage.type === 'error' ? 'text-flagRed' : 'text-success'}`} role="status">
              {restoreMessage.text}
            </p>
          )}
          {batchesLoading ? (
            <p className="mt-1 text-sm text-ink-muted">Loading…</p>
          ) : batches.length === 0 ? (
            <p className="mt-1 text-sm text-ink-muted">No recent actions to restore.</p>
          ) : (
            <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto">
              {batches.slice(0, RECENT_BATCH_DISPLAY_LIMIT).map(batch => (
                <li key={batch.batchId} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-ink">
                    {summarizeWeekendPlannerBatch(batch)}
                    <span className="ml-1.5 text-xs text-ink-muted">
                      — {batchNameById.get(batch.changedBy) || 'Unknown'}, {formatRelativeTime(batch.changedAt)}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setConfirmBatch(batch)}
                    disabled={restoringBatchId !== null}
                    className="btn-secondary flex-shrink-0 px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {restoringBatchId === batch.batchId ? 'Restoring…' : 'Restore this'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <DateFieldButton label="From" value={filters.dateFrom} max={filters.dateTo || undefined}
            onChange={v => setFilters(f => ({ ...f, dateFrom: v }))} />
          <DateFieldButton label="To" value={filters.dateTo} min={filters.dateFrom || undefined}
            onChange={v => setFilters(f => ({ ...f, dateTo: v }))} />
          <ChangeLogFilterMenu
            adminOptions={adminOptions}
            doctorOptions={doctorOptions}
            actionOptions={WEEKEND_ACTION_OPTIONS}
            adminId={filters.adminId}
            doctorId={filters.doctorId}
            action={filters.action}
            onAdminChange={v => setFilters(f => ({ ...f, adminId: v }))}
            onDoctorChange={v => setFilters(f => ({ ...f, doctorId: v }))}
            onActionChange={v => setFilters(f => ({ ...f, action: v }))}
            extraFilter={{
              label: 'Category',
              options: WEEKEND_CATEGORY_FILTER_OPTIONS,
              value: filters.categoryGroup,
              onChange: v => setFilters(f => ({ ...f, categoryGroup: v })),
            }}
          />
          {filtersActive && (
            <button type="button" className="text-sm text-accent hover:underline" onClick={() => setFilters(EMPTY_FILTERS)}>
              Clear
            </button>
          )}
        </div>

        {loading && <p className="mt-4 text-sm text-ink-muted">Loading…</p>}
        {error && <p className="mt-4 text-sm text-flagRed">{error}</p>}
        {!loading && !error && changes.length === 0 && (
          <p className="mt-4 text-sm text-ink-muted">
            {filtersActive ? 'No edits match these filters.' : 'No edits recorded yet.'}
          </p>
        )}
        {!loading && !error && changes.length > 0 && (
          <div className="mt-4 flex-1 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-canvas-raised text-xs uppercase text-ink-muted">
                <tr>
                  <th className="whitespace-nowrap py-2 pr-4">Weekend</th>
                  <th className="whitespace-nowrap py-2 pr-4">Time</th>
                  <th className="whitespace-nowrap py-2 pr-4">Admin</th>
                  <th className="py-2 pr-4">Doctor</th>
                  <th className="whitespace-nowrap py-2 pr-4">Category</th>
                  <th className="whitespace-nowrap py-2 pr-4">Type</th>
                  <th className="py-2">Details</th>
                </tr>
              </thead>
              <tbody className="text-ink-light">
                {changes.map(c => {
                  const { date, time } = formatTimestampParts(c.changed_at)
                  const admin = profilesById.get(c.changed_by)
                  const doctor = profilesById.get(c.profile_id)
                  const detail = weekendChangeDetail(c, nameById)
                  return (
                    <tr key={c.id} className="border-t border-slate-line">
                      <td className="whitespace-nowrap py-2 pr-4 align-top">{date}</td>
                      <td className="whitespace-nowrap py-2 pr-4 align-top text-ink-muted">{time}</td>
                      <td className="whitespace-nowrap py-2 pr-4 align-top">{admin ? `${admin.name} ${admin.surname}` : 'Unknown'}</td>
                      <td className="max-w-[10rem] py-2 pr-4 align-top">
                        {doctor ? <>{doctor.name} {doctor.surname}{doctor.role === 'locum' && <LocumBadge />}</> : 'Unknown'}
                      </td>
                      <td className="whitespace-nowrap py-2 pr-4 align-top">{c.category}</td>
                      <td className="whitespace-nowrap py-2 pr-4 align-top capitalize">{c.action}</td>
                      <td className="max-w-[12rem] py-2 align-top">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="min-w-0 flex-1 truncate text-ink-muted">{detail}</span>
                          <DetailInfoButton text={detail} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* A restore writes real changes immediately (no further review step
          after this), so it gets its own explicit confirm — same "are you
          sure" friction as Clear weekend/month/quarter elsewhere in the
          planner. Nested inside the review log modal's own backdrop rather
          than a sibling, so it needs its own stopPropagation to cancel
          without also closing the review log behind it. */}
      {confirmBatch && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/20 px-4" onClick={() => setConfirmBatch(null)}>
          <div className="card w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <h3 className="font-display text-base font-bold text-ink">Restore this action?</h3>
            <p className="mt-2 text-sm text-ink-light">
              Are you sure you want to restore &ldquo;{summarizeWeekendPlannerBatch(confirmBatch)}&rdquo;? This action is permanent.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmBatch(null)} className="btn-secondary text-sm">Cancel</button>
              <button type="button" onClick={handleConfirmRestore} className="btn-primary text-sm">Restore</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
