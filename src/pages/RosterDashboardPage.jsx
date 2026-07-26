import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import ClearableInput from '../components/ClearableInput'
import SelectMenu from '../components/SelectMenu'
import { useDismissablePopover } from '../lib/useDismissablePopover'
import { computeAnchoredPosition } from '../lib/popoverPosition'

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

const STATUS_STYLES = {
  draft:     'bg-flagAmber-bg text-flagAmber',
  published: 'bg-success-bg text-success',
  archived:  'bg-canvas-sunken text-ink-muted',
}

const STATUS_LABELS = {
  draft:     'Draft',
  published: 'Published',
  archived:  'Archived',
}

const TABS = [
  { key: 'active', label: 'Active' },
  { key: 'archive', label: 'Archive' },
  { key: 'bin', label: 'Bin' },
]

function formatDate(value) {
  return new Date(value).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
}

function daysRemaining(deletedAt) {
  const elapsed = (Date.now() - new Date(deletedAt).getTime()) / 86400000
  return Math.max(0, Math.ceil(30 - elapsed))
}

export default function RosterDashboardPage() {
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const [rosters, setRosters] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')

  const [tab, setTab] = useState('active')
  const [draftSel, setDraftSel] = useState(new Set())
  const [pubSel, setPubSel] = useState(new Set())
  const [archiveSel, setArchiveSel] = useState(new Set())
  const [binSel, setBinSel] = useState(new Set())

  const [search, setSearch] = useState('')
  const [filterMonth, setFilterMonth] = useState('')
  const [filterYear, setFilterYear] = useState('')
  const [binSearch, setBinSearch] = useState('')
  const [binFilterMonth, setBinFilterMonth] = useState('')
  const [binFilterYear, setBinFilterYear] = useState('')

  useEffect(() => {
    loadRosters()
  }, [])

  useEffect(() => {
    setDraftSel(new Set())
    setPubSel(new Set())
    setArchiveSel(new Set())
    setBinSel(new Set())
  }, [tab])

  async function loadRosters() {
    setLoading(true)
    const { data, error } = await supabase
      .from('roster_months')
      .select('*')
      .order('year', { ascending: false })
      .order('month', { ascending: false })

    if (error) {
      setError(error.message)
    } else {
      setRosters(data)
    }
    setLoading(false)
  }

  async function runAction(fn) {
    setActionError('')
    const { error } = await fn()
    if (error) {
      setActionError(error.message)
      return
    }
    await loadRosters()
  }

  const moveToBin = (ids) => runAction(() =>
    supabase.from('roster_months').update({ deleted_at: new Date().toISOString() }).in('id', ids))

  const restoreFromBin = (ids) => runAction(() =>
    supabase.from('roster_months').update({ deleted_at: null }).in('id', ids))

  const archiveRosters = (ids) => runAction(() =>
    supabase.from('roster_months').update({ status: 'archived', archived_at: new Date().toISOString() }).in('id', ids))

  const unarchiveRosters = (ids) => runAction(() =>
    supabase.from('roster_months').update({ status: 'published', archived_at: null }).in('id', ids))

  const deletePermanently = (ids) => {
    if (!window.confirm(`Permanently delete ${ids.length} roster${ids.length !== 1 ? 's' : ''}? This cannot be undone.`)) return
    runAction(() => supabase.rpc('permanently_delete_roster_months', { p_ids: ids }))
  }

  if (loading) {
    return <p className="text-sm text-ink-muted">Loading rosters…</p>
  }

  if (error) {
    return (
      <div className="card border-flagRed bg-flagRed-bg p-4">
        <p className="text-sm text-flagRed">{error}</p>
      </div>
    )
  }

  const drafts = rosters.filter(r => r.status === 'draft' && !r.deleted_at)
  const published = rosters.filter(r => r.status === 'published' && !r.deleted_at)
  const archived = rosters.filter(r => r.status === 'archived' && !r.deleted_at)
  const binned = [...rosters.filter(r => r.deleted_at)].sort((a, b) => new Date(b.deleted_at) - new Date(a.deleted_at))

  const years = [...new Set(archived.map(r => r.year))].sort((a, b) => b - a)
  const filteredArchived = archived.filter(r => {
    if (filterMonth && r.month !== Number(filterMonth)) return false
    if (filterYear && r.year !== Number(filterYear)) return false
    if (search && !`${MONTH_NAMES[r.month]} ${r.year}`.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const binYears = [...new Set(binned.map(r => r.year))].sort((a, b) => b - a)
  const filteredBinned = binned.filter(r => {
    if (binFilterMonth && r.month !== Number(binFilterMonth)) return false
    if (binFilterYear && r.year !== Number(binFilterYear)) return false
    if (binSearch && !`${MONTH_NAMES[r.month]} ${r.year}`.toLowerCase().includes(binSearch.toLowerCase())) return false
    return true
  })

  return (
    <div className="mx-auto max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-ink">Rosters</h1>
      </div>

      <div className="mb-5 flex items-center gap-2">
        {isAdmin && (
          <div className="flex flex-1 gap-1 rounded-lg border border-slate-line bg-canvas-raised p-1 md:w-fit md:flex-none">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors md:flex-none ${
                  tab === t.key ? 'bg-accent text-white' : 'text-ink-light hover:bg-canvas-sunken active:bg-canvas-sunken'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
        {isAdmin && (
          // Always rendered (even off the Active tab) so the tab selector's
          // `flex-1` share of the row is computed against the same layout on
          // every tab — hiding it via `tab !== 'active'` conditional
          // rendering instead would let the selector expand to fill the
          // whole row on Archive/Bin, making it a different width there
          // than on Active.
          <button
            onClick={() => navigate('/roster/generate')}
            aria-hidden={tab !== 'active'}
            tabIndex={tab !== 'active' ? -1 : undefined}
            className={`btn-primary h-[42px] flex-shrink-0 justify-center whitespace-nowrap md:h-auto md:w-auto ${tab !== 'active' ? 'invisible' : ''}`}
          >
            <PencilSparklesIcon className="h-4 w-4" />
            Create roster
          </button>
        )}
      </div>

      {actionError && (
        <div className="card mb-4 border-flagRed bg-flagRed-bg p-4">
          <p className="text-sm text-flagRed">{actionError}</p>
        </div>
      )}

      {!isAdmin && (
        <RosterFlatList rosters={rosters} navigate={navigate} />
      )}

      {isAdmin && tab === 'active' && (
        <>
          <RosterSection
            title="Drafts"
            rosters={drafts}
            selected={draftSel}
            setSelected={setDraftSel}
            navigate={navigate}
            metaFn={r => `Created ${formatDate(r.created_at)}${r.carry_forward ? ' · carry-forward used' : ''}`}
            actions={[{ label: 'Move to Bin', onClick: (ids) => { moveToBin(ids); setDraftSel(new Set()) } }]}
          />
          <RosterSection
            title="Published"
            rosters={published}
            selected={pubSel}
            setSelected={setPubSel}
            navigate={navigate}
            metaFn={r => `Created ${formatDate(r.created_at)}${r.carry_forward ? ' · carry-forward used' : ''}`}
            actions={[{ label: 'Archive', onClick: (ids) => { archiveRosters(ids); setPubSel(new Set()) } }]}
          />
          {drafts.length === 0 && published.length === 0 && (
            <EmptyState navigate={navigate} />
          )}
        </>
      )}

      {isAdmin && tab === 'archive' && (
        <>
          <RosterSearchFilter
            search={search}
            onSearchChange={setSearch}
            filterMonth={filterMonth}
            onFilterMonthChange={setFilterMonth}
            filterYear={filterYear}
            onFilterYearChange={setFilterYear}
            years={years}
            ariaLabel="Filter archived rosters"
          />
          <RosterSection
            title="Archived"
            rosters={filteredArchived}
            selected={archiveSel}
            setSelected={setArchiveSel}
            navigate={navigate}
            metaFn={r => `Archived ${formatDate(r.archived_at || r.updated_at)}`}
            actions={[{ label: 'Unarchive', onClick: (ids) => { unarchiveRosters(ids); setArchiveSel(new Set()) } }]}
            emptyText="No archived rosters match these filters."
          />
        </>
      )}

      {isAdmin && tab === 'bin' && (
        <>
          <RosterSearchFilter
            search={binSearch}
            onSearchChange={setBinSearch}
            filterMonth={binFilterMonth}
            onFilterMonthChange={setBinFilterMonth}
            filterYear={binFilterYear}
            onFilterYearChange={setBinFilterYear}
            years={binYears}
            ariaLabel="Filter bin"
          />
          <RosterSection
            title="Bin"
            rosters={filteredBinned}
            selected={binSel}
            setSelected={setBinSel}
            navigate={navigate}
            metaFn={r => `Deleted ${formatDate(r.deleted_at)} · auto-deletes in ${daysRemaining(r.deleted_at)} day${daysRemaining(r.deleted_at) !== 1 ? 's' : ''}`}
            actions={[
              { label: 'Restore', onClick: (ids) => { restoreFromBin(ids); setBinSel(new Set()) } },
              { label: 'Delete permanently', onClick: (ids) => { deletePermanently(ids); setBinSel(new Set()) } },
            ]}
            emptyText={binned.length === 0 ? 'Bin is empty.' : 'No deleted rosters match these filters.'}
          />
        </>
      )}
    </div>
  )
}

// Search + Filter row shared by the Archive and Bin tabs — the search box
// takes 75% of the row's width and the Filter button the other 25%
// (mobile only; desktop keeps them content-sized via the row's max-w-4xl
// cap already being narrow enough that the split barely shows). The Month/
// Year popover itself is local state, since only one of these rows is ever
// mounted at a time — the search/filter *values* stay lifted so each tab
// keeps its own independent filters.
function RosterSearchFilter({ search, onSearchChange, filterMonth, onFilterMonthChange, filterYear, onFilterYearChange, years, ariaLabel }) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState(null)
  const ref = useRef(null)
  useDismissablePopover(open, () => setOpen(false), ref)
  const activeCount = [filterMonth, filterYear].filter(Boolean).length

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <div className="w-3/4 md:w-auto md:flex-1">
          <ClearableInput
            type="text"
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Search by month or year…"
            className="input-field"
            clearLabel="Clear search"
            icon={<SearchIcon className="h-4 w-4" />}
          />
        </div>
        <button
          onClick={e => {
            setAnchor(e.currentTarget.getBoundingClientRect())
            setOpen(o => !o)
          }}
          className="btn-secondary w-1/4 flex-shrink-0 justify-center whitespace-nowrap md:w-auto"
        >
          <ListFilterIcon className="h-4 w-4" />
          Filter{activeCount > 0 ? ` · ${activeCount}` : ''}
        </button>
      </div>

      {open && anchor && (() => {
        const menuWidth = 220
        const positionStyle = computeAnchoredPosition(anchor, menuWidth)
        return (
          <div
            ref={ref}
            role="dialog"
            aria-label={ariaLabel}
            style={{ ...positionStyle, width: menuWidth }}
            className="fixed z-50 space-y-3 rounded-xl border border-slate-line bg-canvas-raised p-4 shadow-raised"
          >
            <div>
              <label className="label-text">Month</label>
              <SelectMenu
                value={filterMonth}
                onChange={onFilterMonthChange}
                placeholder="All months"
                options={MONTH_NAMES.slice(1).map((name, i) => ({ value: String(i + 1), label: name }))}
                alwaysDown
              />
            </div>
            <div>
              <label className="label-text">Year</label>
              <SelectMenu
                value={filterYear}
                onChange={onFilterYearChange}
                placeholder="All years"
                options={years.map(y => ({ value: String(y), label: String(y) }))}
                alwaysDown
              />
            </div>
          </div>
        )
      })()}
    </>
  )
}

function EmptyState({ navigate }) {
  return (
    <div className="card p-12 text-center">
      <CalendarIcon className="mx-auto mb-3 h-10 w-10 text-ink-muted opacity-40" />
      <p className="font-medium text-ink">No rosters yet</p>
      <p className="mt-1 text-sm text-ink-muted">
        Click "Create roster" to create your first one.
      </p>
      <button onClick={() => navigate('/roster/generate')} className="btn-primary mx-auto mt-5">
        <PencilSparklesIcon className="h-4 w-4" />
        Create roster
      </button>
    </div>
  )
}

function RosterFlatList({ rosters, navigate }) {
  if (rosters.length === 0) {
    return <EmptyState navigate={navigate} />
  }
  return (
    <div className="card divide-y divide-slate-line overflow-hidden">
      {rosters.map(roster => (
        <button
          key={roster.id}
          onClick={() => navigate(`/roster/${roster.id}`)}
          className="flex w-full items-center justify-between px-4 py-2 text-left transition-colors hover:bg-canvas-sunken active:bg-canvas-sunken"
        >
          <div>
            <p className="text-sm font-medium text-ink">{MONTH_NAMES[roster.month]} {roster.year}</p>
            <p className="mt-0.5 text-xs text-ink-muted">Created {formatDate(roster.created_at)}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[roster.status]}`}>
              {STATUS_LABELS[roster.status]}
            </span>
            <ChevronRightIcon className="h-4 w-4 text-ink-muted" />
          </div>
        </button>
      ))}
    </div>
  )
}

function RosterSection({ title, rosters, selected, setSelected, navigate, metaFn, actions, emptyText }) {
  if (rosters.length === 0) {
    return emptyText ? (
      <div className="card p-8 text-center text-sm text-ink-muted">{emptyText}</div>
    ) : null
  }

  const allSelected = rosters.every(r => selected.has(r.id))

  function toggleOne(id) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rosters.map(r => r.id)))
  }

  return (
    <div className="mb-6">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm font-medium text-ink-light">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            className="h-4 w-4 rounded border-slate-line accent-accent"
          />
          {title} ({rosters.length})
        </label>
        {selected.size > 0 && (
          <div className="flex gap-2">
            {actions.map(action => (
              <button
                key={action.label}
                onClick={() => action.onClick([...selected])}
                className="btn-secondary px-3 py-1.5 text-xs"
              >
                {action.label} ({selected.size})
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="card divide-y divide-slate-line overflow-hidden">
        {rosters.map(roster => (
          <div key={roster.id} className="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-canvas-sunken active:bg-canvas-sunken">
            <input
              type="checkbox"
              checked={selected.has(roster.id)}
              onChange={() => toggleOne(roster.id)}
              className="h-4 w-4 shrink-0 rounded border-slate-line accent-accent"
            />
            <button
              onClick={() => navigate(`/roster/${roster.id}`)}
              className="flex flex-1 items-center justify-between text-left"
            >
              <div>
                <p className="text-sm font-medium text-ink">{MONTH_NAMES[roster.month]} {roster.year}</p>
                <p className="mt-0.5 text-xs text-ink-muted">{metaFn(roster)}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[roster.status]}`}>
                  {STATUS_LABELS[roster.status]}
                </span>
                <ChevronRightIcon className="h-4 w-4 text-ink-muted" />
              </div>
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// Lucide's "pencil-sparkles" icon (exact path data) — a "create/generate"
// pencil rather than a plain add icon.
function PencilSparklesIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 3H8" />
      <path d="m15.007 5.008 3.987 3.986" />
      <path d="M20 15v4" />
      <path d="M21.174 6.813a2.82 2.82 0 0 0-3.986-3.987L3.842 16.175a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
      <path d="M22 17h-4" />
      <path d="M4 5v4" />
      <path d="M6 7H2" />
      <path d="M9 2v2" />
    </svg>
  )
}
function CalendarIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path strokeLinecap="round" d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  )
}
function SearchIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}
function ListFilterIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M7 12h10M10 18h4" />
    </svg>
  )
}
function ChevronRightIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  )
}
