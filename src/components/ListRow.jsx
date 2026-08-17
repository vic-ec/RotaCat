import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, X } from 'lucide-react'
import { useDismissablePopover } from '../lib/useDismissablePopover'
import { computeAnchoredPosition } from '../lib/popoverPosition'

function ChevronRightIcon(props) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  )
}
function KebabIcon(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="5" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="12" cy="19" r="1.75" />
    </svg>
  )
}

// Shared row-hover/selected treatment — reuses the app's existing
// `canvas-sunken` hover tint (used on every other clickable row/button
// already) rather than the spec's literal #F7F8FA, so ListRow hovers read
// the same as everything else instead of introducing a second gray.
// Selected uses the same accent-light fill AppLayout's own active nav item
// uses, plus a left accent stripe standing in for the spec's "+ border"
// without breaking the flush look of a `divide-y` row list.
const ROW_BASE = 'flex items-center gap-3 px-4 py-2 transition-colors hover:bg-canvas-sunken active:bg-canvas-sunken'
const ROW_SELECTED = 'bg-accent-light border-l-2 border-accent pl-[14px]'

// Desktop: up to 2-3 inline icon buttons, always titled. Mobile: the same
// actions collapse into one kebab-triggered overflow menu instead of
// cramming icon buttons into a narrow row (§15).
function RowActions({ actions }) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState(null)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  useDismissablePopover(open, () => setOpen(false), menuRef, [triggerRef])

  if (!actions || actions.length === 0) return null

  function toggle(e) {
    e.stopPropagation()
    if (open) { setOpen(false); return }
    setAnchor(triggerRef.current.getBoundingClientRect())
    setOpen(true)
  }

  const menuWidth = 180
  const positionStyle = anchor ? computeAnchoredPosition(anchor, menuWidth) : null

  return (
    <>
      {/* Desktop inline icons */}
      <div className="hidden flex-shrink-0 items-center gap-1 md:flex">
        {actions.slice(0, 3).map(a => (
          <button
            key={a.label}
            type="button"
            title={a.label}
            aria-label={a.label}
            disabled={a.disabled}
            onClick={e => { e.stopPropagation(); a.onClick() }}
            className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-canvas-sunken active:bg-canvas-sunken disabled:cursor-not-allowed disabled:opacity-40 ${a.tone === 'danger' ? 'text-flagRed' : 'text-ink-light'}`}
          >
            {a.icon}
          </button>
        ))}
      </div>

      {/* Mobile overflow menu — 44x44 kebab trigger, same actions */}
      <div className="relative flex-shrink-0 md:hidden">
        <button
          ref={triggerRef}
          type="button"
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="More actions"
          className="flex h-11 w-11 items-center justify-center text-ink-muted"
        >
          <KebabIcon className="h-5 w-5" />
        </button>
        {open && positionStyle && createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ ...positionStyle, width: menuWidth }}
            className="fixed z-50 overflow-hidden rounded-xl border border-slate-line bg-canvas-raised py-1 shadow-raised"
          >
            {actions.map(a => (
              <button
                key={a.label}
                type="button"
                disabled={a.disabled}
                onClick={e => { e.stopPropagation(); setOpen(false); a.onClick() }}
                className={`flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm transition-colors hover:bg-canvas-sunken active:bg-canvas-sunken disabled:cursor-not-allowed disabled:opacity-40 ${a.tone === 'danger' ? 'text-flagRed' : 'text-ink'}`}
              >
                {a.icon}
                {a.label}
              </button>
            ))}
          </div>,
          document.body
        )}
      </div>
    </>
  )
}

// Variant A — identity row (people): checkbox → avatar → name → role tag →
// meta subtext → actions. Mobile stacks avatar+name+tag on line one, meta
// on line two, per §15. See docs/design/layout-spec.md §7.
export function ListRowIdentity({
  checked, onToggleCheck, selectLabel,
  avatar, name, tag, meta,
  actions, onClick, selected = false, chevron = false,
}) {
  const clickable = Boolean(onClick)
  return (
    <div
      onClick={onClick}
      className={`min-h-[56px] ${ROW_BASE} ${clickable ? 'cursor-pointer' : ''} ${selected ? ROW_SELECTED : ''}`}
    >
      {onToggleCheck && (
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggleCheck}
          onClick={e => e.stopPropagation()}
          aria-label={selectLabel}
          className="h-4 w-4 flex-shrink-0 rounded border-slate-line accent-accent md:h-4 md:w-4"
          style={{ minWidth: 16 }}
        />
      )}
      {avatar && <span className="flex-shrink-0">{avatar}</span>}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium text-ink">{name}</p>
          {tag}
        </div>
        {meta && <p className="mt-0.5 truncate text-xs text-ink-muted">{meta}</p>}
      </div>
      <RowActions actions={actions} />
      {chevron && <ChevronRightIcon className="h-4 w-4 flex-shrink-0 text-ink-muted" />}
    </div>
  )
}

// Variant B — record row (rosters, documents): checkbox → title →
// subtitle/date → status tag → chevron. Title/subtitle already stack
// vertically at every width; the status tag drops to its own line below
// the title if it doesn't fit rather than truncating (§15) — driven by
// `flex-wrap`, not a breakpoint, so it degrades gracefully at any width.
// See docs/design/layout-spec.md §7.
export function ListRowRecord({
  checked, onToggleCheck, selectLabel,
  title, subtitle, statusTag,
  onClick, selected = false, chevron = true,
}) {
  const clickable = Boolean(onClick)
  return (
    <div
      onClick={onClick}
      className={`min-h-[56px] ${ROW_BASE} ${clickable ? 'cursor-pointer' : ''} ${selected ? ROW_SELECTED : ''}`}
    >
      {onToggleCheck && (
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggleCheck}
          onClick={e => e.stopPropagation()}
          aria-label={selectLabel}
          className="h-4 w-4 flex-shrink-0 rounded border-slate-line accent-accent"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="truncate text-sm font-medium text-ink">{title}</p>
          {statusTag}
        </div>
        {subtitle && <p className="mt-0.5 truncate text-xs text-ink-muted">{subtitle}</p>}
      </div>
      {chevron && <ChevronRightIcon className="h-4 w-4 flex-shrink-0 text-ink-muted" />}
    </div>
  )
}

// The approve/reject glyph pair, shared by every approval surface in the
// app — the rows themselves, SelectAllRow's bulk actions, and Staff's User
// Requests rows — so a check means the same thing and looks the same
// wherever a request is reviewed. Bare `Check`/`X` rather than lucide's
// ringed `CircleCheck`/`CircleX`: the button below already draws the
// circle, so a ringed glyph reads as a circle inside a circle at 32px.
export const APPROVE_ICON = <Check className="h-4 w-4" strokeWidth={2.5} />
export const REJECT_ICON = <X className="h-4 w-4" strokeWidth={2.5} />

// One circular-outline icon action — teal-outline check (approve),
// red-outline X (reject), or a neutral accent-outline extra action (e.g.
// "view in calendar"). Always inline, never collapsed to a kebab menu —
// unlike RowActions' secondary actions, approve/reject/extra are the whole
// reason an approval row exists, on every viewport.
const APPROVAL_ACTION_TONE_CLASS = {
  success: 'border-success/40 text-success hover:border-success hover:bg-success-bg active:border-success active:bg-success active:text-white',
  danger: 'border-danger/40 text-danger hover:border-danger hover:bg-danger-bg active:border-danger active:bg-danger active:text-white',
  neutral: 'border-accent/40 text-accent hover:border-accent hover:bg-accent-tint active:border-accent active:bg-accent active:text-white',
}
export function ApprovalAction({ icon, label, tone = 'neutral', onClick, disabled }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={e => { e.stopPropagation(); onClick() }}
      className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${APPROVAL_ACTION_TONE_CLASS[tone]}`}
    >
      {icon}
    </button>
  )
}

// Row for an approve/reject queue (Staff's Pending Approvals, Leave
// Requests review) — the same identity shell as ListRowIdentity (checkbox,
// avatar, name, neutral role/category tag, one-line meta), but Approve/
// Reject/extra render as always-visible circular-outline buttons rather
// than going through ListRowIdentity's kebab-collapsing RowActions.
// `children`, when given, renders below the identity row (inside the same
// selected/hover shell) — for a page that needs extra per-row content
// (warnings, an inline reject-reason field) that doesn't fit the fixed
// checkbox/avatar/name/tag/meta/actions shape.
export function ApprovalRow({
  checked, onToggleCheck, selectLabel,
  avatar, name, tag, meta,
  onApprove, onReject, approveLabel = 'Approve', rejectLabel = 'Reject',
  approveDisabled = false, rejectDisabled = false,
  extraAction, onClick, selected = false, children,
}) {
  const clickable = Boolean(onClick)
  return (
    <div className={selected ? ROW_SELECTED : ''}>
      <div
        onClick={onClick}
        className={`min-h-[56px] ${ROW_BASE} ${clickable ? 'cursor-pointer' : ''}`}
      >
        {onToggleCheck && (
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggleCheck}
            onClick={e => e.stopPropagation()}
            aria-label={selectLabel}
            className="h-4 w-4 flex-shrink-0 rounded border-slate-line accent-accent"
            style={{ minWidth: 16 }}
          />
        )}
        {avatar && <span className="flex-shrink-0">{avatar}</span>}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium text-ink">{name}</p>
            {tag}
          </div>
          {meta && <p className="mt-0.5 truncate text-xs text-ink-muted">{meta}</p>}
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          {extraAction && (
            <ApprovalAction icon={extraAction.icon} label={extraAction.label} tone="neutral" onClick={extraAction.onClick} disabled={extraAction.disabled} />
          )}
          <ApprovalAction icon={APPROVE_ICON} label={approveLabel} tone="success" onClick={onApprove} disabled={approveDisabled} />
          <ApprovalAction icon={REJECT_ICON} label={rejectLabel} tone="danger" onClick={onReject} disabled={rejectDisabled} />
        </div>
      </div>
      {children && <div className="px-4 pb-3">{children}</div>}
    </div>
  )
}

