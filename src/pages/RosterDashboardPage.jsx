import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import PageTabs from '../components/PageTabs'
import Toolbar from '../components/Toolbar'
import SectionLabel from '../components/SectionLabel'
import Tag from '../components/Tag'
import { ListRowRecord, ListEmptyState } from '../components/ListRow'
import CreateRosterModal from '../components/CreateRosterModal'
import RosterSummaryPage from './RosterSummaryPage'

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

// Tag's semantic status tones — see docs/design/layout-spec.md §9.
const STATUS_TONE = {
  draft:     'warning',
  published: 'success',
  archived:  'neutral',
}

const STATUS_LABELS = {
  draft:     'Draft',
  published: 'Published',
  archived:  'Archived',
}

const TABS_ADMIN = [
  { key: 'active', label: 'Active' },
  { key: 'archive', label: 'Archive' },
  { key: 'bin', label: 'Bin' },
]
// Non-admins get the same Active/Archive split (and can archive/unarchive
// their own view of it, see set_roster_months_archived) but never see
// Drafts (RLS never returns them) or the Bin (permanent deletion stays
// admin-only).
const TABS_DOCTOR = [
  { key: 'active', label: 'Active' },
  { key: 'archive', label: 'Archive' },
]

// Hours Summary is hidden from locums entirely (same rule as the Summary
// content itself, see rosterSummary.js) — a locum's outer tab row collapses
// to a single "Rosters" tab, so it isn't shown at all (see the render below).
const OUTER_TABS = [{ key: 'rosters', label: 'Rosters' }, { key: 'summary', label: 'Hours Summary' }]

function formatDate(value) {
  return new Date(value).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
}

function daysRemaining(deletedAt) {
  const elapsed = (Date.now() - new Date(deletedAt).getTime()) / 86400000
  return Math.max(0, Math.ceil(30 - elapsed))
}

