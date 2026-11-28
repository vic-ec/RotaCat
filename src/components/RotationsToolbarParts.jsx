import { EllipsisVertical } from 'lucide-react'
import LegendSheet from './LegendSheet'
import { LegendIcon } from './PlannerIcons'
import PageActionsMenu from './PageActionsMenu'
import { ROTATION_TYPE_KEY_OPTIONS, ROTATION_TYPE_COLOR } from '../lib/staffDefaults'
import { ROTATIONS_PAGE_TITLE, ROTATIONS_MENU_ITEMS } from './rotationsMenuItems'

// The toolbar pieces every Rotations tab (Active, Upcoming, Completed)
// shares, so the three toolbars can't drift apart.

// Laid out like the leave legend (LeaveMatrix's): one row per rotation,
// a 20px tile then its name, at text-sm. The tile is a grid cell in small —
// the rotation's colour with its code on it — so the key reads exactly as
// the cells it explains.
export function RotationLegendSwatches() {
  return (
    <div className="flex flex-col gap-2 text-sm text-ink">
      {ROTATION_TYPE_KEY_OPTIONS.map(o => (
        <span key={o.key} className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-[5px] text-[9px] font-semibold text-white"
            style={{ backgroundColor: ROTATION_TYPE_COLOR[o.key] }}
          >
            {o.code}
          </span>
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
