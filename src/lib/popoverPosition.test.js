import { describe, it, expect, afterEach } from 'vitest'
import { computeAnchoredPosition } from './popoverPosition'

function setViewport(width, height) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width })
  Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: height })
}

// Minimal DOMRect-shaped stub — only the fields computeAnchoredPosition reads.
function rect({ top, bottom, right = 100 }) {
  return { top, bottom, right }
}

describe('computeAnchoredPosition', () => {
  afterEach(() => setViewport(1024, 768)) // restore jsdom's default-ish viewport

  it('rolls down from an anchor in the top/middle two-thirds of the screen', () => {
    setViewport(1024, 900)
    const pos = computeAnchoredPosition(rect({ top: 100, bottom: 120 }), 200)
    expect(pos).toEqual({ left: expect.any(Number), top: 126 })
  })

  it('rolls up from an anchor in the bottom third of the screen', () => {
    setViewport(1024, 900)
    const pos = computeAnchoredPosition(rect({ top: 850, bottom: 870 }), 200)
    expect(pos).toEqual({ left: expect.any(Number), bottom: 900 - 850 + 6 })
  })

  it('forceDown always rolls down, ignoring both the anchor-third heuristic and maxHeight', () => {
    setViewport(1024, 900)
    const pos = computeAnchoredPosition(rect({ top: 850, bottom: 870 }), 200, { forceDown: true, maxHeight: 500 })
    expect(pos).toEqual({ left: expect.any(Number), top: 876 })
  })

  it('without maxHeight, keeps the anchor-third choice even when the popover would run off the bottom', () => {
    // Anchor mid (520) is in the top two-thirds of a 900px-tall viewport
    // (< 600), so the old heuristic alone rolls down — even though only
    // 380px is left below it, which is exactly the bug this test documents
    // as the reason maxHeight exists.
    setViewport(1024, 900)
    const pos = computeAnchoredPosition(rect({ top: 500, bottom: 520 }), 200)
    expect(pos).toEqual({ left: expect.any(Number), top: 526 })
  })

  it('with maxHeight, flips up when the anchor-third choice does not fit but the other side has more room', () => {
    // Same anchor as above (mid-screen, "rolls down" by the heuristic) but
    // now with a popover taller than the 380px left below it (900-520-6);
    // 494px is available above (500-6), so it flips.
    setViewport(1024, 900)
    const pos = computeAnchoredPosition(rect({ top: 500, bottom: 520 }), 200, { maxHeight: 400 })
    expect(pos).toEqual({ left: expect.any(Number), bottom: 900 - 500 + 6 })
  })

  it('with maxHeight, stays put when neither side fits but the chosen side still has more room', () => {
    // A short viewport where the popover (500px) doesn't fit on either
    // side — flipping to the side with *less* room would only make things
    // worse, so the original anchor-third choice is kept.
    setViewport(1024, 400)
    const pos = computeAnchoredPosition(rect({ top: 150, bottom: 170 }), 200, { maxHeight: 500 })
    expect(pos).toEqual({ left: expect.any(Number), top: 176 }) // unchanged — still rolls down
  })

  it('with maxHeight, an anchor in the bottom third (already rolling up) is left alone once space above fits', () => {
    // An anchor in the bottom third always has more room above it than
    // below (that's what put it in the bottom third to begin with), so
    // this is the realistic case for that side of the heuristic — the
    // up-to-down flip is symmetric code for completeness, not something a
    // real anchor position can actually trigger.
    setViewport(1024, 900)
    const pos = computeAnchoredPosition(rect({ top: 770, bottom: 790 }), 200, { maxHeight: 300 })
    expect(pos).toEqual({ left: expect.any(Number), bottom: 900 - 770 + 6 })
  })

  it('clamps left within the viewport on both edges', () => {
    setViewport(320, 900)
    const near0 = computeAnchoredPosition(rect({ top: 100, bottom: 120, right: 10 }), 200)
    expect(near0.left).toBe(8)
    const nearEdge = computeAnchoredPosition(rect({ top: 100, bottom: 120, right: 315 }), 200)
    expect(nearEdge.left).toBe(320 - 200 - 8)
  })
})
