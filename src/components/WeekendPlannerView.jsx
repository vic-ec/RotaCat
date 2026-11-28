import { useEffect, useRef, useState } from 'react'
import { Copy, ClipboardPaste, Trash2, ScrollText } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { todayStr, addDays, monthBounds } from '../lib/dateRange'
import {
  nextWeekendSaturday, formatWeekendRange, weekendCoverageSummary, isProfileAssignedToWeekend,
} from '../lib/weekendPlanner'
import UndoToast from './UndoToast'
import WeekendPlannerChangeLogModal from './WeekendPlannerChangeLogModal'
import Modal from './Modal'
import LeaveRequestForm from './LeaveRequestForm'
import { useSwatch } from '../lib/useSwatch'
import { rosterTextSize, readRosterTextSize, storeRosterTextSize } from '../lib/rosterTextSize'
import {
  WEEKS_AHEAD, boundsAroundMonth, FILTERS_BASE, ADMIN_FILTERS, CLERK_FILTERS, MONTH_LABELS,
  quarterMonthsFrom, quarterLabel, weekendHealthScheme,
} from './weekendPlanner/viewHelpers'
import { useWeekendPlannerData } from './weekendPlanner/useWeekendPlannerData'
import { useWeekendMonthData } from './weekendPlanner/useWeekendMonthData'
import { useWeekendUndo } from './weekendPlanner/useWeekendUndo'
import { useWeekendEntryEdits } from './weekendPlanner/useWeekendEntryEdits'
import { useWeekendBulkActions } from './weekendPlanner/useWeekendBulkActions'
import WeekendRequestPanel from './weekendPlanner/WeekendRequestPanel'
import WeekendClipboardBar from './weekendPlanner/WeekendClipboardBar'
import WeekendMobileView from './weekendPlanner/WeekendMobileView'
import WeekendDesktopView from './weekendPlanner/WeekendDesktopView'
import WeekendCellEditor from './weekendPlanner/WeekendCellEditor'
import WeekendDetailSheet from './weekendPlanner/WeekendDetailSheet'
import WeekendPasteModal from './weekendPlanner/WeekendPasteModal'
import WeekendClearConfirmModal from './weekendPlanner/WeekendClearConfirmModal'
import WeekendExceptionsSheet from './weekendPlanner/WeekendExceptionsSheet'
import WeekendAddDoctorsSheet from './weekendPlanner/WeekendAddDoctorsSheet'
import WeekendRemoveDoctorSheet from './weekendPlanner/WeekendRemoveDoctorSheet'
import WeekendCardMenu from './weekendPlanner/WeekendCardMenu'

