import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

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

  return (
    <div className="mx-auto max-w-4xl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-ink">Rosters</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Generate, edit, and publish monthly shift rosters
          </p>
        </div>
        {tab === 'active' && (
          <button onClick={() => navigate('/roster/generate')} className="btn-primary">
            <PlusIcon className="h-4 w-4" />
            Generate new roster
          </button>
        )}
      </div>

      {isAdmin && (
        <div className="mb-5 flex gap-1 rounded-lg border border-slate-line bg-canvas-raised p-1 w-fit">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === t.key ? 'bg-accent text-white' : 'text-ink-light hover:bg-canvas-sunken'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

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
          <div className="card mb-4 flex flex-wrap items-center gap-3 p-4">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by month or year…"
              className="input-field max-w-xs"
            />
            <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)} className="input-field w-auto">
              <option value="">All months</option>
              {MONTH_NAMES.slice(1).map((name, i) => (
                <option key={name} value={i + 1}>{name}</option>
              ))}
            </select>
            <select value={filterYear} onChange={e => setFilterYear(e.target.value)} className="input-field w-auto">
              <option value="">All years</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
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
        <RosterSection
          title="Bin"
          rosters={binned}
          selected={binSel}
          setSelected={setBinSel}
          navigate={navigate}
          metaFn={r => `Deleted ${formatDate(r.deleted_at)} · auto-deletes in ${daysRemaining(r.deleted_at)} day${daysRemaining(r.deleted_at) !== 1 ? 's' : ''}`}
          actions={[
            { label: 'Restore', onClick: (ids) => { restoreFromBin(ids); setBinSel(new Set()) } },
            { label: 'Delete permanently', onClick: (ids) => { deletePermanently(ids); setBinSel(new Set()) } },
          ]}
          emptyText="Bin is empty."
        />
      )}
    </div>
  )
}

function EmptyState({ navigate }) {
  return (
    <div className="card p-12 text-center">
      <CalendarIcon className="mx-auto mb-3 h-10 w-10 text-ink-muted opacity-40" />
      <p className="font-medium text-ink">No rosters yet</p>
      <p className="mt-1 text-sm text-ink-muted">
        Click "Generate new roster" to create your first one.
      </p>
      <button onClick={() => navigate('/roster/generate')} className="btn-primary mx-auto mt-5">
        Generate new roster
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
          className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-canvas-sunken"
        >
          <div>
            <p className="font-medium text-ink">{MONTH_NAMES[roster.month]} {roster.year}</p>
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
          <div key={roster.id} className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-canvas-sunken">
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
                <p className="font-medium text-ink">{MONTH_NAMES[roster.month]} {roster.year}</p>
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

function PlusIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
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
function ChevronRightIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  )
}
