import { forwardRef, useCallback, useEffect, useRef, useState } from 'react'
import TurnstileWidget, { TURNSTILE_ENABLED } from './TurnstileWidget'

// The Turnstile widget as the auth modals carry it: appearance
// "interaction-only", so nothing is shown while Cloudflare verifies the
// visitor silently, and a box only appears if it needs them to do
// something. The slot around it holds no space while hidden — no blank
// band at the bottom of the form, and no extra gap, since the gap above it
// is this slot's own margin and animates in with it — and grows to the
// widget's height (150–200ms ease-out; @layer base flattens that under
// prefers-reduced-motion) when the widget becomes interactive.
//
// Two signals drive it, because neither alone is reliable: the widget's
// onBeforeInteractive/onAfterInteractive say *whether* it should show, and
// a ResizeObserver on the widget's container says *how tall* it is, which
// is Cloudflare's to decide and differs between the flexible and compact
// renderings. The same observer watches the slot's width to pick the
// rendering: "flexible" needs 300px, so a narrower slot (a 320px phone)
// gets "compact" instead.
//
// `gap` is the space the slot opens above itself when shown, matching the
// form's group gap. `ref` is the widget's own (for reset()).
const EASE = 'transition-[height,margin-top] duration-200 ease-out'

const TurnstileSlot = forwardRef(function TurnstileSlot({ onVerify, onExpire, gap = 16, className = '' }, ref) {
  const slotRef = useRef(null)
  const innerRef = useRef(null)
  const [interactive, setInteractive] = useState(false)
  const [contentHeight, setContentHeight] = useState(0)
  const [compact, setCompact] = useState(false)

  useEffect(() => {
    if (!TURNSTILE_ENABLED || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(() => {
      if (innerRef.current) setContentHeight(innerRef.current.getBoundingClientRect().height)
      if (slotRef.current) setCompact(slotRef.current.getBoundingClientRect().width < 300)
    })
    if (innerRef.current) observer.observe(innerRef.current)
    if (slotRef.current) observer.observe(slotRef.current)
    return () => observer.disconnect()
  }, [])

  const handleBeforeInteractive = useCallback(() => {
    setInteractive(true)
    // In a scrolling body (the registration forms) the widget sits last,
    // so bring it into view when it asks for attention — but only as far
    // as needed, never yanking the form to the top.
    slotRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [])
  const handleAfterInteractive = useCallback(() => setInteractive(false), [])

  if (!TURNSTILE_ENABLED) return null

  // Cloudflare's own fallback heights, for the instant before the observer
  // has measured a freshly-shown widget.
  const height = interactive ? (contentHeight || (compact ? 140 : 65)) : 0
  const visible = height > 0

  return (
    <div
      ref={slotRef}
      aria-hidden={!visible}
      style={{ height, marginTop: visible ? gap : 0 }}
      className={`overflow-hidden ${EASE} ${className}`}
      {...(visible ? {} : { inert: '' })}
    >
      <div ref={innerRef}>
        <TurnstileWidget
          ref={ref}
          appearance="interaction-only"
          size={compact ? 'compact' : 'flexible'}
          onVerify={onVerify}
          onExpire={onExpire}
          onBeforeInteractive={handleBeforeInteractive}
          onAfterInteractive={handleAfterInteractive}
        />
      </div>
    </div>
  )
})

export default TurnstileSlot
