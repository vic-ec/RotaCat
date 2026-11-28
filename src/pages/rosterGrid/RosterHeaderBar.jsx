import {
  Undo, Trash2, ClipboardList, Type, ClipboardClock, ScrollText, Maximize2, CalendarRange, Rows3, RefreshCw,
  EllipsisVertical, ArrowLeft, Pencil,
} from 'lucide-react'
import DateStepper, { StepperShell } from '../../components/DateStepper'
import RosterStatusIcon from '../../components/RosterStatusIcon'
import Toolbar, { ToolbarFacet } from '../../components/Toolbar'
import RosterJumpButton from '../../components/RosterJumpButton'
import ViewToggle from '../../components/ViewToggle'
import PageActionsMenu from '../../components/PageActionsMenu'
import { ROSTER_TEXT_SIZES } from '../../lib/rosterTextSize'
import { ROSTER_LAYOUTS, ROSTER_RANGES, MONTH_NAMES } from './rosterGridHelpers'

// The roster's one floating header bar (see the comment where
// RosterGridPage renders it), with its More actions menus, status, planner
// chip and jump chips. Moved out of RosterGridPage as it was.
export default function RosterHeaderBar({
  isAdmin, isLocum, rosterMonth, publishing, handleUnpublish, handleDelete, setShowGenerationReport, textSize,
  setTextSize, goToHoursSummary, setShowChangeLog, generationReport, roomyBar, enterFullscreen, viewMode,
  setViewMode, layout, setLayout, currentWeek, weeks, setCurrentWeek, goToRosterMonth, plannerDrift,
  dismissedDrift, setShowPlannerNotice, plannerChangedSince, totalFlags, totalLocums, jump, jumpTo, back,
  navigate, search, setSearch, filterGroups, filtersActive, clearFilters, editing, setEditing,
}) {
  // The phone header's More actions sheet. Font size leads it — it is the
  // one entry that changes what you are looking at, and the one with no
  // desktop equivalent at this breakpoint — then the two places this page
  // links out to, then Undo Publish on its own behind a divider, since it
  // is the only entry that changes the roster itself.
  //
  // One row that opens its three sizes, not three rows: spelling them out
  // made the top half of the sheet a list of near-identical labels, none of
  // which is an action, and it buried the two that are.
  const unpublishItem = isAdmin && rosterMonth.status === 'published' ? {
    key: 'unpublish',
    icon: <Undo className="h-4 w-4" />,
    label: publishing ? 'Reverting…' : 'Undo Publish',
    danger: true,
    disabled: publishing,
    onClick: handleUnpublish,
  } : null

  const deleteItem = isAdmin ? {
    key: 'delete',
    icon: <Trash2 className="h-4 w-4" />,
    label: 'Delete roster',
    danger: true,
    onClick: handleDelete,
  } : null

  const generationReportItem = {
    key: 'generation-report',
    icon: <ClipboardList className="h-4 w-4" />,
    label: 'Generation report',
    onClick: () => setShowGenerationReport(true),
  }

  const rosterMenuItems = [
    {
      key: 'text-size',
      icon: <Type className="h-4 w-4" />,
      label: 'Font size',
      value: textSize,
      options: ROSTER_TEXT_SIZES.map(size => ({ key: size.key, label: size.name })),
      onSelect: setTextSize,
    },
    'divider',
    ...(isLocum ? [] : [{
      key: 'hours-summary',
      icon: <ClipboardClock className="h-4 w-4" />,
      label: 'Hours Summary',
      onClick: goToHoursSummary,
    }]),
    ...(isAdmin ? [{
      key: 'review-log',
      icon: <ScrollText className="h-4 w-4" />,
      label: 'Review log',
      onClick: () => setShowChangeLog(true),
    }] : []),
    ...(generationReport ? [generationReportItem] : []),
    ...(unpublishItem || deleteItem ? ['divider', ...[unpublishItem, deleteItem].filter(Boolean)] : []),
  ]

  // Wide desktop's kebab holds only what is risky to leave one click away;
  // between md and xl it also takes Hours and Log, which leave the row
  // there. (Font size stays on the row as "Aa" from md up.)
  const dangerItems = [unpublishItem, deleteItem].filter(Boolean)
  const desktopMenuItems = [
    ...(generationReport ? [generationReportItem] : []),
    ...(generationReport && dangerItems.length > 0 ? ['divider'] : []),
    ...dangerItems,
  ]
  const midMenuItems = rosterMenuItems.slice(2)
  // Below `desk` the ⋮ leads with the view switches the bar has no room for
  // there (Font size follows, from rosterMenuItems): how much of the month, and which way round it is drawn.
  const phoneMenuItems = [
    ...(roomyBar ? [] : [{ key: 'fullscreen', icon: <Maximize2 className="h-4 w-4" />, label: 'Fullscreen', onClick: enterFullscreen }]),
    {
      key: 'range', icon: <CalendarRange className="h-4 w-4" />, label: 'Show',
      value: viewMode, options: [{ key: 'month', label: 'Whole month' }, { key: 'week', label: 'One week' }],
      onSelect: setViewMode,
    },
    {
      key: 'layout', icon: <Rows3 className="h-4 w-4" />, label: 'Layout',
      value: layout, options: ROSTER_LAYOUTS.map(o => ({ key: o.key, label: o.label })),
      onSelect: setLayout,
    },
    ...rosterMenuItems,
  ]

  const statusLabel = rosterMonth.status.charAt(0).toUpperCase() + rosterMonth.status.slice(1)
  const statusPillTone = rosterMonth.status === 'published'
    ? 'bg-success-bg text-success ring-1 ring-inset ring-success/45'
    : 'bg-flagAmber-bg text-flagAmber ring-1 ring-inset ring-flagAmber/45'

  // Below lg there's no room for the status pill, so the status is an icon
  // right of the month: a dashed circle with a tick for a draft (amber, the
  // pill's colour), a solid one for a published roster (the pill's green).
  // Its title names it, on hover or a tap (HintLayer).
  const statusIcon = <RosterStatusIcon status={rosterMonth.status} className="h-[30px] w-[20px] lg:hidden" />

  // Week view's stepper. Inside the month it moves a week; off either end
  // it opens the neighbouring month's roster, at its first or last week.
  function stepWeek(delta) {
    const next = currentWeek + delta
    if (next >= 0 && next < weeks.length) { setCurrentWeek(next); return }
    const d = new Date(rosterMonth.year, rosterMonth.month - 1 + delta, 1)
    goToRosterMonth(d.getFullYear(), d.getMonth() + 1, delta < 0 ? 'last' : 'first')
  }

  // The planner notice, folded to a chip: amber, pulsing a few times when
  // it first appears so it isn't missed, and opening the full message.
  const plannerChip = plannerDrift.length > 0 && !dismissedDrift && (
    <button
      type="button"
      onClick={() => setShowPlannerNotice(true)}
      aria-label={plannerChangedSince ? 'Weekend Planner updated — view' : 'Draft differs from the Weekend Planner — view'}
      title={plannerChangedSince ? 'Weekend Planner updated' : 'Draft differs from the Weekend Planner'}
      className="inline-flex h-[30px] flex-shrink-0 animate-[pulse_1.2s_ease-in-out_3] items-center gap-1.5 rounded-lg border border-flagAmber/50 bg-flagAmber-bg px-2 text-xs font-semibold text-flagAmber-text"
    >
      <RefreshCw className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
    </button>
  )

  const weekView = viewMode === 'week'

  const jumpButtons = (totalFlags > 0 || totalLocums > 0) && (
    <div className="flex flex-shrink-0 items-center gap-1.5 sm:gap-2">
      {totalFlags > 0 && (
        <RosterJumpButton kind="flagged" count={totalFlags} position={jump?.kind === 'flagged' ? jump.index : null} onStep={dir => jumpTo('flagged', dir)} />
      )}
      {totalLocums > 0 && (
        <RosterJumpButton kind="locum" count={totalLocums} position={jump?.kind === 'locum' ? jump.index : null} onStep={dir => jumpTo('locum', dir)} />
      )}
    </div>
  )

  const kebabTrigger = (onClick, open) => (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-label="More actions"
      title="More actions"
      className="btn-utility h-[30px] w-[30px] flex-shrink-0 p-0"
    >
      <EllipsisVertical className="h-4 w-4" />
    </button>
  )

  return (
    <div className="sticky top-[max(0.25rem,env(safe-area-inset-top))] z-[35] -mx-3 -mt-2 mb-3 flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-line bg-canvas-raised/95 px-2 py-1.5 shadow-raised backdrop-blur sm:gap-2 md:mx-0 md:-mt-3 md:top-1.5 md:flex-nowrap">
    <button
      type="button"
      // The app's standard back: to wherever the roster was opened from
      // (the Dashboard, My year…), else the Rosters list.
      onClick={() => (back ? navigate(-1) : navigate('/roster'))}
      aria-label={`Back to ${back ? back.label : 'Rosters'}`}
      title={back ? back.label : 'Rosters'}
      className="btn-utility h-[30px] w-[30px] flex-shrink-0 p-0"
    >
      <ArrowLeft className="h-4 w-4" />
    </button>

    <h1 className="min-w-0 flex-1 md:flex-none">
      {weekView ? (
        <StepperShell
          centered
          label={(
            <>
              <span className="sm:hidden">Wk {currentWeek + 1}/{weeks.length} · {MONTH_NAMES[rosterMonth.month].slice(0, 3)}</span>
              <span className="hidden sm:inline">Week {currentWeek + 1} of {weeks.length} · {MONTH_NAMES[rosterMonth.month]} {rosterMonth.year}</span>
            </>
          )}
          onPrev={() => stepWeek(-1)}
          onNext={() => stepWeek(1)}
          prevLabel="Previous week"
          nextLabel="Next week"
        />
      ) : (
        <DateStepper unit="month" year={rosterMonth.year} month={rosterMonth.month} onChange={goToRosterMonth} showToday={false} centered compactBelowSm="lg" />
      )}
    </h1>

    {statusIcon}
    <span className={`hidden rounded-full px-2 py-0.5 text-xs font-medium lg:inline ${statusPillTone}`}>
      {statusLabel}
    </span>
    {/* Beside the status from md, where it belongs with "when and
        status"; on a phone it follows the jump chips (below). */}
    {plannerChip && <span className="hidden md:inline-flex">{plannerChip}</span>}

    <div className="hidden h-5 w-px flex-shrink-0 bg-slate-line md:block" aria-hidden="true" />

    {/* Find — on the row from md; in the ⊕ below it. */}
    <div className="hidden min-w-[150px] flex-1 md:block md:max-w-[340px] 2xl:min-w-[220px]">
      <div>
        <Toolbar
          className=""
          compact
          mobileMode="inline"
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search by surname…"
          filterGroups={filterGroups}
          active={filtersActive}
          onClearAll={clearFilters}
        />
      </div>
    </div>

    <div className="hidden h-5 w-px flex-shrink-0 bg-slate-line md:block" aria-hidden="true" />

    {jumpButtons}
    {plannerChip && <span className="inline-flex md:hidden">{plannerChip}</span>}

    <div className="flex flex-shrink-0 items-center gap-2 md:ml-auto">
      {/* The three view switches sit on the row only from `desk` (1440px), where
          there is width to spare; below it they live in ⋮, so the
          search box and Filter are never squeezed or pushed onto a
          second line. */}
      <div className="hidden desk:block">
        <ViewToggle view={viewMode} onChange={setViewMode} options={ROSTER_RANGES} tight />
      </div>
      <div className="hidden desk:block">
        <ViewToggle view={layout} onChange={setLayout} options={ROSTER_LAYOUTS} tight labelFrom="2xl" />
      </div>

      {/* Font size — "Aa" opening S/M/L, rather than four bare letters
          whose meaning wasn't obvious. */}
      <div className="hidden desk:block">
      <span title="Font size" className="inline-flex">
      <ToolbarFacet
        icon={<span className="text-sm font-semibold leading-none" aria-hidden="true">Aa</span>}
        label="Font size"
        compact
        value={textSize}
        onChange={setTextSize}
        options={ROSTER_TEXT_SIZES.map(size => ({ value: size.key, label: size.name }))}
      />
      </span>
      </div>

      {/* Hours Summary — every role except locum (matches Roster Hours
          Summary's own visibility rule). */}
      {!isLocum && (
        <button
          onClick={goToHoursSummary}
          aria-label="Hours Summary"
          title="Hours Summary"
          className="hidden btn-secondary text-sm 2xl:inline-flex"
        >
          <ClipboardClock className="h-4 w-4" />
          <span>Hours</span>
        </button>
      )}

      {isAdmin && (
        <button
          onClick={() => setShowChangeLog(true)}
          aria-label="Review log"
          title="Review log"
          className="hidden btn-secondary text-sm 2xl:inline-flex"
        >
          <ScrollText className="h-4 w-4" />
          <span>Log</span>
        </button>
      )}

      {/* Edit — on the bar from md (on a phone it is in the ⊕). */}
      {isAdmin && !editing && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-pressed={editing}
          className="hidden btn-secondary h-[30px] px-3 py-0 text-sm md:inline-flex"
        >
          <Pencil className="h-4 w-4" /> Edit
        </button>
      )}
      {roomyBar && <button
        type="button"
        onClick={enterFullscreen}
        aria-label="Fullscreen"
        title="Fullscreen"
        data-testid="enter-fullscreen"
        className="btn-utility h-[30px] w-[30px] flex-shrink-0 p-0"
      >
        <Maximize2 className="h-4 w-4" />
      </button>}

      {/* ⋮ — always last, holding whatever isn't on the row at this
          width. (The status sits right of the month: statusIcon.) */}
      <div className="relative desk:hidden">
        <PageActionsMenu items={phoneMenuItems} trigger={kebabTrigger} />
      </div>
      <div className="hidden desk:block 2xl:hidden"><PageActionsMenu items={midMenuItems} trigger={kebabTrigger} /></div>
      <div className="hidden 2xl:block"><PageActionsMenu items={desktopMenuItems} trigger={kebabTrigger} /></div>
    </div>
    </div>
  )
}