// Select-all header for a bulk-selection list — white/plain when nothing's
// checked, teal-tinted once anything is, so a partially or fully selected
// list stays visually distinct from the idle state (rather than always
// tinted, or never tinted, depending on which page you're on).
//
// This row also owns the bulk actions themselves, rather than a separate
// bar fixed to the bottom of the viewport: pass `count` (how many rows are
// selected), `actions` (`[{ label, onClick, tone }]` — `tone: 'danger'`
// gets the reject treatment, anything else the approve one) and `onCancel`,
// and the right-hand side of this row becomes "{n} selected" + those
// actions the moment anything is checked. Mobile renders approve/reject as
// the same circular-outline icon buttons (ApprovalAction) the rows below
// use, so the header stays one line at 375px; `md:` and up swaps to
// labelled text buttons. `disabled` (e.g. while a bulk action is already in
// flight) disables every action at once — Cancel stays enabled so a stuck
// action can still be dismissed.
//
// Cancel stays a text button on every viewport, unlike approve/reject: the
// only sensible glyph for it is an ✕, which is also the reject glyph, and
// two adjacent ✕s where one rejects the requests and the other just clears
// the checkboxes is not a distinction worth asking anyone to make.
const BULK_ACTION_ICON = {
  danger: REJECT_ICON,
  success: APPROVE_ICON,
}
const BULK_ACTION_BUTTON_CLASS = {
  danger: 'btn-danger-outline',
  success: 'btn-success',
}
export function SelectAllRow({
  checked, onToggleCheck, selectLabel, active,
  count = 0, actions = [], onCancel, disabled = false,
}) {
  const showActions = count > 0 && actions.length > 0
  return (
    <div className={`flex min-h-[48px] items-center gap-2 px-4 py-2 transition-colors md:gap-3 md:px-5 ${active ? 'bg-accent-tint' : 'bg-canvas-raised'}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggleCheck}
        aria-label={selectLabel}
        className="h-4 w-4 flex-shrink-0 rounded border-slate-line accent-accent"
        style={{ minWidth: 16 }}
      />
      <span className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Select all</span>
      {showActions && (
        <div className="ml-auto flex flex-shrink-0 items-center gap-2">
          <span className="whitespace-nowrap text-xs font-medium text-ink-light">{count} selected</span>

          {/* Mobile: icon-only, matching each row's own approve/reject buttons */}
          <div className="flex items-center gap-1.5 md:hidden">
            {actions.map(a => {
              const tone = a.tone === 'danger' ? 'danger' : 'success'
              return (
                <ApprovalAction
                  key={a.label}
                  icon={BULK_ACTION_ICON[tone]}
                  label={a.label}
                  tone={tone}
                  onClick={a.onClick}
                  disabled={disabled}
                />
              )
            })}
          </div>

          {/* Desktop: the same actions, labelled */}
          <div className="hidden items-center gap-2 md:flex">
            {actions.map(a => (
              <button
                key={a.label}
                type="button"
                onClick={a.onClick}
                disabled={disabled}
                className={BULK_ACTION_BUTTON_CLASS[a.tone === 'danger' ? 'danger' : 'success']}
              >
                {a.label}
              </button>
            ))}
          </div>

          {onCancel && (
            <button type="button" onClick={onCancel} className="btn-ghost px-1 text-xs md:px-4 md:text-sm">
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// Shared empty state for any list — icon + one-line message + optional
// primary action.
export function ListEmptyState({ icon, message, actionLabel, onAction }) {
  return (
    <div className="card p-10 text-center">
      {icon && <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center text-ink-muted opacity-40">{icon}</span>}
      <p className="text-sm text-ink-muted">{message}</p>
      {actionLabel && onAction && (
        <button onClick={onAction} className="btn-primary mx-auto mt-4">
          {actionLabel}
        </button>
      )}
    </div>
  )
}
