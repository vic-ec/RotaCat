import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { List, LayoutGrid } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import PageTabs from '../components/PageTabs'
import Toolbar from '../components/Toolbar'
import SectionLabel from '../components/SectionLabel'
import Tag from '../components/Tag'
import { ListRowRecord, ListEmptyState } from '../components/ListRow'
import CreateRosterModal from '../components/CreateRosterModal'
import ViewToggle from '../components/ViewToggle'
import FloatingActionMenu from '../components/FloatingActionMenu'
import RosterSummaryPage from './RosterSummaryPage'

const ROSTER_VIEW_OPTIONS = [
  { key: 'list', label: 'List', icon: List },
  { key: 'grid', label: 'Grid', icon: LayoutGrid },
]

const ROSTER_VIEW_KEY = 'rotacat:rosterView'

// Reuses the exact same status tokens as the small Tag variant="status"
// pill below (STATUS_TONE/Tag.jsx's STATUS_TONE_CLASS) rather than picking
// new colors — draft's flagAmber-bg, published's success-bg, archived's
// canvas-sunken. Verified (real numbers, not eyeballed): text-ink clears
// 12-13:1 and text-ink-light clears 6.2-6.8:1 against all three at this
// larger full-card-wash size; text-ink-muted (the usual small-meta-text
// choice) only clears 4.0-4.3:1 — under 4.5:1 — so the card's meta line
// uses text-ink-light instead, not the smaller text's usual color.
const STATUS_CARD_BG = {
  draft:     'bg-flagAmber-bg',
  published: 'bg-success-bg',
  archived:  'bg-canvas-sunken',
}

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

