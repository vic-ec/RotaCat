import { useRef, useState } from 'react'
import { Search, Filter, List, EllipsisVertical, Plus, X } from 'lucide-react'
import ClearableInput from './ClearableInput'
import { MobileFiltersSheet } from './Toolbar'
import LegendSheet from './LegendSheet'
import PageActionsMenu from './PageActionsMenu'
import { useDismissablePopover } from '../lib/useDismissablePopover'

// Mobile-only floating action menu — replaces the sticky-top search row +
// inline "More actions" kebab pattern with a single bottom-right expanding
// trigger (see docs/design/layout-spec.md §15's "Toolbar FAB", which
// documents this as the new standard and keeps the sticky-top pattern only
// as reference for pages not yet migrated).
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
// untouched; only mobile chrome changes. A page whose "mobile" block runs
// wider than `md` (e.g. WeekendPlannerView's is `lg:hidden`) therefore has
// to keep its inline toolbar row alive for the md–lg band — see those
// pages' own `hidden md:block` wrappers.
//
// Props:
// - search: `{ value, onChange, placeholder }` — always required.
// - filter: `{ facets, groups, active, onClearAll, sheetTitle }` — omit
//   entirely on a page with nothing to filter. `facets` are Toolbar's
//   single-select facet descriptors, `groups` its FilterPanel-shaped
//   multi-select groups; both render inline in the one sheet.
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
// - primaryAction: `{ icon, label, onClick }` — the page's own create/add
//   action (Rotations' "Add doctor"), which §15 otherwise gives its own
//   bottom-right FAB. A page needing both puts it here rather than
//   rendering two FABs in the same corner; it sits nearest the ⊕ as the
//   shortest reach, and is the one stack item that isn't a way of looking
//   at the list.
// - hidden — pass `true` while a page's own bulk-selection UI is showing
//   (Staff's `BulkActionBar`, fixed to the same bottom edge) so the two
//   floating elements never overlap; this menu renders nothing while
//   hidden.
export default function FloatingActionMenu({ search, filter, legend, moreMenu, cycleView, primaryAction, hidden = false }) {
  const [open, setOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)
  const stackRef = useRef(null)
  useDismissablePopover(open, () => setOpen(false), stackRef)

  if (hidden) return null

  const hasFilter = Boolean(filter?.facets?.length || filter?.groups?.length)
  const hasLegend = Boolean(legend)
  const hasMore = Boolean(moreMenu?.items?.length)
  const hasView = Boolean(cycleView)
  const hasPrimary = Boolean(primaryAction)

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
          {/* ClearableInput wraps its <input> in a positioning div, so the
              flex sizing has to go on that wrapper — putting it on the
              input's own className would leave the wrapper at its
              shrink-to-fit width and strand dead space in the pill. */}
          <div className="min-w-0 flex-1">
            <ClearableInput
              autoFocus
              value={search.value}
              onChange={e => search.onChange(e.target.value)}
              placeholder={search.placeholder}
              clearLabel="Clear search"
              className="input-field w-full border-none bg-transparent shadow-none"
            />
          </div>
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
          {/* `flex-col-reverse`, so this reads bottom-to-top on screen —
              nearest the ⊕ first: primary action, Search, Filter, Legend,
              More actions, View. Ordered by expected reach, not by how
              often a page happens to pass each one, so a control never
              moves position between pages just because a neighbour is
              absent.
              The stack container stays mounted while collapsed and only its
              individual buttons drop out — LegendSheet/PageActionsMenu own
              their open sheet internally, so unmounting the whole stack on
              collapse (the FAB closes the moment one of them is picked)
              would tear the just-opened sheet down with it. Empty, the
              container is zero-sized and invisible. */}
          <div
            ref={stackRef}
            className="absolute bottom-[60px] right-0 flex flex-col-reverse items-center gap-3 [@media(orientation:landscape)]:bottom-0 [@media(orientation:landscape)]:right-[60px] [@media(orientation:landscape)]:flex-row-reverse"
          >
            {hasView && open && (
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
                trigger={onClick => open && (
                  <FabItem icon={EllipsisVertical} label="More actions" onClick={() => { onClick(); setOpen(false) }} />
                )}
              />
            )}
            {hasLegend && (
              <LegendSheet
                title={legend.title}
                ruleIntro={legend.ruleIntro}
                ruleBullets={legend.ruleBullets}
                trigger={onClick => open && (
                  <FabItem icon={List} label="Legend" onClick={() => { onClick(); setOpen(false) }} />
                )}
              >
                {legend.children}
              </LegendSheet>
            )}
            {hasFilter && open && (
              <FabItem
                icon={Filter}
                label={filter.sheetTitle || 'Filter'}
                active={filter.active}
                onClick={() => { setFilterSheetOpen(true); setOpen(false) }}
              />
            )}
            {open && <FabItem icon={Search} label="Search" onClick={() => { setSearchOpen(true); setOpen(false) }} />}
            {hasPrimary && open && (
              <FabItem
                icon={primaryAction.icon}
                label={primaryAction.label}
                onClick={() => { primaryAction.onClick(); setOpen(false) }}
              />
            )}
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
          groups={filter?.groups}
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
