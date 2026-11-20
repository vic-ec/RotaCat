import { ChevronDown } from 'lucide-react'

// A table section header: the shared teal "sheen" bar running the full
// width of the table, with its label (name, count, chevron) pinned to the
// left edge so it stays readable while the columns scroll sideways.
//
// Only the label is pinned, never the bar. A sticky element painted with
// the sheen gradient is drawn wrongly by WebKit (Safari, and every browser
// on an iPhone): the gradient loses its transparency and the bar renders
// as black and white streaks. This is the arrangement the roster's Lanes
// view already uses, which renders correctly on a phone.
//
// `onToggle`: omit it inside a table row that is itself clickable — the
// label is still a real button (focusable, announces its state), and its
// click bubbles to the row.
export default function SectionBar({ label, count, collapsed, onToggle, className = '' }) {
  return (
    <div className={`sheen-divider block py-1.5 ${className}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="sticky left-0 inline-flex items-center gap-2 px-1 text-left uppercase"
      >
        <span>{label} <span className="divider-meta ml-1 normal-case font-normal">{count}</span></span>
        <ChevronDown className={`divider-meta h-3 w-3 flex-shrink-0 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
      </button>
    </div>
  )
}
