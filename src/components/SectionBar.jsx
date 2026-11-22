import { ChevronDown } from 'lucide-react'

// Shared section header for wide, horizontally scrolling tables.
//
// The sheen bar spans the full table width and scrolls with it; only the
// label (name, count, chevron) is pinned to the left edge. Pinning the whole
// bar isn't an option: WebKit (Safari and every iPhone browser) draws the
// sheen gradient on a sticky element without its transparency, so bars
// showed as black and white streaks.
//
// The bar's own rounded left end (and its mint edge at night) scrolls off
// with the bar, though, so the pinned label redraws them: `.section-bar-cap`
// paints the rounded corner and the 4px gap around it in the colour behind
// the bar, plus the mint edge in night vision — solid colours only, so the
// WebKit problem doesn't come back. `surround` names that colour: 'canvas'
// for tables on the page ground, 'card' for tables inside a .card.
const SURROUND = {
  canvas: 'rgb(var(--color-canvas))',
  card: 'rgb(var(--color-card))',
}

export default function SectionBar({ label, count, collapsed, onToggle, surround = 'canvas', className = '' }) {
  return (
    <div className={`sheen-divider !items-stretch !p-0 ${className}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        title={collapsed ? 'Expand' : 'Collapse'}
        style={{ '--section-bar-surround': SURROUND[surround] ?? SURROUND.canvas }}
        className="section-bar-cap sticky left-1 inline-flex items-center gap-2 py-1.5 pl-3 pr-2 text-left uppercase"
      >
        <span>{label} <span className="divider-meta ml-1 normal-case font-normal">{count}</span></span>
        <ChevronDown className={`divider-meta h-3 w-3 flex-shrink-0 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
      </button>
    </div>
  )
}
