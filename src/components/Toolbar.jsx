import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ClearableInput from './ClearableInput'
import { useDismissablePopover } from '../lib/useDismissablePopover'
import { computeAnchoredPosition } from '../lib/popoverPosition'

function SearchIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}
function FiltersIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M7 12h10M10 18h4" />
    </svg>
  )
}
function ClearIcon(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="m9.5 9.5 5 5m0-5-5 5" />
    </svg>
  )
}
function CloseIcon(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

// The app's one "quick-select pill" pattern — icon + label, a rectangle
// with rounded corners (never a full pill), opening a small anchored
// popover that closes on pick or on an outside click. This is what
// Roster's Sort/Month/Year controls (RosterDashboardPage.jsx) already look
// like; Toolbar's own `sortFacets`/`filterFacets` props render one of
// these per entry, so several independent single-select facets already
// sit side by side out of the box — reach for those props first. Exported
// here too (as `QuickSelectButton`) for the rarer case of a single
// standalone quick-select control living outside a full Toolbar (e.g. a
// page-specific single-select filter that isn't part of a search/sort/
// filter row). Same anchored-popover mechanics as SelectMenu (portalled to
// <body>, positioned off the trigger's own rect), just styled as a compact
// icon+label button rather than a full-width form field.
//
// The label hides below `sm` (icon-only) so this and its siblings (e.g.
// Filter, a ViewToggle) don't crowd out a narrow-phone search box that
// sits next to them — CompactToolbarRow's mobile row is the main case,
// same idea as ViewToggle's own responsive label. `aria-label` keeps the
// button properly named once the visible text is hidden; the active/open
// state stays visible icon-only too, since it's the whole button's own
// background (bg-accent) flipping, not something carried by the label text.
// `compact`: forces icon-only (no text label) at every width, not just
// below `sm` — for a caller whose row needs to fit a facet next to a
// search box that never gets its own row (WeekendPlannerView's month-view
// toolbar), rather than the default "icon-only only below sm" behaviour.
export function ToolbarFacet({ icon, label, value, onChange, options, isActive, disabled = false, compact = false }) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState(null)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  useDismissablePopover(open, () => setOpen(false), menuRef, [triggerRef])

  function toggle() {
    if (disabled) return
    if (open) { setOpen(false); return }
    setAnchor(triggerRef.current.getBoundingClientRect())
    setOpen(true)
  }

  const menuWidth = 180
  const positionStyle = anchor ? computeAnchoredPosition(anchor, menuWidth) : null

  return (
    <div className="relative flex-shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        className={`flex h-[30px] items-center justify-center gap-1.5 whitespace-nowrap rounded border border-accent/25 px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          open || isActive ? 'bg-accent text-white' : 'bg-canvas text-ink-light hover:bg-canvas-sunken hover:text-ink'
        }`}
      >
        {icon}
        <span className={compact ? 'hidden' : 'hidden sm:inline'}>{label}</span>
      </button>
      {open && positionStyle && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{ ...positionStyle, width: menuWidth }}
          className="fixed z-50 max-h-60 overflow-y-auto rounded-xl border border-slate-line bg-canvas-raised py-1 shadow-raised"
        >
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false) }}
              className={`block w-full px-4 py-2 text-left text-sm transition-colors ${
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

// Same facet, rendered inline (no popover) as a vertical option list — used
// inside the mobile bottom sheet, where nesting a second floating popover
// inside an already-open sheet would be an awkward double-layer.
function ToolbarFacetInline({ icon, label, value, onChange, options }) {
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
        {icon}{label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {options.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`h-[30px] rounded border px-3 text-sm font-medium transition-colors ${
              opt.value === value
                ? 'border-transparent bg-accent text-white'
                : 'border-accent/25 bg-canvas text-ink-light hover:bg-canvas-sunken'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// Bottom sheet combining every Sort/Filter facet into the one mobile
// control the spec asks for, rather than three separate controls competing
// for a narrow row (§15). Slides up from the bottom (not a full-screen
// sheet — that's the Modal/form pattern, a different one, see Modal.jsx).
function MobileFiltersSheet({ title, facets, active, onClearAll, onClose }) {
  const sheetRef = useRef(null)
  useDismissablePopover(true, onClose, sheetRef)
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-ink/20 md:hidden" role="presentation">
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[80vh] w-full overflow-y-auto rounded-t-xl bg-canvas-raised pb-[max(env(safe-area-inset-bottom),16px)] shadow-raised"
      >
        <div className="flex items-center justify-between border-b border-slate-line px-5 py-3">
          <p className="text-sm font-semibold text-ink">{title}</p>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center text-ink-muted hover:text-ink">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-5 px-5 py-4">
          {facets.map(({ key, ...f }) => <ToolbarFacetInline key={key} {...f} />)}
        </div>
        {active && onClearAll && (
          <div className="border-t border-slate-line px-5 py-3">
            <button
              type="button"
              onClick={() => { onClearAll(); onClose() }}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-accent"
            >
              <ClearIcon className="h-4 w-4" />
              Clear all
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// Shared list-page toolbar: [ Search ] [ Sort ▾ ] [ Filter ▾ ] [ × Clear
// (conditional) ], identical order/behavior on every list page. See
// docs/design/layout-spec.md §5.
//
// `sortFacets`/`filterFacets`: arrays of `{ key, icon, label, value,
// onChange, options: [{value,label}], isActive }` — one dropdown trigger
// each on desktop, collapsed into a single "Filters" bottom sheet on
// mobile (§15). Pass an empty array (the default) to omit Sort or Filter
// entirely on a page that doesn't need it.
//
// `active`: whether to show the Clear (×) button at all — only rendered
// when a search term or filter is genuinely active, never by default.
//
// `compact`: opt-in, off by default (every existing caller is unaffected).
// Shrinks the search input instead of holding it at a fixed 320px, and
// forces the Filter trigger to icon-only at every width instead of just
// below `sm` — for a caller (WeekendPlannerView's month view) where search
// and Filter must always share one row without wrapping or overflowing,
// on both the true-mobile block and the md:flex desktop/tablet block.
export default function Toolbar({
  searchValue, onSearchChange, searchPlaceholder,
  sortFacets = [], filterFacets = [],
  active = false, onClearAll,
  mobileSheetTitle = 'Filters',
  compact = false,
}) {
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false)
  const facets = [...sortFacets, ...filterFacets]

  return (
    <div className="mb-4">
      {/* Desktop / tablet row — search fixed at 320px (or shrinkable, in
          compact mode), facets + clear trailing */}
      <div className="hidden flex-nowrap items-center gap-2 md:flex">
        <div className={compact ? 'min-w-0 flex-1' : 'w-80 flex-shrink-0'}>
          <ClearableInput
            type="text"
            value={searchValue}
            onChange={e => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="input-field"
            clearLabel="Clear search"
            icon={<SearchIcon className="h-4 w-4" />}
          />
        </div>
        {facets.map(({ key, ...f }) => <ToolbarFacet key={key} {...f} compact={compact} />)}
        {active && onClearAll && (
          <button
            type="button"
            onClick={onClearAll}
            aria-label="Clear all filters"
            title="Clear all filters"
            className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded border border-accent/25 bg-canvas text-ink-light transition-colors hover:bg-canvas-sunken hover:text-ink active:bg-accent active:text-white"
          >
            <ClearIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Mobile — search + Filter share one row (compact mode) instead of
          Filter stacking onto its own row below a full-width search box. */}
      <div className={`flex gap-2 md:hidden ${compact ? 'flex-nowrap items-center' : 'flex-col'}`}>
        <div className={compact ? 'min-w-0 flex-1' : ''}>
          <ClearableInput
            type="text"
            value={searchValue}
            onChange={e => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="input-field"
            clearLabel="Clear search"
            icon={<SearchIcon className="h-4 w-4" />}
          />
        </div>
        {facets.length > 0 && (
          <button
            type="button"
            onClick={() => setMobileSheetOpen(true)}
            aria-label={mobileSheetTitle}
            className={`flex h-[30px] flex-shrink-0 items-center justify-center gap-1.5 rounded border border-accent/25 text-sm font-medium transition-colors ${compact ? 'w-[30px]' : ''} ${
              active ? 'bg-accent text-white' : 'bg-canvas text-ink-light'
            }`}
          >
            <FiltersIcon className="h-4 w-4" />
            {!compact && mobileSheetTitle}
          </button>
        )}
      </div>

      {mobileSheetOpen && (
        <MobileFiltersSheet
          title={mobileSheetTitle}
          facets={facets}
          active={active}
          onClearAll={onClearAll}
          onClose={() => setMobileSheetOpen(false)}
        />
      )}
    </div>
  )
}

// Named alias for standalone use — see ToolbarFacet's own comment above.
export const QuickSelectButton = ToolbarFacet
