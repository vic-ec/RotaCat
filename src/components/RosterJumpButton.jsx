import { ChevronLeft, ChevronRight, TriangleAlert } from 'lucide-react'

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
  const step = 'flex h-full items-center px-1.5 hover:opacity-75 active:opacity-60'
  return (
    <div className={`inline-flex h-[30px] flex-shrink-0 items-center overflow-hidden rounded-lg border text-xs font-semibold ${TONES[kind]}`}>
      <button
        type="button"
        onClick={() => onStep('next')}
        aria-label={`Go to next ${what} (${count} in total)`}
        className="flex h-full items-center gap-1.5 whitespace-nowrap px-2.5 tabular-nums hover:opacity-75 active:opacity-60"
      >
        {flagged && <TriangleAlert className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />}
        {label}
      </button>
      <span className="h-full w-px bg-current opacity-30" aria-hidden="true" />
      <button type="button" onClick={() => onStep('prev')} aria-label={`Previous ${what}`} className={step}>
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <button type="button" onClick={() => onStep('next')} aria-label={`Next ${what}`} className={step}>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}