// The pieces this coordinator renders, and the data/saving hooks it
// wires together, live in ./weekendPlanner/.
// The Weekend Planner's grid + edit logic, factored out of WeekendPlannerPage
// so it can render both at its own /weekend route (unchanged nav entry) and
// nested inside the Leave page's "Planners" tab group — per the Planners-tabs
// restructure, without duplicating the assign/remove logic in two places.
// Callers own the page-level heading/locum-redirect; this is just the
// review-log button + rules + grid.
//
// Two genuinely different layouts share the same data/state below, not one
// layout stretched wider: mobile (lg:hidden) keeps the month-at-a-time card
// list from the earlier mobile-first redesign; desktop (hidden lg:block) is
// a weekend-first summary table + inspector, per a desktop UX review that
// flagged the previous desktop attempt (category-first columns, full-row
// parity tinting competing with warning states, an always-editable
// inspector) as fighting its own content instead of supporting it. Rows stay
// neutral/white; parity is a small labelled badge, not a background; a
// dedicated Status column ("Fully planned" / "N gaps") replaces the old
// inline pink pill; and the inspector defaults to a read-only summary with
// editing behind an explicit "Edit assignments" action. Still a fixed
// two-pane split (not drag-resizable) and still one month at a time — those
// scope cuts from the previous round stand.
// initialYear/initialMonth seed the starting viewYear/viewMonth instead of
// always defaulting to today — set when WeekendPlanner.jsx opens this from
// its year overview at a specific month, possibly outside today's default
// fetch window (a past/future year an admin navigated to); goToMonth widens
// the fetch on demand so browsing freely from there (in either direction,
// same as the year overview itself) doesn't run out of loaded months.
// onBackToYear,
// when present, renders a "← Overview" link back to that overview (matching
// MonthWorkspace.jsx's own back-link wording) — absent
// when this is reached directly (the standalone /weekend route, or a caller
// with no year overview of its own).
// initialFocusSaturday, when present, is a specific weekend (today or
// later, always within initialYear/initialMonth) to scroll to and open the
// add-doctor picker for on mount — the year overview's "Next weekend
// needing staff" panel hands this off via its "Plan now" button rather than
// this page computing its own "next open weekend" shortcut, since that
// panel now owns finding one across the whole year, not just this page's
// own rolling fetch window.
export default function WeekendPlannerView({ initialYear, initialMonth, onBackToYear, clipboard, setClipboard, initialFocusSaturday, initialFilter, onFilterChange } = {}) {
  const { isAdmin, isClerk, canSubmitLeave, profile } = useAuth()
  const [showChangeLog, setShowChangeLog] = useState(false)
  // Which weekend+group's add-doctor sheet is open — shared by the mobile
  // card's own Open pill/+ triggers and the desktop inspector's per-category
  // + trigger alike (both funnel through WeekendAddDoctorsSheet now, not two
  // separate edit mechanisms).
  const [openRolePicker, setOpenRolePicker] = useState(null) // { saturday, groupKey, replaceEntryId? } or null — replaceEntryId makes it a swap
  // Which weekend's table row is in edit mode (desktop): x / swap beside
  // each name and + Add under each category, on the row itself rather
  // than in the rail card.
  const [editingSaturday, setEditingSaturday] = useState(null)
  // The roster-style cell editor (DoctorDropdown): which weekend + category,
  // and which entry is being swapped/removed (null = adding).
  const [cellEditor, setCellEditor] = useState(null) // { saturday, groupKey, entryId } or null
  const [cellEditorSearch, setCellEditorSearch] = useState('')
  const swatch = useSwatch()
  // The same S/M/L text size the roster grid uses, stored under the same
  // key, so the two pages' pills read at one size.
  const [textSize, setTextSize] = useState(readRosterTextSize)
  useEffect(() => { storeRosterTextSize(textSize) }, [textSize])
  const { base: rosterBase } = rosterTextSize(textSize)
  const [removeSheetEntry, setRemoveSheetEntry] = useState(null) // { entry, saturday, groupLabel } or null
  const [cardMenuSaturday, setCardMenuSaturday] = useState(null) // which card's ⋮ menu is open, or null
  // Seeded from initialFilter — whatever the year overview's own Showing
  // picker was left on, so opening a month doesn't silently drop back to
  // this page's default. Absent (opened directly at /weekend, no scope
  // chosen yet), it falls back to that default: an admin's concern is the
  // whole roster, not their own rotation (they may not even be on it), so
  // they land on "All weekends" rather than sharing non-admins' "My
  // weekends", matching ADMIN_FILTERS leading with the same chip above.
  const [filter, setFilterState] = useState(initialFilter || (isAdmin || isClerk ? 'all' : 'mine'))
  // Every filter change is reported up, so going back to the year view
  // lands on the same scope this page was left on.
  function setFilter(next) {
    setFilterState(next)
    onFilterChange?.(next)
  }
  const [searchQuery, setSearchQuery] = useState('') // desktop-only: filter grid rows by assigned surname
  const [requestOpen, setRequestOpen] = useState(false) // the panel's "Request weekend off" form
  // The mobile "Next weekend" card can be dismissed for the visit; it comes
  // back on the next load, since the next weekend is still the next weekend.
  const [nextWeekendDismissed, setNextWeekendDismissed] = useState(false)
  const [selectedSaturday, setSelectedSaturday] = useState(null) // desktop-only: which row the inspector shows
  const [detailSaturday, setDetailSaturday] = useState(null) // mobile-only: which card's read-only quick-glance sheet is open
  const [exceptionsSaturday, setExceptionsSaturday] = useState(null) // which weekend's exception-requests sheet is open
  const today = todayStr()
  const [viewYear, setViewYear] = useState(() => initialYear ?? Number(today.slice(0, 4)))
  const [viewMonth, setViewMonth] = useState(() => initialMonth ?? Number(today.slice(5, 7)))

  // The Requests planner tab only exists for admins (approval queue) and
  // doctors (their own history) — matches the same condition LeavePlannerPage
  // uses to decide whether to render that tab at all, so "View requests"
  // never links somewhere that redirects the visitor elsewhere.
  const canViewRequests = isAdmin || canSubmitLeave

  // Same split WeekendPlanner.jsx's year overview uses: a staffing viewer
  // reads everyone's exceptions, a doctor only ever their own.
  const staffingRole = isAdmin || isClerk

  const filters = isAdmin ? ADMIN_FILTERS : isClerk ? CLERK_FILTERS : FILTERS_BASE

  // What's actually fetched — a window around whichever month is being
  // viewed, not the whole calendar (year view's own fetch, in
  // WeekendPlanner.jsx, already covers a full year on its own; duplicating
  // that here for every month visited would be wasteful). Starts as today
  // through WEEKS_AHEAD later by default (the common "just landed on
  // /weekend" case wants a planning runway, not history), widened to also
  // cover initialYear/initialMonth's whole month when that's seeded from
  // further away (the year overview's "Open month" action) — otherwise the
  // very month this opens on could itself be outside what's loaded.
  // Navigating further than this window, in either direction, re-centres it
  // on the newly-viewed month instead (goToMonth below) rather than it ever
  // growing without bound.
  const [fetchBounds, setFetchBounds] = useState(() => {
    const seededBounds = initialYear && initialMonth ? monthBounds(initialYear, initialMonth) : null
    const defaultThroughDate = addDays(today, WEEKS_AHEAD * 7)
    return {
      from: seededBounds && seededBounds.start < today ? seededBounds.start : today,
      through: seededBounds && seededBounds.end > defaultThroughDate ? seededBounds.end : defaultThroughDate,
    }
  })

  const { doctors, rotationsByDoctorId, entries, setEntries, myWeekendRequests, weekendExceptions, loading, error, setError, load } =
    useWeekendPlannerData({ fetchBounds, profile, staffingRole })
  const {
    byWeekend, doctorById, displayNames, assignableDoctors, activeDoctorIds, myRequestsBySaturday, myName,
    requestSaturday, fetchedSet, exceptionsBySaturday, excusedBySaturday, monthSaturdays, monthEntryCount,
    quarterEntryCount, monthStatusCounts,
  } = useWeekendMonthData({ fetchBounds, entries, doctors, myWeekendRequests, weekendExceptions, profile, today, viewYear, viewMonth })
  const { lastAction, toastVisible, setToastVisible, undoing, pushUndo, undoLastAction } = useWeekendUndo({ profile, setError, load })
  const { saving, setSaving, addEntries, removeEntry, deleteEntries, insertEntries } =
    useWeekendEntryEdits({ entries, setEntries, setError, profile, doctorById, rotationsByDoctorId, displayNames, pushUndo })

  // Free browsing in either direction, matching the year overview's own
  // unbounded prev/next — widens (re-centres, really) fetchBounds the
  // moment navigation lands on a month outside what's currently loaded, so
  // there's no artificial edge to hit the way the old fixed rolling window
  // had one. A month already inside fetchBounds is a no-op state update
  // (same object reference back), so stepping through already-loaded months
  // doesn't refetch on every click.
  function goToMonth(newYear, newMonth) {
    const target = monthBounds(newYear, newMonth)
    setFetchBounds(prev => (target.start >= prev.from && target.end <= prev.through) ? prev : boundsAroundMonth(newYear, newMonth))
    setViewYear(newYear)
    setViewMonth(newMonth)
  }

  const visibleSaturdays = monthSaturdays.filter(saturday => {
    const bySaturday = byWeekend.get(saturday)
    if (filter === 'needs-planning') return weekendCoverageSummary(bySaturday).openGroups.length > 0
    if (filter === 'mine') return isProfileAssignedToWeekend(bySaturday, profile?.id)
    // No longer offered as a choice (it went with the Filter pill), but a
    // link or a stored wshow from before can still arrive carrying it.
    if (filter === 'my-requests') return myRequestsBySaturday.has(saturday)
    return true
  })

  // The surname search (shared Toolbar, both breakpoints) narrows the
  // visible weekends further still (any doctor assigned to that weekend, in
  // any group), on top of whichever filter chip is active.
  const searchTerm = searchQuery.trim().toLowerCase()
  const searchedSaturdays = !searchTerm ? visibleSaturdays : visibleSaturdays.filter(saturday => {
    const bySaturday = byWeekend.get(saturday) || {}
    return Object.values(bySaturday).flat().some(e => doctorById.get(e.profile_id)?.surname?.toLowerCase().includes(searchTerm))
  })

  const nextWeekend = nextWeekendSaturday(today)
  const nextWeekendCoverage = weekendCoverageSummary(byWeekend.get(nextWeekend))
  const nextWeekendMine = isProfileAssignedToWeekend(byWeekend.get(nextWeekend), profile?.id)
  const nextWeekendScheme = weekendHealthScheme(nextWeekendCoverage)

  const cardRefs = useRef(new Map())
  // Seeded from initialFocusSaturday — set when this page is opened via the
  // year overview's "Next weekend needing staff" panel (WeekendYearOverview's
  // "Plan now" button), which already lands initialYear/initialMonth on the
  // right month, so the target card exists in the DOM by the time this
  // effect first runs. Lazy-initialized (not re-synced from the prop after
  // mount) since it's a one-shot hand-off, not persistent state.
  const [pendingFocusSaturday, setPendingFocusSaturday] = useState(() => initialFocusSaturday ?? null)
  useEffect(() => {
    if (!pendingFocusSaturday) return
    const node = cardRefs.current.get(pendingFocusSaturday)
    if (!node) return // month switch hasn't re-rendered this card yet — effect re-fires once searchedSaturdays changes
    // Optional call — jsdom (this app's test environment) doesn't implement
    // scrollIntoView at all, unlike every real browser.
    node.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
    const firstOpenGroup = weekendCoverageSummary(byWeekend.get(pendingFocusSaturday)).openGroups[0]
    if (firstOpenGroup) setOpenRolePicker({ saturday: pendingFocusSaturday, groupKey: firstOpenGroup })
    setPendingFocusSaturday(null)
    // searchedSaturdays is a deliberate extra dep, not read in the body —
    // it's what makes this effect re-fire once a month switch re-renders
    // the list, so it can catch the target card mounting.
  }, [pendingFocusSaturday, searchedSaturdays, byWeekend])

  // The inspector defaults to Next weekend when it's in view, so the most
  // urgent question is answered the moment the page loads — otherwise the
  // first visible row, and whatever the admin last clicked as long as it's
  // still in view after a filter/search/month change.
  const inspectorSaturday = (selectedSaturday && searchedSaturdays.includes(selectedSaturday))
    ? selectedSaturday
    : (searchedSaturdays.includes(nextWeekend) ? nextWeekend : searchedSaturdays[0]) ?? null

  // Doctors already placed SOMEWHERE this weekend (any group) — the DB's
  // unique(weekend_saturday, profile_id) means a doctor can only fill one
  // slot per weekend, so they're excluded from every group's picker once
  // placed, not just their own.
  function assignedDoctorIds(saturday) {
    const bySaturday = byWeekend.get(saturday)
    if (!bySaturday) return new Set()
    return new Set(Object.values(bySaturday).flat().map(e => e.profile_id))
  }

  const {
    pasteTarget, setPasteTarget, showClearMonthModal, setShowClearMonthModal, showClearQuarterModal,
    setShowClearQuarterModal, clearWeekendTarget, setClearWeekendTarget, copyWeekend, copyMonth, copyQuarter,
    openWeekendPaste, openMonthPaste, openQuarterPaste, handleConfirmPaste, handleConfirmClearMonth,
    handleConfirmClearQuarter, handleConfirmClearWeekend, pasteActions,
  } = useWeekendBulkActions({
    isAdmin, clipboard, setClipboard, byWeekend, monthSaturdays, fetchedSet, viewYear, viewMonth,
    selectedSaturday, searchedSaturdays, setSaving, deleteEntries, insertEntries, pushUndo,
  })

  // Weekend's page-level "More actions" kebab (PageActionsMenu) — the bulk
  // Copy/Clear month+quarter actions as one group, Review log as its own
  // group after a divider (previously a separate always-visible button on
  // both viewports; now this menu's one home instead of two entry points
  // to the same action). Shared by both viewports' own trigger instances.
  const weekendMenuItems = [
    { key: 'copy-month', icon: <Copy className="h-4 w-4" />, label: `Copy ${MONTH_LABELS[viewMonth - 1]} ${viewYear}`, disabled: monthEntryCount === 0, onClick: copyMonth },
    { key: 'copy-quarter', icon: <Copy className="h-4 w-4" />, label: `Copy ${quarterLabel(quarterMonthsFrom(viewYear, viewMonth))}`, disabled: quarterEntryCount === 0, onClick: copyQuarter },
    ...pasteActions.map(a => ({ key: a.key, icon: <ClipboardPaste className="h-4 w-4" />, label: a.label, disabled: a.disabled, onClick: a.onClick })),
    { key: 'clear-month', icon: <Trash2 className="h-4 w-4" />, label: `Clear ${MONTH_LABELS[viewMonth - 1]} ${viewYear}`, danger: true, disabled: monthEntryCount === 0, onClick: () => setShowClearMonthModal(true) },
    { key: 'clear-quarter', icon: <Trash2 className="h-4 w-4" />, label: `Clear ${quarterLabel(quarterMonthsFrom(viewYear, viewMonth))}`, danger: true, disabled: quarterEntryCount === 0, onClick: () => setShowClearQuarterModal(true) },
    'divider',
    { key: 'review-log', icon: <ScrollText className="h-4 w-4" />, label: 'Review log', onClick: () => setShowChangeLog(true) },
  ]

  const defaultFilter = isAdmin || isClerk ? 'all' : 'mine'

  // The request panel (see WeekendRequestPanel) — rendered by both layouts.
  function renderRequestPanel(id, className) {
    return (
      <WeekendRequestPanel
        id={id} className={className} viewYear={viewYear} viewMonth={viewMonth} goToMonth={goToMonth}
        setRequestOpen={setRequestOpen} filters={filters} filter={filter} setFilter={setFilter}
      />
    )
  }

  return (
    <div>
      {loading && <p className="mt-6 text-sm text-ink-muted">Loading…</p>}
      {error && <p className="mt-6 text-sm text-flagRed">{error}</p>}

      {!loading && !error && (
        <>
          {/* ── Copy/Paste/Clear (admin-only), shared across mobile+desktop rather
              than duplicated per viewport — Copy/Clear month/quarter act on
              whichever month (or quarter starting from it) is currently
              viewed, both reached through the "More actions" kebab
              (PageActionsMenu, shared by both viewports — see
              weekendMenuItems above). The clipboard pill (once non-null) stays
              visible across month navigation so it's always clear what's
              copied and what "Paste" would currently target. Per-weekend
              Copy/Paste live on each weekend row itself (mobile card header
              / desktop inspector) instead, since there's no single "current
              weekend" here to infer a target from. ── */}

          {isAdmin && clipboard && (
            <WeekendClipboardBar
              clipboard={clipboard} viewYear={viewYear} viewMonth={viewMonth}
              openMonthPaste={openMonthPaste} openQuarterPaste={openQuarterPaste} setClipboard={setClipboard}
            />
          )}

          {/* ── Mobile: month-at-a-time card list ── */}
          <WeekendMobileView
            onBackToYear={onBackToYear} monthStatusCounts={monthStatusCounts} renderRequestPanel={renderRequestPanel}
            searchQuery={searchQuery} setSearchQuery={setSearchQuery} filter={filter} setFilter={setFilter}
            filters={filters} defaultFilter={defaultFilter} isAdmin={isAdmin} weekendMenuItems={weekendMenuItems}
            pasteActions={pasteActions} nextWeekendDismissed={nextWeekendDismissed}
            setNextWeekendDismissed={setNextWeekendDismissed} monthSaturdays={monthSaturdays} nextWeekend={nextWeekend}
            nextWeekendScheme={nextWeekendScheme} nextWeekendCoverage={nextWeekendCoverage} nextWeekendMine={nextWeekendMine}
            searchedSaturdays={searchedSaturdays}
            card={{
              byWeekend, myRequestsBySaturday, clipboard, cardRefs, selectedSaturday, setSelectedSaturday,
              setDetailSaturday, monthSaturdays, myName, exceptionsBySaturday, setExceptionsSaturday, isAdmin,
              setCardMenuSaturday, doctorById, displayNames, setOpenRolePicker,
            }}
          />

          {/* ── Desktop: weekend-first summary table + inspector (see file-level comment for rationale) ── */}
          <WeekendDesktopView
            onBackToYear={onBackToYear} searchQuery={searchQuery} setSearchQuery={setSearchQuery}
            monthStatusCounts={monthStatusCounts} textSize={textSize} setTextSize={setTextSize} isAdmin={isAdmin}
            weekendMenuItems={weekendMenuItems} rosterBase={rosterBase} searchedSaturdays={searchedSaturdays}
            monthSaturdays={monthSaturdays} renderRequestPanel={renderRequestPanel} inspectorSaturday={inspectorSaturday}
            byWeekend={byWeekend} displayNames={displayNames} doctorById={doctorById}
            myRequestsBySaturday={myRequestsBySaturday} exceptionsBySaturday={exceptionsBySaturday} myName={myName}
            canViewRequests={canViewRequests} editingSaturday={editingSaturday} setEditingSaturday={setEditingSaturday}
            setClearWeekendTarget={setClearWeekendTarget} copyWeekend={copyWeekend} openWeekendPaste={openWeekendPaste}
            clipboard={clipboard}
            row={{
              byWeekend, monthSaturdays, inspectorSaturday, isAdmin, editingSaturday, setSelectedSaturday,
              exceptionsBySaturday, setExceptionsSaturday, doctorById, displayNames, swatch, saving,
              setCellEditorSearch, setCellEditor,
            }}
          />
        </>
      )}

      {requestOpen && (
        <Modal title="Request weekend off" onClose={() => setRequestOpen(false)} centered>
          <LeaveRequestForm onCancel={() => setRequestOpen(false)}
            initialLeaveType="weekend_exception"
            initialDateFrom={requestSaturday}
            initialDateTo={addDays(requestSaturday, 1)}
            onSubmitted={() => { setRequestOpen(false); load() }}
          />
        </Modal>
      )}

      {showChangeLog && <WeekendPlannerChangeLogModal onClose={() => setShowChangeLog(false)} onDataChanged={load} />}

      {exceptionsSaturday && (
        <WeekendExceptionsSheet
          saturday={exceptionsSaturday}
          exceptions={exceptionsBySaturday.get(exceptionsSaturday) || []}
          displayNames={displayNames}
          doctorById={doctorById}
          onClose={() => setExceptionsSaturday(null)}
        />
      )}

      {detailSaturday && (
        <WeekendDetailSheet
          saturday={detailSaturday}
          weekendIndex={monthSaturdays.indexOf(detailSaturday) + 1}
          bySaturday={byWeekend.get(detailSaturday) || {}}
          doctorById={doctorById}
          displayNames={displayNames}
          myRequest={myRequestsBySaturday.get(detailSaturday)}
          exceptions={exceptionsBySaturday.get(detailSaturday) || []}
          myRequestName={myName}
          onClose={() => setDetailSaturday(null)}
        />
      )}

      {cellEditor && (
        <WeekendCellEditor
          cellEditor={cellEditor} setCellEditor={setCellEditor} cellEditorSearch={cellEditorSearch}
          setCellEditorSearch={setCellEditorSearch} assignedDoctorIds={assignedDoctorIds} excusedBySaturday={excusedBySaturday}
          assignableDoctors={assignableDoctors} rotationsByDoctorId={rotationsByDoctorId} doctorById={doctorById}
          entries={entries} displayNames={displayNames} removeEntry={removeEntry} addEntries={addEntries}
        />
      )}

      {openRolePicker && (
        <WeekendAddDoctorsSheet
          saturday={openRolePicker.saturday}
          initialGroupKey={openRolePicker.groupKey}
          doctors={assignableDoctors}
          assignedIds={assignedDoctorIds(openRolePicker.saturday)}
          excusedIds={excusedBySaturday.get(openRolePicker.saturday)}
          rotationsByDoctorId={rotationsByDoctorId}
          swapping={openRolePicker.replaceEntryId ? (displayNames.get(entries.find(e => e.id === openRolePicker.replaceEntryId)?.profile_id) ?? 'doctor') : null}
          onAdd={async (groupKey, profileIds) => {
            const { saturday, replaceEntryId } = openRolePicker
            setOpenRolePicker(null)
            if (replaceEntryId) await removeEntry(replaceEntryId)
            addEntries(saturday, groupKey, profileIds)
          }}
          onRemove={openRolePicker.replaceEntryId ? () => { const id = openRolePicker.replaceEntryId; setOpenRolePicker(null); removeEntry(id) } : undefined}
          onClose={() => setOpenRolePicker(null)}
        />
      )}

      {removeSheetEntry && (
        <WeekendRemoveDoctorSheet
          entry={removeSheetEntry.entry}
          doctor={doctorById.get(removeSheetEntry.entry.profile_id)}
          saturday={removeSheetEntry.saturday}
          groupLabel={removeSheetEntry.groupLabel}
          onRemove={entryId => { removeEntry(entryId); setRemoveSheetEntry(null) }}
          onClose={() => setRemoveSheetEntry(null)}
        />
      )}

      {cardMenuSaturday && (
        <WeekendCardMenu
          saturday={cardMenuSaturday}
          hasClipboard={clipboard?.granularity === 'weekend'}
          isSourceCard={clipboard?.sourceSaturday === cardMenuSaturday}
          canCopy={weekendCoverageSummary(byWeekend.get(cardMenuSaturday)).filledGroups > 0}
          onCopy={() => { copyWeekend(cardMenuSaturday); setCardMenuSaturday(null) }}
          onPaste={() => { openWeekendPaste(cardMenuSaturday); setCardMenuSaturday(null) }}
          onClear={() => { setClearWeekendTarget(cardMenuSaturday); setCardMenuSaturday(null) }}
          onClose={() => setCardMenuSaturday(null)}
        />
      )}

      {pasteTarget && clipboard && (
        <WeekendPasteModal
          clipboard={clipboard}
          targetMonths={pasteTarget.months}
          targetLabel={pasteTarget.label}
          existingByWeekend={byWeekend}
          activeDoctorIds={activeDoctorIds}
          saving={saving}
          onConfirm={handleConfirmPaste}
          onClose={() => setPasteTarget(null)}
        />
      )}

      {showClearMonthModal && (
        <WeekendClearConfirmModal
          title={`Clear ${MONTH_LABELS[viewMonth - 1]} ${viewYear}?`}
          entryCount={monthEntryCount}
          saving={saving}
          onConfirm={handleConfirmClearMonth}
          onClose={() => setShowClearMonthModal(false)}
        />
      )}

      {showClearQuarterModal && (
        <WeekendClearConfirmModal
          title={`Clear ${quarterLabel(quarterMonthsFrom(viewYear, viewMonth))}?`}
          entryCount={quarterEntryCount}
          saving={saving}
          onConfirm={handleConfirmClearQuarter}
          onClose={() => setShowClearQuarterModal(false)}
        />
      )}

      {clearWeekendTarget && (
        <WeekendClearConfirmModal
          title={`Clear ${formatWeekendRange(clearWeekendTarget)}?`}
          entryCount={Object.values(byWeekend.get(clearWeekendTarget) || {}).flat().length}
          saving={saving}
          onConfirm={handleConfirmClearWeekend}
          onClose={() => setClearWeekendTarget(null)}
        />
      )}

      {/* Clears the mobile bottom nav — 54px of bar plus the home-indicator
          inset plus a gap, the same offset the FAB uses. From md up there is
          no bar, so it sits at the usual 16px. */}
      {toastVisible && lastAction && (
        <UndoToast label={lastAction.label} onUndo={undoLastAction} onDismiss={() => setToastVisible(false)} undoing={undoing} />
      )}
    </div>
  )
}