function formatDateTime(value) {
  return new Date(value).toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function daysRemaining(deletedAt) {
  const elapsed = (Date.now() - new Date(deletedAt).getTime()) / 86400000
  return Math.max(0, Math.ceil(30 - elapsed))
}

// ListRowRecord's subtitle is a single truncating line (by design, for
// every other page that uses it) — join a multi-line meta (see
// publishedMetaFn) into one line rather than changing that shared
// component's contract for this one case. RosterCard (grid view, fully
// local to this file) renders the array as two real stacked lines instead.
function metaAsLine(meta) {
  return Array.isArray(meta) ? meta.join(' · ') : meta
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
  // Lazy-mounts RosterSummaryPage the first time the Hours Summary tab is
  // visited, then keeps it mounted (hidden via CSS, not unmounted) for the
  // rest of the session — switching tabs used to fully remount it every
  // time, silently discarding its own search/sort/filter state and
  // triggering a fresh data fetch even when nothing had changed. Its own
  // Refresh button (and a real month/year change) are the actual signals
  // for "pull fresh numbers" now, not "did I glance away and back."
  const [hasVisitedSummary, setHasVisitedSummary] = useState(view === 'summary')
  useEffect(() => { if (view === 'summary') setHasVisitedSummary(true) }, [view])
  const [rosters, setRosters] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  // roster_month_id -> most recent roster_entry_changes.changed_at, for
  // published rosters only — powers the Published/Updated meta line below
  // (see loadRosters). Never populated for non-admins if RLS restricts
  // read access to the audit log the same way it already restricts the
  // Review log modal in RosterGridPage.jsx — those rosters just always
  // read as "Published [date]" for that viewer, which degrades gracefully
  // rather than erroring.
  const [lastEditByRosterId, setLastEditByRosterId] = useState({})

  const [tab, setTab] = useState('active')
  const [draftSel, setDraftSel] = useState(new Set())
  const [pubSel, setPubSel] = useState(new Set())
  const [archiveSel, setArchiveSel] = useState(new Set())
  const [binSel, setBinSel] = useState(new Set())

  const [activeSearch, setActiveSearch] = useState('')
  const [activeFilterMonth, setActiveFilterMonth] = useState(new Set())
  const [activeFilterYear, setActiveFilterYear] = useState(new Set())
  const [activeSortDir, setActiveSortDir] = useState('desc')
  const [search, setSearch] = useState('')
  const [filterMonth, setFilterMonth] = useState(new Set())
  const [filterYear, setFilterYear] = useState(new Set())
  const [archiveSortDir, setArchiveSortDir] = useState('desc')
  const [binSearch, setBinSearch] = useState('')
  const [binFilterMonth, setBinFilterMonth] = useState(new Set())
  const [binFilterYear, setBinFilterYear] = useState(new Set())
  const [binSortDir, setBinSortDir] = useState('desc')
  const [showCreateModal, setShowCreateModal] = useState(false)
  // Shared across Active/Archive/Bin — switching once holds across tabs,
  // same as Toolbar's own search/sort/filter state being per-tab but this
  // display-mode choice being page-wide. Persisted so it survives a tab
  // switch, a page reload, and logout/login. Defaults to 'list' so nothing
  // changes for anyone until they switch it.
  const [rosterView, setRosterView] = useState(() => {
    try { return localStorage.getItem(ROSTER_VIEW_KEY) || 'list' } catch { return 'list' }
  })
  useEffect(() => {
    try { localStorage.setItem(ROSTER_VIEW_KEY, rosterView) } catch { /* ignore */ }
  }, [rosterView])

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
      setLoading(false)
      return
    }
    setRosters(data)

    // Published rosters only — a draft has no "was this edited after
    // going live" question to answer, and archived/bin keep their own
    // existing meta text untouched.
    const publishedIds = data.filter(r => r.status === 'published' && !r.deleted_at).map(r => r.id)
    if (publishedIds.length === 0) {
      setLastEditByRosterId({})
    } else {
      const { data: changes } = await supabase
        .from('roster_entry_changes')
        .select('roster_month_id, changed_at')
        .in('roster_month_id', publishedIds)
      const lastEdit = {}
      for (const c of changes || []) {
        if (!lastEdit[c.roster_month_id] || c.changed_at > lastEdit[c.roster_month_id]) {
          lastEdit[c.roster_month_id] = c.changed_at
        }
      }
      setLastEditByRosterId(lastEdit)
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
    if (activeFilterMonth.size > 0 && !activeFilterMonth.has(String(r.month))) return false
    if (activeFilterYear.size > 0 && !activeFilterYear.has(String(r.year))) return false
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

  // "Published [date]" by default — a published roster with no edits since
  // going live has nothing to say beyond when it was published. Once
  // roster_entry_changes shows an edit after publish, a doctor still only
  // ever sees "Published [date]" (the edit detail isn't surfaced to them),
  // but an admin sees both lines together — "Published [date]" AND
  // "Updated [date and time]" of the most recent edit — not one replacing
  // the other. Returns an array of lines when there's a second line to
  // show, a plain string otherwise; see metaAsLine below for the one
  // context (ListRowRecord's single-line subtitle) that can't render two
  // real lines and needs them joined instead.
  function publishedMetaFn(r) {
    const publishedLine = `Published ${formatDate(r.published_at || r.updated_at)}`
    const lastEdit = lastEditByRosterId[r.id]
    const editedSincePublish = Boolean(lastEdit) && lastEdit > r.published_at
    if (isAdmin && editedSincePublish) {
      return [publishedLine, `Updated ${formatDateTime(lastEdit)}`]
    }
    return publishedLine
  }

  const years = [...new Set(archived.map(r => r.year))].sort((a, b) => b - a)
  const filteredArchived0 = archived.filter(r => {
    if (filterMonth.size > 0 && !filterMonth.has(String(r.month))) return false
    if (filterYear.size > 0 && !filterYear.has(String(r.year))) return false
    if (search && !`${MONTH_NAMES[r.month]} ${r.year}`.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })
  const filteredArchived = archiveSortDir === 'asc' ? [...filteredArchived0].reverse() : filteredArchived0

  const binYears = [...new Set(binned.map(r => r.year))].sort((a, b) => b - a)
  const filteredBinned0 = binned.filter(r => {
    if (binFilterMonth.size > 0 && !binFilterMonth.has(String(r.month))) return false
    if (binFilterYear.size > 0 && !binFilterYear.has(String(r.year))) return false
    if (binSearch && !`${MONTH_NAMES[r.month]} ${r.year}`.toLowerCase().includes(binSearch.toLowerCase())) return false
    return true
  })
  // binned is already newest-deleted-first; Bin's Sort axis is deletion
  // recency (matches its own "Deleted X · auto-deletes in Y days" meta),
  // not roster month/year like the Active/Archive tabs.
  const filteredBinned = binSortDir === 'asc' ? [...filteredBinned0].reverse() : filteredBinned0

  // Header/sub-header (the tab rows) span the full page width, left-aligned
  // — only the search/sort/filter toolbar and the roster list panels
  // themselves read at the narrower, centered md:max-w-2xl width. The Hours
  // Summary table also needs the full-width room RosterSummaryPage gives
  // itself, so the width constraint below wraps the Rosters view's list
  // content only, not the tabs above it or this whole page.
  return (
    <div className="mx-auto max-w-7xl">
      {/* outerTabs is length 1 for a locum (Hours Summary hidden) — nothing
          to switch between, so the row (and its Create-roster action, which
          only ever applies to the Rosters tab) doesn't render at all rather
          than showing a single dead tab. */}
      {outerTabs.length > 1 && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
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

      {/* Mounted once (on first visit) and kept alive from then on — hidden
          via CSS rather than unmounted when switching away, so its data
          and search/sort/filter state survive tab switches instead of
          resetting every time. See hasVisitedSummary above. */}
      {hasVisitedSummary && (
        <div className={view === 'summary' ? '' : 'hidden'}>
          <RosterSummaryPage />
        </div>
      )}

      {view !== 'summary' && (
      <>
      <PageTabs tabs={isAdmin ? TABS_ADMIN : TABS_DOCTOR} active={tab} onChange={setTab} ariaLabel="Roster status" size="sub" />

      <div className="mx-auto mt-4 md:max-w-2xl">
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
                view={rosterView} onViewChange={setRosterView}
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
                view={rosterView}
              />
            )}
            <RosterSection
              title="Published"
              rosters={filteredPublished}
              selected={pubSel}
              setSelected={setPubSel}
              navigate={navigate}
              metaFn={publishedMetaFn}
              actions={[{ label: 'Archive', onClick: (ids) => { archiveRosters(ids); setPubSel(new Set()) } }]}
              emptyText={published.length > 0 ? 'No published rosters match these filters.' : undefined}
              view={rosterView}
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
              view={rosterView} onViewChange={setRosterView}
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
              view={rosterView}
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
              view={rosterView} onViewChange={setRosterView}
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
              view={rosterView}
            />
          </>
        )}
      </div>
      </>
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

// Search/Sort/Filter row shared by the Active, Archive, and Bin tabs. Month
// and Year are condensed into one Filter trigger (FilterPanel, the app's
// standard grouped multi-select popover — e.g. a doctor can filter to
// "March or April" in one go, rather than picking a single month at a
// time) instead of two separate single-select facet buttons. Sort defaults
// to "Oldest first"/"Newest first" (the roster-month axis) but Bin can
// override the labels to describe its own deletion-recency axis instead.
// Not built on the shared Toolbar template — Toolbar's filterFacets render
// one button per facet and can't be condensed into one, and its layout has
// no slot for an extra component like FilterPanel alongside it.
function RosterToolbar({
  search, onSearchChange,
  filterMonth, onFilterMonthChange, filterYear, onFilterYearChange, years,
  sortDir, onSortDirChange,
  sortLabels = { asc: 'Oldest first', desc: 'Newest first' },
  view, onViewChange,
}) {
  const filtersActive = filterMonth.size > 0 || filterYear.size > 0

  function clearAll() {
    onSearchChange('')
    onFilterMonthChange(new Set())
    onFilterYearChange(new Set())
  }

  const sortFacets = [{
    key: 'sort', icon: <SortIcon className="h-4 w-4" />, label: 'Sort',
    value: sortDir, onChange: onSortDirChange,
    options: [{ value: 'desc', label: sortLabels.desc }, { value: 'asc', label: sortLabels.asc }],
    isActive: sortDir !== 'desc',
  }]
  const filterGroups = [
    {
      key: 'month', label: 'Month',
      options: MONTH_NAMES.slice(1).map((name, i) => ({ value: String(i + 1), label: name })),
      selected: filterMonth, onChange: onFilterMonthChange,
    },
    {
      key: 'year', label: 'Year',
      options: years.map(y => ({ value: String(y), label: String(y) })),
      selected: filterYear, onChange: onFilterYearChange,
    },
  ]

  return (
    <>
      {/* Below `md` this whole row is replaced by the Toolbar FAB (§15);
          `md:` and up keeps the existing inline row untouched. */}
      <div className="hidden md:block">
        <Toolbar
          className="mb-4"
          searchValue={search}
          onSearchChange={onSearchChange}
          searchPlaceholder="Search by month or year…"
          sortFacets={sortFacets}
          filterGroups={filterGroups}
          mobileMode="inline"
          trailing={<ViewToggle view={view} onChange={onViewChange} options={ROSTER_VIEW_OPTIONS} />}
          active={Boolean(search) || filtersActive}
          onClearAll={clearAll}
        />
      </div>
      {/* The Month/Year multi-selects move into the FAB's Filters sheet —
          the FAB has no inline row left to hang FilterPanel off. List/Grid
          becomes a single cycling icon (see cycleView). */}
      <FloatingActionMenu
        search={{ value: search, onChange: onSearchChange, placeholder: 'Search by month or year…' }}
        sort={{ facets: sortFacets, active: sortDir !== 'desc' }}
        filter={{
          groups: filterGroups,
          active: Boolean(search) || filtersActive,
          onClearAll: clearAll,
          sheetTitle: 'Filters',
        }}
        cycleView={{
          value: view,
          onChange: onViewChange,
          options: ROSTER_VIEW_OPTIONS.map(o => ({ value: o.key, label: o.label, icon: o.icon })),
        }}
      />
    </>
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
// stays a per-group inline swap rather than the page-level `SelectAllRow`
// bulk actions Staff uses, which assume one list per tab, not two.
function RosterSection({ title, rosters, selected, setSelected, navigate, metaFn, actions, emptyText, view = 'list' }) {
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
      {view === 'grid' ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {rosters.map(roster => (
            <RosterCard
              key={roster.id}
              checked={selected.has(roster.id)}
              onToggleCheck={() => toggleOne(roster.id)}
              selectLabel={`Select ${MONTH_NAMES[roster.month]} ${roster.year}`}
              month={MONTH_NAMES[roster.month]}
              year={roster.year}
              meta={metaFn(roster)}
              status={roster.status}
              onClick={() => navigate(`/roster/${roster.id}`)}
            />
          ))}
        </div>
      ) : (
        <div className="card divide-y divide-slate-line overflow-hidden">
          {rosters.map(roster => (
            <ListRowRecord
              key={roster.id}
              checked={selected.has(roster.id)}
              onToggleCheck={() => toggleOne(roster.id)}
              selectLabel={`Select ${MONTH_NAMES[roster.month]} ${roster.year}`}
              title={`${MONTH_NAMES[roster.month]} ${roster.year}`}
              subtitle={metaAsLine(metaFn(roster))}
              statusTag={<Tag variant="status" tone={STATUS_TONE[roster.status]}>{STATUS_LABELS[roster.status]}</Tag>}
              onClick={() => navigate(`/roster/${roster.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// Status-tinted card for the grid view — checkbox top-left (bulk-select
// works identically to list view, same selected/toggleOne wiring from
// RosterSection above), Month+Year bold and centered in the space above
// the meta line, meta text (whatever RosterSection's own metaFn produces
// for this tab — "Created …", "Archived …", "Deleted … auto-deletes …",
// or Published's own array-of-lines, rendered here as two real stacked
// lines rather than metaAsLine's joined single line) in small text at the
// bottom. Sized to MonthCard's own scale (AnnualPlannerOverview.jsx) —
// same p-3 padding — rather than a forced 1:1 square: MonthCard has no
// single fixed height either (its own content, a title/summary/day-grid,
// drives it), so min-h-36 here is a same-scale estimate for this card's
// checkbox+month/year+meta content, not a literal copy of one pixel
// value. Worth a live look in case it reads cramped or too tall — nothing
// here forces it to stay at that height if that turns out wrong.
function RosterCard({ checked, onToggleCheck, selectLabel, month, year, meta, status, onClick }) {
  const metaLines = Array.isArray(meta) ? meta : [meta]
  return (
    <div
      onClick={onClick}
      className={`flex min-h-36 cursor-pointer flex-col rounded-lg p-3 transition-colors hover:brightness-95 active:brightness-95 ${STATUS_CARD_BG[status] || STATUS_CARD_BG.archived}`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggleCheck}
        onClick={e => e.stopPropagation()}
        aria-label={selectLabel}
        className="h-4 w-4 flex-shrink-0 rounded border-slate-line accent-accent"
      />
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <p className="truncate font-display text-lg font-bold leading-tight text-ink">{month}</p>
        <p className="font-display text-lg font-bold leading-tight text-ink">{year}</p>
      </div>
      <div className="min-w-0">
        {metaLines.map((line, i) => (
          <p key={i} className="truncate text-xs text-ink-light">{line}</p>
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
