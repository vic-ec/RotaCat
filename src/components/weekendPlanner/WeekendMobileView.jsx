import { Filter, ClipboardPaste, ChevronLeft } from 'lucide-react'
import FloatingActionMenu from '../FloatingActionMenu'
import MonthLegendTrigger from './MonthLegendTrigger'
import NextWeekendCard from './NextWeekendCard'
import WeekendMobileCard from './WeekendMobileCard'

// The phone layout (to lg): toolbar row, request panel, FAB, the Next
// weekend card and the month's weekend cards. `card` carries the props
// every WeekendMobileCard shares.
export default function WeekendMobileView({
  onBackToYear, monthStatusCounts, renderRequestPanel, searchQuery, setSearchQuery, filter, setFilter, filters,
  defaultFilter, isAdmin, weekendMenuItems, pasteActions, nextWeekendDismissed, setNextWeekendDismissed,
  monthSaturdays, nextWeekend, nextWeekendScheme, nextWeekendCoverage, nextWeekendMine, searchedSaturdays, card,
}) {
  // `extra` renders right after the Today button (DateStepper's own
  // extension point) — different per viewport (mobile: the More actions
  // kebab; desktop: More Actions + the Legend trigger), so this stays a
  // function rather than one shared JSX constant.
  function renderBackLink() {
    if (!onBackToYear) return null
    return (
      <button type="button" onClick={onBackToYear} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-light hover:text-ink">
        <ChevronLeft className="h-4 w-4 flex-shrink-0" /> Overview
      </button>
    )
  }

  return (
    <div className="lg:hidden" data-testid="weekend-mobile">
      {/* Two layouts only — this one all the way up to `lg`, and the
          desktop table beyond it. There used to be a third for the
          md–lg band (an inline Showing + search row and a kebab),
          left over from before the FAB existed; the FAB now covers
          the whole block (hideFrom="lg"), so that row is gone.
          The way back and the coverage-count Legend lead; the Legend
          trigger is information, not an action, so it gets its own
          caption line rather than competing with the link for the
          row. */}
      {/* Toolbar row, then the panel, then the weekends — the order
          every planner month view keeps on a phone: the way back out
          of the month leads, as it does on a desktop, rather than
          sitting under a full panel. The panel holds the month
          stepper, Showing and the request action; search and the
          admin actions are in the FAB. */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-line pb-3">
        {renderBackLink()}
        <MonthLegendTrigger counts={monthStatusCounts} triggerClassName="flex items-center gap-2.5 text-xs text-ink-muted hover:text-ink" />
      </div>
      <div className="mt-3">{renderRequestPanel('weekend-scope-mobile')}</div>
      {/* Fixed-positioned, so where it sits in this block is
          immaterial. The Legend trigger deliberately stays out of it
          (see the row above: information, not an action), so
          `legend` is unused here. Search/Filter render for everyone;
          only More is admin-gated. hideFrom="lg": this whole block
          runs to `lg`, so the FAB has to as well. */}
      <FloatingActionMenu
        hideFrom="lg"
        search={{ value: searchQuery, onChange: setSearchQuery, placeholder: 'Search name…' }}
        filter={{
          facets: [{
            key: 'filter', icon: <Filter className="h-4 w-4" />, label: 'Filter',
            value: filter, onChange: setFilter,
            options: filters.map(f => ({ value: f.key, label: f.label })),
            isActive: filter !== defaultFilter,
          }],
          active: Boolean(searchQuery) || filter !== defaultFilter,
          onClearAll: () => { setSearchQuery(''); setFilter(defaultFilter) },
          sheetTitle: 'Filters',
        }}
        moreMenu={isAdmin ? { title: 'More actions', items: weekendMenuItems } : undefined}
        actions={pasteActions.map(a => ({ ...a, icon: ClipboardPaste }))}
      />
      {/* "Next weekend needing staff" moved to the year overview
          (WeekendYearOverview, between its year selector and Selected
          month panels) — this stays the literal next weekend only,
          informational, fill following coverage health
          (weekendHealthScheme, matching the year overview's legend). */}
      {/* Only in the month that holds it: the card describes one
          specific weekend, and this view only loads the month on
          screen — shown elsewhere it sat above January's weekends
          reading "0 of 4 groups staffed" for a November weekend
          whose entries were never fetched. */}
      {!nextWeekendDismissed && monthSaturdays.includes(nextWeekend) && (
            <NextWeekendCard
              nextWeekendScheme={nextWeekendScheme}
              setNextWeekendDismissed={setNextWeekendDismissed}
              nextWeekend={nextWeekend}
              nextWeekendCoverage={nextWeekendCoverage}
              nextWeekendMine={nextWeekendMine}
            />
      )}


      <div data-testid="weekend-mobile-list" className="mt-3 space-y-3">
        {searchedSaturdays.length === 0 ? (
          <p className="text-sm text-ink-muted">
            {monthSaturdays.length === 0 ? 'No weekends to plan in this month yet.' : 'No weekends match this filter/search.'}
          </p>
        ) : searchedSaturdays.map(saturday => (
          <WeekendMobileCard key={saturday} saturday={saturday} {...card} />
        ))}
      </div>
    </div>
  )
}
