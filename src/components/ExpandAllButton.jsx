import { ChevronDown } from 'lucide-react'

// Shown under a grouped list once every section is collapsed, which is the
// one state the section headers themselves can't get you out of in a single
// press: the headers are all that's left on screen, and reopening five of
// them one at a time to find a doctor is a chore. Deliberately only then —
// a permanent control would be one more thing to read on a list that is
// already working.
//
// Full width and quiet (btn-utility, not a filled button): it is a way back
// to the list, not an action on the data in it.
//
// Pair it with allSectionsCollapsed (lib/collapsibleSections) so every
// grouped table decides "show it?" the same way.
export default function ExpandAllButton({ onExpandAll, label = 'Expand all', className = '' }) {
  return (
    <button
      type="button"
      onClick={onExpandAll}
      className={`btn-utility mt-3 flex w-full items-center justify-center gap-1.5 ${className}`}
    >
      <ChevronDown className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
      {label}
    </button>
  )
}
