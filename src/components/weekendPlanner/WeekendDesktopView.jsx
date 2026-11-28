import { EllipsisVertical } from 'lucide-react'
import { CATEGORY_GROUPS } from '../../lib/weekendPlanner'
import { ROSTER_TEXT_SIZES } from '../../lib/rosterTextSize'
import PageActionsMenu from '../PageActionsMenu'
import PlannerToolbar from '../PlannerToolbar'
import PlannerDetailsCard from '../PlannerDetailsCard'
import { PANEL_RAIL } from '../PlannerRequestPanel'
import { ToolbarFacet } from '../Toolbar'
import MonthLegendTrigger from './MonthLegendTrigger'
import WeekendInspector from './WeekendInspector'
import WeekendTableRow from './WeekendTableRow'

// The desktop layout (lg and up): toolbar, the weekend table and the rail
// (request panel over the Selected weekend card). `row` carries the props
// every WeekendTableRow shares.
export default function WeekendDesktopView({
  onBackToYear, searchQuery, setSearchQuery, monthStatusCounts, textSize, setTextSize, isAdmin, weekendMenuItems,
  rosterBase, searchedSaturdays, monthSaturdays, row, renderRequestPanel, inspectorSaturday, byWeekend,
  displayNames, doctorById, myRequestsBySaturday, exceptionsBySaturday, myName, canViewRequests, editingSaturday,
  setEditingSaturday, setClearWeekendTarget, copyWeekend, openWeekendPaste, clipboard,
}) {
  return (
    <div className="hidden lg:block" data-testid="weekend-desktop">
      {/* The one toolbar every planner month view shares: back out of
          the month, the search that narrows the table, the live
          coverage-count Legend and, for an admin, a compact More
          actions button in the same cluster. The month stepper and the scope picker live in the
          rail panel beside the table, as on the overview. */}
      <div className="mt-6">
        <PlannerToolbar
          onBack={onBackToYear}
          search={{ value: searchQuery, onChange: setSearchQuery, placeholder: 'Search name…' }}
          legend={<MonthLegendTrigger counts={monthStatusCounts} triggerClassName="flex items-center gap-2.5 text-xs text-ink-muted hover:text-ink" />}
          // More actions sits with the search and the legend, one
          // compact control in the same cluster, rather than alone at
          // the far end of the row.
          middle={(
            <div className="flex items-center gap-2">
              <ToolbarFacet
                icon={<span className="text-sm font-semibold leading-none" aria-hidden="true">Aa</span>}
                label="Font size"
                compact
                value={textSize}
                onChange={setTextSize}
                options={ROSTER_TEXT_SIZES.map(size => ({ value: size.key, label: size.name }))}
              />
              {isAdmin && (
            <PageActionsMenu
              items={weekendMenuItems}
              trigger={(onClick, open) => (
                <button type="button" onClick={onClick} aria-expanded={open} aria-label="More Actions" title="More Actions" className="btn-utility flex h-[30px] items-center gap-1 px-2 text-xs">
                  <EllipsisVertical className="h-3.5 w-3.5" /> More
                </button>
              )}
            />
              )}
            </div>
          )}
        />
      </div>

      {/* Table and a sticky rail (request panel on top, Selected
          weekend inspector under it) — the same grid-plus-rail split
          every other planner page uses. */}
      <div className="mt-4 flex items-start gap-4">
        {/* Each weekend is its own card-like row: taller, with a gap
            between rows (border-spacing), so the table reads as a
            list of weekends rather than a dense grid — the names are
            read here, and the rail beside it is for acting on the
            selected one. */}
        <div className="max-h-[70vh] min-w-0 flex-1 overflow-auto" style={{ fontSize: `${rosterBase}px` }}>
          {/* The Weekend column is only as wide as its date (which
              never wraps); the four category columns share the rest
              equally and only widen if a name would wrap, since pills
              never do. */}
          <table className="w-full min-w-[720px] border-separate border-spacing-y-2 text-[1em]">
            <colgroup>
              <col style={{ width: '1%' }} />
              {CATEGORY_GROUPS.map(group => <col key={group.key} style={{ width: `${(99 / CATEGORY_GROUPS.length).toFixed(2)}%` }} />)}
            </colgroup>
            <thead>
              <tr className="text-left text-xs text-ink-muted">
                <th className="sticky top-0 left-0 z-20 bg-canvas-raised px-3 py-2 font-medium">Weekend</th>
                {CATEGORY_GROUPS.map(group => (
                  <th key={group.key} className="sticky top-0 z-10 bg-canvas-raised px-3 py-2 font-medium">{group.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {searchedSaturdays.length === 0 ? (
                <tr>
                  <td colSpan={CATEGORY_GROUPS.length + 1} className="px-3 py-6 text-center text-ink-muted">
                    {monthSaturdays.length === 0 ? 'No weekends to plan in this month yet.' : 'No weekends match this filter/search.'}
                  </td>
                </tr>
              ) : searchedSaturdays.map(saturday => (
                <WeekendTableRow key={saturday} saturday={saturday} {...row} />
              ))}
            </tbody>
          </table>
        </div>

        <div className={`order-first ${PANEL_RAIL}`}>
        {renderRequestPanel('weekend-scope-desktop')}
        <PlannerDetailsCard className="mt-3" eyebrow="Selected weekend" emptyMessage="Select a weekend to see details.">
          {inspectorSaturday && (
            <WeekendInspector
              saturday={inspectorSaturday}
              weekendIndex={monthSaturdays.indexOf(inspectorSaturday) + 1}
              bySaturday={byWeekend.get(inspectorSaturday) || {}}
              displayNames={displayNames}
              doctorById={doctorById}
              isAdmin={isAdmin}
              myRequest={myRequestsBySaturday.get(inspectorSaturday)}
              exceptions={exceptionsBySaturday.get(inspectorSaturday) || []}
              myRequestName={myName}
              canViewRequests={canViewRequests}
              editing={editingSaturday === inspectorSaturday}
              onToggleEditing={() => setEditingSaturday(prev => prev === inspectorSaturday ? null : inspectorSaturday)}
              onClearWeekend={saturday => setClearWeekendTarget(saturday)}
              onCopyWeekend={copyWeekend}
              onPasteWeekend={openWeekendPaste}
              hasWeekendClipboard={clipboard?.granularity === 'weekend'}
            />
          )}
        </PlannerDetailsCard>
        </div>
      </div>
    </div>
  )
}
