import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// The nav bar is the one thing on screen on every page, and its order is a
// deliberate story rather than an accident: where am I, what am I working,
// what am I asking for, who else is there, then me. It has drifted before,
// so it gets a test — one per role, including which entries a role does
// NOT get.
const authState = { profile: { id: 'me', name: 'Ada', surname: 'Doe', is_approved: true, category: 'MO' }, signOut: vi.fn(), isAdmin: false, isLocum: false, isClerk: false }
vi.mock('../context/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('../lib/supabase', () => {
  const builder = { select: () => builder, eq: () => builder, then: (res, rej) => Promise.resolve({ count: 0, data: [] }).then(res, rej) }
  return { supabase: { from: () => builder, rpc: () => Promise.resolve({ data: [] }) } }
})
const { default: AppLayout } = await import('./AppLayout')

function navLabels(role) {
  Object.assign(authState, { isAdmin: false, isLocum: false, isClerk: false }, role)
  const { unmount } = render(<MemoryRouter><AppLayout /></MemoryRouter>)
  // The sidebar and the bottom bar render the same list; read the bottom
  // one, which is the phone's primary navigation.
  const bars = screen.getAllByRole('navigation')
  const labels = within(bars[bars.length - 1]).getAllByRole('link').map(a => a.textContent.trim())
  unmount()
  return labels
}

describe('AppLayout nav order', () => {
  it('admin: Dashboard, Roster, Planners, Staff, Account', () => {
    expect(navLabels({ isAdmin: true })).toEqual(['Dashboard', 'Roster', 'Planners', 'Staff', 'Account'])
  })

  it('doctor: the same, with Swaps before Staff', () => {
    expect(navLabels({})).toEqual(['Dashboard', 'Roster', 'Planners', 'Swaps', 'Staff', 'Account'])
  })

  it('locum: Open shifts instead of Planners, and no Swaps', () => {
    expect(navLabels({ isLocum: true })).toEqual(['Dashboard', 'Roster', 'Open shifts', 'Staff', 'Account'])
  })

  it('clerk: read-only, so no Swaps and a singular Planner', () => {
    expect(navLabels({ isClerk: true })).toEqual(['Dashboard', 'Roster', 'Planner', 'Staff', 'Account'])
  })
})

// Swiping is a second way to do what the bar does, in the bar's own order.
describe('AppLayout swipe navigation', () => {
  afterEach(() => { delete window.matchMedia })

  function renderAt(path, { phone = true } = {}) {
    window.matchMedia = () => ({ matches: phone })
    Object.assign(authState, { isAdmin: true, isLocum: false, isClerk: false })
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<p>DashboardScreen</p>} />
            <Route path="/roster" element={<p>RosterScreen</p>} />
            <Route path="/leave" element={<p>PlannersScreen</p>} />
            <Route path="/staff" element={<p>StaffScreen</p>} />
            <Route path="/account" element={<p>AccountScreen</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    )
  }

  function swipe(text, dx, dy = 0) {
    const el = screen.getByText(text)
    fireEvent.touchStart(el, { touches: [{ clientX: 200, clientY: 300 }] })
    fireEvent.touchEnd(el, { changedTouches: [{ clientX: 200 + dx, clientY: 300 + dy }] })
  }

  function activeTab() {
    const bars = screen.getAllByRole('navigation')
    return within(bars[bars.length - 1]).getAllByRole('link').find(a => a.getAttribute('aria-current') === 'page').textContent.trim()
  }

  it('swipe left walks forward through the bar, and the bar follows', () => {
    renderAt('/')
    swipe('DashboardScreen', -150)
    expect(screen.getByText('RosterScreen')).toBeInTheDocument()
    expect(activeTab()).toBe('Roster')
    swipe('RosterScreen', -150)
    expect(screen.getByText('PlannersScreen')).toBeInTheDocument()
    expect(activeTab()).toBe('Planners')
  })

  it('swipe right walks back, and neither end wraps', () => {
    renderAt('/account')
    swipe('AccountScreen', -150)
    expect(screen.getByText('AccountScreen')).toBeInTheDocument()
    swipe('AccountScreen', 150)
    expect(screen.getByText('StaffScreen')).toBeInTheDocument()

    swipe('StaffScreen', 150)
    swipe('PlannersScreen', 150)
    swipe('RosterScreen', 150)
    swipe('DashboardScreen', 150)
    expect(screen.getByText('DashboardScreen')).toBeInTheDocument()
  })

  it('a vertical scroll or a short nudge is not a swipe', () => {
    renderAt('/roster')
    swipe('RosterScreen', -150, 200)
    swipe('RosterScreen', -30)
    expect(screen.getByText('RosterScreen')).toBeInTheDocument()
  })

  it('is a phone gesture only — nothing happens at tablet width and up', () => {
    renderAt('/roster', { phone: false })
    swipe('RosterScreen', -150)
    expect(screen.getByText('RosterScreen')).toBeInTheDocument()
  })

  it('tapping the bar still navigates', () => {
    renderAt('/')
    const bars = screen.getAllByRole('navigation')
    fireEvent.click(within(bars[bars.length - 1]).getByRole('link', { name: 'Staff' }))
    expect(screen.getByText('StaffScreen')).toBeInTheDocument()
  })
})
