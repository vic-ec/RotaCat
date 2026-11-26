import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

// The app's one style of hover/tap label. Anything with a `title` — an
// icon button ("More actions", "Legend", "Today"), a cut-off name, a grid
// cell's detail — gets the same small dark, rounded label, centred above it
// (below it when there's no room above), instead of the browser's own
// tooltip, which RotaCat can't style and which never appears on a phone.
//
// Mounted once at the root. Components just set `title` as usual and stay
// unaware of it: the attribute keeps doing its other jobs (an accessible
// description, `getByTitle` in tests). While a label is showing, the
// element's `title` is parked in `data-hint-title` so the browser doesn't
// draw its own on top, and put back as soon as the pointer leaves.
//
// Mouse: shown after a short pause (so sweeping across a toolbar doesn't
// flicker), hidden on leave, click, scroll or a key. Touch: shown on a tap
// and kept until the next tap, a scroll or a key — the tap still does
// whatever it does. Under sheets and modals (z-40) so a menu the tap opened
// covers it.
//
// A lifted finger fires pointerout with no relatedTarget, which for a
// mouse means "left the window". Treating it that way for touch closed
// every tap hint a few milliseconds after it opened, so only a mouse
// pointer leaving the window clears it.
const HOVER_DELAY_MS = 350
const MAX_WIDTH = 256

function hintTarget(node) {
  return node?.closest?.('[title]:not([title=""]), [data-hint-title]') ?? null
}

export default function HintLayer() {
  const [hint, setHint] = useState(null) // { label, x, y, above }

  useEffect(() => {
    let current = null
    let timer = null

    function park(el) {
      const label = el.getAttribute('title')
      if (label) {
        el.setAttribute('data-hint-title', label)
        el.removeAttribute('title')
      }
      return el.getAttribute('data-hint-title')
    }
    function restore(el) {
      if (!el) return
      const label = el.getAttribute('data-hint-title')
      if (label != null && !el.hasAttribute('title')) el.setAttribute('title', label)
      el.removeAttribute('data-hint-title')
    }
    function show(el) {
      if (!el.isConnected) return
      const label = el.getAttribute('data-hint-title')
      if (!label) return
      const rect = el.getBoundingClientRect()
      const above = rect.top > 44
      const half = Math.min(MAX_WIDTH, label.length * 6.5 + 16) / 2 + 8
      const x = Math.min(Math.max(rect.left + rect.width / 2, half), window.innerWidth - half)
      setHint({ label, x, y: above ? rect.top - 6 : rect.bottom + 6, above })
    }
    function clear() {
      clearTimeout(timer)
      restore(current)
      current = null
      setHint(null)
    }

    function onPointerOver(e) {
      if (e.pointerType !== 'mouse') return
      const el = hintTarget(e.target)
      if (el === current) return
      clear()
      if (!el) return
      current = el
      park(el)
      timer = setTimeout(() => show(el), HOVER_DELAY_MS)
    }
    // A new tap closes the hint the last one opened.
    function onPointerDown(e) {
      if (e.pointerType !== 'mouse' && current) clear()
    }
    function onPointerUp(e) {
      if (e.pointerType === 'mouse') { if (current) { clearTimeout(timer); setHint(null) } return }
      const el = hintTarget(e.target)
      clear()
      if (!el) return
      current = el
      park(el)
      show(el)
    }
    function onLeaveWindow(e) {
      if (e.pointerType === 'mouse' && !e.relatedTarget) clear()
    }

    document.addEventListener('pointerover', onPointerOver)
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('pointerup', onPointerUp)
    document.addEventListener('pointerout', onLeaveWindow)
    document.addEventListener('keydown', clear)
    window.addEventListener('scroll', clear, true)
    window.addEventListener('blur', clear)
    return () => {
      clear()
      document.removeEventListener('pointerover', onPointerOver)
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('pointerup', onPointerUp)
      document.removeEventListener('pointerout', onLeaveWindow)
      document.removeEventListener('keydown', clear)
      window.removeEventListener('scroll', clear, true)
      window.removeEventListener('blur', clear)
    }
  }, [])

  if (!hint) return null
  return createPortal(
    <span
      role="tooltip"
      style={{
        position: 'fixed',
        left: hint.x,
        top: hint.y,
        maxWidth: MAX_WIDTH,
        transform: `translate(-50%, ${hint.above ? '-100%' : '0'})`,
      }}
      className="pointer-events-none z-40 w-max popup-hint text-center"
    >
      {hint.label}
    </span>,
    document.body,
  )
}
