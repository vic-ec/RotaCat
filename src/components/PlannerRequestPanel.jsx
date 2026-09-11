import { useAuth } from '../context/AuthContext'

// The one "here's where you stand, here's how to ask" panel, shared by all
// three planners — Annual's own capacity card was the only entry point to a
// leave request from any planner page, and only on a phone. Same four slots
// everywhere, and a planner fills the ones it has something to say in:
//
//   eyebrow   who and when this reading is about ("For Medical Officer · September")
//   aside     one optional secondary control on the eyebrow's own line
//   children  the reading itself (see PanelReading) or a control, or nothing
//             at all where the planner has no capacity concept (Weekends)
//   action    a full-width primary button
//
// The action is gated on canSubmitLeave here rather than at each call site,
// so an admin or clerk reads the same panel without a button they'd be
// refused at submission. Everything else renders for everyone.
export default function PlannerRequestPanel({ eyebrow, aside, children, actionLabel, onAction, className = '' }) {
  const { canSubmitLeave } = useAuth()

  return (
    <div className={`rounded-xl border border-slate-line bg-gradient-to-br from-accent-tint to-canvas p-3 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-accent-dark">{eyebrow}</p>
        {aside}
      </div>
      {children}
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

// The desktop placement every planner uses: a 320px card, right-aligned,
// directly above whatever the page's own right-hand rail or grid is — the
// same width as the Selected month/weekend rails, so the two share an edge.
export const PANEL_DESKTOP_WRAPPER = 'mb-3 hidden justify-end lg:flex'
export const PANEL_DESKTOP_WIDTH = 'w-80'
