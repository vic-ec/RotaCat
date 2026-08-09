import { useState } from 'react'
import { DEFAULT_RULES_URL } from './InlineRuleHint'

// Shared bottom-sheet Legend — replaces the drifting "Legend button + a
// separate InlineRuleHint info icon" pattern that used to be duplicated on
// every planner page (each page reading its own colour/role-key legend at a
// different entry point than its own "How it works" rules). One sheet
// shell, two trigger styles per caller: a static "Legend" button
// (Annual/Special, whose legend never changes) or a live-count chip
// showing real numbers (Weekend, since "how many gaps right now" is worth
// surfacing without opening anything). `trigger` is a render-prop —
// `trigger(onClick) => ReactNode` — so trigger content/styling stays fully
// caller-owned. `children` is the legend body (colour/role-key rows,
// whatever the caller needs); ruleIntro/ruleBullets fold in what used to be
// a separate "How it works" trigger, so a caller migrating onto this has
// exactly one entry point to both instead of two.
export default function LegendSheet({ title = 'Legend', trigger, children, ruleIntro, ruleBullets, rulesUrl = DEFAULT_RULES_URL }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {trigger(() => setOpen(true))}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/20 sm:items-center sm:px-4" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="card flex w-full max-w-sm flex-col rounded-b-none p-4 sm:max-h-[80vh] sm:rounded-b-lg"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-bold text-ink">{title}</h2>
              <button type="button" onClick={() => setOpen(false)} className="text-ink-muted hover:text-ink" aria-label="Close">×</button>
            </div>
            <div className="mt-3 max-h-[70vh] overflow-y-auto">
              {children}
              {ruleBullets && ruleBullets.length > 0 && (
                <div className="mt-4 border-t border-slate-line pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">How it works</p>
                  {ruleIntro && <p className="mt-1.5 text-sm text-ink-light">{ruleIntro}</p>}
                  <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs text-ink-muted">
                    {ruleBullets.map((bullet, i) => <li key={i}>{bullet}</li>)}
                  </ul>
                  <p className="mt-2 text-xs text-ink-muted">
                    <a href={rulesUrl} target="_blank" rel="noreferrer" className="underline hover:text-ink">Full rules</a>
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
