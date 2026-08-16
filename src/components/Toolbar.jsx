import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ClearableInput from './ClearableInput'
import FilterPanel from './FilterPanel'
import { useDismissablePopover } from '../lib/useDismissablePopover'
import { computeAnchoredPosition } from '../lib/popoverPosition'

// Above this many options, a facet/group grows a search box rather than
// staying a flat list — same threshold and rationale as FilterPanel's
// FilterGroup, including the `alwaysSearchable` override.
const SEARCH_THRESHOLD = 13

function filterByQuery(options, query) {
  if (!query.trim()) return options
  const q = query.trim().toLowerCase()
  return options.filter(opt => opt.label.toLowerCase().includes(q))
}

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
function ChevronDownIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
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
//
// `variant`: `'pill'` (default, the small icon+label button above) or
// `'row'` — a full-width row (label, current value preview, chevron) for
// use as one entry in MobileFiltersSheet's list of parent menu items. Same
// popover underneath either way — a facet is a facet, just dressed
// differently depending on where it's triggered from. The value preview is
// `aria-hidden` so the button's accessible name stays just its label (e.g.
// "Sort", not "Sort Newest first"), matching the pill variant's name.
//
// `alwaysSearchable`: forces the search box on below SEARCH_THRESHOLD — for
// a facet like Doctor, where a caller wants search regardless of how many
// names happen to be on staff right now.
export function ToolbarFacet({ icon, label, value, onChange, options, isActive, disabled = false, compact = false, variant = 'pill', alwaysSearchable = false }) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState(null)
  const [query, setQuery] = useState('')
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  useDismissablePopover(open, () => setOpen(false), menuRef, [triggerRef])

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  function toggle() {
    if (disabled) return
    if (open) { setOpen(false); return }
    setAnchor(triggerRef.current.getBoundingClientRect())
    setOpen(true)
  }

  const isRow = variant === 'row'
  const searchable = alwaysSearchable || options.length > SEARCH_THRESHOLD
  const visibleOptions = searchable ? filterByQuery(options, query) : options
  const selected = options.find(o => o.value === value)
  const menuWidth = isRow ? Math.max(anchor?.width || 0, 200) : 180
  const positionStyle = anchor ? computeAnchoredPosition(anchor, menuWidth) : null

  return (
    <div className={isRow ? '' : 'relative flex-shrink-0'}>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={isRow ? undefined : label}
        className={isRow
          ? 'flex w-full items-center gap-2 py-3 text-left text-sm font-medium text-ink'
          : `toolbar-pill ${open || isActive ? 'toolbar-pill-active' : 'toolbar-pill-idle'}`}
      >
        {icon}
        <span className={isRow ? 'flex-1' : (compact ? 'hidden' : 'hidden sm:inline')}>{label}</span>
        {isRow && selected && <span aria-hidden="true" className="truncate text-ink-muted">{selected.label}</span>}
        {isRow && <ChevronDownIcon className={`h-4 w-4 flex-shrink-0 text-ink-muted transition-transform ${open ? 'rotate-180' : ''}`} />}
      </button>
      {open && positionStyle && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{ ...positionStyle, width: menuWidth }}
          className="fixed z-50 max-h-60 overflow-y-auto rounded-xl border border-slate-line bg-canvas-raised py-1 shadow-raised"
        >
          {searchable && (
            <div className="px-2 pb-1">
              <ClearableInput
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={`Search ${label.toLowerCase()}…`}
                aria-label={`Search ${label.toLowerCase()}`}
                clearLabel={`Clear ${label.toLowerCase()} search`}
                icon={<SearchIcon className="h-4 w-4" />}
                className="input-field"
                autoFocus
              />
            </div>
          )}
          {visibleOptions.length === 0 && (
            <p className="px-4 py-2 text-sm text-ink-muted">No matches</p>
          )}
          {visibleOptions.map(opt => (
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

// Mobile-sheet row for a FilterPanel-shaped multi-select group (`{key,
// label, options, selected: Set, onChange}`) — same "row trigger opens its
// own anchored popover" shape as ToolbarFacet's `variant="row"`, just with
// a checkbox list (plus an "All" reset for the empty-Set default) instead
// of single-select buttons. Kept as its own component rather than folded
// into ToolbarFacet: multi-select's "All" row and checkbox semantics don't
// map onto a single-select's option list without the toggle turning into a
// pile of conditionals.
function ToolbarGroupInline({ label, options, selected, onChange, alwaysSearchable = false }) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState(null)
  const [query, setQuery] = useState('')
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  useDismissablePopover(open, () => setOpen(false), menuRef, [triggerRef])

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  function toggle() {
    if (open) { setOpen(false); return }
    setAnchor(triggerRef.current.getBoundingClientRect())
    setOpen(true)
  }

  function toggleOption(value) {
    const next = new Set(selected)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    onChange(next)
  }

  const isAll = selected.size === 0
  const searchable = alwaysSearchable || options.length > SEARCH_THRESHOLD
  const visibleOptions = searchable ? filterByQuery(options, query) : options
  const menuWidth = Math.max(anchor?.width || 0, 200)
  const positionStyle = anchor ? computeAnchoredPosition(anchor, menuWidth) : null

  return (
    <div>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex w-full items-center gap-2 py-3 text-left text-sm font-medium text-ink"
      >
        <span className="flex-1">{label}</span>
        <span aria-hidden="true" className="truncate text-ink-muted">{isAll ? 'All' : `${selected.size} selected`}</span>
        <ChevronDownIcon className={`h-4 w-4 flex-shrink-0 text-ink-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && positionStyle && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{ ...positionStyle, width: menuWidth }}
          className="fixed z-50 max-h-72 overflow-y-auto rounded-xl border border-slate-line bg-canvas-raised py-1 shadow-raised"
        >
          {searchable && (
            <div className="px-2 pb-1">
              <ClearableInput
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={`Search ${label.toLowerCase()}…`}
                aria-label={`Search ${label.toLowerCase()}`}
                clearLabel={`Clear ${label.toLowerCase()} search`}
                icon={<SearchIcon className="h-4 w-4" />}
                className="input-field"
                autoFocus
              />
            </div>
          )}
          <button
            type="button"
            onClick={() => onChange(new Set())}
            className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-ink-light transition-colors hover:bg-canvas-sunken active:bg-canvas-sunken"
          >
            <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border ${isAll ? 'border-accent bg-accent text-white' : 'border-slate-line'}`}>
              {isAll && <CheckIcon className="h-2.5 w-2.5" />}
            </span>
            <span className={isAll ? 'font-semibold text-ink' : ''}>All</span>
          </button>
          {searchable && visibleOptions.length === 0 && (
            <p className="px-4 py-2 text-sm text-ink-muted">No matches</p>
          )}
          {visibleOptions.map(opt => {
            const checked = selected.has(opt.value)
            return (
              <label
                key={opt.value}
                className="flex w-full cursor-pointer items-center gap-2.5 px-4 py-2 text-sm text-ink-light transition-colors hover:bg-canvas-sunken active:bg-canvas-sunken"
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
        </div>,
        document.body
      )}
    </div>
  )
}

// Bottom sheet combining every Sort/Filter facet into the one mobile
// control the spec asks for, rather than three separate controls competing
// for a narrow row (§15). Slides up from the bottom (not a full-screen
// sheet — that's the Modal/form pattern, a different one, see Modal.jsx).
// Exported (not just Toolbar-internal) so FloatingActionMenu can reuse it
// verbatim for its own "Filter" action instead of a second filter-sheet
// implementation — same facets shape, same sheet, just a different trigger.
//
// `groups` (FilterPanel-shaped multi-select) is only ever passed by
// FloatingActionMenu: Toolbar itself still renders filterGroups inline as a
// FilterPanel on both breakpoints and never routes them here (see its own
// `filterGroups` comment), but the FAB has no inline row left to put them
// on, so for those callers the sheet is the only place they can live.
export function MobileFiltersSheet({ title, facets = [], groups = [], active, onClearAll, onClose }) {
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
        <div className="divide-y divide-slate-line px-5">
          {facets.map(({ key, ...f }) => <ToolbarFacet key={key} variant="row" {...f} />)}
          {groups.map(({ key, ...g }) => <ToolbarGroupInline key={key} {...g} />)}
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
// onChange, options: [{value,label}], isActive }` — one single-select
// dropdown trigger each. In the default `mobileMode="sheet"` these collapse
// into one "Filters" bottom sheet on mobile (§15); with `mobileMode="inline"`
// each renders as its own always-visible button on mobile too, same as
// desktop. Pass an empty array (the default) to omit Sort or Filter
// entirely on a page that doesn't need it.
//
// `filterGroups`: FilterPanel-shaped multi-select groups (`{key, label,
// options, selected: Set, onChange}`) — for a page whose filter needs
// several independently multi-selectable dimensions (e.g. Staff's
// Role/Category/Status/Admin) rather than one single-select value.
// Renders as one `[Filter ▾ (n)]` `FilterPanel` trigger, always inline on
// both breakpoints regardless of `mobileMode` — no current caller needs a
// mobile-sheet+filterGroups combination, so the sheet never receives these.
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
//
// `mobileMode`: `"sheet"` (default, today's behavior) or `"inline"` — the
// always-visible-on-mobile row shape CompactToolbarRow used to provide
// (that component has since been folded into this one). Also switches the
// mobile row to the same nowrap layout `compact` uses on its own, since
// "every facet stays on the row" and "search can grow unbounded" don't fit
// together.
//
// `trailing`/`desktopTrailing`: extra controls appended after the Clear
// button — `trailing` on both breakpoints (e.g. RosterDashboardPage's
// List/Grid `ViewToggle`, which belongs on mobile too), `desktopTrailing`
// desktop-only, positioned *before* Clear instead (matches the position
// CompactToolbarRow's own `trailing` used to render at — its callers, e.g.
// InternRotationsMatrix's year-nav/Today cluster, only ever needed it on
// desktop, mobile already renders that cluster in its own header above
// the toolbar row).
//
// `className`: overrides the root's own spacing (`mb-4` by default) — for a
// caller embedding this inline as one flex item within a larger shared row
// (WeekendPlannerView's desktop toolbar, alongside its DateStepper nav
// cluster) rather than as its own standalone block, where the built-in
// bottom margin would just add uneven space against row siblings that don't
// carry one.
export default function Toolbar({
  searchValue, onSearchChange, searchPlaceholder,
  sortFacets = [], filterFacets = [], filterGroups = [],
  active = false, onClearAll,
  mobileSheetTitle = 'Filters',
  compact = false,
  mobileMode = 'sheet',
  trailing, desktopTrailing,
  className = 'mb-4',
}) {
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false)
  const facets = [...sortFacets, ...filterFacets]
  const mobileInline = compact || mobileMode === 'inline'

  const clearButton = active && onClearAll && (
    <button
      type="button"
      onClick={onClearAll}
      aria-label="Clear all filters"
      title="Clear all filters"
      className="toolbar-clear-btn"
    >
      <ClearIcon className="h-4 w-4" />
    </button>
  )

  return (
    <div className={className}>
      {/* Desktop / tablet row — search fixed at 320px (or shrinkable up to
          that same 320px, in compact mode — shrinks to fit a narrower row
          without ever ballooning past it just because the row has room),
          facets + filterGroups + desktopTrailing + clear + trailing */}
      <div className="hidden flex-nowrap items-center gap-2 md:flex">
        <div className={compact ? 'min-w-0 max-w-xs flex-1' : 'w-80 flex-shrink-0'}>
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
        {filterGroups.length > 0 && <FilterPanel groups={filterGroups} />}
        {desktopTrailing}
        {clearButton}
        {trailing}
      </div>

      {/* Mobile — `mobileInline` (compact, or explicit mobileMode="inline")
          keeps every facet on the row instead of collapsing Sort/Filter
          into the "Filters" sheet button. filterGroups always renders
          inline here regardless of mode — see its own comment above. */}
      <div className={`flex gap-2 md:hidden ${mobileInline ? 'flex-nowrap items-center' : 'flex-col'}`}>
        <div className={mobileInline ? 'min-w-0 flex-1' : ''}>
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
        {mobileMode === 'inline' ? (
          facets.map(({ key, ...f }) => <ToolbarFacet key={key} {...f} compact={compact} />)
        ) : (
          facets.length > 0 && (
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
          )
        )}
        {filterGroups.length > 0 && <FilterPanel groups={filterGroups} />}
        {clearButton}
        {trailing}
      </div>

      {mobileMode !== 'inline' && mobileSheetOpen && (
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
