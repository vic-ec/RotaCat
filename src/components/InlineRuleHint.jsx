import { useState } from 'react'
import { CircleQuestionMark } from 'lucide-react'

const DEFAULT_RULES_URL = 'https://github.com/vic-ec/RotaCat/blob/main/EC_LEAVE_PLANNER_RULES.md'

// Perplexity's "3-layer rules" recommendation, applied: one plain-language
// sentence always visible at the decision point, a "How it works" popup
// with the fuller detail (an optional lead sentence plus bullets) for
// anyone who wants it, and a link out to the full written policy —
// replacing a permanently-open wall of bullet points that repeat visitors
// skim past every time they land on the page. `intro` is optional — most
// callers just pass `bullets`; a caller with one specific rule worth
// calling out above the bullet list (e.g. Annual Leave's concurrency caps)
// can pass it separately instead of folding it into `inline`, which keeps
// the always-visible strip a short, scannable line.
//
// `compact`: drops the permanent bordered/shaded box down to a single
// slim text-plus-link row (still opens the same modal) — for a page like
// the Annual planner where this sits above every screen and a
// permanently-open card was eating vertical space repeat visitors don't
// need. Defaults to false so every other caller (Special/Weekend/Rules
// pages) keeps the original boxed treatment unchanged.
//
// `iconOnly`: no inline text, no row of its own — just the trigger, as a
// round accent-tint button (same treatment as MonthWorkspace's "Legend"
// chip) so a caller can drop it directly into an existing row (e.g. right
// next to that Legend chip) instead of it claiming a line of its own.
// `icon`: overrides the default "?" trigger icon (CircleQuestionMark) —
// most iconOnly callers want that default, but a caller styling this as
// part of its own icon row (e.g. WeekendPlannerView's month-view toolbar,
// which uses a plain <Info/> to sit alongside its own other neutral
// toolbar icons) can swap it in without a second copy of this component.
export default function InlineRuleHint({ inline, intro, bullets, rulesUrl = DEFAULT_RULES_URL, compact = false, iconOnly = false, icon }) {
  const [showModal, setShowModal] = useState(false)

  if (iconOnly) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          aria-label="How it works"
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-accent-tint text-accent"
        >
          {icon ?? <CircleQuestionMark className="h-4 w-4" />}
        </button>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 px-4" onClick={() => setShowModal(false)}>
            <div className="card w-full max-w-lg max-h-[80vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-bold text-ink">How it works</h2>
                <button onClick={() => setShowModal(false)} className="text-ink-muted hover:text-ink" aria-label="Close">×</button>
              </div>
              {intro && <p className="mt-3 text-sm text-ink-light">{intro}</p>}
              <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-ink-muted">
                {bullets.map((bullet, i) => <li key={i}>{bullet}</li>)}
              </ul>
              <p className="mt-3 text-xs text-ink-muted">
                <a href={rulesUrl} target="_blank" rel="noreferrer" className="underline hover:text-ink">Full rules</a>
              </p>
            </div>
          </div>
        )}
      </>
    )
  }

  return (
    <div className={compact
      ? 'mt-3 flex items-start justify-between gap-3 text-xs text-ink-muted'
      : 'mt-4 rounded-lg border border-slate-line bg-canvas-sunken p-3 text-sm text-ink-light'}
    >
      {compact ? (
        <>
          <span>{inline}</span>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="flex-shrink-0 whitespace-nowrap font-medium text-accent hover:underline"
          >
            How it works
          </button>
        </>
      ) : (
        <>
          <p>{inline}</p>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="mt-1 text-xs font-medium text-accent hover:underline"
          >
            How it works
          </button>
          <p className="mt-2 text-xs text-ink-muted">
            <a href={rulesUrl} target="_blank" rel="noreferrer" className="underline hover:text-ink">Full rules</a>
          </p>
        </>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 px-4" onClick={() => setShowModal(false)}>
          <div className="card w-full max-w-lg max-h-[80vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-ink">How it works</h2>
              <button onClick={() => setShowModal(false)} className="text-ink-muted hover:text-ink" aria-label="Close">×</button>
            </div>
            {intro && <p className="mt-3 text-sm text-ink-light">{intro}</p>}
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-ink-muted">
              {bullets.map((bullet, i) => <li key={i}>{bullet}</li>)}
            </ul>
            {compact && (
              <p className="mt-3 text-xs text-ink-muted">
                <a href={rulesUrl} target="_blank" rel="noreferrer" className="underline hover:text-ink">Full rules</a>
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
