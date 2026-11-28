import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { BookUp, Pencil, Minimize2 } from 'lucide-react'
import FloatingActionMenu from '../components/FloatingActionMenu'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import RosterVacancyManager from '../components/RosterVacancyManager'
import { monthBounds } from '../lib/dateRange'
import * as rosterEdits from '../lib/rosterEdits'
import RosterEditBar, { EDIT_BAR_HEIGHT } from '../components/RosterEditBar'
import UndoToast from '../components/UndoToast'
import RosterChangeLogModal from '../components/RosterChangeLogModal'
import GenerationReportModal from '../components/GenerationReportModal'
import WeekendDriftDetailsModal from '../components/WeekendDriftDetailsModal'
import NewLocumModal from '../components/NewLocumModal'
import LateArrivalModal from '../components/LateArrivalModal'
import Modal from '../components/Modal'
import LeaveRequestForm from '../components/LeaveRequestForm'
import CancelLeaveModal from '../components/CancelLeaveModal'
import { useBack } from '../lib/backNav'
import RosterLanesView, { LanesLegend } from '../components/RosterLanesView'
import { rosterTextSize, rosterTextScale, readRosterTextSize, storeRosterTextSize } from '../lib/rosterTextSize'
import { useIsDesktop } from '../lib/useIsDesktop'
import { isUnfilled, MONTH_NAMES, driftStorageKey, isDriftMuted } from './rosterGrid/rosterGridHelpers'
import { useRosterMonthData } from './rosterGrid/useRosterMonthData'
import { useRosterAdminData } from './rosterGrid/useRosterAdminData'
import { useRosterEdits } from './rosterGrid/useRosterEdits'
import { useRosterPublishing } from './rosterGrid/useRosterPublishing'
import { useRosterFullscreen } from './rosterGrid/useRosterFullscreen'
import { useRosterDeepLinks } from './rosterGrid/useRosterDeepLinks'
import { useRosterCalendar } from './rosterGrid/useRosterCalendar'
import { useRosterLookups } from './rosterGrid/useRosterLookups'
import RosterHeaderBar from './rosterGrid/RosterHeaderBar'
import RosterRowsGrid from './rosterGrid/RosterRowsGrid'
import RosterShiftMenu from './rosterGrid/RosterShiftMenu'
import LatePromptSheet from './rosterGrid/LatePromptSheet'
import PublishConfirmDialog from './rosterGrid/PublishConfirmDialog'
import PlannerNoticeModal from './rosterGrid/PlannerNoticeModal'

