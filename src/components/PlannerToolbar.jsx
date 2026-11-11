import { useState } from 'react'
import { ChevronLeft, Search, X } from 'lucide-react'
import ClearableInput from './ClearableInput'

// The one toolbar every planner month view shares, so the rail beside the
// grid starts at the same height on all three:
//
//   [< Overview]  [Search name…]  [legend or counts ……………]  [Calendar | List]
//
// `onBack` is always the way back to the overview; `search` is
// { value, onChange, placeholder }; `legend` is a compact trigger (the
// Legend sheet's icon button) shown on every viewport; `middle` is the
// inline desktop-only content beside it (a capacity key, or "2 staffed · 2
// need staff"); `viewToggle` fills the right-hand slot where a planner has
// a second view. The slot keeps its width when there is no toggle, so the
// layout never shifts between planners.
//
// Mobile (< lg): the back link and the toggle share the row; search
// collapses behind an icon that opens a second row with the field, and the
// inline `middle` content gives way to the compact `legend` trigger alone.
export default function PlannerToolbar({ onBack, backLabel = 'Overview', search, legend, middle, viewToggle }) {
  const [searchOpen, setSearchOpen] = useState(false)

  const backLink = (
    <button
      type="button"
      onClick={onBack}
      className="inline-flex flex-shrink-0 items-center gap-1.5 text-sm font-medium text-ink-light hover:text-ink"
    >
      <ChevronLeft className="h-4 w-4 flex-shrink-0" /> {backLabel}
    </button>
  )

  return (
    <div data-testid="planner-toolbar" className="border-b border-slate-line pb-3">
      {/* One row that adapts, not a desktop row and a mobile row: every
          control exists exactly once in the DOM (one back link, one legend
          trigger), and only the search swaps between a field and an icon. */}
      <div className="flex h-11 items-center gap-2 lg:gap-3">
        {backLink}
        {search && (
          <div className="hidden w-64 flex-shrink-0 lg:block">
            <ClearableInput
              type="search"
              aria-label="Search name"
              value={search.value}
              onChange={e => search.onChange(e.target.value)}
              placeholder={search.placeholder ?? 'Search name…'}
              className="input-field w-full"
            />
          </div>
        )}
        {search && (
          <button
            type="button"
            onClick={() => setSearchOpen(o => !o)}
            aria-label={searchOpen ? 'Close search' : 'Search'}
            aria-expanded={searchOpen}
            className={`btn-utility h-[30px] w-[30px] p-0 lg:hidden ${searchOpen ? 'text-accent' : ''}`}
          >
            {searchOpen ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
          </button>
        )}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {legend}
          <div className="hidden min-w-0 lg:block">{middle}</div>
        </div>
        <div className="flex flex-shrink-0 items-center justify-end lg:w-[132px]">{viewToggle}</div>
      </div>
      {search && searchOpen && (
        <div className="mt-2 lg:hidden">
          <ClearableInput
            type="search"
            aria-label="Search name"
            autoFocus
            value={search.value}
            onChange={e => search.onChange(e.target.value)}
            placeholder={search.placeholder ?? 'Search name…'}
            className="input-field w-full"
          />
        </div>
      )}
    </div>
  )
}
