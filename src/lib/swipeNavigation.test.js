import { describe, it, expect } from 'vitest'
import { activeNavIndex, swipeDestination, swipeDirection, swipeStartIsReserved } from './swipeNavigation'

const NAV = [
  { to: '/', end: true },
  { to: '/roster' },
  { to: '/leave' },
  { to: '/staff' },
  { to: '/account' },
]

describe('activeNavIndex', () => {
  it('matches the way the bar lights up: exact for Dashboard, by prefix for the rest', () => {
    expect(activeNavIndex(NAV, '/')).toBe(0)
    expect(activeNavIndex(NAV, '/roster')).toBe(1)
    expect(activeNavIndex(NAV, '/roster/abc/summary')).toBe(1)
    expect(activeNavIndex(NAV, '/account/p2')).toBe(4)
    // A prefix is a path segment, not a string prefix.
    expect(activeNavIndex(NAV, '/staffroom')).toBe(-1)
  })
})

describe('swipeDestination', () => {
  it('swipe left is the next screen, swipe right the previous', () => {
    expect(swipeDestination(NAV, '/', 'left')).toBe('/roster')
    expect(swipeDestination(NAV, '/leave', 'left')).toBe('/staff')
    expect(swipeDestination(NAV, '/leave', 'right')).toBe('/roster')
    expect(swipeDestination(NAV, '/roster/abc', 'right')).toBe('/')
  })

  it('does not wrap: Dashboard and Account are the two ends', () => {
    expect(swipeDestination(NAV, '/', 'right')).toBeNull()
    expect(swipeDestination(NAV, '/account', 'left')).toBeNull()
  })

  it('goes nowhere from a path no bar entry claims', () => {
    expect(swipeDestination(NAV, '/somewhere-else', 'left')).toBeNull()
  })
})

describe('swipeDirection', () => {
  it('reads a long, quick, flat drag', () => {
    expect(swipeDirection({ dx: -120, dy: 10, duration: 200 })).toBe('left')
    expect(swipeDirection({ dx: 120, dy: -10, duration: 200 })).toBe('right')
  })

  it('ignores a short drag, a slow one, and a diagonal one', () => {
    expect(swipeDirection({ dx: -40, dy: 0, duration: 200 })).toBeNull()
    expect(swipeDirection({ dx: -120, dy: 0, duration: 900 })).toBeNull()
    expect(swipeDirection({ dx: -120, dy: 90, duration: 200 })).toBeNull()
  })
})

describe('swipeStartIsReserved', () => {
  function tree(html) {
    const boundary = document.createElement('div')
    boundary.innerHTML = html
    document.body.appendChild(boundary)
    return boundary
  }

  it('leaves plain page content to the swipe', () => {
    const boundary = tree('<section><p id="t">text</p></section>')
    expect(swipeStartIsReserved(boundary.querySelector('#t'), boundary)).toBe(false)
  })

  it('reserves form controls, overlays and explicit opt-outs', () => {
    const boundary = tree(`
      <input id="input" type="range" />
      <div style="position: fixed"><button id="sheet">x</button></div>
      <div data-no-swipe-nav><span id="optout">x</span></div>
    `)
    for (const id of ['input', 'sheet', 'optout']) {
      expect(swipeStartIsReserved(boundary.querySelector(`#${id}`), boundary)).toBe(true)
    }
  })

  // The roster grid and Hours Summary: a sideways drag there is a scroll.
  it('reserves a sideways scroller only while it actually overflows', () => {
    const boundary = tree('<div id="scroller" style="overflow-x: auto"><table><tbody><tr><td id="cell">1</td></tr></tbody></table></div>')
    const scroller = boundary.querySelector('#scroller')
    const cell = boundary.querySelector('#cell')
    Object.defineProperty(scroller, 'clientWidth', { value: 300, configurable: true })
    Object.defineProperty(scroller, 'scrollWidth', { value: 300, configurable: true })
    expect(swipeStartIsReserved(cell, boundary)).toBe(false)
    Object.defineProperty(scroller, 'scrollWidth', { value: 1400, configurable: true })
    expect(swipeStartIsReserved(cell, boundary)).toBe(true)
  })
})
