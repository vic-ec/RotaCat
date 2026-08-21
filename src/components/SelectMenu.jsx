import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDismissablePopover } from '../lib/useDismissablePopover'
import { computeAnchoredPosition } from '../lib/popoverPosition'

function ChevronDownIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
    </svg>
  )
}

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
// `options` is an array of `{ value, label }`. `onChange` receives the
// plain new value (not an event), matching how every caller here already
// treats these as plain string state, not native <select> change handlers.
export default function SelectMenu({ value, onChange, options, placeholder = 'Select…', disabled = false, className = '', alwaysDown = false, id, ariaDescribedBy }) {
  const [open, setOpen] = useState(false)
  const [anchorRect, setAnchorRect] = useState(null)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  useDismissablePopover(open, () => setOpen(false), menuRef, [triggerRef])

  const selected = options.find(o => o.value === value)

  function toggle() {
    if (open) { setOpen(false); return }
    setAnchorRect(triggerRef.current.getBoundingClientRect())
    setOpen(true)
  }

  const menuWidth = anchorRect ? Math.max(anchorRect.width, 160) : 160
  const positionStyle = anchorRect ? computeAnchoredPosition(anchorRect, menuWidth, { forceDown: alwaysDown }) : null

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
        className="input-field flex w-full items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className={`truncate ${selected ? 'text-ink' : 'text-ink-muted'}`}>{selected ? selected.label : placeholder}</span>
        <ChevronDownIcon className={`h-4 w-4 flex-shrink-0 text-ink-muted transition-transform ${open ? '' : 'rotate-180'}`} />
      </button>
      {open && positionStyle && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          style={{ ...positionStyle, width: menuWidth }}
          className="fixed z-50 max-h-60 overflow-y-auto rounded-lg border border-slate-line bg-canvas-raised py-1 shadow-raised"
        >
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={opt.value === value}
              onClick={() => { onChange(opt.value); setOpen(false) }}
              className={`block w-full px-3 py-2 text-left text-sm transition-colors ${
                opt.value === value
                  ? 'bg-accent font-semibold text-white hover:bg-accent-dark active:bg-accent-dark'
                  : 'text-ink hover:bg-canvas-sunken active:bg-canvas-sunken'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}
