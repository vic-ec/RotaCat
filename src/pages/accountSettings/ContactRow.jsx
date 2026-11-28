import { useRef } from 'react'
import { CircleCheck } from 'lucide-react'
import { useDismissablePopover } from '../../lib/useDismissablePopover'
import EditIconButton from './EditIconButton'
import { PencilIcon } from './icons'

// Single-value contact field shown as an icon + value row, with a small
// trigger that turns the value itself into an editable input in place —
// no separate panel or duplicate label for fields that only ever hold one
// value (a phone number or email address). Padding matches SectionRow's
// exactly so a collapsed Contact row is the same height as the rows below it.
export default function ContactRow({ icon, value, placeholder = 'Not set', editLabel, editing, onToggle, editable = true, href, note, verified, children }) {
  const rowRef = useRef(null)
  // Dismissing here calls the same onToggle the Cancel/pencil button uses,
  // which resets the field and closes it while editing=true — an outside
  // click behaves exactly like tapping Cancel.
  useDismissablePopover(editing, onToggle, rowRef)
  // The whole row opens the field, not just the pencil — the same target
  // size the SectionRow accordions below give their own headers, with the
  // matching background feedback. Only while closed: once open, the row is
  // a form, and a click inside it must not toggle the field shut (an
  // outside click already does, via useDismissablePopover above).
  const rowOpensEditor = editable && !editing
  return (
    <div
      ref={rowRef}
      onClick={rowOpensEditor ? onToggle : undefined}
      className={`px-5 py-3 transition-colors ${
        rowOpensEditor ? 'cursor-pointer hover:bg-canvas-sunken active:bg-canvas-sunken' : ''
      }`}
    >
      {/* Centered when just displaying the value (icon and single-line text
          read as one unit); top-aligned only while editing, so the icon
          stays pinned to the input's line instead of drifting to the middle
          of the taller expanded block (input + Update/Cancel + notes). */}
      <div className={`flex gap-3 ${editing ? 'items-start' : 'items-center'}`}>
        {/* mt-[5px] while editing = the input's own border(1px)+padding-top(4px),
            so the icon's top lines up with the input's text-content top exactly
            (same vertical center as the input's text) regardless of how tall
            the expanded block gets once Update/Cancel/notes appear below it.
            mt-0.5 (2px) undershot this by 3px, which read as the icon
            "jumping up" when entering edit mode. */}
        <span className={`flex-shrink-0 text-ink-light ${editing ? 'mt-[5px]' : ''}`}>{icon}</span>
        <div className="min-w-0 flex-1">
          {editing ? children : (
            <>
              {/* Same border+padding box as .input-field, just with a
                  transparent border/background — so switching into edit mode
                  swaps only the border/background colour, never the geometry.
                  (A negative-margin trick was tried here before to cancel out
                  the input's own padding, but that shifted the input's left
                  edge back over the icon; matching box models outright avoids
                  needing any offset math at all.)
                  This only holds while the edit input keeps .input-field's
                  symmetric py-1: both fields carried a `pt-[3px] pb-[5px]`
                  override for a while, which kept the same total height but
                  sat the text 1px high, so the value visibly hopped up on
                  entering edit mode. Don't reintroduce per-field padding
                  here — the icon's mt-[5px] above is derived from that same
                  4px padding-top too. */}
              {value && href ? (
                <a
                  href={href}
                  onClick={e => e.stopPropagation()}
                  className="flex items-center gap-1.5 truncate rounded border border-transparent px-3 py-1 text-sm text-ink hover:underline"
                >
                  <span className="truncate">{value}</span>
                  {value && verified && (
                    <CircleCheck title="Email verified" className="h-3.5 w-3.5 flex-shrink-0 text-success" />
                  )}
                </a>
              ) : (
                <p className="flex items-center gap-1.5 truncate rounded border border-transparent px-3 py-1 text-sm text-ink">
                  <span className="truncate">{value || placeholder}</span>
                  {value && verified && (
                    <CircleCheck title="Email verified" className="h-3.5 w-3.5 flex-shrink-0 text-success" />
                  )}
                </p>
              )}
              {note && <p className="mt-0.5 px-3 text-xs text-ink-muted">{note}</p>}
            </>
          )}
        </div>
        {/* mt-[3px] while editing keeps the pencil exactly where it sits when
            closed: its 24px box is centred in the 30px display line then, and
            top-aligned once the row switches to items-start above — a 3px
            drop, which read as the icon hopping on entering edit mode. Same
            derivation as the leading icon's own mt-[5px]. */}
        {editable && (
          <EditIconButton
            label={editLabel}
            expanded={editing}
            onClick={onToggle}
            icon={PencilIcon}
            className={editing ? 'mt-[3px]' : ''}
          />
        )}
      </div>
    </div>
  )
}