export default function RosterDashboardPage() {
  const navigate = useNavigate()
  const { isAdmin, isLocum } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const outerTabs = isLocum ? OUTER_TABS.filter(t => t.key !== 'summary') : OUTER_TABS
  const requestedView = searchParams.get('view')
  const view = outerTabs.some(t => t.key === requestedView) ? requestedView : 'rosters'
  function setView(nextView) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('view', nextView)
      return next
    }, { replace: true })
  }
  const [rosters, setRosters] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')

  const [tab, setTab] = useState('active')
  const [draftSel, setDraftSel] = useState(new Set())
  const [pubSel, setPubSel] = useState(new Set())
  const [archiveSel, setArchiveSel] = useState(new Set())
  const [binSel, setBinSel] = useState(new Set())

  const [activeSearch, setActiveSearch] = useState('')
  const [activeFilterMonth, setActiveFilterMonth] = useState('')
  const [activeFilterYear, setActiveFilterYear] = useState('')
  const [activeSortDir, setActiveSortDir] = useState('desc')
  const [search, setSearch] = useState('')
  const [filterMonth, setFilterMonth] = useState('')
  const [filterYear, setFilterYear] = useState('')
  const [archiveSortDir, setArchiveSortDir] = useState('desc')
  const [binSearch, setBinSearch] = useState('')
  const [binFilterMonth, setBinFilterMonth] = useState('')
  const [binFilterYear, setBinFilterYear] = useState('')
  const [binSortDir, setBinSortDir] = useState('desc')
  const [showCreateModal, setShowCreateModal] = useState(false)

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

  // Archive/unarchive go through an RPC rather than a direct table update —
  // it's the one write non-admins are allowed (published <-> archived only,
  // see the set_roster_months_archived migration), so routing admins
  // through the same call keeps this to one code path for both roles.
  const archiveRosters = (ids) => runAction(() =>
    supabase.rpc('set_roster_months_archived', { p_ids: ids, p_archived: true }))

  const unarchiveRosters = (ids) => runAction(() =>
    supabase.rpc('set_roster_months_archived', { p_ids: ids, p_archived: false }))

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

  function matchesActiveFilters(r) {
    if (activeFilterMonth && r.month !== Number(activeFilterMonth)) return false
    if (activeFilterYear && r.year !== Number(activeFilterYear)) return false
    if (activeSearch && !`${MONTH_NAMES[r.month]} ${r.year}`.toLowerCase().includes(activeSearch.toLowerCase())) return false
    return true
  }
  const activeYears = [...new Set([...drafts, ...published].map(r => r.year))].sort((a, b) => b - a)
  // The query's own order (year/month desc = newest first) is the 'desc'
  // direction; Sort's "Oldest first" just reverses the already-filtered
  // list rather than re-querying.
  const applyActiveSort = list => activeSortDir === 'asc' ? [...list].reverse() : list
  const filteredDrafts = applyActiveSort(drafts.filter(matchesActiveFilters))
  const filteredPublished = applyActiveSort(published.filter(matchesActiveFilters))

  const years = [...new Set(archived.map(r => r.year))].sort((a, b) => b - a)
  const filteredArchived0 = archived.filter(r => {
    if (filterMonth && r.month !== Number(filterMonth)) return false
    if (filterYear && r.year !== Number(filterYear)) return false
    if (search && !`${MONTH_NAMES[r.month]} ${r.year}`.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })
  const filteredArchived = archiveSortDir === 'asc' ? [...filteredArchived0].reverse() : filteredArchived0

  const binYears = [...new Set(binned.map(r => r.year))].sort((a, b) => b - a)
  const filteredBinned0 = binned.filter(r => {
    if (binFilterMonth && r.month !== Number(binFilterMonth)) return false
    if (binFilterYear && r.year !== Number(binFilterYear)) return false
    if (binSearch && !`${MONTH_NAMES[r.month]} ${r.year}`.toLowerCase().includes(binSearch.toLowerCase())) return false
    return true
  })
  // binned is already newest-deleted-first; Bin's Sort axis is deletion
  // recency (matches its own "Deleted X · auto-deletes in Y days" meta),
  // not roster month/year like the Active/Archive tabs.
  const filteredBinned = binSortDir === 'asc' ? [...filteredBinned0].reverse() : filteredBinned0

  // The roster list reads best at the narrower md:max-w-2xl cap already
  // used throughout this tab; the Hours Summary table is a wide grid that
  // needs the full-width room RosterSummaryPage gives itself instead — so
  // the width constraint below wraps the Rosters view's content only, not
  // this whole page.
  return (
    <div className="mx-auto max-w-7xl">
      {/* outerTabs is length 1 for a locum (Hours Summary hidden) — nothing
          to switch between, so the row (and its Create-roster action, which
          only ever applies to the Rosters tab) doesn't render at all rather
          than showing a single dead tab. */}
      {outerTabs.length > 1 && (
        <div className="mx-auto mb-6 flex flex-wrap items-center justify-between gap-3 md:max-w-2xl">
          <PageTabs tabs={outerTabs} active={view} onChange={setView} ariaLabel="Rosters" />
          {isAdmin && view === 'rosters' && tab === 'active' && (
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              aria-label="Create roster"
              title="Create roster"
              className="btn-primary h-[42px] flex-shrink-0 justify-center whitespace-nowrap md:h-auto md:w-auto"
            >
              <PencilSparklesIcon className="h-4 w-4" />
              <span className="hidden md:inline">Create roster</span>
            </button>
          )}
        </div>
      )}

      {view === 'summary' ? (
        <RosterSummaryPage />
      ) : (
      <div className="mx-auto md:max-w-2xl">
        <PageTabs tabs={isAdmin ? TABS_ADMIN : TABS_DOCTOR} active={tab} onChange={setTab} ariaLabel="Roster status" size="sub" />

        <div className="mt-4">
          {actionError && (
            <div className="card mb-4 border-flagRed bg-flagRed-bg p-4">
              <p className="text-sm text-flagRed">{actionError}</p>
            </div>
          )}

          {tab === 'active' && (
          <>
            {((isAdmin && drafts.length > 0) || published.length > 0) && (
              <RosterToolbar
                search={activeSearch} onSearchChange={setActiveSearch}
                filterMonth={activeFilterMonth} onFilterMonthChange={setActiveFilterMonth}
                filterYear={activeFilterYear} onFilterYearChange={setActiveFilterYear}
                years={activeYears}
                sortDir={activeSortDir} onSortDirChange={setActiveSortDir}
              />
            )}
            {isAdmin && (
              <RosterSection
                title="Drafts"
                rosters={filteredDrafts}
                selected={draftSel}
                setSelected={setDraftSel}
                navigate={navigate}
                metaFn={r => `Created ${formatDate(r.created_at)}${r.carry_forward ? ' · carry-forward used' : ''}`}
                actions={[{ label: 'Move to Bin', onClick: (ids) => { moveToBin(ids); setDraftSel(new Set()) } }]}
                emptyText={drafts.length > 0 ? 'No drafts match these filters.' : undefined}
              />
            )}
            <RosterSection
              title="Published"
              rosters={filteredPublished}
              selected={pubSel}
              setSelected={setPubSel}
              navigate={navigate}
              metaFn={r => `Created ${formatDate(r.created_at)}${r.carry_forward ? ' · carry-forward used' : ''}`}
              actions={[{ label: 'Archive', onClick: (ids) => { archiveRosters(ids); setPubSel(new Set()) } }]}
              emptyText={published.length > 0 ? 'No published rosters match these filters.' : undefined}
            />
            {(!isAdmin || drafts.length === 0) && published.length === 0 && (
              <EmptyState isAdmin={isAdmin} onCreate={() => setShowCreateModal(true)} />
            )}
          </>
        )}

        {tab === 'archive' && (
          <>
            <RosterToolbar
              search={search} onSearchChange={setSearch}
              filterMonth={filterMonth} onFilterMonthChange={setFilterMonth}
              filterYear={filterYear} onFilterYearChange={setFilterYear}
              years={years}
              sortDir={archiveSortDir} onSortDirChange={setArchiveSortDir}
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
            <RosterToolbar
              search={binSearch} onSearchChange={setBinSearch}
              filterMonth={binFilterMonth} onFilterMonthChange={setBinFilterMonth}
              filterYear={binFilterYear} onFilterYearChange={setBinFilterYear}
              years={binYears}
              sortDir={binSortDir} onSortDirChange={setBinSortDir}
              sortLabels={{ asc: 'Oldest deleted first', desc: 'Newest deleted first' }}
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
      </div>
      )}

      {showCreateModal && (
        <CreateRosterModal
          onClose={() => setShowCreateModal(false)}
          onGenerate={() => { setShowCreateModal(false); navigate('/roster/generate') }}
          onBuild={() => { setShowCreateModal(false); navigate('/roster/build') }}
        />
      )}
    </div>
  )
}

// Search/Sort/Filter row shared by the Active, Archive, and Bin tabs — a
// thin wrapper around the shared Toolbar template (search/sort/filter/
// clear, collapsing to a mobile "Filters" sheet). Month and Year are two
// independent filter facets; Sort defaults to "Oldest first"/"Newest
// first" (the roster-month axis) but Bin can override the labels to
// describe its own deletion-recency axis instead.
function RosterToolbar({
  search, onSearchChange,
  filterMonth, onFilterMonthChange, filterYear, onFilterYearChange, years,
  sortDir, onSortDirChange,
  sortLabels = { asc: 'Oldest first', desc: 'Newest first' },
}) {
  return (
    <Toolbar
      searchValue={search}
      onSearchChange={onSearchChange}
      searchPlaceholder="Search by month or year…"
      sortFacets={[{
        key: 'sort', icon: <SortIcon className="h-4 w-4" />, label: 'Sort',
        value: sortDir, onChange: onSortDirChange,
        options: [{ value: 'desc', label: sortLabels.desc }, { value: 'asc', label: sortLabels.asc }],
        isActive: sortDir !== 'desc',
      }]}
      filterFacets={[
        {
          key: 'month', icon: <CalendarIcon className="h-4 w-4" />, label: 'Month',
          value: filterMonth, onChange: onFilterMonthChange,
          options: [{ value: '', label: 'All months' }, ...MONTH_NAMES.slice(1).map((name, i) => ({ value: String(i + 1), label: name }))],
          isActive: Boolean(filterMonth),
        },
        {
          key: 'year', icon: <CalendarIcon className="h-4 w-4" />, label: 'Year',
          value: filterYear, onChange: onFilterYearChange,
          options: [{ value: '', label: 'All years' }, ...years.map(y => ({ value: String(y), label: String(y) }))],
          isActive: Boolean(filterYear),
        },
      ]}
      active={Boolean(search) || Boolean(filterMonth) || Boolean(filterYear)}
      onClearAll={() => { onSearchChange(''); onFilterMonthChange(''); onFilterYearChange('') }}
    />
  )
}

function EmptyState({ isAdmin, onCreate }) {
  if (!isAdmin) {
    return (
      <ListEmptyState
        icon={<CalendarIcon className="h-10 w-10" />}
        message="No rosters yet. Check back once a roster has been published."
      />
    )
  }
  return (
    <ListEmptyState
      icon={<CalendarIcon className="h-10 w-10" />}
      message='No rosters yet. Click "Create roster" to create your first one.'
      actionLabel="Create roster"
      onAction={onCreate}
    />
  )
}

// Group header uses the shared SectionLabel for its text half; the
// "select all in this group" checkbox stays alongside it (not dropped)
// since bulk-selecting a whole group is a real, used feature here — see
// docs/design/layout-spec.md §6's carve-out for exactly this case. The
// header swaps to the bulk-action row (count + contextual actions) the
// moment anything's selected, in place of the plain label (§8) — each
// group (Drafts/Published/Archived/Bin) selects independently, so this
// stays a per-group inline swap rather than the page-level sticky
// BulkActionBar Staff uses, which assumes one list per tab, not two.
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
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            aria-label={`Select all in ${title}`}
            className="h-4 w-4 rounded border-slate-line accent-accent"
          />
          <SectionLabel count={rosters.length} className="mb-0">{title}</SectionLabel>
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
          <ListRowRecord
            key={roster.id}
            checked={selected.has(roster.id)}
            onToggleCheck={() => toggleOne(roster.id)}
            selectLabel={`Select ${MONTH_NAMES[roster.month]} ${roster.year}`}
            title={`${MONTH_NAMES[roster.month]} ${roster.year}`}
            subtitle={metaFn(roster)}
            statusTag={<Tag variant="status" tone={STATUS_TONE[roster.status]}>{STATUS_LABELS[roster.status]}</Tag>}
            onClick={() => navigate(`/roster/${roster.id}`)}
          />
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
function SortIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z" />
    </svg>
  )
}
