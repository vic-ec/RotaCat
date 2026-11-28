import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDismissablePopover } from '../lib/useDismissablePopover'
import { computeAnchoredPosition } from '../lib/popoverPosition'
import { ChevronDown as ChevronDownIcon } from 'lucide-react'

// Drop-in replacement for a plain <select> that opens the app's own styled
// popover list instead of the browser's native picker — a native <select>'s
// closed box can be restyled with CSS, but its open dropdown is always
// rendered by the OS (an iOS/Android action sheet, a native combo box on
// desktop), which is why Role/Category and friends used to look visually
// out of step with the rest of the app's custom quick-menu popovers.
//
// The option list is `fixed`-positioned (anchored to the trigger button's
// own rect, same math as every other popover in the app) rather than
// `absolute` inside the trigger — a plain absolute child gets clipped by
// any `overflow-hidden` ancestor (e.g. the rounded-card row groups on the
// Account page), which cut the list off before this fix. It's also
// rendered through a portal straight onto <body>, rather than in place in
// the component tree — `position: fixed` is only guaranteed to escape
// ancestor clipping/stacking as long as no ancestor establishes its own
// containing block (a `transform`, `filter`, etc. anywhere above it), and
// on Edge/Opera specifically this list was reported rendering clipped by
// a sibling row's edit panel in the Staff page's pending-approvals list
// — invisible in a full-page screenshot (which reflows/recomposites the
// whole page), but visible live. A portal sidesteps the question of what
// exactly in the ancestor chain triggered it, since <body> has no such
// ancestors to begin with.
//
// `searchable` adds a type-to-filter box at the top of the open list (long
// lists such as the doctor picker): it takes focus on open, every typed
// word must appear in the label, and Enter picks the first match.
//
// `options` is an array of `{ value, label }`. `onChange` receives the
// plain new value (not an event), matching how every caller here already
// treats these as plain string state, not native <select> change handlers.
export default function SelectMenu({ value, onChange, options, placeholder = 'Select…', disabled = false, className = '', triggerClassName = '', alwaysDown = false, id, ariaDescribedBy, showCodes = false, searchable = false, searchPlaceholder = 'Type to search…' }) {
  const [open, setOpen] = useState(false)
  const [anchorRect, setAnchorRect] = useState(null)
  const [query, setQuery] = useState('')
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  useDismissablePopover(open, () => setOpen(false), menuRef, [triggerRef])

  const selected = options.find(o => o.value === value)

  function toggle() {
    if (open) { setOpen(false); return }
    setAnchorRect(triggerRef.current.getBoundingClientRect())
    setQuery('')
    setOpen(true)
  }

  const words = searchable ? query.trim().toLowerCase().split(/\s+/).filter(Boolean) : []
  const visibleOptions = words.length
    ? options.filter(o => { const label = String(o.label).toLowerCase(); return words.every(w => label.includes(w)) })
    : options

  function choose(v) { onChange(v); setOpen(false) }

  const menuWidth = anchorRect ? Math.max(anchorRect.width, 160) : 160
  // 240 matches the popover's own max-h-60 — see computeAnchoredPosition's
  // maxHeight comment. Ignored automatically whenever forceDown/alwaysDown
  // is set, same as the anchor-position heuristic it refines.
  const positionStyle = anchorRect ? computeAnchoredPosition(anchorRect, menuWidth, { forceDown: alwaysDown, maxHeight: 240 }) : null

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-describedby={ariaDescribedBy}
        className={`input-field flex w-full items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60 ${triggerClassName}`}
      >
        <span className={`truncate ${selected ? 'text-ink' : 'text-ink-muted'}`}>{selected ? selected.label : placeholder}</span>
        <ChevronDownIcon className={`h-4 w-4 flex-shrink-0 text-ink-muted transition-transform ${open ? '' : 'rotate-180'}`} />
      </button>
      {open && positionStyle && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          style={{ ...positionStyle, width: menuWidth }}
          className="fixed z-50 max-h-60 overflow-y-auto rounded-lg border border-edge bg-canvas-raised py-1 shadow-raised"
        >
          {searchable && (
            <div className="sticky top-0 z-10 border-b border-edge bg-canvas-raised px-2 pb-2 pt-1">
              <input
                type="text"
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key !== 'Enter') return
                  e.preventDefault()
                  if (visibleOptions.length > 0) choose(visibleOptions[0].value)
                }}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                autoComplete="off"
                className="input-field w-full py-1.5 text-sm"
              />
            </div>
          )}
          {searchable && visibleOptions.length === 0 && (
            <p className="px-3 py-2 text-sm text-ink-muted">No match</p>
          )}
          {visibleOptions.map(opt => (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={opt.value === value}
              onClick={() => choose(opt.value)}
              className={`${showCodes ? 'flex items-baseline justify-between gap-3' : 'block'} w-full px-3 py-2 text-left text-sm transition-colors ${
                opt.value === value
                  ? 'bg-accent font-semibold text-on-fill hover:bg-accent-dark active:bg-accent-dark'
                  : 'text-ink hover:bg-canvas-sunken active:bg-canvas-sunken'
              }`}
            >
              {opt.label}
              {/* showCodes: an option's short code, set to the right. Hidden
                  from assistive tech — the option is still named by its label,
                  the code is a visual aid for learning the abbreviations. */}
              {showCodes && opt.code && (
                <span aria-hidden="true" className={`flex-shrink-0 text-xs font-semibold ${opt.value === value ? '' : 'text-ink-muted'}`}>{opt.code}</span>
              )}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}