// The roster month page. The pieces it renders, and the data, editing and
// navigation hooks it wires together, live in ./rosterGrid/.
export default function RosterGridPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isAdmin, isLocum, user } = useAuth()

  const {
    rosterMonth, entries, profiles, consultantProfiles, shiftTypes, shiftTypeRows, leaveByProfile, loading, error,
    publicHolidays, plannerDrift, plannerChangedSince, dismissedDrift, setDismissedDrift, advertisedIds,
    loadAll, refreshEntries, refreshLeave,
  } = useRosterMonthData({ id, isAdmin })
  // "Capture" on the edit bar: the Capture leave form, for this month.
  const [absenceOpen, setAbsenceOpen] = useState(false)
  // Leave being cancelled from the roster (the struck-through name's popup
  // or the shift menu): the request, in CancelLeaveModal's shape.
  const [cancelLeaveFor, setCancelLeaveFor] = useState(null)
  const { fullscreen, enterFullscreen, exitFullscreen } = useRosterFullscreen()
  const back = useBack()
  const [viewMode, setViewMode] = useState('month') // 'month' | 'week'
  const [layout, setLayout] = useState('rows')       // 'rows' | 'lanes'
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState(new Set())
  // "Show only" in the Filter: 'flagged' and/or 'locum'. Rows view dims
  // every cell holding neither; Lanes has no slots to show, so ticking one
  // switches to Rows.
  const [showOnly, setShowOnly] = useState(new Set())
  // Where the toolbar's jump buttons last landed: { kind, index }. The
  // entry being jumped to waits in pendingJumpId until the grid (Rows,
  // and the right week) has rendered it; glowEntryId lights it briefly.
  const [jump, setJump] = useState(null)
  // A day opened from My year (?date=…&mark=1) keeps a dark grey rail and
  // frame, distinct from today's accent, until another day is opened.
  const [markedDate, setMarkedDate] = useState(null)
  const [currentWeek, setCurrentWeek] = useState(0) // 0-indexed week
  const [showDriftDetails, setShowDriftDetails] = useState(false)

  // The one shift menu (see components/ShiftMenu.jsx): what was tapped and
  // where, so the md+ panel can sit beside the cell.
  const [menu, setMenu] = useState(null) // { date, shiftCode, entry, anchorRect }
  const [latePrompt, setLatePrompt] = useState(null) // the shiftOption tapped, before the form
  const [lateFor, setLateFor] = useState(null)       // the shiftOption the form is open for

  // Published-roster removal/reassignment workflow (§2.5) — set instead of
  // opening the plain dropdown whenever an occupied slot on a PUBLISHED
  // roster is clicked. RosterVacancyManager owns the recursive swap-conflict
  // chain from here; onDone() just closes it and reloads.
  const [activeVacancy, setActiveVacancy] = useState(null)
  const [newLocumFor, setNewLocumFor] = useState(null) // { date, shiftCode, entry, mode } a "New locum" is being added to

  // Review log (audit trail of manual edits to this roster)
  const [showChangeLog, setShowChangeLog] = useState(false)
  // The engine's report on the run that made this draft — opened straight
  // after a generation (?report=1, set by the Generate page) and again from
  // the ⋮ menu. Only offered while it still describes the draft on screen.
  const [showGenerationReport, setShowGenerationReport] = useState(false)

  // Publish confirmation — publishing is a visible, hard-to-miss state
  // change for every doctor on the roster, so it gets an explicit "are you
  // sure" rather than firing straight off the button click.
  const [showPublishConfirm, setShowPublishConfirm] = useState(false)
  // The edit gate: cells are read-only until an admin presses Edit, the
  // same gate the Weekend planner's month view has. Every cell change still
  // writes immediately once editing — the gate only stops a stray click on
  // a dense grid from reassigning someone. `?mode=edit` (the dashboard's
  // Edit action) opens the page already editing; `?publish=1` (its Publish
  // action) opens the publish confirmation straight away.
  const [searchParams, setSearchParams] = useSearchParams()
  const [editing, setEditing] = useState(searchParams.get('mode') === 'edit')
  // Roster text size (S/M/L), per device. The grids are the densest thing in
  // the app and 12px cell text does not suit every pair of eyes.
  const [textSize, setTextSize] = useState(readRosterTextSize)
  // Shown under the title when the month switch lands on a month with no
  // roster this viewer can open; cleared by the next successful switch.
  const [noRosterNote, setNoRosterNote] = useState('')
  const [showPlannerNotice, setShowPlannerNotice] = useState(false)
  // Set by Week view's stepper when it rolls back into the previous month:
  // that roster should open on its last week, which isn't known until it
  // has loaded.
  const openOnLastWeek = useRef(false)

  // The title's month switch. Looks the month's roster up (RLS decides
  // which ones this viewer may see — a doctor only gets published ones)
  // and opens it in place; a month without one says so and stays put.
  async function goToRosterMonth(year, month, week = 'first') {
    const { data } = await supabase.from('roster_months').select('id').eq('year', year).eq('month', month)
    const target = (data || [])[0]
    if (!target) {
      setNoRosterNote(`No roster for ${MONTH_NAMES[month]} ${year} yet.`)
      return
    }
    setNoRosterNote('')
    setJump(null)
    setCurrentWeek(0)
    openOnLastWeek.current = week === 'last'
    navigate(`/roster/${target.id}${editing ? '?mode=edit' : ''}`)
  }

  const { latestChanges, lateByEntryId, refreshLateArrivals, locumProfiles, locumContacts, refreshLocums } =
    useRosterAdminData({ id, isAdmin, rosterMonth, entries })
  const { calendarDays, weeks, visibleDays, entryMap } =
    useRosterCalendar({ rosterMonth, publicHolidays, viewMode, currentWeek, entries, shiftTypes })
  const { glowEntryId, setPendingJumpId } = useRosterDeepLinks({
    layout, setLayout, currentWeek, setCurrentWeek, viewMode, rosterMonth, loading, searchParams, setSearchParams,
    isAdmin, entries, weeks, shiftTypes, leaveByProfile, setMarkedDate, setEditing, setActiveVacancy, setMenu,
    setShowPublishConfirm, setShowGenerationReport, setShowChangeLog,
  })
  useEffect(() => { storeRosterTextSize(textSize) }, [textSize])
  const { base: rosterBase } = rosterTextSize(textSize)
  const rosterScale = rosterTextScale(textSize)
  // Below md the Consultant column folds into the date rail (see the grid),
  // so the column plan changes with the breakpoint, not just the CSS.
  const wideGrid = useIsDesktop(768)
  // The paper roster's Leave and Course columns, on a screen wide enough to
  // add them; narrower, the date rail says how many are away instead.
  const leaveCols = useIsDesktop(1024)
  // Under 400px (smaller phones) the bar is short of room once the status
  // icon and both jump chips are on it, so Fullscreen moves into the ⋮.
  const roomyBar = useIsDesktop(400)

  const weekCount = weeks.length
  useEffect(() => {
    if (!openOnLastWeek.current || weekCount === 0) return
    openOnLastWeek.current = false
    setCurrentWeek(weekCount - 1)
  }, [rosterMonth?.id, weekCount])

  const {
    profileMap, generationReport, assignableProfiles, displayNames, awayByDate, categoryOptions, chipFilterActive,
    filtersActive, matchesFilter, lanesProfiles, clearFilters, nameById, vacatedLeaveType, absenceFor, lateOptionFor,
  } = useRosterLookups({
    id, isAdmin, rosterMonth, entries, profiles, consultantProfiles, leaveByProfile, visibleDays, search,
    filterCategory, showOnly, setSearch, setFilterCategory, setShowOnly, locumProfiles, shiftTypeRows,
  })

  const canEdit = isAdmin && editing

  const {
    lastAction, toastVisible, setToastVisible, undoing, editNotice, pushUndo, runEdit, editArgs, assignCover,
    undoLastAction, handleDragStart, handleDrop, shiftTypeIdFor, nameOf,
  } = useRosterEdits({ id, user, entries, shiftTypes, nameById, refreshEntries, refreshLeave, refreshLocums })

  function handleCellClick(date, shiftCode, existingEntry, event = null) {
    if (!canEdit) return
    const anchorRect = event?.currentTarget?.getBoundingClientRect?.() ?? null
    setMenu({ date, shiftCode, entry: existingEntry || null, anchorRect })
  }

  const { publishing, handlePublish, handleUnpublish, handleDelete } =
    useRosterPublishing({ id, rosterMonth, entries, shiftTypes, loadAll, navigate, setShowPublishConfirm })

  function goToHoursSummary() {
    navigate(`/roster?view=summary&year=${rosterMonth.year}&month=${rosterMonth.month}`, {
      state: { fromRosterId: id, fromRosterLabel: `${MONTH_NAMES[rosterMonth.month]} ${rosterMonth.year}` },
    })
  }

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <p className="text-sm text-ink-muted">Loading roster…</p>
      </div>
    )
  }

  if (error || !rosterMonth) {
    return (
      <div className="mx-auto max-w-xl">
        <div className="card border-flagRed bg-flagRed-bg p-6 text-center">
          <p className="text-sm text-flagRed">{error || 'Roster not found.'}</p>
          <button onClick={() => navigate('/roster')} className="btn-secondary mt-4">
            Back to rosters
          </button>
        </div>
      </div>
    )
  }

  // A flagged entry is the scheduler's "[ ]" — a place it couldn't fill —
  // so it is counted once, as flagged, and not again as a locum
  // placeholder. Both lists run in roster order (date, then shift start),
  // which is the order the jump buttons step through them.
  const startOf = entry => Number((shiftTypes[entry.shift_type_id] || '').split('_')[1]) || 0
  const byRosterOrder = (a, b) => a.date.localeCompare(b.date) || startOf(a) - startOf(b)
  const flaggedEntries = entries.filter(isUnfilled).sort(byRosterOrder)
  const locumEntries = entries.filter(e => e.is_locum && !isUnfilled(e)).sort(byRosterOrder)
  const totalFlags = flaggedEntries.length
  const totalLocums = locumEntries.length

  function jumpTo(kind, direction) {
    const list = kind === 'flagged' ? flaggedEntries : locumEntries
    if (list.length === 0) return
    const current = jump?.kind === kind ? jump.index : -1
    const index = direction === 'prev'
      ? (current <= 0 ? list.length - 1 : current - 1)
      : (current + 1) % list.length
    const target = list[index]
    setJump({ kind, index })
    if (layout !== 'rows') setLayout('rows')
    if (viewMode === 'week') {
      const week = weeks.findIndex(w => w.some(d => d.dateStr === target.date))
      if (week >= 0) setCurrentWeek(week)
    }
    setPendingJumpId(target.id)
  }

  const showOnlyOptions = [
    totalFlags > 0 && { value: 'flagged', label: `Flagged slots (${totalFlags})` },
    totalLocums > 0 && { value: 'locum', label: `Locum placeholders (${totalLocums})` },
  ].filter(Boolean)
  const filterGroups = [
    showOnlyOptions.length > 0 && {
      key: 'showOnly', label: 'Show only',
      options: showOnlyOptions,
      selected: showOnly,
      onChange: next => {
        setShowOnly(next)
        if (next.size > 0 && layout !== 'rows') setLayout('rows')
      },
    },
    categoryOptions.length > 0 && {
      key: 'category', label: 'Category',
      options: categoryOptions,
      selected: filterCategory, onChange: setFilterCategory,
    },
  ].filter(Boolean)

  // Publish — always labelled, since it's the one action here with real
  // consequences. Opens a confirmation instead of publishing immediately.
  const showPublish = isAdmin && rosterMonth.status === 'draft'
  const publishButton = (
    <button
      onClick={() => setShowPublishConfirm(true)}
      disabled={publishing}
      className="btn-primary text-sm shadow-raised"
    >
      <BookUp className="h-4 w-4" />
      Publish
    </button>
  )

  return (
    <div className="mx-auto max-w-full">
      {/* Edit / Publish float at the bottom-right so they stay in reach
          however far the grid has been scrolled. On a phone they fold into
          the quick-actions ⊕ instead (Delete stays in the ⋮ menu). */}
      {/* Publish floats at the bottom-right (Edit is on the header bar). */}
      {isAdmin && showPublish && !fullscreen && (
          <div className="fixed bottom-6 right-6 z-30 hidden items-center gap-2 md:flex">
            {publishButton}
          </div>
      )}
      {fullscreen && (
        <button
          type="button"
          onClick={exitFullscreen}
          aria-label="Exit fullscreen"
          title="Exit fullscreen"
          data-testid="exit-fullscreen"
          className="btn-utility fixed right-2 top-[max(0.5rem,env(safe-area-inset-top))] z-[45] h-[34px] w-[34px] p-0 opacity-80 shadow-raised hover:opacity-100 print:hidden"
        >
          <Minimize2 className="h-4 w-4" />
        </button>
      )}
      {/* Phone quick-actions ⊕: Find (search + Filter) for everyone, plus
          Edit and Publish for admins — the same place Rotations and Team
          Leave keep their search. */}
      {!fullscreen && <FloatingActionMenu
        search={{ value: search, onChange: setSearch, placeholder: 'Search by surname…' }}
        filter={{ groups: filterGroups, active: filtersActive, onClearAll: clearFilters, sheetTitle: 'Filters' }}
        actions={isAdmin ? [
          // While the edit bar is showing, Done lives there, not here.
          !editing && { key: 'edit', icon: Pencil, label: 'Edit', active: false, onClick: () => setEditing(true) },
          showPublish && { key: 'publish', icon: BookUp, label: 'Publish', onClick: () => setShowPublishConfirm(true) },
        ] : undefined}
        raiseBy={canEdit ? EDIT_BAR_HEIGHT + 8 : 0}
      />}

      {canEdit && (
        <RosterEditBar
          canUndo={Boolean(lastAction) && lastAction.byUserId === user.id}
          undoing={undoing}
          onUndo={undoLastAction}
          onHistory={() => setShowChangeLog(true)}
          onDone={() => setEditing(false)}
          onAbsence={() => setAbsenceOpen(true)}
          notice={editNotice || null}
        />
      )}

      {cancelLeaveFor && (
        // The dialog reads and asks about the shifts the leave opened
        // itself (the same everywhere leave is cancelled).
        <CancelLeaveModal
          request={cancelLeaveFor}
          isOwn={false}
          onClose={() => setCancelLeaveFor(null)}
          onCancelled={() => { setCancelLeaveFor(null); refreshLeave(); refreshEntries() }}
        />
      )}

      {absenceOpen && rosterMonth && (
        <Modal title="Capture leave or absence" onClose={() => setAbsenceOpen(false)} centered>
          {/* Approved on the spot, like Team Leave's Capture leave. Stays
              open so several can be entered in one sitting from the paper
              roster; the grid's leave re-reads after each. */}
          <LeaveRequestForm onCancel={() => setAbsenceOpen(false)}
            captureOnly
            initialDateFrom={monthBounds(rosterMonth.year, rosterMonth.month).start}
            onSubmitted={refreshLeave}
          />
        </Modal>
      )}

      {canEdit && toastVisible && lastAction && lastAction.byUserId === user.id && (
        <UndoToast
          label={lastAction.label}
          onUndo={undoLastAction}
          onDismiss={() => setToastVisible(false)}
          undoing={undoing}
          align="left"
          bottomClassName="bottom-[calc(116px+env(safe-area-inset-bottom))] md:bottom-4"
        />
      )}

      {/* Publish confirmation */}
      {showPublishConfirm && (
        <PublishConfirmDialog setShowPublishConfirm={setShowPublishConfirm} handlePublish={handlePublish} />
      )}

      {/* Weekend Planner notice (§2.6) — the planner and this draft
          disagree. It used to be a block above the grid; it is now the
          amber chip in the bar (plannerChip), and this is what the chip
          opens. Two different facts, two different messages: only a
          planner edit made after generation is "updated"; otherwise the
          draft simply doesn't match the plan (the engine can't always
          honour it, and drafts get hand-edited). Regenerate is offered
          only when there is a newer plan to apply. */}
      {showPlannerNotice && plannerDrift.length > 0 && (
        <PlannerNoticeModal
          plannerChangedSince={plannerChangedSince} setShowPlannerNotice={setShowPlannerNotice} plannerDrift={plannerDrift}
          isAdmin={isAdmin} navigate={navigate} setShowDriftDetails={setShowDriftDetails}
        />
      )}

      {showDriftDetails && (
        <WeekendDriftDetailsModal
          drift={plannerDrift}
          plannerChanged={plannerChangedSince}
          profileMap={profileMap}
          driftMuted={isDriftMuted(id, plannerDrift)}
          onToggleMute={muted => {
            if (muted) {
              sessionStorage.setItem(driftStorageKey(id), JSON.stringify(plannerDrift))
              setDismissedDrift(true)
            } else {
              sessionStorage.removeItem(driftStorageKey(id))
            }
          }}
          onClose={() => setShowDriftDetails(false)}
        />
      )}

      {/* One floating bar holds the whole header — there is no title block
          above it. In order: ← back to Rosters, the month switch (which is
          also the page's heading, and in Week view steps weeks, rolling
          into the neighbouring month's roster at either end), the status
          pill and the planner chip · Find (search + Filter) · the flagged /
          locum jump chips · then, at the far right, Month/Week, Rows/Lanes,
          Aa, Hours, Log, ⋮.
          On a phone only ← · month · chips · ⋮ stay on the row: Month/Week
          and Rows/Lanes move into ⋮, Find into the ⊕, and the status shows
          as a dot on ⋮. Sticks to the top of the window (clear of an
          iPhone's notch) while the grid scrolls under it; z above the
          Lanes grid's own sticky header (z-30), below menus, sheets and
          modals (z-40+). */}
      {/* Close to the top: pulled up into the page's own top padding, and
          only a few pixels below the window edge once it sticks. */}
      {!fullscreen && (
        <RosterHeaderBar
          isAdmin={isAdmin} isLocum={isLocum} rosterMonth={rosterMonth} publishing={publishing}
          handleUnpublish={handleUnpublish} handleDelete={handleDelete} setShowGenerationReport={setShowGenerationReport}
          textSize={textSize} setTextSize={setTextSize} goToHoursSummary={goToHoursSummary}
          setShowChangeLog={setShowChangeLog} generationReport={generationReport} roomyBar={roomyBar}
          enterFullscreen={enterFullscreen} viewMode={viewMode} setViewMode={setViewMode} layout={layout}
          setLayout={setLayout} currentWeek={currentWeek} weeks={weeks} setCurrentWeek={setCurrentWeek}
          goToRosterMonth={goToRosterMonth} plannerDrift={plannerDrift} dismissedDrift={dismissedDrift}
          setShowPlannerNotice={setShowPlannerNotice} plannerChangedSince={plannerChangedSince} totalFlags={totalFlags}
          totalLocums={totalLocums} jump={jump} jumpTo={jumpTo} back={back} navigate={navigate} search={search}
          setSearch={setSearch} filterGroups={filterGroups} filtersActive={filtersActive} clearFilters={clearFilters}
          editing={editing} setEditing={setEditing}
        />
      )}
      {noRosterNote && (
        <p role="status" className="-mt-1 mb-3 text-sm text-ink-muted">{noRosterNote}</p>
      )}

      {layout === 'lanes' ? (
        <>
          <RosterLanesView
            textSize={textSize}
            days={visibleDays}
            profiles={lanesProfiles}
            entries={entries}
            shiftTypes={shiftTypes}
            displayNames={displayNames}
            entryMap={entryMap}
            leaveByProfile={leaveByProfile}
            padToWeek={viewMode === 'week'}
            lateEntryIds={lateByEntryId}
            onShiftClick={isAdmin && !canEdit ? entry => { const o = lateOptionFor(entry); if (o) setLatePrompt(o) } : undefined}
          />
          <LanesLegend textSize={textSize} />
        </>
      ) : (
      /* Grid — horizontally scrollable. Each day is its own bordered
         block on the page background: `border-separate` with a spacer row
         between days (6px, 14px before a Monday) rather than a divider
         line, so adjacent flag fills can never merge into one slab. The
         cells carry the block's border themselves (top and bottom on every
         cell, left on the rail, right on the last shift cell), which is
         what lets a short weekend row close its frame after three columns
         without a filler cell. Kept as a table so drag-and-drop, the cell
         picker and the fixed column plan all stay as they were.
         Full-bleed below md: the rail plus three shift columns is 385px,
         which only fits a 390px phone without the page's side padding. */
      <RosterRowsGrid
        rosterBase={rosterBase} wideGrid={wideGrid} leaveCols={leaveCols} rosterScale={rosterScale} visibleDays={visibleDays}
        row={{
          markedDate, awayByDate, id, entryMap, consultantProfiles, displayNames, canEdit, refreshEntries, showOnly,
          handleDrop, profileMap, chipFilterActive, matchesFilter, glowEntryId, absenceFor, isAdmin, setCancelLeaveFor,
          latestChanges, nameById, vacatedLeaveType, handleCellClick, lateOptionFor, setLatePrompt, lateByEntryId,
          handleDragStart, rosterMonth,
        }}
      />
      )}

      {/* The one shift menu — every tap on a name, slot or "+" while editing */}
      {menu && (
        <RosterShiftMenu
          menu={menu} setMenu={setMenu} rosterMonth={rosterMonth} entries={entries} assignableProfiles={assignableProfiles}
          shiftTypes={shiftTypes} leaveByProfile={leaveByProfile} displayNames={displayNames} locumProfiles={locumProfiles}
          locumContacts={locumContacts} user={user} nameOf={nameOf} advertisedIds={advertisedIds} shiftTypeRows={shiftTypeRows}
          setActiveVacancy={setActiveVacancy} assignCover={assignCover} runEdit={runEdit} editArgs={editArgs}
          refreshLocums={refreshLocums} refreshLeave={refreshLeave} shiftTypeIdFor={shiftTypeIdFor} calendarDays={calendarDays}
          id={id} absenceFor={absenceFor} setCancelLeaveFor={setCancelLeaveFor} setNewLocumFor={setNewLocumFor}
          lateOptionFor={lateOptionFor} lateByEntryId={lateByEntryId} setLateFor={setLateFor} profileMap={profileMap}
        />
      )}

      {/* A name tapped outside Edit mode (admins): one thing to do. */}
      {latePrompt && (
        <LatePromptSheet latePrompt={latePrompt} setLatePrompt={setLatePrompt} setLateFor={setLateFor} lateByEntryId={lateByEntryId} />
      )}
      {lateFor && (
        <LateArrivalModal option={lateFor} onClose={() => setLateFor(null)} onSaved={refreshLateArrivals} />
      )}

      {newLocumFor && (
        <NewLocumModal
          adminId={user.id}
          onDone={cover => {
            const { date, shiftCode, entry, mode } = newLocumFor
            setNewLocumFor(null)
            if (mode === 'replace') runEdit(() => rosterEdits.addCover({ ...editArgs(entry), mode, cover })).then(refreshLocums)
            else assignCover(cover, date, shiftCode, entry)
          }}
          onClose={() => setNewLocumFor(null)}
        />
      )}

      {/* Published-roster removal/reassignment workflow (§2.5) */}
      {activeVacancy && (
        <RosterVacancyManager
          key={activeVacancy.entryId}
          vacancy={activeVacancy}
          entries={entries}
          shiftTypes={shiftTypes}
          profiles={assignableProfiles}
          displayNames={displayNames}
          rosterMonthId={id}
          leaveByProfile={leaveByProfile}
          locums={locumProfiles}
          contacts={locumContacts}
          onDone={info => {
            setActiveVacancy(null)
            if (info?.summary) {
              const { cover, replacementName, vacancy } = info.summary
              const who = nameOf(vacancy.currentProfileId) || 'Doctor'
              const where = rosterEdits.shiftLabel(vacancy.date, vacancy.shiftCode)
              const description = cover === 'replace' ? `${who} replaced with ${replacementName} on ${where}`
                : cover === 'advertise' ? `${who} taken off ${where}; slot advertised`
                : cover === 'open' ? `${who} taken off ${where}; slot left open`
                : `${who} taken off ${where}, no cover`
              pushUndo({ batchId: info.batchId, description })
            }
            refreshEntries(); refreshLocums(); if (info?.leaveChanged) refreshLeave()
          }}
        />
      )}

      {showGenerationReport && generationReport && (
        <GenerationReportModal
          report={generationReport}
          monthLabel={`${MONTH_NAMES[rosterMonth.month]} ${rosterMonth.year}`}
          profileMap={profileMap}
          onClose={() => setShowGenerationReport(false)}
        />
      )}

      {showChangeLog && (
        <RosterChangeLogModal
          rosterMonthId={id}
          monthLabel={`${MONTH_NAMES[rosterMonth.month]} ${rosterMonth.year}`}
          onClose={() => setShowChangeLog(false)}
        />
      )}
    </div>
  )
}
