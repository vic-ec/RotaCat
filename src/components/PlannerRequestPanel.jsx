import { useAuth } from '../context/AuthContext'

// The one "here's where you stand, here's how to ask" panel, shared by all
// three planners — Annual's own capacity card was the only entry point to a
// leave request from any planner page, and only on a phone. Same four slots
// everywhere, and a planner fills the ones it has something to say in:
//
// The slots, in the one order every planner uses:
//
//   eyebrow      which planner and which view ("Annual leave · Overview",
//                "Annual leave · Month")
//   aside        one optional secondary control on the eyebrow's own line
//   stepper      the period being browsed — the view's ONE period control
//                (year on an overview, month on a month view): a DateStepper,
//                `centered`, no Today
//   children     the "Showing" picker — its label is always "Showing"
//   headline     the reading (PanelReading) — month views only
//   capacityBar  a CapacityBar — month views on the leave planners only
//   action       a full-width primary button, the only filled button on
//                the page
//
// The action is gated on canSubmitLeave here rather than at each call site,
// so an admin or clerk reads the same panel without a button they'd be
// refused at submission. Everything else renders for everyone.
//
// Placement is the same on every planner page, overview and month view
// alike: on a desktop (lg+) it leads the sticky right-hand rail beside the
// grid (see PANEL_RAIL); below that it sits above the grid, full width.
export default function PlannerRequestPanel({ eyebrow, aside, stepper, children, headline, capacityBar, actionLabel, onAction, className = '' }) {
  const { canSubmitLeave } = useAuth()

  return (
    <div data-testid="planner-request-panel" className={`rounded-xl border border-slate-line bg-gradient-to-br from-accent-tint to-canvas p-3 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-accent-dark">{eyebrow}</p>
        {aside}
      </div>
      {stepper && <div className="mt-2">{stepper}</div>}
      {children}
      {headline}
      {capacityBar && <div className="mt-3">{capacityBar}</div>}
      {canSubmitLeave && actionLabel && (
        <button type="button" onClick={onAction} className="btn-primary mt-2 block w-full text-center">
          {actionLabel}
        </button>
      )}
    </div>
  )
}

// One number and what it counts — the panel's reading. Tabular figures so
// the number doesn't jump width as the month changes.
export function PanelReading({ value, unit, valueClassName = 'text-ink' }) {
  return (
    <p className="mt-1.5 flex items-baseline gap-1.5">
      <span className={`font-display text-3xl font-bold tabular-nums ${valueClassName}`}>{value}</span>
      <span className="text-xs text-ink-muted">{unit}</span>
    </p>
  )
}

// The rail every planner page hangs this panel in, beside its grid: on a
// desktop (lg+) a 320px column that sticks to the top of the viewport
// while the grid scrolls; below that it comes first in the stack, full
// width, so the panel sits above the grid on a phone. A flex child of a
// `flex flex-col gap-4 lg:flex-row lg:items-start` row whose grid is
// `min-w-0 lg:flex-1`.
//
// lg:w-80, never a bare w-80 beside w-full: both are unscoped `width`
// utilities on one element, and which wins is Tailwind's stylesheet order,
// not this string's — it was landing on w-full at every size and starving
// the grid beside it of any width at all.
export const PANEL_RAIL = 'order-first w-full flex-shrink-0 lg:order-none lg:sticky lg:top-4 lg:w-80'
