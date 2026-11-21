import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// A small dark label naming an icon-only control: shown on hover with a
// mouse (after a short pause, so sweeping across the toolbar doesn't
// flicker), and for a moment after a tap on a touch screen — where there is
// no hover, and `title` never shows at all. Wraps the control rather than
// replacing it, so the control's own click still does its job; the hint
// never takes the pointer (pointer-events: none), and sits under sheets and
// modals (z-40) so a menu the tap opened covers it.
//
// Drawn above the control when there is room, otherwise below.
const HOVER_DELAY_MS = 350
const TAP_SHOW_MS = 1500

export default function HoverHint({ label, children, className = '' }) {
  const wrapRef = useRef(null)
  const timer = useRef(null)
  const [pos, setPos] = useState(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  function show() {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect) return
    const above = rect.top > 44
    // Keep the whole label on screen: estimate its width from its length
    // and pull the centre in from either edge by half of it.
    const half = Math.min(256, label.length * 6.5 + 16) / 2 + 8
    const x = Math.min(Math.max(rect.left + rect.width / 2, half), window.innerWidth - half)
    setPos({ x, y: above ? rect.top - 6 : rect.bottom + 6, above })
  }
  function hide() {
    clearTimeout(timer.current)
    setPos(null)
  }

  return (
    <span
      ref={wrapRef}
      className={`inline-flex ${className}`}
      onPointerEnter={e => {
        if (e.pointerType !== 'mouse') return
        clearTimeout(timer.current)
        timer.current = setTimeout(show, HOVER_DELAY_MS)
      }}
      onPointerLeave={e => { if (e.pointerType === 'mouse') hide() }}
      onPointerUp={e => {
        if (e.pointerType === 'mouse') { hide(); return }
        show()
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setPos(null), TAP_SHOW_MS)
      }}
    >
      {children}
      {pos && createPortal(
        <span
          role="tooltip"
          style={{
            position: 'fixed',
            left: pos.x,
            top: pos.y,
            transform: `translate(-50%, ${pos.above ? '-100%' : '0'})`,
          }}
          className="pointer-events-none z-40 w-max max-w-[16rem] rounded-md text-center bg-ink px-2 py-1 text-xs font-medium text-canvas-raised shadow-raised"
        >
          {label}
        </span>,
        document.body,
      )}
    </span>
  )
}
