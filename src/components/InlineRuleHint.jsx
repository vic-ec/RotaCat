import { useState } from 'react'

const DEFAULT_RULES_URL = 'https://github.com/vic-ec/RotaCat/blob/main/EC_LEAVE_PLANNER_RULES.md'

// Perplexity's "3-layer rules" recommendation, applied: one plain-language
// sentence always visible at the decision point, a handful of bullets
// behind an expand toggle for "how it works," and a link out to the full
// written policy — replacing a permanently-open wall of bullet points that
// repeat visitors skim past every time they land on the page.
export default function InlineRuleHint({ inline, bullets, rulesUrl = DEFAULT_RULES_URL }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="mt-4 rounded-lg border border-slate-line bg-canvas-sunken p-3 text-sm text-ink-light">
      <p>{inline}</p>
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="mt-1 text-xs font-medium text-accent hover:underline"
        aria-expanded={expanded}
      >
        {expanded ? 'Hide how it works' : 'How it works'}
      </button>
      {expanded && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-ink-muted">
          {bullets.map((bullet, i) => <li key={i}>{bullet}</li>)}
        </ul>
      )}
      <p className="mt-2 text-xs text-ink-muted">
        <a href={rulesUrl} target="_blank" rel="noreferrer" className="underline hover:text-ink">Full rules</a>
      </p>
    </div>
  )
}
