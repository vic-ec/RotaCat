import { useRef, useState } from 'react'
import { splitHolidayName } from '../lib/publicHolidays'
import { useDismissablePopover } from '../lib/useDismissablePopover'

// Compact "PH" marker for the roster grid's date column. The column is only
// 44px wide, so spelling the holiday's name out inline (as this used to
// do) wrapped it over five or six lines and stretched the row far taller
// than the shift cells beside it. The day now carries a small badge and the
// name is revealed on hover (desktop) or tap (mobile, where :hover never
// fires on its own).
export default function PublicHolidayBadge({ name }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useDismissablePopover(open, () => setOpen(false), ref)

  const { baseName, observed } = splitHolidayName(name)
  const label = baseName || 'Public holiday'
  const statusText = observed ? 'Observed public holiday' : 'Public holiday'

  return (
    <span ref={ref} className="group relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label={`${label} — ${statusText}`}
        className="flex h-5 w-5 items-center justify-center rounded bg-rose text-[10px] font-semibold leading-none text-white transition-colors hover:bg-rose-dark focus:outline-none focus:ring-1 focus:ring-rose-dark"
      >
        PH
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
