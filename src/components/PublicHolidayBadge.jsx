import { useRef, useState } from 'react'
import { splitHolidayName } from '../lib/publicHolidays'
import { useDismissablePopover } from '../lib/useDismissablePopover'

// Compact "PH" marker for the roster grid's date column. The column is only
// 44px wide, so spelling the holiday's name out inline (as this used to
// do) wrapped it over five or six lines and stretched the row far taller
// than the shift cells beside it. The day now carries a small badge and the
// name is revealed on hover (desktop) or tap (mobile, where :hover never
// fires on its own).
//
// `children` turns the badge inside out: instead of a "PH" chip sitting
// beside what it marks, the rose box wraps the caller's own content. Doctor
// Lanes needs that — its day headers are one narrow column each, and a chip
// under the date made the public-holiday columns two lines taller than
// every other column in the row. Same popover either way; only the box
// around it changes.
export default function PublicHolidayBadge({ name, children }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useDismissablePopover(open, () => setOpen(false), ref)

  const { baseName, observed } = splitHolidayName(name)
  const label = baseName || 'Public holiday'
  const statusText = observed ? 'Observed public holiday' : 'Public holiday'

  const wraps = children != null

  return (
    <span ref={ref} className={`group relative ${wraps ? 'block' : 'inline-block'}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        // Only the chip takes an aria-label. On the wrapping variant the
        // caller's content is the date, and an aria-label here would
        // replace it — leaving a column header that announces the holiday
        // but not which day it falls on. The holiday goes in after it
        // instead.
        aria-label={wraps ? undefined : `${label} — ${statusText}`}
        className={`rounded bg-rose text-white transition-colors hover:bg-rose-dark focus:outline-none focus:ring-1 focus:ring-rose-dark ${
          wraps
            ? 'block w-full px-0.5 py-0.5'
            : 'flex h-5 w-5 items-center justify-center text-[10px] font-semibold leading-none'
        }`}
      >
        {children ?? 'PH'}
        {wraps && <span className="sr-only"> — {label}, {statusText}</span>}
      </button>
      {/* Opens to the right, over the Consultant column: the grid sits in an
          `overflow-x-auto` wrapper, so a tooltip dropping below a short row
          would be clipped by the scroll container instead of overhanging it. */}
      <span
        role="tooltip"
        className={`absolute left-full top-0 z-30 ml-1 w-max max-w-[160px] rounded border border-slate-line bg-canvas-raised px-1.5 py-1 text-left text-[10px] font-normal leading-tight text-ink shadow-md ${
          open ? 'block' : 'hidden group-hover:block'
        }`}
      >
        <span className="block font-semibold">{label}</span>
        <span className="block text-ink-muted">{statusText}</span>
      </span>
    </span>
  )
}
