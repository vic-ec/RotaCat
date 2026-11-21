import { ArrowLeftRight, ArrowRight, CircleDashed, Minus, Plus, Replace } from 'lucide-react'
import AdminBadge from './AdminBadge'
import { groupByDay, logTime } from '../lib/reviewLog'

// Shared layout for the roster and weekend planner review logs: changes
// grouped under a date header ("Fri 20 Nov 2026"), then one row each —
// Time, Type, Change, By. On a phone the same row stacks: time, type and
// initials on one line, the change underneath.
//
// Type chips stay neutral grey with a small symbol: the red/amber/green
// palette is reserved for roster status, not for kinds of edit.
const TYPE_ICONS = {
  assigned: Plus,
  added: Plus,
  replaced: ArrowLeftRight,
  vacated: CircleDashed,
  removed: Minus,
  moved: ArrowRight,
  overwrote: Replace,
}

export function TypeChip({ type, label }) {
  const Icon = TYPE_ICONS[type] ?? Plus
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-slate-line bg-canvas px-2 py-px text-xs font-semibold text-ink-light">
      <Icon className="h-3 w-3 flex-shrink-0 text-ink-muted" aria-hidden="true" />
      {label}
    </span>
  )
}

// A struck-through name: the person who came off the shift/weekend.
export function OffName({ children }) {
  return <s className="text-ink-muted decoration-ink-muted/70">{children}</s>
}

// The muted joining word in "Jenna Smith with Musa Omar" / "… to …".
export function Joiner({ children }) {
  return <span className="text-ink-muted">{' '}{children}{' '}</span>
}

// items: [{ id, at, type, typeLabel, admin: { short, fullName }, change: node, framed? }]
// `framed` wraps the row in a light box — used for a multi-change batch.
export default function ReviewLogList({ items }) {
  const days = groupByDay(items, item => item.at)
  return (
    <div className="text-sm">
      <div className="hidden grid-cols-[4rem_8.5rem_minmax(0,1fr)_auto] gap-x-3 border-b border-slate-line pb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted md:grid">
        <span>Time</span>
        <span>Type</span>
        <span>Change</span>
        <span className="text-right">By</span>
      </div>
      {days.map(day => (
        <section key={day.key} aria-label={day.label}>
          <h3 className="mt-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-muted after:h-px after:flex-1 after:bg-slate-line">
            {day.label}
          </h3>
          <ul>
            {day.items.map(item => (
              <li
                key={item.id}
                className={item.framed
                  ? 'my-1.5 rounded-lg border border-slate-line bg-canvas px-2.5 md:-mx-2.5'
                  : 'border-b border-slate-hairline last:border-b-0'}
              >
                <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 py-2.5 md:grid-cols-[4rem_8.5rem_minmax(0,1fr)_auto]">
                  <span className="pt-0.5 tabular-nums text-ink-muted">{logTime(item.at)}</span>
                  <span className="pt-px"><TypeChip type={item.type} label={item.typeLabel} /></span>
                  <div className="col-span-3 row-start-2 min-w-0 text-ink-light md:col-span-1 md:col-start-3 md:row-start-1">
                    {item.change}
                  </div>
                  <span className="col-start-3 row-start-1 justify-self-end md:col-start-4">
                    <AdminBadge short={item.admin.short} fullName={item.admin.fullName} />
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
