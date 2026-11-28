import { useRef, useState } from 'react'
import { ChevronDown as ChevronDownIcon } from 'lucide-react'
import { useDismissablePopover } from '../../lib/useDismissablePopover'

// Plain expandable row (icon + title + chevron) used for the multi-field
// sections inside the single continuous form card — same expand/collapse
// behaviour as before, just without its own bordered card per section.
export default function SectionRow({ icon, title, subtitle, danger = false, defaultOpen = false, onClose, children }) {
  const [open, setOpen] = useState(defaultOpen)
  const rowRef = useRef(null)

  function close() {
    setOpen(false)
    onClose?.()
  }
  function toggle() {
    if (open) close()
    else setOpen(true)
  }

  useDismissablePopover(open, close, rowRef)
  return (
    <div ref={rowRef}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className={`flex w-full items-center gap-3 px-5 py-3 text-left transition-colors ${
          danger ? 'hover:bg-danger/15 active:bg-danger/15' : 'hover:bg-canvas-sunken active:bg-canvas-sunken'
        }`}
      >
        <span className={`flex-shrink-0 ${danger ? 'text-danger' : 'text-ink-light'}`}>{icon}</span>
        <span className="min-w-0 flex-1">
          <span className={`block text-sm font-medium ${danger ? 'text-danger' : 'text-ink'}`}>{title}</span>
          {subtitle && <span className="mt-0.5 block truncate text-xs text-ink-muted">{subtitle}</span>}
        </span>
        <span className="flex-shrink-0 rounded p-1 text-ink-muted">
          <ChevronDownIcon className={`h-4 w-4 transition-transform ${open ? '' : 'rotate-180'}`} />
        </span>
      </button>
      {/* The seam under the header takes the card's own border colour: a
          danger card is bordered in danger, and a slate hairline across it
          read as a stray teal line through an otherwise red panel. */}
      {open && <div className={`border-t px-5 py-5 ${danger ? 'border-danger/40' : 'border-slate-line'}`}>{children}</div>}
    </div>
  )
}
