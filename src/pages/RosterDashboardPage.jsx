import { useEffect, useState, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, Pencil, BookUp, Plus, TriangleAlert } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import PageTabs from '../components/PageTabs'
import Toolbar from '../components/Toolbar'
import SectionLabel from '../components/SectionLabel'
import Tag from '../components/Tag'
import { ListRowRecord, ListEmptyState } from '../components/ListRow'
import CreateRosterModal from '../components/CreateRosterModal'
import GenerationRunsPanel from '../components/GenerationRunsPanel'
import FloatingActionMenu from '../components/FloatingActionMenu'
import RosterSummaryPage from './RosterSummaryPage'
import RowActionIcon from '../components/RowActionIcon'
import InfoPopover from '../components/InfoPopover'
import { fetchHoursFlags } from '../lib/rosterSummary'
import { syncWeekendPatternsFromEntries } from '../lib/weekendPatternSync'

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

// Tag's semantic status tones — see docs/design/layout-spec.md §9.
const MONTH_LABELS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
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
// component's contract for this one case. Only a phone's rows use it; the
// desktop table gives each date a column of its own.
function metaAsLine(meta) {
  return Array.isArray(meta) ? meta.join(' · ') : meta
}

// A Set of ids kept in sessionStorage under `key`. Takes a Set, not an
// updater function — every caller here already builds the next Set itself.
function useSessionSet(key) {
  const [value, setValue] = useState(() => {
    try { return new Set(JSON.parse(sessionStorage.getItem(key) || '[]')) } catch { return new Set() }
  })
  function set(next) {
    setValue(next)
    try { sessionStorage.setItem(key, JSON.stringify([...next])) } catch { /* ignore */ }
  }
  return [value, set]
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
  // Ticks survive a trip into a roster and back (sessionStorage) — one
  // stray click on a row used to cost the whole selection. They still
  // clear on a tab switch and when the browser tab closes.
  const [draftSel, setDraftSel] = useSessionSet('rotacat:rosterSel:draft')
  const [pubSel, setPubSel] = useSessionSet('rotacat:rosterSel:published')
  // roster id -> { over, under } doctor counts (see fetchHoursFlags).
  const [hoursFlags, setHoursFlags] = useState(() => new Map())
  const [archiveSel, setArchiveSel] = useSessionSet('rotacat:rosterSel:archive')
  const [binSel, setBinSel] = useSessionSet('rotacat:rosterSel:bin')
  const prevTab = useRef(tab)

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

  useEffect(() => {
    loadRosters()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loads on open, and again if admin rights resolve after (for the Flags)
  }, [isAdmin])

  useEffect(() => {
    // Only on a real tab switch — on mount the restored ticks are what we
    // want. Compared against the previous tab rather than a "has mounted"
    // flag, which React's development double-run of effects defeats.
    if (prevTab.current === tab) return
    prevTab.current = tab
    setDraftSel(new Set())
    setPubSel(new Set())
    setArchiveSel(new Set())
    setBinSel(new Set())
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the setters are stable in effect; this fires on a tab switch only
  }, [tab])

  // Once the lists are in, drop any restored tick whose roster has since
  // moved section or gone — a bulk action must never carry a stale id.
  useEffect(() => {
    if (loading) return
    const prune = (sel, setSel, list) => {
      const ids = new Set(list.map(r => r.id))
      const kept = [...sel].filter(id => ids.has(id))
      if (kept.length !== sel.size) setSel(new Set(kept))
    }
    prune(draftSel, setDraftSel, rosters.filter(r => r.status === 'draft' && !r.deleted_at))
    prune(pubSel, setPubSel, rosters.filter(r => r.status === 'published' && !r.deleted_at))
    prune(archiveSel, setArchiveSel, rosters.filter(r => r.status === 'archived' && !r.deleted_at))
    prune(binSel, setBinSel, rosters.filter(r => r.deleted_at))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the roster list (re)loads, not on every tick
  }, [rosters, loading])

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
    // Drafts too, for their own "Last updated" column.
    const publishedIds = data.filter(r => (r.status === 'published' || r.status === 'draft') && !r.deleted_at).map(r => r.id)
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
    // Hours warnings per roster (admins), read after the list is on screen.
    if (isAdmin) {
      fetchHoursFlags(data.filter(r => (r.status === 'published' || r.status === 'draft') && !r.deleted_at))
        .then(setHoursFlags).catch(() => {})
    }
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

  // Publish several drafts at once — the same two steps as the roster
  // page's own Publish, roster by roster in date order (the weekend
  // pattern each one leaves behind is what the next month continues from).
  const publishMany = (ids) => {
    const chosen = rosters.filter(r => ids.includes(r.id) && r.status === 'draft')
      .sort((a, b) => a.year - b.year || a.month - b.month)
    if (chosen.length === 0) return
    const names = chosen.map(r => `${MONTH_LABELS[r.month - 1]} ${r.year}`).join(', ')
    if (!window.confirm(`Publish ${chosen.length === 1 ? 'this roster' : `these ${chosen.length} rosters`}? ${names}. Every doctor will be able to see ${chosen.length === 1 ? 'it' : 'them'}.`)) return
    return runAction(async () => {
      const { data: types } = await supabase.from('shift_types').select('id, code')
      const codes = Object.fromEntries((types || []).map(t => [t.id, t.code]))
      for (const r of chosen) {
        const { error } = await supabase.from('roster_months')
          .update({ status: 'published', published_at: new Date().toISOString() }).eq('id', r.id)
        if (error) return { error }
        const { data: entries } = await supabase.from('roster_entries').select('*').eq('roster_month_id', r.id)
        await syncWeekendPatternsFromEntries((entries || []).map(e => ({ ...e, date: e.date?.slice(0, 10) })), codes)
      }
      return { error: null }
    })
  }

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

  // The same "edited since it was published" fact as publishedMetaFn's
  // second line, for the table's own Last updated column. Admins only, as
  // there; empty when nothing has changed since publishing.
  function publishedUpdatedCell(r) {
    const lastEdit = lastEditByRosterId[r.id]
    return isAdmin && lastEdit && lastEdit > r.published_at ? formatDateTime(lastEdit) : ''
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

      {/* The app's reading column (Dashboard, Staff → Requests), so the
          toolbar and the list share one width. */}
      <div className="mx-auto mt-4 md:max-w-2xl">
          {actionError && (
            <div className="card mb-4 border-flagRed bg-flagRed-bg p-4">
              <p className="text-sm text-flagRed">{actionError}</p>
            </div>
          )}

          {tab === 'active' && (
          <>
            {/* Runs still going, and runs that failed — the way back to a
                generation after leaving the Generate page. */}
            {isAdmin && <GenerationRunsPanel onRunFinished={loadRosters} />}
            {((isAdmin && drafts.length > 0) || published.length > 0) && (
              <div className="flex items-start gap-2">
                {/* Create leads the toolbar row, beside the search it sits
                    above the lists it adds to — not off in the page's top
                    corner away from everything it relates to. */}
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(true)}
                    aria-label="Create roster"
                    title="Create roster"
                    // A phone has the floating "+" for this already.
                    className="btn-primary hidden flex-shrink-0 justify-center whitespace-nowrap md:inline-flex"
                  >
                    <PencilSparklesIcon className="h-4 w-4" />
                    Create
                  </button>
                )}
                <div className="min-w-0 flex-1">
                  <RosterToolbar
                    search={activeSearch} onSearchChange={setActiveSearch}
                    filterMonth={activeFilterMonth} onFilterMonthChange={setActiveFilterMonth}
                    filterYear={activeFilterYear} onFilterYearChange={setActiveFilterYear}
                    years={activeYears}
                    sortDir={activeSortDir} onSortDirChange={setActiveSortDir}
                    onCreate={isAdmin ? () => setShowCreateModal(true) : undefined}
                  />
                </div>
              </div>
            )}
            {isAdmin && (
              <RosterSection
                title="Drafts"
                rosters={filteredDrafts}
                selected={draftSel}
                setSelected={setDraftSel}
                navigate={navigate}
                metaFn={r => `Created ${formatDate(r.created_at)}${r.carry_forward ? ' · carry-forward used' : ''}`}
                columns={[
                  { header: 'Created', width: 'w-24', cell: r => formatDate(r.created_at) },
                  { header: 'Last updated', width: 'w-36', cell: r => (lastEditByRosterId[r.id] ? formatDateTime(lastEditByRosterId[r.id]) : '') },
                ]}
                actions={[
                  { label: 'Publish', primary: true, onClick: (ids) => { publishMany(ids); setDraftSel(new Set()) } },
                  { label: 'Move to Bin', destructive: true, onClick: (ids) => { moveToBin(ids); setDraftSel(new Set()) } },
                ]}
                emptyText={drafts.length > 0 ? 'No drafts match these filters.' : undefined}
                isAdmin={isAdmin}
                flags={isAdmin ? hoursFlags : null}
              />
            )}
            <RosterSection
              title="Published"
              rosters={filteredPublished}
              selected={pubSel}
              setSelected={setPubSel}
              navigate={navigate}
              metaFn={publishedMetaFn}
              columns={[
                { header: 'Published', width: 'w-24', cell: r => formatDate(r.published_at || r.updated_at) },
                { header: 'Last updated', width: 'w-36', cell: publishedUpdatedCell },
              ]}
              actions={[{ label: 'Archive', onClick: (ids) => { archiveRosters(ids); setPubSel(new Set()) } }]}
              emptyText={published.length > 0 ? 'No published rosters match these filters.' : undefined}
              isAdmin={isAdmin}
              flags={isAdmin ? hoursFlags : null}
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
              columns={[
                { header: 'Archived', cell: r => formatDate(r.archived_at || r.updated_at) },
                { header: 'Published', cell: r => (r.published_at ? formatDate(r.published_at) : '') },
              ]}
              actions={[{ label: 'Unarchive', onClick: (ids) => { unarchiveRosters(ids); setArchiveSel(new Set()) } }]}
              emptyText="No archived rosters match these filters."
              isAdmin={isAdmin}
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
              columns={[
                { header: 'Deleted', cell: r => formatDate(r.deleted_at) },
                { header: 'Auto-deletes in', cell: r => `${daysRemaining(r.deleted_at)} day${daysRemaining(r.deleted_at) !== 1 ? 's' : ''}` },
              ]}
              actions={[
                { label: 'Restore', onClick: (ids) => { restoreFromBin(ids); setBinSel(new Set()) } },
                { label: 'Delete permanently', destructive: true, onClick: (ids) => { deletePermanently(ids); setBinSel(new Set()) } },
              ]}
              emptyText={binned.length === 0 ? 'Bin is empty.' : 'No deleted rosters match these filters.'}
              isAdmin={isAdmin}
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
  // Phone only: the Create roster action, nearest the ⊕. The desktop row
  // has its own Create button beside the search.
  onCreate,
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
          stretch
          searchValue={search}
          onSearchChange={onSearchChange}
          searchPlaceholder="Search by month or year…"
          sortFacets={sortFacets}
          filterGroups={filterGroups}
          mobileMode="inline"
          active={Boolean(search) || filtersActive}
          onClearAll={clearAll}
        />
      </div>
      {/* The Month/Year multi-selects move into the FAB's Filters sheet —
          the FAB has no inline row left to hang FilterPanel off. */}
      <FloatingActionMenu
        primaryAction={onCreate ? { icon: Plus, label: 'Create roster', onClick: onCreate } : undefined}
        search={{ value: search, onChange: onSearchChange, placeholder: 'Search by month or year…' }}
        sort={{ facets: sortFacets, active: sortDir !== 'desc' }}
        filter={{
          groups: filterGroups,
          active: Boolean(search) || filtersActive,
          onClearAll: clearAll,
          sheetTitle: 'Filters',
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
// stays a per-group inline swap rather than reusing Staff's `SelectAllRow`,
// which assumes one list per tab, not two.
//
// The list is two renderings of the same rows. On a desktop it is a table
// (the Staff list's own table styling): roster, status, the section's date
// columns, and the actions, each in a column of its own so a year of months
// reads down a line. `columns` supplies the date columns, since what is
// worth dating differs per section (created / published / archived /
// deleted). Every section passes exactly two, and the table's layout is
// fixed, so the Drafts and Published tables stacked on the Active tab line
// up column for column. On a phone there is no room for columns, and the
// rows stay the stacked ListRowRecord they were.
// `flags` (admins): roster id -> { over, under } hours warnings, shown as a
// warning icon in a Flags column that opens the counts and a link to that
// roster's Hours Summary, filtered to the flagged doctors.
function HoursFlag({ roster, flag }) {
  if (!flag) return null
  const name = `${MONTH_NAMES[roster.month]} ${roster.year}`
  const total = flag.over + flag.under
  const plural = (n, a, b) => (n === 1 ? a : b)
  return (
    <InfoPopover
      hover
      icon={<TriangleAlert className="h-4 w-4" />}
      title={`${total} ${plural(total, 'doctor', 'doctors')} outside contracted hours`}
      label={`Hours warnings for ${name}`}
      tone="danger"
    >
      <p className="font-semibold text-ink">{name}</p>
      <ul className="mt-1 space-y-0.5">
        {flag.over > 0 && <li>{flag.over} {plural(flag.over, 'doctor is', 'doctors are')} over contracted hours</li>}
        {flag.under > 0 && <li>{flag.under} {plural(flag.under, 'doctor is', 'doctors are')} under contracted hours</li>}
      </ul>
      <Link
        to={`/roster?view=summary&year=${roster.year}&month=${roster.month}&hours=flagged`}
        className="mt-2 inline-flex min-h-[44px] items-center font-medium text-accent hover:text-accent-dark md:min-h-0"
      >
        Open Hours Summary ›
      </Link>
    </InfoPopover>
  )
}

function RosterSection({ title, rosters, selected, setSelected, navigate, metaFn, actions, emptyText, isAdmin = false, columns = [], flags = null }) {
  // View / Edit / Publish for one roster — icon buttons on its row
  // (RowActionIcon), the same on every screen size.
  function rosterActions(roster) {
    const items = [
      { key: 'view', icon: <Eye className="h-4 w-4" />, label: 'View', onClick: () => navigate(`/roster/${roster.id}`) },
      { key: 'edit', icon: <Pencil className="h-4 w-4" />, label: 'Edit', onClick: () => navigate(`/roster/${roster.id}?mode=edit`) },
    ]
    if (roster.status === 'draft') items.push({ key: 'publish', icon: <BookUp className="h-4 w-4" />, label: 'Publish', onClick: () => navigate(`/roster/${roster.id}?mode=edit&publish=1`) })
    return items
  }

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
      {/* min-h reserves the bulk-action buttons' height, so ticking a box
          swaps the label row's content without pushing the cards down. */}
      {/* The left inset puts this tick box directly above the ones it
          governs. A phone's rows sit inside a bordered card (1px border +
          px-4 = 17px); the desktop table's cells pad by px-2.5 (1px + 10px
          = 11px). */}
      <div className="mb-2 flex min-h-[38px] flex-wrap items-center justify-between gap-2 pl-[17px] md:pl-[11px]">
        <label className="flex items-center gap-3">
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
                // A bulk action that bins or deletes is destructive and takes
                // the outlined red; Archive / Unarchive stay generic.
                className={`${action.destructive ? 'btn-danger-outline' : action.primary ? 'btn-primary' : 'btn-secondary'} px-3`}
              >
                {action.label} ({selected.size})
              </button>
            ))}
          </div>
        )}
      </div>
      <>
        <div className="card hidden overflow-x-auto md:block">
          <table className="w-full min-w-[600px] table-fixed border-collapse text-xs" aria-label={title}>
            <colgroup>
              <col className="w-9" />
              {/* Roster takes what is left, never less than a month's name. */}
              <col className="min-w-[8.5rem]" />
              <col className="w-24" />
              {columns.map(c => <col key={c.header} className={c.width || 'w-28'} />)}
              {flags && <col className="w-14" />}
              {isAdmin && <col className="w-24" />}
            </colgroup>
            <thead>
              <tr className="border-b border-slate-line bg-canvas-cool text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                <th className="px-2.5 py-2"><span className="sr-only">Select</span></th>
                <th className="px-2.5 py-2">Roster</th>
                <th className="px-2.5 py-2">Status</th>
                {columns.map(c => <th key={c.header} className="px-2.5 py-2">{c.header}</th>)}
                {flags && <th className="px-2.5 py-2">Flags</th>}
                {isAdmin && <th className="px-2.5 py-2 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {rosters.map(roster => {
                const name = `${MONTH_NAMES[roster.month]} ${roster.year}`
                return (
                  <tr
                    key={roster.id}
                    onClick={() => navigate(`/roster/${roster.id}`)}
                    title={`Open ${name}`}
                    className="cursor-pointer border-b border-slate-line transition-colors last:border-0 hover:bg-canvas-sunken active:bg-slate-line"
                  >
                    <td className="px-2.5 py-2.5" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(roster.id)}
                        onChange={() => toggleOne(roster.id)}
                        aria-label={`Select ${name}`}
                        className="block h-4 w-4 rounded border-slate-line accent-accent"
                      />
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-2.5 text-sm font-medium text-ink">{name}</td>
                    <td className="px-2.5 py-2.5">
                      <Tag variant="status" tone={STATUS_TONE[roster.status]}>{STATUS_LABELS[roster.status]}</Tag>
                    </td>
                    {columns.map(c => {
                      const value = c.cell(roster)
                      return (
                        <td key={c.header} className="truncate px-2.5 py-2.5 text-ink-light" title={value || undefined}>
                          {value || <span className="text-ink-muted">—</span>}
                        </td>
                      )
                    })}
                    {flags && (
                      <td className="px-1.5 py-1" onClick={e => e.stopPropagation()} data-testid="hours-flag-cell">
                        <HoursFlag roster={roster} flag={flags.get(roster.id)} />
                      </td>
                    )}
                    {isAdmin && (
                      <td className="px-2.5 py-2" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-0.5">
                          {rosterActions(roster).map(a => (
                            <RowActionIcon
                              key={a.key}
                              icon={a.icon}
                              title={a.label}
                              label={`${a.label} ${name}`}
                              onClick={a.onClick}
                              tone={a.key === 'publish' ? 'primary' : 'default'}
                            />
                          ))}
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="card divide-y divide-slate-line overflow-hidden md:hidden">
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
              actions={isAdmin ? [
                flags?.get(roster.id) && <span key="flag" onClick={e => e.stopPropagation()}><HoursFlag roster={roster} flag={flags.get(roster.id)} /></span>,
              ].filter(Boolean).concat(rosterActions(roster).map(a => (
                <RowActionIcon
                  key={a.key}
                  icon={a.icon}
                  title={a.label}
                  label={`${a.label} ${MONTH_NAMES[roster.month]} ${roster.year}`}
                  onClick={a.onClick}
                  tone={a.key === 'publish' ? 'primary' : 'default'}
                />
              ))) : undefined}
            />
          ))}
        </div>
      </>
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
