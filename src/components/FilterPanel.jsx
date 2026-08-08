import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDismissablePopover } from '../lib/useDismissablePopover'
import { computeAnchoredPosition } from '../lib/popoverPosition'

// Above this many options, a group's expanded list gets a capped height
// with its own scrollbar instead of growing the popover indefinitely.
const SCROLL_CAP_THRESHOLD = 6

function ChevronDownIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
    </svg>
  )
}
function FilterIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  )
}
function CheckIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}

// One group's header row (name + selected-count chip + chevron) and, when
// expanded, its own "All" reset row plus a real multi-select checkbox list.
// `selected` is a Set of option values; empty = "All". Only ever one group
// expanded at a time across the whole panel (see FilterPanel below) — this
// component just renders whatever expanded state it's told.
function FilterGroup({ group, expanded, onToggleExpand }) {
  const { label, options, selected, onChange } = group
  const isAll = selected.size === 0

  function toggleOption(value) {
    const next = new Set(selected)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    onChange(next)
  }

  return (
    <div className="border-b border-slate-line last:border-0">
      <button
        type="button"
        onClick={onToggleExpand}
        aria-expanded={expanded}
        className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors hover:bg-canvas-sunken active:bg-canvas-sunken ${
          expanded ? 'font-semibold text-ink' : 'font-medium text-ink'
        }`}
      >
        <span className="flex-1">{label}</span>
        {selected.size > 0 && (
          <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-semibold text-white">
            {selected.size}
          </span>
        )}
        <ChevronDownIcon className={`h-4 w-4 flex-shrink-0 text-ink-muted transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <div className="pb-1.5">
          <button
            type="button"
            onClick={() => onChange(new Set())}
            className="flex w-full items-center gap-2.5 px-4 py-1.5 text-left text-sm text-ink-light transition-colors hover:bg-canvas-sunken active:bg-canvas-sunken"
          >
            <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border ${isAll ? 'border-accent bg-accent text-white' : 'border-slate-line'}`}>
              {isAll && <CheckIcon className="h-2.5 w-2.5" />}
            </span>
            <span className={isAll ? 'font-semibold text-ink' : ''}>All</span>
          </button>
          <div className={options.length > SCROLL_CAP_THRESHOLD ? 'max-h-48 overflow-y-auto' : ''}>
            {options.map(opt => {
              const checked = selected.has(opt.value)
              return (
                <label
                  key={opt.value}
                  className="flex w-full cursor-pointer items-center gap-2.5 px-4 py-1.5 text-sm text-ink-light transition-colors hover:bg-canvas-sunken active:bg-canvas-sunken"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleOption(opt.value)}
                    className="sr-only"
                  />
                  <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${checked ? 'border-accent bg-accent text-white' : 'border-slate-line'}`}>
                    {checked && <CheckIcon className="h-2.5 w-2.5" />}
                  </span>
                  <span className={checked ? 'font-semibold text-ink' : ''}>{opt.label}</span>
                </label>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// The app's multi-select grouped-facet pattern — one "Filter" trigger
// covering several independent dimensions at once (e.g. Category/Role/
// Status/Admin on Staff), rather than a separate trigger per dimension.
// Opens a single popover listing every group by name; tapping a group
// expands it in place (accordion-style — only one expanded at a time) to
// reveal an "All" reset option plus a real multi-select checkbox list, so a
// viewer can e.g. filter to "Registrar OR MO" in one dimension at once
// instead of being limited to picking exactly one value per dimension.
//
// `groups`: [{ key, label, options: [{value,label}], selected: Set,
// onChange(nextSet) }]. The trigger's own active state and badge count are
// derived from the groups' selected sets, so callers never compute that
// separately.
export default function FilterPanel({ groups, className = '' }) {
  const [open, setOpen] = useState(false)
  const [anchorRect, setAnchorRect] = useState(null)
  const [expandedKey, setExpandedKey] = useState(null)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)

  function close() {
    setOpen(false)
    setAnchorRect(null)
    setExpandedKey(null)
  }
  useDismissablePopover(open, close, menuRef, [triggerRef])

  function toggle() {
    if (open) { close(); return }
    setAnchorRect(triggerRef.current.getBoundingClientRect())
    setOpen(true)
  }

  const activeCount = groups.reduce((sum, g) => sum + g.selected.size, 0)
  const menuWidth = 240
  const positionStyle = anchorRect ? computeAnchoredPosition(anchorRect, menuWidth) : null

  return (
    <div className="relative flex-shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex h-[30px] items-center justify-center gap-1.5 whitespace-nowrap rounded border border-accent/25 px-3 text-sm font-medium transition-colors ${
          open || activeCount > 0 ? 'bg-accent text-white' : 'bg-canvas text-ink-light hover:bg-canvas-sunken hover:text-ink'
        } ${className}`}
      >
        <FilterIcon className="h-4 w-4" />
        Filter
        {activeCount > 0 && (
          <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-white/25 text-[10px] font-semibold">
            {activeCount}
          </span>
        )}
      </button>
      {open && positionStyle && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{ ...positionStyle, width: menuWidth }}
          className="fixed z-50 max-h-[70vh] overflow-y-auto rounded-xl border border-slate-line bg-canvas-raised py-1 shadow-raised"
        >
          {groups.map(group => (
            <FilterGroup
              key={group.key}
              group={group}
              expanded={expandedKey === group.key}
              onToggleExpand={() => setExpandedKey(k => (k === group.key ? null : group.key))}
            />
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}
