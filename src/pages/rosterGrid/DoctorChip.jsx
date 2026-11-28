import { AlarmClock, UserRoundPen } from 'lucide-react'
import RosterAbsenceNote from '../../components/RosterAbsenceNote'
import { OPEN_LOCUM_LABEL } from '../../lib/locumCover'
import { adjustedTimesLabel } from '../../lib/shiftTimes'
import { useSwatch } from '../../lib/useSwatch'
import { isUnfilled } from './rosterGridHelpers'

// ── DoctorChip ─────────────────────────────────────────────────────────────
// One assignment. The surface stays plain and the doctor's own colour sits
// on the left rail instead of filling the whole chip: at 39 approved
// doctors a grid of full fills reads as a quilt, and the fill was the only
// thing separating one day from the next. A 3px rail still lets someone
// find themselves at a glance, which was the one job the fill did well.
//
// The shift is not named here — the column heading above says which shift
// this is, so a code in the cell would be the third statement of it and is
// most of the width back.
//
// `absence` (see absenceFor): a doctor who is not working this shift. Either
// the doctor taken off it — their name sits struck through above whoever
// covers it, or above an "Open" slot when nobody does yet — or the doctor
// still on it who has approved leave over its date, whose own name is the
// one struck through. Tapping a struck name says why; while editing it is
// plain text, since a tap there already means "edit this shift".
// `onLate` (admins, outside Edit mode): the chip opens "Log late arrival".
// `late`: this shift has a late arrival on record — a small clock, shown to
// admins only (nobody else can read the records) and never printed.
export default function DoctorChip({ entry, profile, displayNames, onClick, onDragStart, isAdmin, canDrag = true, dimmed = false, glow = false, absence = null, onLate, late = false, onCancelLeave = null, editHint = null }) {
  // Before the early returns below — a hook can't sit behind one.
  const swatch = useSwatch()
  // A jumped-to chip glows for a moment (see jumpTo) in its own colour.
  // The spotlight on a jumped-to chip: a ring in the ink colour (near-black
  // on the light theme, near-white at night) with a gap inside it, so it
  // stands clear of the red and amber the chips themselves are drawn in.
  // `relative z-10` lifts the chip above its neighbours — the ring is a
  // shadow outside the chip's box, and the chip stacked just below was
  // painting over its bottom edge.
  const glowRing = glow ? 'relative z-10 ring-2 ring-ink ring-offset-2 ring-offset-canvas-raised' : ''
  const lateMark = late && (
    <AlarmClock data-testid="late-marker" aria-label="Late arrival recorded" className="ml-1 h-3 w-3 flex-shrink-0 text-ink-muted print:hidden" />
  )
  // A name changed by hand (covering someone, swapped, replaced, moved,
  // put back, new times) carries a small grey pen; it alone has a hint,
  // on hover or tap. Untouched names have none.
  // Its own tap target: a tap shows the hint and does not also open the
  // chip's menu or late-arrival prompt.
  // The whole chip carries the hint (hover, or a tap on a phone).
  const editMark = editHint && (
    <span data-testid="edit-marker" aria-hidden="true" className="ml-1 flex flex-shrink-0 items-center text-ink-muted print:hidden">
      <UserRoundPen className="h-3 w-3" />
    </span>
  )
  const editTitle = editHint || undefined
  const vacated = absence?.kind === 'vacated' ? absence : null
  const vacatedLine = vacated && (
    <div data-testid="vacated-doctor" className={`flex px-1.5 text-[0.834em] text-ink-muted ${dimmed ? 'opacity-30' : ''}`}>
      <RosterAbsenceNote name={vacated.shortName} summary={vacated.summary} interactive={!isAdmin} onCancelLeave={vacated.cancelRequest && onCancelLeave ? () => onCancelLeave(vacated.cancelRequest) : null} />
    </div>
  )

  // Vacated with no cover wanted: the struck-through name and nothing
  // else. While editing, the name itself is what opens the menu (to add
  // cover later, or put the doctor back).
  if (vacated?.noCover) {
    return (
      <div
        data-entry-id={entry.id}
        data-testid="no-cover"
        onClick={isAdmin ? onClick : undefined}
        className={`rounded-sm ${isAdmin ? 'cursor-pointer hover:bg-canvas-sunken' : ''} ${glowRing}`}
      >
        {vacatedLine}
      </div>
    )
  }

  // Vacated and not yet covered: the slot stays visible, and while editing
  // it is the thing to click to fill this same entry (so the struck name
  // stays with whoever ends up covering it).
  if (vacated?.open) {
    return (
      <>
        {vacatedLine}
        <div
          data-entry-id={entry.id}
          onClick={isAdmin ? onClick : undefined}
          className={`rounded border border-dashed border-flagAmber bg-flagAmber-bg px-1.5 py-0.5 text-[0.834em] font-medium text-flagAmber ${
            isAdmin ? 'cursor-pointer hover:opacity-80' : ''
          } ${dimmed ? 'opacity-30' : ''} ${glowRing}`}
        >
          {OPEN_LOCUM_LABEL}
        </div>
      </>
    )
  }

  // The scheduler's "[ ]" for a place it couldn't fill reads as what it is.
  // (A slot opened by taking a doctor off is drawn above, under their
  // struck-through name, so the name is never lost behind the flag.)
  if (entry.is_locum && isUnfilled(entry)) {
    return (
      <div
        data-entry-id={entry.id}
        onClick={isAdmin ? onClick : undefined}
        className={`rounded border border-dashed border-flagRed bg-canvas-raised px-1.5 py-0.5 text-center text-[0.834em] font-semibold text-flagRed ${
          isAdmin ? 'cursor-pointer hover:opacity-80' : ''
        } ${glowRing}`}
      >
        Unfilled
      </div>
    )
  }

  if (entry.is_locum) {
    return (
      <>
      {vacatedLine}
      <div
        data-entry-id={entry.id}
        onClick={isAdmin ? onClick : onLate}
        title={editTitle}
        className={`flex items-center rounded border border-dashed border-flagAmber bg-flagAmber-bg px-1.5 py-0.5 text-[0.834em] font-medium text-flagAmber ${
          isAdmin || onLate ? 'cursor-pointer hover:opacity-80' : ''
        } ${dimmed ? 'opacity-30' : ''} ${glowRing}`}
      >
        <span className="min-w-0 flex-1">{entry.locum_name || OPEN_LOCUM_LABEL}{adjustedTimesLabel(entry) && <span className="ml-1 font-normal" data-testid="adjusted-times">{adjustedTimesLabel(entry)}</span>}</span>
        {lateMark}
        {editMark}
      </div>
      </>
    )
  }

  if (!profile) return null

  const onLeave = absence?.kind === 'on_leave' ? absence : null
  const chipName = `${displayNames?.get(profile.id) ?? profile.surname}${entry.display_tag ? ` ${entry.display_tag}` : ''}`
  // Adjusted times sit after the name, lighter, so the hours read at a glance.
  const times = adjustedTimesLabel(entry)

  const railColor = profile.color_code || '#4A90D9'
  const draggableNow = isAdmin && canDrag

  return (
    <>
    {vacatedLine}
    <div
      data-entry-id={entry.id}
      draggable={draggableNow}
      onDragStart={draggableNow ? onDragStart : undefined}
      onClick={isAdmin ? onClick : onLate}
      className={`flex items-center rounded-sm border border-slate-line border-l-[3px] bg-canvas-raised px-1.5 py-0.5 text-[0.834em] font-medium ${onLeave ? 'text-ink-muted' : 'text-ink'} ${
        isAdmin || onLate ? 'cursor-pointer hover:bg-canvas-sunken' : ''
      } ${dimmed ? 'opacity-30' : ''} ${glowRing}`}
      style={{ borderLeftColor: swatch.stroke(railColor) }}
      title={editTitle}
    >
      {onLeave
        ? <RosterAbsenceNote name={chipName} summary={onLeave.summary} interactive={!isAdmin} onCancelLeave={onLeave.cancelRequest && onCancelLeave ? () => onCancelLeave(onLeave.cancelRequest) : null} />
        : <span className="min-w-0 flex-1 truncate">{chipName}{times && <span className="ml-1 font-normal text-ink-light" data-testid="adjusted-times">{times}</span>}</span>}
      {lateMark}
      {editMark}
    </div>
    {/* Still rostered over approved leave with nobody covering: say so, so
        the gap reads as one rather than as a struck name someone dealt with. */}
    {onLeave && (
      <span
        data-testid="no-cover-arranged"
        className={`mt-0.5 inline-block rounded-full bg-flagAmber-bg px-1.5 py-px text-[0.75em] font-semibold text-flagAmber ${dimmed ? 'opacity-30' : ''}`}
      >
        No cover arranged
      </span>
    )}
    </>
  )
}
