import { EllipsisVertical } from 'lucide-react'
import LegendSheet from './LegendSheet'
import { LegendIcon } from './PlannerIcons'
import PageActionsMenu from './PageActionsMenu'
import { ROTATION_TYPE_KEY_OPTIONS, ROTATION_TYPE_COLOR } from '../lib/staffDefaults'
import { ROTATIONS_PAGE_TITLE, ROTATIONS_MENU_ITEMS } from './rotationsMenuItems'

// The toolbar pieces every Rotations tab (Active, Upcoming, Completed)
// shares, so the three toolbars can't drift apart.

export function RotationLegendSwatches() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
      {ROTATION_TYPE_KEY_OPTIONS.map(o => (
        <span key={o.key} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 flex-shrink-0 rounded-sm" style={{ backgroundColor: ROTATION_TYPE_COLOR[o.key] }} />
          {o.label}
        </span>
      ))}
    </div>
  )
}

export function RotationLegendButton() {
  return (
    <LegendSheet
      title="Legend"
      trigger={onClick => (
        <button type="button" onClick={onClick} aria-label="Legend" title="Legend" className="btn-utility h-[30px] w-[30px] p-0"><LegendIcon className="h-4 w-4" /></button>
      )}
    >
      <RotationLegendSwatches />
    </LegendSheet>
  )
}

export function RotationsMoreMenu() {
  return (
    <PageActionsMenu
      title={ROTATIONS_PAGE_TITLE}
      items={ROTATIONS_MENU_ITEMS}
      trigger={(onClick, open) => (
        <button
          type="button"
          onClick={onClick}
          aria-label="More actions"
          aria-expanded={open}
          className={`icon-btn ${open ? 'icon-btn-active' : 'icon-btn-idle'}`}
        >
          <EllipsisVertical className="h-4 w-4" />
        </button>
      )}
    />
  )
}
