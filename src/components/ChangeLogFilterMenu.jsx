import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDismissablePopover } from '../lib/useDismissablePopover'
import { computeAnchoredPosition } from '../lib/popoverPosition'
import SelectMenu from './SelectMenu'

function FilterIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h16M7 12h10M10 19h4" />
    </svg>
  )
}

// Collapses the Admin/Doctor/Change-type/(Role or Category) filters into a
// single icon button opening an anchored popover — the four full-width
// dropdowns they replace didn't fit a mobile-width review-log modal
// without wrapping to several rows. `extraFilter` is the 4th, caller-
// specific dropdown: { label, options, value, onChange, disabled? } — the
// roster log uses it for a Role filter, the weekend planner log for a
// Category filter, since only one of those applies to either table.
export default function ChangeLogFilterMenu({
  adminOptions, doctorOptions, actionOptions,
  adminId, doctorId, action,
  onAdminChange, onDoctorChange, onActionChange,
  extraFilter,
  activeCount,
}) {
  const [open, setOpen] = useState(false)
  const [anchorRect, setAnchorRect] = useState(null)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  useDismissablePopover(open, () => setOpen(false), menuRef, [triggerRef])

  function toggle() {
    if (open) { setOpen(false); return }
    setAnchorRect(triggerRef.current.getBoundingClientRect())
    setOpen(true)
  }

  const menuWidth = 220
  const positionStyle = anchorRect ? computeAnchoredPosition(anchorRect, menuWidth) : null

  return (
    <span className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Filters"
        className="btn-secondary relative h-[30px] w-[30px] flex-shrink-0 p-0"
      >
        <FilterIcon className="mx-auto h-4 w-4" />
        {activeCount > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] font-semibold text-white">
            {activeCount}
          </span>
        )}
      </button>
      {open && positionStyle && createPortal(
        <div
          ref={menuRef}
          style={{ ...positionStyle, width: menuWidth }}
          className="fixed z-50 space-y-3 rounded-lg border border-slate-line bg-canvas-raised p-3 shadow-raised"
        >
          <div>
            <label className="label-text">Admin</label>
            <SelectMenu alwaysDown value={adminId} onChange={onAdminChange}
              options={[{ value: '', label: 'All admins' }, ...adminOptions]} />
          </div>
          <div>
            <label className="label-text">Doctor</label>
            <SelectMenu alwaysDown value={doctorId} onChange={onDoctorChange}
              options={[{ value: '', label: 'All doctors' }, ...doctorOptions]} />
          </div>
          <div>
            <label className="label-text">Change type</label>
            <SelectMenu alwaysDown value={action} onChange={onActionChange} options={actionOptions} />
          </div>
          {extraFilter && (
            <div>
              <label className="label-text">{extraFilter.label}</label>
              <SelectMenu
                alwaysDown
                value={extraFilter.value}
                onChange={extraFilter.onChange}
                options={extraFilter.options}
                disabled={!!extraFilter.disabled}
              />
            </div>
          )}
        </div>,
        document.body
      )}
    </span>
  )
}
