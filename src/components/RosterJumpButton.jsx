import { ChevronLeft, ChevronRight, CircleDashed, TriangleAlert } from 'lucide-react'

// The roster toolbar's "⚠ 1 flagged ‹ ›" / "Locums 2/14 ‹ ›" control: the
// count is also the way to the slots it counts. The label jumps to the
// next one (the first, the first time); ‹ › step back and forward,
// wrapping round. Once you've jumped, the label shows where you are.
//
// Red for flagged slots, amber for locum placeholders — the same two roster
// colours the cells themselves use, so the button and what it finds match.
const TONES = {
  flagged: 'border-flagRed/50 bg-flagRed-bg text-flagRed',
  locum: 'border-flagAmber/50 bg-flagAmber-bg text-flagAmber-text',
}

export default function RosterJumpButton({ kind, count, position, onStep }) {
  const flagged = kind === 'flagged'
  const noun = flagged ? 'flagged' : (count === 1 ? 'locum' : 'locums')
  const where = position == null ? null : `${position + 1}/${count}`
  const label = where ? `${flagged ? 'Flagged' : 'Locums'} ${where}` : `${count} ${noun}`
  const what = flagged ? 'flagged slot' : 'locum placeholder'
  const Icon = flagged ? TriangleAlert : CircleDashed
  const step = 'hidden h-full items-center px-1.5 hover:opacity-75 active:opacity-60 2xl:flex'
  // On a phone the chip is just its icon and a number — the count, then
  // where you are ("3/28") — and a tap moves on to the next one, wrapping
  // round. The words and the ‹ › pair come back from 2xl, where the row has
  // the width for them.
  return (
    <div className={`inline-flex h-[30px] flex-shrink-0 items-center overflow-hidden rounded-lg border text-xs font-semibold ${TONES[kind]}`}>
      <button
        type="button"
        onClick={() => onStep('next')}
        aria-label={`Go to next ${what} (${count} in total)`}
        title={`${count} ${what}${count === 1 ? '' : 's'}`}
        className="flex h-full items-center gap-1 whitespace-nowrap px-2 tabular-nums hover:opacity-75 active:opacity-60 2xl:gap-1.5 2xl:px-2.5"
      >
        <Icon className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
        <span className="2xl:hidden">{where ?? count}</span>
        <span className="hidden 2xl:inline">{label}</span>
      </button>
      <span className="hidden h-full w-px bg-current opacity-30 2xl:block" aria-hidden="true" />
      <button type="button" onClick={() => onStep('prev')} aria-label={`Previous ${what}`} className={step}>
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <button type="button" onClick={() => onStep('next')} aria-label={`Next ${what}`} className={step}>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}
