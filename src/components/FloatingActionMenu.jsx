import { useRef, useState } from 'react'
import { Search, Filter, List, EllipsisVertical, Plus, X } from 'lucide-react'
import ClearableInput from './ClearableInput'
import { MobileFiltersSheet } from './Toolbar'
import LegendSheet from './LegendSheet'
import PageActionsMenu from './PageActionsMenu'
import { useDismissablePopover } from '../lib/useDismissablePopover'

// Mobile-only floating action menu — replaces the sticky-top search row +
// inline "More actions" kebab pattern with a single bottom-right expanding
// trigger (design pass covered in chat, not yet folded into
// docs/design/layout-spec.md §15 — that section still describes the
// sticky-top pattern this replaces; needs a follow-up doc edit once this
// ships on all three pages it's targeting).
//
// Deliberately reuses the app's existing sheet machinery rather than a new
// one-off panel: Filter opens the same `MobileFiltersSheet` Toolbar's own
// "Filters" button already opens (exported from Toolbar.jsx for this).
// Legend and More pass straight through to the existing `LegendSheet`/
// `PageActionsMenu`, unchanged — so those two still look and behave exactly
// like they do everywhere else they're used (e.g. per-card kebab menus),
// rather than inventing a second "more menu" visual language just for this
// trigger.
//
// Desktop (`md:` and up) renders nothing here — every page keeps its
// existing desktop Toolbar row + inline Legend/More trigger buttons
// untouched; only mobile chrome changes.
//
// Props:
// - search: `{ value, onChange, placeholder }` — always required.
// - filter: `{ facets, active, onClearAll, sheetTitle }` — omit entirely on
//   a page with nothing to filter.
// - legend: `{ title, children, ruleIntro, ruleBullets }` — same shape
//   LegendSheet already takes, minus its own `trigger` (this component
//   supplies that). Omit on a page with no legend.
// - moreMenu: `{ title, items }` — same shape PageActionsMenu already
//   takes, minus its own `trigger`. Omit on a page with no page-level
//   actions.
// - cycleView: `{ value, options: [{ value, label, icon: Icon }], onChange }`
//   — a single cycling icon button stepping through `options` in order, for
//   a page whose "view" control is a simple toggle (Roster's List/Grid).
//   This is a deliberate shape change from the existing two-segment
//   `ViewToggle` component — a segmented control doesn't fit a single-icon
//   FAB slot as-is. If that tradeoff isn't wanted, keep `ViewToggle`
//   rendered inline above the list instead of passing `cycleView` here.
// - hidden — pass `true` while a page's own bulk-selection UI is showing
//   (Staff's `BulkActionBar`, fixed to the same bottom edge) so the two
//   floating elements never overlap; this menu renders nothing while
//   hidden.
export default function FloatingActionMenu({ search, filter, legend, moreMenu, cycleView, hidden = false }) {
  const [open, setOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)
  const stackRef = useRef(null)
  useDismissablePopover(open, () => setOpen(false), stackRef)

  if (hidden) return null

  const hasFilter = Boolean(filter?.facets?.length)
  const hasLegend = Boolean(legend)
  const hasMore = Boolean(moreMenu?.items?.length)
  const hasView = Boolean(cycleView)

  function nextViewOption() {
    const i = cycleView.options.findIndex(o => o.value === cycleView.value)
    return cycleView.options[(i + 1) % cycleView.options.length]
  }

  return (
    <div
      className="fixed z-30 md:hidden"
      style={{ bottom: 'calc(70px + env(safe-area-inset-bottom))', right: 'max(1rem, env(safe-area-inset-right))' }}
    >
      {searchOpen ? (
        <div className="flex w-[calc(100vw-2rem)] max-w-sm items-center gap-1 rounded-full border border-slate-line bg-canvas-raised py-1 pl-3 pr-1 shadow-raised">
          <Search className="h-4 w-4 flex-shrink-0 text-ink-muted" />
          <ClearableInput
            autoFocus
            value={search.value}
            onChange={e => search.onChange(e.target.value)}
            placeholder={search.placeholder}
            className="input-field flex-1 border-none bg-transparent shadow-none focus:ring-0"
          />
          <button
            type="button"
            onClick={() => setSearchOpen(false)}
            aria-label="Close search"
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-ink-muted hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <>
          <div
            ref={stackRef}
            className="absolute bottom-[60px] right-0 flex flex-col-reverse items-center gap-3 [@media(orientation:landscape)]:bottom-0 [@media(orientation:landscape)]:right-[60px] [@media(orientation:landscape)]:flex-row-reverse"
          >
            {hasView && (
              <FabItem
                icon={nextViewOption().icon}
                label={`Switch to ${nextViewOption().label}`}
                onClick={() => { cycleView.onChange(nextViewOption().value); setOpen(false) }}
              />
            )}
            {hasMore && (
              <PageActionsMenu
                title={moreMenu.title}
                items={moreMenu.items}
                trigger={onClick => (
                  <FabItem icon={EllipsisVertical} label="More actions" onClick={() => { onClick(); setOpen(false) }} />
                )}
              />
            )}
            {hasLegend && (
              <LegendSheet
                title={legend.title}
                ruleIntro={legend.ruleIntro}
                ruleBullets={legend.ruleBullets}
                trigger={onClick => (
                  <FabItem icon={List} label="Legend" onClick={() => { onClick(); setOpen(false) }} />
                )}
              >
                {legend.children}
              </LegendSheet>
            )}
            {hasFilter && (
              <FabItem
                icon={Filter}
                label={filter.sheetTitle || 'Filter'}
                active={filter.active}
                onClick={() => { setFilterSheetOpen(true); setOpen(false) }}
              />
            )}
            <FabItem icon={Search} label="Search" onClick={() => { setSearchOpen(true); setOpen(false) }} />
          </div>

          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            aria-label={open ? 'Close quick actions' : 'Quick actions'}
            aria-expanded={open}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-raised"
          >
            <Plus className="h-6 w-6 transition-transform duration-200" style={{ transform: open ? 'rotate(45deg)' : 'rotate(0deg)' }} />
          </button>
        </>
      )}

      {filterSheetOpen && (
        <MobileFiltersSheet
          title={filter?.sheetTitle || 'Filters'}
          facets={filter?.facets}
          active={filter?.active}
          onClearAll={filter?.onClearAll}
          onClose={() => setFilterSheetOpen(false)}
        />
      )}
    </div>
  )
}

function FabItem({ icon: Icon, label, onClick, active }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full shadow-raised transition-colors ${
        active ? 'bg-accent text-white' : 'bg-canvas-raised text-ink hover:bg-canvas-sunken'
      }`}
    >
      <Icon className="h-[18px] w-[18px]" />
    </button>
  )
}
