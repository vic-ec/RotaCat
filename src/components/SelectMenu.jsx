import { useRef, useState } from 'react'
import { useDismissablePopover } from '../lib/useDismissablePopover'

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
// `options` is an array of `{ value, label }`. `onChange` receives the
// plain new value (not an event), matching how every caller here already
// treats these as plain string state, not native <select> change handlers.
export default function SelectMenu({ value, onChange, options, placeholder = 'Select…', disabled = false, className = '' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useDismissablePopover(open, () => setOpen(false), ref)

  const selected = options.find(o => o.value === value)

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="input-field flex w-full items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className={`truncate ${selected ? 'text-ink' : 'text-ink-muted'}`}>{selected ? selected.label : placeholder}</span>
        <ChevronDownIcon className={`h-4 w-4 flex-shrink-0 text-ink-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-line bg-canvas-raised py-1 shadow-raised"
        >
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={opt.value === value}
              onClick={() => { onChange(opt.value); setOpen(false) }}
              className={`block w-full px-3 py-2 text-left text-sm hover:bg-canvas-sunken ${
                opt.value === value ? 'font-semibold text-accent' : 'text-ink'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
