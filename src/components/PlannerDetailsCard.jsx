import { ActionSheet } from './ActionSheet'
import { useIsDesktop } from '../lib/useIsDesktop'

// The second card in every planner rail, under the request panel: what the
// grid's current selection is about — SELECTED MONTH on an overview,
// SELECTED DAY or SELECTED WEEKEND on a month view. The content (DayDetails,
// WeekendDetails, MonthSummary) is written once and mounted here in one of
// two containers, never both at once:
//   - desktop (lg+): a white card in the rail, replacing the centred popup
//     the leave planners used to open for a day
//   - below lg: a bottom sheet (ActionSheet), opened when a day or weekend
//     is tapped and closed with `onClose`; nothing inline
// `emptyMessage` is the desktop card's resting state ("Select a day to see
// details."); an overview, where a month is always selected, never shows
// it. The breakpoint check is useIsDesktop — a real matchMedia query, so
// the two containers are genuinely different DOM rather than two copies
// hidden by CSS (which would double every heading for a screen reader and
// a test alike).
export default function PlannerDetailsCard({ eyebrow, title, emptyMessage, open = false, onClose, children, className = '' }) {
  const isDesktop = useIsDesktop()

  if (isDesktop) {
    return (
      <div data-testid="planner-details-card" className={`card p-4 ${className}`}>
        <p className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">{eyebrow}</p>
        {children ? (
          <>
            {title && <h3 className="mt-1 font-display text-base font-semibold text-ink">{title}</h3>}
            {children}
          </>
        ) : (
          <p className="mt-2 text-sm text-ink-muted">{emptyMessage}</p>
        )}
      </div>
    )
  }

  if (!open || !children) return null
  return (
    <ActionSheet title={eyebrow} onClose={onClose}>
      <div data-testid="planner-details-sheet" className="px-3 pb-3 pt-1">
        {title && <h3 className="font-display text-base font-semibold text-ink">{title}</h3>}
        {children}
      </div>
    </ActionSheet>
  )
}
