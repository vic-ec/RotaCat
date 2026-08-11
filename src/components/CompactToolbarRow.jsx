import { CircleX } from 'lucide-react'
import ClearableInput from './ClearableInput'
import { ToolbarFacet } from './Toolbar'

function SearchIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}

// Search + optional Sort + Filter, all on one row at a fixed 30px control
// height — the All Staff tab's own toolbar layout (docs/design/layout-
// spec.md §5), shared here so every list page that needs it (Staff's
// Pending Approvals/User Requests, the leave Requests queue, Intern
// rotations) renders identically rather than falling back to the generic
// Toolbar component, whose mobile view collapses Sort+Filter into a single
// "Filters" sheet trigger instead of keeping them as always-visible
// buttons next to a narrower search box. `sortFacet` is optional — omit it
// for a page with only a Filter (e.g. Intern rotations). `desktop` picks
// which breakpoint's copy this instance renders; mount one of each (both
// exist in the DOM, only one is ever visible via CSS) the same way the
// accounts tab's own mobile/desktop toolbar pair already does. `trailing`
// is an optional extra control rendered after Filter and before the clear
// button — for a page-specific control that isn't a Sort/Filter facet
// (e.g. Intern rotations' Table/Timeline view toggle).
export default function CompactToolbarRow({
  searchValue, onSearchChange, searchPlaceholder,
  sortFacet, filterFacet, clearActive, onClearAll,
  trailing,
  desktop = false, className = '',
}) {
  return (
    <div className={`${desktop ? 'hidden items-center gap-2 md:flex' : 'flex items-center gap-2 md:hidden'} ${className}`}>
      <div className={desktop ? 'w-80 flex-shrink-0' : 'min-w-0 flex-1'}>
        <ClearableInput
          type="text"
          value={searchValue}
          onChange={e => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="input-field h-[30px] py-1"
          clearLabel="Clear search"
          icon={<SearchIcon className="h-4 w-4" />}
        />
      </div>
      {sortFacet && <ToolbarFacet {...sortFacet} />}
      {filterFacet && <ToolbarFacet {...filterFacet} />}
      {trailing}
      {clearActive && (
        <button
          onClick={onClearAll}
          aria-label="Clear all filters"
          title="Clear all filters"
          className="toolbar-clear-btn"
        >
          <CircleX className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
