import { ToolbarFacet } from './Toolbar'
import { changeLogFilterFacets } from './changeLogFilterFacets'

// Admin/Doctor/Change-type/(Role or Category) filters for the Roster and
// Weekend Planner review logs — four independent single-select facets built
// on the app's one shared quick-select-pill primitive (ToolbarFacet, aka
// QuickSelectButton), same shape as RosterDashboardPage's Month/Year facets.
// Previously a single icon-only trigger collapsing all four into stacked
// SelectMenu dropdowns behind one popover; that read as its own bespoke
// interaction model next to every other filter surface in the app, which
// all use this same facet row instead.
//
// The facets themselves live in changeLogFilterFacets.jsx (see its own
// comment) so a caller that also folds them into the Toolbar FAB below `md`
// isn't restating them — this component is just the desktop row that
// renders them.
export default function ChangeLogFilterMenu(props) {
  return (
    <>
      {changeLogFilterFacets(props).map(({ key, ...facet }) => <ToolbarFacet key={key} {...facet} />)}
    </>
  )
}
