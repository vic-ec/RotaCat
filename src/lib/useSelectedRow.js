import { useState } from 'react'

// Click a row, it stays lit until you click another — the two admin doctor
// tables (Hours Summary, All Leave) are both far wider than a screen, and
// losing your place in a column of near-identical figures is most of the
// difficulty of reading one. Hover already highlights, but a hover is gone
// the moment the pointer leaves and never existed on a touch screen at all.
//
// Clicking the same row again clears it, so a marker can be put away rather
// than only moved.
//
// `rowProps` returns everything a <tr> needs: the handler, the selected
// background, and the aria-selected/role pair that says a row can be picked.
// The background has to be OPAQUE, like the hover — these tables freeze
// their first column, and a frozen column hides what scrolls under it by
// painting over it, so anything translucent there turns it into a window
// onto the columns behind (see LeaveAuditReport's own note).
export function useSelectedRow() {
  const [selectedId, setSelectedId] = useState(null)

  function rowProps(id, { selectedClassName = 'bg-accent-tint', restClassName = '' } = {}) {
    const selected = selectedId === id
    return {
      onClick: () => setSelectedId(current => (current === id ? null : id)),
      'aria-selected': selected,
      className: `cursor-pointer ${selected ? selectedClassName : `${restClassName} hover:bg-canvas-cool`}`,
      isSelected: selected,
    }
  }

  return { selectedId, setSelectedId, rowProps }
}
