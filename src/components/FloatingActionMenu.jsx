import { useRef, useState } from 'react'
import { Search, ArrowUpDown, Filter, List, EllipsisVertical, Plus, X } from 'lucide-react'
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
// - sort: `{ facets, active, sheetTitle }` — Toolbar's `sortFacets`, on
//   their own trigger and their own sheet. Kept separate from `filter`
//   rather than merged into one sheet the way the inline Toolbar's mobile
//   mode does: with a whole stack to spend, sort is worth its own reach
//   instead of being buried a sheet deep behind a Filter icon.
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
// - hidden — pass `true` while a page renders its own element fixed to the
//   same bottom edge, so the two floating elements never overlap; this menu
//   renders nothing while hidden. (No page needs it today — the bulk
//   approve/reject actions that used to sit down here moved into the list's
//   own `SelectAllRow` header — but it stays as the escape hatch for the
//   next one that does.)
export default function FloatingActionMenu({ search, sort, filter, legend, moreMenu, cycleView, primaryAction, hidden = false }) {
  const [open, setOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [sheet, setSheet] = useState(null) // 'sort' | 'filter' | null
  const stackRef = useRef(null)
  useDismissablePopover(open, () => setOpen(false), stackRef)

  if (hidden) return null

  const hasSort = Boolean(sort?.facets?.length)
  const hasFilter = Boolean(filter?.facets?.length || filter?.groups?.length)
  const hasLegend = Boolean(legend)
  const hasMore = Boolean(moreMenu?.items?.length)
  const hasView = Boolean(cycleView)
  const hasPrimary = Boolean(primaryAction)

  function nextViewOption() {
    const i = cycleView.options.findIndex(o => o.value === cycleView.value)
    return cycleView.options[(i + 1) % cycleView.options.length]
  }

  // Which slots this page actually filled, bottom-to-top — the stagger has
  // to count rendered buttons, not slots, or a page missing Sort would open
  // with a visible hole in the timing where Sort's turn would have been.
  const slots = [
    hasPrimary && 'primary',
    'search',
    hasSort && 'sort',
    hasFilter && 'filter',
    hasLegend && 'legend',
    hasMore && 'more',
    hasView && 'view',
  ].filter(Boolean)
  const stagger = key => ({ open, index: slots.indexOf(key) })

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
          {/* `flex-col-reverse` — the stack sits above the ⊕ and grows
              upward, so the FIRST child renders at the bottom, nearest the
              trigger, and DOM order here reads exactly as the stack reads
              on screen bottom-to-top: primary action, Search, Sort, Filter,
              Legend, More actions, View. Ordered by expected reach, not by
              how often a page happens to pass each one, so a control never
              moves position between pages just because a neighbour is
              absent. (Landscape flips to `flex-row-reverse` off the same
              rule: first child nearest the trigger, growing leftward.)
              Everything here stays mounted in both states (see FabItem) —
              LegendSheet/PageActionsMenu own their open sheet internally, so
              unmounting on collapse (the FAB closes the moment one of them
              is picked) would tear the just-opened sheet down with it.
              `pointer-events-none` on the container because a collapsed
              stack still reserves its full layout box: only the buttons
              take pointer events back, and only while open, so the
              invisible box never swallows a tap meant for the page. */}
          <div
            ref={stackRef}
            className="pointer-events-none absolute bottom-[60px] right-0 flex flex-col-reverse items-center gap-3 [@media(orientation:landscape)]:bottom-0 [@media(orientation:landscape)]:right-[60px] [@media(orientation:landscape)]:flex-row-reverse"
          >
            {hasPrimary && (
              <FabItem
                {...stagger('primary')}
                icon={primaryAction.icon}
                label={primaryAction.label}
                onClick={() => { primaryAction.onClick(); setOpen(false) }}
              />
            )}
            <FabItem
              {...stagger('search')}
              icon={Search}
              label="Search"
              onClick={() => { setSearchOpen(true); setOpen(false) }}
            />
            {hasSort && (
              <FabItem
                {...stagger('sort')}
                icon={ArrowUpDown}
                label={sort.sheetTitle || 'Sort'}
                active={sort.active}
                onClick={() => { setSheet('sort'); setOpen(false) }}
              />
            )}
            {hasFilter && (
              <FabItem
                {...stagger('filter')}
                icon={Filter}
                label={filter.sheetTitle || 'Filter'}
                active={filter.active}
                onClick={() => { setSheet('filter'); setOpen(false) }}
              />
            )}
            {hasLegend && (
              <LegendSheet
                title={legend.title}
                ruleIntro={legend.ruleIntro}
                ruleBullets={legend.ruleBullets}
                trigger={onClick => (
                  <FabItem {...stagger('legend')} icon={List} label="Legend" onClick={() => { onClick(); setOpen(false) }} />
                )}
              >
                {legend.children}
              </LegendSheet>
            )}
            {hasMore && (
              <PageActionsMenu
                title={moreMenu.title}
                items={moreMenu.items}
                trigger={onClick => (
                  <FabItem {...stagger('more')} icon={EllipsisVertical} label="More actions" onClick={() => { onClick(); setOpen(false) }} />
                )}
              />
            )}
            {hasView && (
              <FabItem
                {...stagger('view')}
                icon={nextViewOption().icon}
                label={`Switch to ${nextViewOption().label}`}
                onClick={() => { cycleView.onChange(nextViewOption().value); setOpen(false) }}
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
            {/* ⊕ → ✕ over the same 100ms as the first button's reveal, so
                the trigger and the stack start moving together — and snaps
                back with them, since an icon still spinning after the stack
                has gone would be the only thing left animating. */}
            <Plus
              className="h-6 w-6 motion-reduce:transition-none"
              style={{
                transform: open ? 'rotate(45deg)' : 'rotate(0deg)',
                transition: open ? `transform ${OPEN_MS}ms ease-out` : 'none',
              }}
            />
          </button>
        </>
      )}

      {/* Sort and Filter are two triggers onto the same sheet shell, never
          open at once. Sort deliberately gets no `onClearAll`: "Clear all"
          resets search and filters too, which isn't what a sheet showing
          only sort options should offer. */}
      {sheet === 'sort' && (
        <MobileFiltersSheet
          title={sort.sheetTitle || 'Sort'}
          facets={sort.facets}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'filter' && (
        <MobileFiltersSheet
          title={filter.sheetTitle || 'Filters'}
          facets={filter.facets}
          groups={filter.groups}
          active={filter.active}
          onClearAll={filter.onClearAll}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  )
}

// Opening borrows its shape from nambicompany/expandable-fab, the Android
// widget this pattern is modelled on: each button scales 0→1 and fades in
// on an overshoot curve, and the next starts only once the previous has
// finished (its AnimatorSet uses playSequentially, not an overlapping
// stagger) — so the step equals the duration and the stack genuinely opens
// one icon at a time. Well under that library's own 125ms default, because
// a sequential cascade pays this per button rather than once: at five
// buttons it is the difference between a ~625ms open and a ~375ms one, and
// a toolbar gets opened often enough to feel every millisecond.
const OPEN_MS = 75
// CSS stand-in for the reference's OvershootInterpolator(3.5f) — grows a
// little past full size before settling.
const OPEN_EASE = 'cubic-bezier(0.34, 1.8, 0.64, 1)'

// Stays mounted in both states and animates between them rather than
// mounting on open: a mounting element has no "from" to transition out of,
// and the buttons for Legend/More own their sheets, which unmounting would
// close in the same tap that opened them.
//
// Closed, it is inert as well as invisible — `aria-hidden` keeps it out of
// the accessibility tree, `tabIndex=-1` out of the tab order, and the
// container's `pointer-events-none` out of hit-testing, so a collapsed
// stack can't be tabbed into or tapped through. `visibility` gets its own
// zero-length step in the opening transition so it flips at the start of
// each button's turn rather than for the whole stack at once.
function FabItem({ icon: Icon, label, onClick, active, open, index }) {
  // Closing isn't animated at all — the stack is gone the frame the ⊕ is
  // tapped. Dismissing is a correction, and a cascade played backwards just
  // makes the user wait to get their screen back; there's also nothing to
  // read on the way out, unlike on the way in. So only the opening
  // direction carries a duration, a delay, or a stagger.
  const transition = open
    ? `transform ${OPEN_MS}ms ${OPEN_EASE} ${index * OPEN_MS}ms, opacity ${OPEN_MS}ms ease-out ${index * OPEN_MS}ms, visibility 0s linear ${index * OPEN_MS}ms`
    : 'none'

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-hidden={!open}
      tabIndex={open ? undefined : -1}
      title={label}
      style={{ transition }}
      className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full shadow-raised
        motion-reduce:!transition-none ${
        open ? 'pointer-events-auto visible scale-100 opacity-100' : 'invisible scale-0 opacity-0'
      } ${
        active ? 'bg-accent text-white' : 'bg-canvas-raised text-ink hover:bg-canvas-sunken'
      }`}
    >
      <Icon className="h-[18px] w-[18px]" />
    </button>
  )
}
