import { useEffect, useState } from 'react'
import { ChevronDown, RotateCcw } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import {
  fetchProfilesById, fetchAdminOptions, fetchDoctorOptions,
  queryWeekendPlannerChanges, WEEKEND_ACTION_OPTIONS, WEEKEND_CATEGORY_FILTER_OPTIONS,
  fetchWeekendPlannerBatches, summarizeWeekendPlannerBatch, restoreWeekendPlannerBatch,
} from '../lib/changeLog'
import {
  adminInitialsMap, shortDate, weekendBatchParts, weekendChangeLine, weekendLogEntries, WEEKEND_TYPES,
} from '../lib/reviewLog'
import ReviewLogList, { OffName } from './ReviewLogList'
import DateFieldButton from './DateFieldButton'
import ChangeLogFilterMenu from './ChangeLogFilterMenu'
import { changeLogFilterFacets } from './changeLogFilterFacets'
import ClearableInput from './ClearableInput'
import FloatingActionMenu from './FloatingActionMenu'
import LocumBadge from './LocumBadge'

const RECENT_LIMIT = 300
const EMPTY_FILTERS = { dateFrom: '', dateTo: '', adminId: '', doctorId: '', action: '', categoryGroup: '' }

function Person({ profile, struck = false }) {
  const name = profile ? `${profile.name} ${profile.surname}` : 'Unknown'
  const badge = profile?.role === 'locum' && <LocumBadge />
  return struck ? <><OffName>{name}</OffName>{badge}</> : <span className="text-ink">{name}{badge}</span>
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
  // Client-side, unlike the rest of `filters` (which go to the server as
  // query params): this narrows the already-fetched page of rows by the
  // names the table actually shows, rather than re-querying. Admin/Doctor
  // already have exact-match server filters — this is the "I only remember
  // part of the surname" case those don't cover.
  const [q, setQ] = useState('')
  const [changes, setChanges] = useState([])
  const [profilesById, setProfilesById] = useState(new Map())
  const [adminOptions, setAdminOptions] = useState([])
  const [doctorOptions, setDoctorOptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [batches, setBatches] = useState([])
  const [batchProfilesById, setBatchProfilesById] = useState(new Map())
  const [openBatchIds, setOpenBatchIds] = useState(() => new Set())
  const [restoringBatchId, setRestoringBatchId] = useState(null)
  const [restoreMessage, setRestoreMessage] = useState(null) // { type: 'error' | 'success', text }
  const [confirmBatch, setConfirmBatch] = useState(null) // { batchId, changes } pending a "restore?" confirmation, or null

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

  // Full batches (every row of each recent paste/clear/edit), so a batch's
  // summary and its Restore describe the whole action even when a filter
  // hides some of its rows from the log.
  async function loadBatches() {
    const { batches: fetched } = await fetchWeekendPlannerBatches()
    const ids = fetched.flatMap(b => b.changes.flatMap(c => [c.changed_by, c.profile_id]))
    setBatchProfilesById(await fetchProfilesById(ids))
    setBatches(fetched)
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

    // Both lists: the restore is itself logged as a new batch.
    await Promise.all([loadBatches(), load()])
    onDataChanged?.()
  }

  async function handleConfirmRestore() {
    if (!confirmBatch) return
    const batchId = confirmBatch.batchId
    setConfirmBatch(null)
    await handleRestore(batchId)
  }

  const filtersActive = Object.values(filters).some(Boolean) || Boolean(q)

  const profileOf = id => profilesById.get(id) ?? batchProfilesById.get(id) ?? null
  function fullName(id) {
    const p = profileOf(id)
    return p ? `${p.name} ${p.surname}` : ''
  }
  const searchTerm = q.trim().toLowerCase()
  const visibleChanges = searchTerm
    ? changes.filter(c => `${fullName(c.changed_by)} ${fullName(c.profile_id)}`.toLowerCase().includes(searchTerm))
    : changes

  const batchesById = new Map(batches.map(b => [b.batchId, b]))
  const entries = weekendLogEntries(visibleChanges, batchesById)
  const adminShort = adminInitialsMap(new Map([...batchProfilesById, ...profilesById]), entries.map(e => e.changedBy))
  const restoreBusy = restoringBatchId !== null

  function toggleBatchOpen(batchId) {
    setOpenBatchIds(prev => {
      const next = new Set(prev)
      if (next.has(batchId)) next.delete(batchId)
      else next.add(batchId)
      return next
    })
  }

  function askRestore(entry) {
    setConfirmBatch({ batchId: entry.batchId, changes: entry.batch?.changes ?? entry.visible })
  }

  function restoreLabel(entry) {
    return restoringBatchId === entry.batchId ? 'Restoring…' : 'Restore this'
  }

  // One manual add/remove: the weekend and category, then the doctor —
  // struck through when they came off it. A small ↺ restores it.
  function singleChange(entry) {
    const c = entry.change
    return (
      <>
        <p className="font-semibold text-ink">{weekendChangeLine(c)}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2">
          <span><Person profile={profileOf(c.profile_id)} struck={c.action === 'remove'} /></span>
          {entry.batchId && (
            <button
              type="button"
              onClick={() => askRestore(entry)}
              disabled={restoreBusy}
              aria-label={restoreLabel(entry)}
              title="Restore this"
              className="inline-flex h-6 w-6 items-center justify-center rounded-full text-ink-muted hover:bg-canvas-sunken hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </p>
      </>
    )
  }

  // A paste/clear touching several rows: one summary (weekends, every
  // category, counts), its own Restore, and the individual changes folded
  // underneath.
  function batchChange(entry, parts) {
    const all = entry.batch?.changes ?? entry.visible
    const open = openBatchIds.has(entry.batchId)
    return (
      <>
        <p className="font-semibold text-ink">{parts.weekends} · {parts.categories.join(', ')}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3">
          <span>{parts.counts}</span>
          <button
            type="button"
            onClick={() => toggleBatchOpen(entry.batchId)}
            aria-expanded={open}
            className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
          >
            {open ? 'Hide' : 'Show'} {all.length} changes
            <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
        </p>
        <button
          type="button"
          onClick={() => askRestore(entry)}
          disabled={restoreBusy}
          className="btn-secondary mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RotateCcw className="h-3 w-3" aria-hidden="true" />
          {restoreLabel(entry)}
        </button>
        {open && (
          <ul className="mt-2 space-y-0.5 border-t border-slate-hairline pt-2 text-[13px]">
            {all.map(c => (
              <li key={c.id}>
                <span className="mr-1.5 inline-block w-3 text-center text-ink-muted" aria-label={c.action === 'add' ? 'Added' : 'Removed'}>{c.action === 'add' ? '+' : '−'}</span>
                <Person profile={profileOf(c.profile_id)} struck={c.action === 'remove'} />
                <span className="text-ink-muted"> · {shortDate(c.weekend_saturday, new Date(c.changed_at).getFullYear())} · {c.category}</span>
              </li>
            ))}
          </ul>
        )}
      </>
    )
  }

  const logItems = entries.map(entry => {
    const admin = { short: adminShort.get(entry.changedBy) ?? '?', fullName: fullName(entry.changedBy) || 'Unknown' }
    if (entry.kind === 'batch') {
      const parts = weekendBatchParts(entry.batch?.changes ?? entry.visible)
      return { id: entry.id, at: entry.at, type: parts.type, typeLabel: WEEKEND_TYPES[parts.type], admin, change: batchChange(entry, parts), framed: true }
    }
    const type = entry.change.action === 'add' ? 'added' : 'removed'
    return { id: entry.id, at: entry.at, type, typeLabel: WEEKEND_TYPES[type], admin, change: singleChange(entry) }
  })

  const filterFacets = changeLogFilterFacets({
    adminOptions,
    doctorOptions,
    actionOptions: WEEKEND_ACTION_OPTIONS,
    adminId: filters.adminId,
    doctorId: filters.doctorId,
    action: filters.action,
    onAdminChange: v => setFilters(f => ({ ...f, adminId: v })),
    onDoctorChange: v => setFilters(f => ({ ...f, doctorId: v })),
    onActionChange: v => setFilters(f => ({ ...f, action: v })),
    extraFilter: {
      label: 'Category',
      options: WEEKEND_CATEGORY_FILTER_OPTIONS,
      value: filters.categoryGroup,
      onChange: v => setFilters(f => ({ ...f, categoryGroup: v })),
    },
  })
  const clearAll = () => { setFilters(EMPTY_FILTERS); setQ('') }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center scrim px-4" onClick={onClose}>
      <div className="card flex w-full max-w-5xl max-h-[85vh] flex-col p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-ink">Review log — Weekend planner</h2>
          <button type="button" onClick={onClose} className="btn-close -mr-2 h-9 w-9 text-ink-muted" aria-label="Close review log">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <p className="mt-1 text-xs text-ink-muted">Most recent {RECENT_LIMIT} matching edits.</p>

        {/* From/To stay on the row at every width — they set which slice of
            the log is being looked at, the way Audit's own range does, and
            they're the one control here the FAB has no slot for. Search and
            the four facets fold into the FAB below `md`. */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <DateFieldButton label="From" value={filters.dateFrom} max={filters.dateTo || undefined}
            onChange={v => setFilters(f => ({ ...f, dateFrom: v }))} />
          <DateFieldButton label="To" value={filters.dateTo} min={filters.dateFrom || undefined}
            onChange={v => setFilters(f => ({ ...f, dateTo: v }))} />
          <div className="hidden flex-wrap items-center gap-2 md:flex">
            <div className="w-56">
              <ClearableInput
                type="text"
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Search by name…"
                className="input-field"
                clearLabel="Clear search"
              />
            </div>
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
              <button type="button" className="text-sm text-accent hover:underline" onClick={clearAll}>
                Clear
              </button>
            )}
          </div>
        </div>

        {restoreMessage && (
          <p className={`mt-2 text-sm ${restoreMessage.type === 'error' ? 'text-flagRed' : 'text-success'}`} role="status">
            {restoreMessage.text}
          </p>
        )}

        {/* Inside the card, not the backdrop: the backdrop's own onClick is
            what closes this modal, so a FAB rendered as its sibling would
            dismiss the whole log on every tap. */}
        <FloatingActionMenu
          search={{ value: q, onChange: setQ, placeholder: 'Search by name…' }}
          filter={{
            facets: filterFacets,
            active: filtersActive,
            onClearAll: clearAll,
            sheetTitle: 'Filters',
          }}
        />

        {loading && <p className="mt-4 text-sm text-ink-muted">Loading…</p>}
        {error && <p className="mt-4 text-sm text-flagRed">{error}</p>}
        {!loading && !error && visibleChanges.length === 0 && (
          <p className="mt-4 text-sm text-ink-muted">
            {filtersActive ? 'No edits match these filters.' : 'No edits recorded yet.'}
          </p>
        )}
        {!loading && !error && visibleChanges.length > 0 && (
          <div className="mt-4 flex-1 overflow-auto pb-16 md:pb-0">
            <ReviewLogList items={logItems} />
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center scrim px-4" onClick={() => setConfirmBatch(null)}>
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
